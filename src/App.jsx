import { useState, useEffect, useRef, useCallback } from "react";
import { loadPrefs, savePrefs, loadTasks, createTask, updateTask, deleteTask } from "./lib/data.js";
import { supabase } from "./lib/supabase.js";
import { THEMES } from "./lib/themes.js";

// ─── Categorias: cores fixas, NÃO mudam com tema ───
const CATEGORIES = {
  work:     { label: "Trabalho", icon: "💼", color: "#E85D3A" },
  study:    { label: "Estudo",   icon: "📚", color: "#3A8FE8" },
  health:   { label: "Saúde",   icon: "🏃", color: "#2EBD6B" },
  personal: { label: "Pessoal", icon: "🧘", color: "#B45CE8" },
  home:     { label: "Casa",    icon: "🏠", color: "#E8A93A" },
};

// ─── Prioridades: usam CSS vars (mudam com tema) ───
const PRIORITIES = {
  high:   { label: "Alta",   color: "var(--accent)", weight: 3 },
  medium: { label: "Média",  color: "var(--yellow)", weight: 2 },
  low:    { label: "Baixa",  color: "var(--blue)",   weight: 1 },
};

const MOTIV = [
  "Cada tarefa concluída é uma vitória.",
  "Foco no progresso, não na perfeição.",
  "Seu eu do futuro agradece agora.",
  "Pequenos passos, grandes conquistas.",
  "A disciplina supera a motivação.",
  "Comece. A motivação vem depois.",
  "Você é mais capaz do que imagina.",
];

const uid    = () => Math.random().toString(36).slice(2, 9);
const fmt    = (min) => { if (min < 60) return `${min}min`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h}h${m}` : `${h}h`; };
const fmtSec = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const fmtS2M = (s) => fmt(Math.round(s / 60));
const today  = () => new Date().toISOString().split("T")[0];

// ─── card() usa CSS vars ───
const card = (extra = {}) => ({
  background: "var(--card)", border: "1px solid var(--border)",
  borderRadius: 16, padding: "16px 18px", ...extra,
});

// ─── Alpha helpers ───
const a = (varName, pct) => `color-mix(in srgb, ${varName} ${pct}%, transparent)`;

// ─── Voice guide helper ───
const getPlatform = () => {
  const u = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(u)) return "ios";
  if (/Android/.test(u)) return "android";
  if (/Mac/.test(u)) return "mac";
  if (/Win/.test(u)) return "windows";
  return "other";
};

export default function App({ user, onSignOut }) {
  const [tasks, setTasks]               = useState([]);
  const [availableTime, setAvailableTime] = useState(480);
  const [theme, setTheme]               = useState("default");
  const [tab, setTab]                   = useState("tasks");
  const [newTask, setNewTask]           = useState({ title: "", category: "work", priority: "medium", duration: 30, recurring: false });
  const [motivation]                    = useState(MOTIV[Math.floor(Math.random() * MOTIV.length)]);
  const [dayDate]                       = useState(today());
  const [showDone, setShowDone]         = useState(false);
  const [activeTimer, setActiveTimer]   = useState(null);
  const [timerSec, setTimerSec]         = useState(0);
  const [toast, setToast]               = useState(null);
  const [voiceGuide, setVoiceGuide]     = useState(false);
  const [editingId, setEditingId]       = useState(null);
  const [editData, setEditData]         = useState(null);
  const [dataLoading, setDataLoading]   = useState(true);
  const timerRef    = useRef(null);
  const inputRef    = useRef(null);
  const debounceRef = useRef(null);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  // ─── Aplica CSS vars quando tema muda ───
  useEffect(() => {
    const t = THEMES[theme] || THEMES.default;
    const root = document.documentElement;
    Object.entries(t).forEach(([k, v]) => {
      if (k === "label") return;
      root.style.setProperty(`--${k}`, v);
    });
  }, [theme]);

  // ─── Completion sound via Web Audio API ───
  const playCompleteSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.12 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.5);
      });
      setTimeout(() => ctx.close(), 1500);
    } catch {}
  };

  // ─── Helper: recarregar tarefas do banco ───
  const reloadTasks = useCallback(async () => {
    try {
      const remote = await loadTasks();
      setTasks(remote);
    } catch (err) {
      flash(`Erro ao recarregar tarefas: ${err.message}`);
    }
  }, []);

  // ─── Tarefa recorrente — idempotente ───
  const processRecurring = useCallback(async () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: doneRecurring } = await supabase
      .from("tasks")
      .select("title, category, priority, duration")
      .eq("recurring", true)
      .eq("completed", true)
      .lt("date", todayStr);

    if (!doneRecurring?.length) return;

    const uniq = new Map();
    for (const r of doneRecurring) {
      const k = `${r.title}|${r.category}|${r.priority}|${r.duration}`;
      uniq.set(k, r);
    }

    const { data: todayTasks } = await supabase
      .from("tasks")
      .select("title, category, priority, duration")
      .eq("date", todayStr);

    const existsToday = new Set(
      (todayTasks || []).map(t => `${t.title}|${t.category}|${t.priority}|${t.duration}`)
    );

    const toCreate = [...uniq.values()].filter(r => {
      const k = `${r.title}|${r.category}|${r.priority}|${r.duration}`;
      return !existsToday.has(k);
    });

    if (toCreate.length > 0) {
      const { data: { user: u } } = await supabase.auth.getUser();
      await supabase.from("tasks").insert(
        toCreate.map(r => ({
          ...r, user_id: u.id, recurring: true, date: todayStr,
          completed: false, timer_started: false, actual_seconds: 0,
        }))
      );
      await reloadTasks();
    }
  }, [reloadTasks]);

  // ─── Carga inicial ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prefs, remoteTasks] = await Promise.all([loadPrefs(), loadTasks()]);
        if (cancelled) return;
        setAvailableTime(prefs.availableTime ?? 480);
        setTheme(THEMES[prefs.theme] ? prefs.theme : "default");
        setTasks(remoteTasks);
        savePrefs({ lastActiveDate: new Date().toISOString().split("T")[0] }).catch(() => {});
        await processRecurring();
      } catch (err) {
        if (!cancelled) flash(`Erro ao carregar dados: ${err.message}`);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Virada de meia-noite ───
  useEffect(() => {
    let timeoutId;
    const scheduleNextMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      const msUntil = nextMidnight.getTime() - now.getTime();
      timeoutId = setTimeout(async () => {
        await processRecurring();
        scheduleNextMidnight();
      }, msUntil);
    };
    scheduleNextMidnight();
    return () => clearTimeout(timeoutId);
  }, [processRecurring]);

  // ─── Persistência availableTime com debounce 500ms ───
  const persistPrefs = useCallback((time) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try { await savePrefs({ availableTime: time }); }
      catch (err) { flash(`Erro ao salvar tempo: ${err.message}`); }
    }, 500);
  }, []);

  const handleAvailableTimeChange = (value) => {
    setAvailableTime(value);
    persistPrefs(value);
  };

  // ─── Aplicar e salvar tema ───
  const applyTheme = async (key) => {
    setTheme(key);
    flash("🎨 Tema aplicado");
    try { await savePrefs({ theme: key }); }
    catch (err) { flash(`Erro ao salvar tema: ${err.message}`); }
  };

  // ─── Timer tick (intocado) ───
  useEffect(() => {
    if (activeTimer) timerRef.current = setInterval(() => setTimerSec(s => s + 1), 1000);
    else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [activeTimer]);

  // ─── Derived ───
  const todayT     = tasks.filter(t => t.date === dayDate);
  const pending    = todayT.filter(t => !t.completed);
  const done       = todayT.filter(t => t.completed);
  const sorted     = [...pending].sort((a, b) => { const d = PRIORITIES[b.priority].weight - PRIORITIES[a.priority].weight; return d || a.duration - b.duration; });
  const totalPlan  = todayT.reduce((s, t) => s + t.duration, 0);
  const totalRealSec = done.reduce((s, t) => s + (t.actualSeconds || 0), 0);
  const totalEstSec  = done.reduce((s, t) => s + t.duration * 60, 0);
  const timeSaved  = totalEstSec - totalRealSec;
  const doneMin    = done.reduce((s, t) => s + t.duration, 0);
  const freeMin    = availableTime - totalPlan;
  const pctDone    = availableTime > 0 ? Math.min((doneMin / availableTime) * 100, 100) : 0;
  const rate       = todayT.length ? Math.round((done.length / todayT.length) * 100) : 0;
  const eff        = totalEstSec > 0 ? Math.round((timeSaved / totalEstSec) * 100) : 0;

  // ─── Streak corrigido ───
  const streak = (() => {
    const doneDates = [...new Set(tasks.filter(t => t.completed).map(t => t.date))];
    if (!doneDates.length) return 0;
    const todayStr  = new Date().toISOString().split("T")[0];
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yestStr   = yesterday.toISOString().split("T")[0];
    const lastDone  = doneDates.sort().reverse()[0];
    if (lastDone < yestStr) return 0;
    let count = 1;
    const dSet = new Set(doneDates);
    const cur  = new Date(lastDone + "T12:00:00");
    for (let i = 0; i < 365; i++) {
      cur.setDate(cur.getDate() - 1);
      const s = cur.toISOString().split("T")[0];
      if (dSet.has(s)) count++; else break;
    }
    return count;
  })();

  // ─── Actions com update otimista + rollback ───
  const addTaskFn = async () => {
    if (!newTask.title.trim()) return;
    const optimistic = {
      id: uid(), ...newTask, date: dayDate,
      completed: false, timerStarted: false, actualSeconds: 0,
      createdAt: new Date().toISOString(),
    };
    setTasks(prev => [...prev, optimistic]);
    setNewTask({ title: "", category: "work", priority: "medium", duration: 30, recurring: false });
    setTab("tasks");
    flash("✅ Tarefa adicionada!");
    try {
      const serverTask = await createTask(optimistic);
      setTasks(prev => prev.map(t => t.id === optimistic.id ? serverTask : t));
    } catch (err) {
      setTasks(prev => prev.filter(t => t.id !== optimistic.id));
      flash(`Erro ao salvar tarefa: ${err.message}`);
    }
  };

  const complete = async (id) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    if (!t.timerStarted) { flash("⏱ Inicie o timer antes!"); return; }
    let sec = t.actualSeconds || 0;
    if (activeTimer === id) { sec += timerSec; setActiveTimer(null); setTimerSec(0); }
    const patch = { completed: true, actualSeconds: sec };
    const previous = tasks.find(x => x.id === id);
    setTasks(tasks.map(x => x.id === id ? { ...x, ...patch } : x));
    playCompleteSound();
    try { await updateTask(id, patch); }
    catch (err) { setTasks(ts => ts.map(x => x.id === id ? previous : x)); flash(`Erro ao concluir tarefa: ${err.message}`); }
  };

  const uncomplete = async (id) => {
    const previous = tasks.find(x => x.id === id);
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: false } : t));
    try { await updateTask(id, { completed: false }); }
    catch (err) { setTasks(ts => ts.map(x => x.id === id ? previous : x)); flash(`Erro: ${err.message}`); }
  };

  const del = async (id) => {
    const previous = [...tasks];
    setTasks(tasks.filter(t => t.id !== id));
    if (activeTimer === id) { setActiveTimer(null); setTimerSec(0); }
    if (editingId === id) { setEditingId(null); setEditData(null); }
    try { await deleteTask(id); }
    catch (err) { setTasks(previous); flash(`Erro ao deletar: ${err.message}`); }
  };

  const startEdit = (id) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    setEditingId(id);
    setEditData({ title: t.title, category: t.category, priority: t.priority, duration: t.duration, recurring: t.recurring });
  };

  const saveEdit = async () => {
    if (!editData || !editingId) return;
    if (!editData.title.trim()) { flash("Digite um nome"); return; }
    const previous = tasks.find(t => t.id === editingId);
    setTasks(tasks.map(t => t.id === editingId ? { ...t, ...editData } : t));
    setEditingId(null); setEditData(null);
    flash("✏️ Tarefa atualizada!");
    try { await updateTask(editingId, editData); }
    catch (err) { setTasks(ts => ts.map(x => x.id === editingId ? previous : x)); flash(`Erro ao atualizar: ${err.message}`); }
  };

  const cancelEdit = () => { setEditingId(null); setEditData(null); };

  const toggle = async (id) => {
    if (activeTimer === id) {
      const sec = timerSec;
      setTasks(prev => prev.map(t => t.id === id ? { ...t, actualSeconds: (t.actualSeconds || 0) + sec } : t));
      setActiveTimer(null); setTimerSec(0);
      try {
        const t = tasks.find(x => x.id === id);
        await updateTask(id, { actualSeconds: (t?.actualSeconds || 0) + sec });
      } catch (err) { flash(`Erro ao salvar timer: ${err.message}`); }
    } else {
      if (activeTimer) {
        const prevSec = timerSec, prevId = activeTimer;
        setTasks(p => p.map(t => t.id === prevId ? { ...t, actualSeconds: (t.actualSeconds || 0) + prevSec } : t));
        const prevTask = tasks.find(x => x.id === prevId);
        updateTask(prevId, { actualSeconds: (prevTask?.actualSeconds || 0) + prevSec }).catch(() => {});
      }
      setTasks(p => p.map(t => t.id === id ? { ...t, timerStarted: true } : t));
      updateTask(id, { timerStarted: true }).catch(() => {});
      setActiveTimer(id); setTimerSec(0);
    }
  };

  const resetAll = async () => {
    if (!confirm("Limpar tudo? Isso vai apagar todas as tarefas do banco.")) return;
    const prevTasks = [...tasks];
    setTasks([]); setAvailableTime(480);
    try {
      await Promise.all(prevTasks.map(t => deleteTask(t.id)));
      await savePrefs({ availableTime: 480 });
    } catch (err) { setTasks(prevTasks); flash(`Erro ao resetar: ${err.message}`); }
  };

  // ─── Nav button ───
  const tabBtn = (key, label) => (
    <button key={key} onClick={() => setTab(key)} style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
      padding: "8px 2px", border: "none", background: "transparent", cursor: "pointer",
      color: tab === key ? "var(--accent)" : "var(--textFaint)",
      fontSize: 10, fontWeight: tab === key ? 700 : 400, fontFamily: "inherit",
      transition: "color 0.2s", whiteSpace: "nowrap",
    }}>
      {/* Active indicator dot */}
      <div style={{
        width: 4, height: 4, borderRadius: "50%",
        background: tab === key ? "var(--accent)" : "transparent",
        marginBottom: 1, transition: "background 0.2s",
      }} />
      {label}
    </button>
  );

  const pageTitle = (text) => (
    <div style={{ marginBottom: 18 }}>
      <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, color: "var(--text)" }}>{text}</span>
    </div>
  );

  // ─── Loading spinner ───
  if (dataLoading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(165deg, var(--bg1, #0D0D0F) 0%, var(--bg2, #1A1A2E) 40%, var(--bg3, #16213E) 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Outfit', sans-serif",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{
            width: 32, height: 32, border: "3px solid rgba(232,93,58,0.2)",
            borderTopColor: "#E85D3A", borderRadius: "50%",
            animation: "spin 0.8s linear infinite", margin: "0 auto",
          }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(165deg, var(--bg1) 0%, var(--bg2) 40%, var(--bg3) 100%)",
      fontFamily: "'Outfit', sans-serif", color: "var(--text)", position: "relative",
    }}>
      {/* Ambient */}
      <div style={{ position: "fixed", top: -200, right: -200, width: 600, height: 600, background: `radial-gradient(circle, ${a("var(--accent)", 7)} 0%, transparent 70%)`, pointerEvents: "none" }} />

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: a("var(--accent)", 95), color: "var(--text)", padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: `0 4px 20px ${a("var(--accent)", 40)}`, animation: "slideD 0.3s ease" }}>
          {toast}
        </div>
      )}

      {/* ═══════════ CONTENT ═══════════ */}
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "16px 16px 90px" }}>

        {/* Mini header */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontFamily: "'Space Mono', monospace", color: "var(--accent)", letterSpacing: 4, textTransform: "uppercase", marginBottom: 4 }}>Performance Engine</div>
          <div style={{ fontSize: 12, color: "var(--textFaint)", fontStyle: "italic" }}>"{motivation}"</div>
        </div>

        {/* ─── ACTIVE TIMER ─── */}
        {activeTimer && (() => {
          const t = tasks.find(x => x.id === activeTimer); if (!t) return null;
          const acc = (t.actualSeconds || 0) + timerSec, est = t.duration * 60;
          const rem = Math.max(est - acc, 0), over = acc > est, overS = acc - est;
          const p = Math.min((acc / est) * 100, 100);
          return (
            <div style={{ ...card({ marginBottom: 14 }), borderColor: over ? a("var(--green)", 25) : a("var(--accent)", 25), background: over ? a("var(--green)", 6) : a("var(--accent)", 6) }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: over ? "var(--green)" : "var(--accent)", marginBottom: 6 }}>
                {over ? "⚡ Prazo atingido" : "⏱ Focando"}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>{t.title}</div>
              {!over ? (
                <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "var(--accent)", textAlign: "center" }}>{fmtSec(rem)}</div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "var(--green)" }}>✅ No prazo!</div>
                  <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "var(--yellow)" }}>+{fmtSec(overS)}</div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--textFaint)", margin: "6px 0 4px" }}>
                <span>Real: {fmtSec(acc)}</span><span>Est: {fmt(t.duration)}</span>
              </div>
              <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${p}%`, borderRadius: 2, background: over ? "var(--green)" : "var(--accent)", transition: "width 1s linear" }} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => toggle(activeTimer)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>⏸ Pausar</button>
                <button onClick={() => complete(activeTimer)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "var(--green)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Concluir ✓</button>
              </div>
            </div>
          );
        })()}

        {/* ════════════ TAB: TAREFAS ════════════ */}
        {tab === "tasks" && (
          <div>
            {pageTitle("Minhas Tarefas")}

            {/* Time slider */}
            <div style={card({ marginBottom: 14 })}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: "var(--textDim)", fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase" }}>Tempo hoje</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)", fontFamily: "'Space Mono', monospace" }}>{fmt(availableTime)}</span>
              </div>
              <input type="range" min={30} max={960} step={15} value={availableTime}
                onChange={e => handleAvailableTimeChange(+e.target.value)}
                style={{ width: "100%", height: 5, appearance: "none", background: `linear-gradient(to right, var(--accent) ${(availableTime / 960) * 100}%, var(--border) ${(availableTime / 960) * 100}%)`, borderRadius: 3, outline: "none", cursor: "pointer" }} />
            </div>

            {/* Progress */}
            <div style={card({ marginBottom: 14 })}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Progresso</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: rate >= 80 ? "var(--green)" : rate >= 40 ? "var(--yellow)" : "var(--accent)", fontFamily: "'Space Mono', monospace" }}>{rate}%</span>
              </div>
              <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${pctDone}%`, background: pctDone >= 80 ? `linear-gradient(90deg,var(--green),${a("var(--green)",80)})` : pctDone >= 40 ? `linear-gradient(90deg,var(--yellow),${a("var(--yellow)",80)})` : `linear-gradient(90deg,var(--accent),var(--yellow))`, transition: "width 0.5s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--textFaint)" }}>
                <span>{done.length}/{todayT.length} tarefas • Real: {fmtS2M(totalRealSec)}</span>
                <span>{freeMin >= 0 ? `${fmt(freeMin)} livre` : `⚠ ${fmt(-freeMin)} extra`}</span>
              </div>
              {timeSaved > 0 && done.length > 0 && (
                <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: a("var(--green)", 8), border: `1px solid ${a("var(--green)", 15)}`, fontSize: 11, color: "var(--green)", textAlign: "center" }}>
                  ⚡ {fmtS2M(timeSaved)} ganhos — {eff}% mais rápido
                </div>
              )}
              {streak > 0 && <div style={{ marginTop: 6, fontSize: 11, color: "var(--textFaint)", textAlign: "center" }}>🔥 {streak} dias consecutivos</div>}
            </div>

            {/* Task list */}
            {sorted.length === 0 && done.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", ...card(), border: `1px dashed var(--border)` }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🚀</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>Nenhuma tarefa ainda</div>
                <div style={{ fontSize: 12, color: "var(--textFaint)" }}>Toque em <strong>Adicionar</strong> para começar</div>
              </div>
            ) : (
              <>
                {sorted.length > 0 && <div style={{ fontSize: 10, color: "var(--textFaint)", marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>Inicie o timer (▶) para poder concluir</div>}

                {sorted.map(t => {
                  const cat = CATEGORIES[t.category], pri = PRIORITIES[t.priority];
                  const active = activeTimer === t.id;
                  const acc = (t.actualSeconds || 0) + (active ? timerSec : 0);
                  const started = t.timerStarted;
                  const isEditing = editingId === t.id;
                  return (
                    <div key={t.id} style={{
                      ...card({ marginBottom: 8, padding: "12px 14px" }),
                      borderLeft: `3px solid ${pri.color}`,
                      borderColor: isEditing ? a("var(--blue)", 30) : active ? a("var(--accent)", 25) : undefined,
                      background: isEditing ? a("var(--blue)", 4) : active ? a("var(--accent)", 5) : "var(--card)",
                    }}>
                      {!isEditing ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <button onClick={() => complete(t.id)} title={started ? "Concluir" : "Inicie o timer"}
                            style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${started ? a("var(--green)", 40) : a("var(--text)", 7)}`, background: "transparent", cursor: started ? "pointer" : "not-allowed", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: started ? "var(--green)" : a("var(--text)", 12) }}>
                            {started ? "✓" : "🔒"}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, color: "var(--text)" }}>{t.title}{t.recurring ? " ↺" : ""}</div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, flexWrap: "wrap" }}>
                              <span style={{ color: cat.color }}>{cat.icon} {cat.label}</span>
                              <span style={{ color: a("var(--text)", 20) }}>•</span>
                              <span style={{ color: "var(--textFaint)", fontFamily: "'Space Mono', monospace" }}>{fmt(t.duration)}</span>
                              {acc > 0 && <>
                                <span style={{ color: a("var(--text)", 20) }}>•</span>
                                <span style={{ color: acc > t.duration * 60 ? "var(--yellow)" : "var(--green)", fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>{fmtSec(acc)}</span>
                              </>}
                            </div>
                          </div>
                          <button onClick={() => toggle(t.id)} style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid var(--border)", background: active ? a("var(--accent)", 15) : "var(--card)", color: active ? "var(--accent)" : "var(--textFaint)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>{active ? "⏸" : "▶"}</button>
                          <button onClick={() => startEdit(t.id)} style={{ width: 30, height: 30, borderRadius: 7, border: "none", background: "var(--card)", color: "var(--textFaint)", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✏️</button>
                          <button onClick={() => del(t.id)} style={{ width: 30, height: 30, borderRadius: 7, border: "none", background: "transparent", color: a("var(--text)", 20), cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 10, color: "var(--blue)", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Editando tarefa</div>
                          <input value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })}
                            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${a("var(--blue)", 30)}`, background: "var(--card)", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
                            onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                            autoFocus />
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                            {Object.entries(CATEGORIES).map(([k, c]) => (
                              <button key={k} onClick={() => setEditData({ ...editData, category: k })} style={{
                                padding: "5px 10px", borderRadius: 6, fontSize: 10, border: "1px solid", cursor: "pointer", fontFamily: "inherit",
                                borderColor: editData.category === k ? c.color + "55" : "var(--border)",
                                background: editData.category === k ? c.color + "15" : "transparent",
                                color: editData.category === k ? c.color : "var(--textFaint)",
                              }}>{c.icon} {c.label}</button>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                            {Object.entries(PRIORITIES).map(([k, p]) => (
                              <button key={k} onClick={() => setEditData({ ...editData, priority: k })} style={{
                                flex: 1, padding: "5px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: "1px solid", cursor: "pointer", fontFamily: "inherit",
                                borderColor: editData.priority === k ? p.color.replace("var(--", "").replace(")", "") + "55" : "var(--border)",
                                background: editData.priority === k ? a(p.color, 15) : "transparent",
                                color: editData.priority === k ? p.color : "var(--textFaint)",
                              }}>{p.label}</button>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                            {[5, 10, 15, 30, 45, 60, 90, 120].map(d => (
                              <button key={d} onClick={() => setEditData({ ...editData, duration: d })} style={{
                                padding: "5px 8px", borderRadius: 6, fontSize: 10, border: "1px solid", cursor: "pointer", fontFamily: "'Space Mono', monospace",
                                borderColor: editData.duration === d ? a("var(--accent)", 35) : "var(--border)",
                                background: editData.duration === d ? a("var(--accent)", 10) : "transparent",
                                color: editData.duration === d ? "var(--accent)" : "var(--textFaint)",
                              }}>{fmt(d)}</button>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={saveEdit} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "var(--blue)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Salvar ✓</button>
                            <button onClick={cancelEdit} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--textDim)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {done.length > 0 && (
                  <>
                    <button onClick={() => setShowDone(!showDone)} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${a("var(--green)", 10)}`, background: a("var(--green)", 3), color: "var(--green)", fontSize: 11, cursor: "pointer", marginTop: 6, fontFamily: "inherit" }}>
                      ✅ {done.length} concluída{done.length > 1 ? "s" : ""} {showDone ? "▲" : "▼"}
                    </button>
                    {showDone && done.map(t => {
                      const cat = CATEGORIES[t.category], est = t.duration * 60, real = t.actualSeconds || 0, diff = est - real;
                      return (
                        <div key={t.id} style={{ ...card({ marginTop: 6, padding: "10px 14px" }), background: a("var(--green)", 3), borderColor: a("var(--green)", 8) }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <button onClick={() => uncomplete(t.id)} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "var(--green)", color: "#fff", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✓</button>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, textDecoration: "line-through", color: a("var(--text)", 40) }}>{t.title}</div>
                              <div style={{ fontSize: 10, color: "var(--textFaint)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <span>{cat.icon} {cat.label}</span><span>•</span>
                                <span style={{ fontFamily: "'Space Mono', monospace" }}>Est: {fmt(t.duration)}</span><span>•</span>
                                <span style={{ fontFamily: "'Space Mono', monospace", color: "var(--green)" }}>Real: {fmtS2M(real)}</span>
                                {diff > 0 && <span style={{ color: "var(--green)", fontWeight: 600 }}>⚡-{fmtS2M(diff)}</span>}
                                {diff < 0 && <span style={{ color: "var(--yellow)", fontWeight: 600 }}>🐢+{fmtS2M(-diff)}</span>}
                              </div>
                            </div>
                            <button onClick={() => del(t.id)} style={{ border: "none", background: "transparent", color: a("var(--text)", 15), cursor: "pointer", fontSize: 11 }}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════ TAB: ADICIONAR ════════════ */}
        {tab === "add" && (
          <div>
            {pageTitle("Nova Tarefa")}
            <div style={card()}>
              <label style={{ fontSize: 11, color: "var(--textDim)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, display: "block" }}>Nome da tarefa</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input ref={inputRef} value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="Ex: Revisar relatório trimestral"
                  style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 15, outline: "none", boxSizing: "border-box" }}
                  onKeyDown={e => e.key === "Enter" && addTaskFn()} />
                <button onClick={() => { setVoiceGuide(!voiceGuide); if (!voiceGuide) setTimeout(() => inputRef.current?.focus(), 50); }}
                  style={{ width: 46, height: 46, borderRadius: 10, border: "none", background: voiceGuide ? `linear-gradient(135deg,var(--accent),var(--purple))` : "var(--card)", color: voiceGuide ? "#fff" : "var(--textDim)", fontSize: 18, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.3s" }}>
                  🎤
                </button>
              </div>

              {voiceGuide && (() => {
                const p = getPlatform();
                const instructions = {
                  mac:     { title: "💻 Mac",     text: "Pressione Fn duas vezes. Ative em Ajustes → Teclado → Ditado." },
                  windows: { title: "💻 Windows", text: "Pressione Win + H para ativar Ditado por Voz." },
                  ios:     { title: "📱 iPhone",  text: "Toque no ícone 🎙️ no canto inferior do teclado." },
                  android: { title: "📱 Android", text: "Toque no ícone 🎙️ no teclado (Gboard)." },
                  other:   { title: "🎙️ Ditado",  text: "Celular: 🎙️ no teclado. Mac: Fn Fn. Windows: Win+H." },
                };
                const i = instructions[p] || instructions.other;
                return (
                  <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: a("var(--accent)", 6), border: `1px solid ${a("var(--accent)", 12)}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 4 }}>{i.title}</div>
                    <div style={{ fontSize: 12, color: "var(--textDim)", lineHeight: 1.5 }}>{i.text}</div>
                    <button onClick={() => { setVoiceGuide(false); setTimeout(() => inputRef.current?.focus(), 50); }}
                      style={{ marginTop: 8, padding: "6px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      Entendi, focar no campo →
                    </button>
                  </div>
                );
              })()}

              <label style={{ fontSize: 11, color: "var(--textDim)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, display: "block" }}>Categoria</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {Object.entries(CATEGORIES).map(([k, c]) => (
                  <button key={k} onClick={() => setNewTask({ ...newTask, category: k })} style={{
                    padding: "6px 12px", borderRadius: 8, border: "1px solid", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
                    borderColor: newTask.category === k ? c.color + "55" : "var(--border)",
                    background: newTask.category === k ? c.color + "15" : "transparent",
                    color: newTask.category === k ? c.color : "var(--textDim)",
                  }}>{c.icon} {c.label}</button>
                ))}
              </div>

              <label style={{ fontSize: 11, color: "var(--textDim)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, display: "block" }}>Prioridade</label>
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                {Object.entries(PRIORITIES).map(([k, p]) => (
                  <button key={k} onClick={() => setNewTask({ ...newTask, priority: k })} style={{
                    flex: 1, padding: 8, borderRadius: 8, border: "1px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    borderColor: newTask.priority === k ? a(p.color, 35) : "var(--border)",
                    background: newTask.priority === k ? a(p.color, 15) : "transparent",
                    color: newTask.priority === k ? p.color : "var(--textDim)",
                  }}>{p.label}</button>
                ))}
              </div>

              <label style={{ fontSize: 11, color: "var(--textDim)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, display: "block" }}>
                Duração estimada: <span style={{ color: "var(--accent)", fontFamily: "'Space Mono', monospace" }}>{fmt(newTask.duration)}</span>
              </label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {[5, 10, 15, 30, 45, 60, 90, 120].map(d => (
                  <button key={d} onClick={() => setNewTask({ ...newTask, duration: d })} style={{
                    padding: "6px 10px", borderRadius: 8, border: "1px solid", fontSize: 12, cursor: "pointer", fontFamily: "'Space Mono', monospace",
                    borderColor: newTask.duration === d ? a("var(--accent)", 35) : "var(--border)",
                    background: newTask.duration === d ? a("var(--accent)", 10) : "transparent",
                    color: newTask.duration === d ? "var(--accent)" : "var(--textDim)",
                  }}>{fmt(d)}</button>
                ))}
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 12, color: "var(--textDim)", cursor: "pointer" }}>
                <input type="checkbox" checked={newTask.recurring} onChange={e => setNewTask({ ...newTask, recurring: e.target.checked })} style={{ accentColor: "var(--accent)" }} />
                Tarefa recorrente (repete todo dia)
              </label>

              <button onClick={addTaskFn} style={{
                width: "100%", padding: 14, borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700,
                cursor: newTask.title.trim() ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.3s",
                background: newTask.title.trim() ? `linear-gradient(135deg, var(--accent), var(--yellow))` : "var(--card)",
                color: newTask.title.trim() ? "#fff" : a("var(--text)", 20),
                boxShadow: newTask.title.trim() ? `0 4px 20px ${a("var(--accent)", 30)}` : "none",
              }}>Adicionar Tarefa</button>
            </div>
          </div>
        )}

        {/* ════════════ TAB: ESTATÍSTICAS ════════════ */}
        {tab === "stats" && (
          <div>
            {pageTitle("Estatísticas")}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                { l: "Tarefas",    v: todayT.length,        s: null },
                { l: "Concluídas", v: done.length,           s: null },
                { l: "Estimado",   v: fmt(totalPlan),        s: "planejado" },
                { l: "Tempo Real", v: fmtS2M(totalRealSec),  s: "cronômetro" },
              ].map(({ l, v, s }) => (
                <div key={l} style={card({ padding: "14px 16px" })}>
                  <div style={{ fontSize: 10, color: "var(--textFaint)", marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "var(--text)" }}>{v}</div>
                  {s && <div style={{ fontSize: 9, color: "var(--textFaint)", marginTop: 2 }}>{s}</div>}
                </div>
              ))}
            </div>

            {done.length > 0 && (
              <div style={{
                ...card({ marginBottom: 14, textAlign: "center" }),
                background: timeSaved >= 0 ? a("var(--green)", 8) : a("var(--yellow)", 8),
                borderColor: timeSaved >= 0 ? a("var(--green)", 15) : a("var(--yellow)", 15),
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--textFaint)", marginBottom: 10 }}>Eficiência</div>
                <div style={{ fontSize: 38, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: timeSaved >= 0 ? "var(--green)" : "var(--yellow)" }}>
                  {timeSaved >= 0 ? "+" : "-"}{fmtS2M(Math.abs(timeSaved))}
                </div>
                <div style={{ fontSize: 12, color: "var(--textFaint)", marginTop: 2 }}>{timeSaved >= 0 ? "de tempo ganho" : "além do estimado"}</div>
                <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 20, fontSize: 11 }}>
                  <div><div style={{ color: "var(--textFaint)" }}>Estimado</div><div style={{ fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "var(--text)" }}>{fmtS2M(totalEstSec)}</div></div>
                  <div style={{ width: 1, background: "var(--border)" }} />
                  <div><div style={{ color: "var(--textFaint)" }}>Real</div><div style={{ fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "var(--text)" }}>{fmtS2M(totalRealSec)}</div></div>
                  <div style={{ width: 1, background: "var(--border)" }} />
                  <div><div style={{ color: "var(--textFaint)" }}>Taxa</div><div style={{ fontWeight: 700, fontFamily: "'Space Mono', monospace", color: timeSaved >= 0 ? "var(--green)" : "var(--yellow)" }}>{Math.abs(eff)}% <span style={{ fontSize: 9 }}>{timeSaved >= 0 ? "rápido" : "lento"}</span></div></div>
                </div>
                <div style={{ marginTop: 14, textAlign: "left" }}>
                  <div style={{ fontSize: 10, color: "var(--textFaint)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Por tarefa</div>
                  {done.map(t => {
                    const e2 = t.duration * 60, r = t.actualSeconds || 0, d = e2 - r, p = e2 > 0 ? Math.round((d / e2) * 100) : 0;
                    return (
                      <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${a("var(--text)", 3)}`, fontSize: 11 }}>
                        <span style={{ flex: 1, color: "var(--textDim)" }}>{t.title}</span>
                        <span style={{ color: "var(--textFaint)", fontFamily: "'Space Mono', monospace", fontSize: 10, marginRight: 8 }}>{fmtS2M(r)}/{fmt(t.duration)}</span>
                        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, color: d > 0 ? "var(--green)" : d < 0 ? "var(--yellow)" : "var(--textFaint)", minWidth: 48, textAlign: "right" }}>
                          {d > 0 ? `⚡${p}%` : d < 0 ? `🐢${Math.abs(p)}%` : "="}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={card({ marginBottom: 14 })}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--textFaint)", marginBottom: 12 }}>Por Categoria</div>
              {Object.entries(CATEGORIES).map(([k, c]) => {
                const ct = todayT.filter(t => t.category === k), cd = ct.filter(t => t.completed), rs = cd.reduce((s, t) => s + (t.actualSeconds || 0), 0);
                if (!ct.length) return null;
                return (
                  <div key={k} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: c.color, fontWeight: 600 }}>{c.icon} {c.label}</span>
                      <span style={{ fontSize: 11, color: "var(--textFaint)", fontFamily: "'Space Mono', monospace" }}>{cd.length}/{ct.length} • {fmtS2M(rs)}</span>
                    </div>
                    <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 3, width: `${(cd.length / ct.length) * 100}%`, background: c.color, transition: "width 0.4s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ ...card({ textAlign: "center", marginBottom: 14 }), background: a("var(--accent)", 6), borderColor: a("var(--accent)", 10) }}>
              <div style={{ fontSize: 36, marginBottom: 4 }}>🔥</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "var(--accent)" }}>{streak}</div>
              <div style={{ fontSize: 12, color: "var(--textFaint)", marginTop: 2 }}>dias consecutivos</div>
            </div>

            <button onClick={resetAll} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--textFaint)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
              Resetar dados
            </button>
          </div>
        )}

        {/* ════════════ TAB: PERSONALIZAR ════════════ */}
        {tab === "customize" && (
          <div>
            {pageTitle("Personalizar")}
            <div style={{ fontSize: 12, color: "var(--textDim)", marginBottom: 20, marginTop: -12 }}>
              Escolha a aparência do app. A preferência é salva na sua conta.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {Object.entries(THEMES).map(([key, t]) => {
                const isActive = theme === key;
                return (
                  <div key={key} onClick={() => applyTheme(key)} style={{
                    borderRadius: 14,
                    border: isActive ? `2px solid var(--accent)` : `1px solid var(--border)`,
                    padding: "14px",
                    cursor: "pointer",
                    background: t.bg2,
                    transition: "all 0.2s",
                    transform: isActive ? "scale(1.02)" : "scale(1)",
                    boxShadow: isActive ? `0 0 0 3px ${t.accent}22` : "none",
                  }}>
                    {/* Preview de cores */}
                    <div style={{ display: "flex", gap: 4, marginBottom: 10, height: 28, borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ flex: 3, background: t.bg1 }} />
                      <div style={{ flex: 1, background: t.accent }} />
                      <div style={{ flex: 1, background: t.green }} />
                    </div>
                    {/* Mini task mockup */}
                    <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, padding: "6px 8px", marginBottom: 8 }}>
                      <div style={{ width: "60%", height: 6, borderRadius: 3, background: t.text, opacity: 0.7, marginBottom: 4 }} />
                      <div style={{ width: "35%", height: 4, borderRadius: 3, background: t.accent, opacity: 0.6 }} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: t.text }}>{t.label}</div>
                    {isActive && (
                      <div style={{ fontSize: 9, color: t.accent, marginTop: 3, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>
                        ● Ativo
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Paleta de cores ativa */}
            <div style={{ ...card({ marginTop: 20 }) }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--textFaint)", marginBottom: 12 }}>
                Paleta — {THEMES[theme]?.label}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { label: "Accent",  color: "var(--accent)" },
                  { label: "Verde",   color: "var(--green)" },
                  { label: "Amarelo", color: "var(--yellow)" },
                  { label: "Azul",    color: "var(--blue)" },
                  { label: "Roxo",    color: "var(--purple)" },
                ].map(({ label, color }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: color, marginBottom: 4, border: "1px solid var(--border)" }} />
                    <div style={{ fontSize: 9, color: "var(--textFaint)" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ BOTTOM NAV ═══════════ */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: `color-mix(in srgb, var(--bg1) 92%, transparent)`,
        backdropFilter: "blur(16px)",
        borderTop: "1px solid var(--border)",
        zIndex: 100,
      }}>
        <div style={{ display: "flex", maxWidth: 520, margin: "0 auto", padding: "6px 0 env(safe-area-inset-bottom, 8px)" }}>
          {tabBtn("tasks",     "Tarefas")}
          {tabBtn("add",       "Adicionar")}
          {tabBtn("stats",     "Estatísticas")}
          {tabBtn("customize", "Personalizar")}
          <button onClick={onSignOut} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            padding: "8px 2px", border: "none", background: "transparent", cursor: "pointer",
            color: "var(--textFaint)", fontSize: 10, fontWeight: 400, fontFamily: "inherit",
            transition: "color 0.2s",
          }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: "transparent", marginBottom: 1 }} />
            Sair
          </button>
        </div>
      </div>

      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
          background: var(--accent); cursor: pointer;
          box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 40%, transparent);
        }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.85} }
        @keyframes slideD { from{transform:translateX(-50%) translateY(-16px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} }
        @keyframes spin   { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        button { font-family: inherit; }
        ::placeholder { color: var(--textFaint); }
      `}</style>
    </div>
  );
}
