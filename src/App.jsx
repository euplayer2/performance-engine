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

const PRIORITIES = {
  high:   { label: "Alta",  color: "var(--accent)", weight: 3 },
  medium: { label: "Média", color: "var(--yellow)", weight: 2 },
  low:    { label: "Baixa", color: "var(--blue)",   weight: 1 },
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
const fmtDate = () => new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

const card = (extra = {}) => ({
  background: "var(--card)", border: "1px solid var(--border)",
  borderRadius: 12, padding: "16px 20px", ...extra,
});

const a = (varName, pct) => `color-mix(in srgb, ${varName} ${pct}%, transparent)`;

const SIDEBAR_W = 200;
const SIDEBAR_COLLAPSED_W = 52;

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
  const [editingId, setEditingId]       = useState(null);
  const [editData, setEditData]         = useState(null);
  const [dataLoading, setDataLoading]   = useState(true);
  const [sidebarPinned, setSidebarPinned] = useState(true);
  const [sidebarHover, setSidebarHover]   = useState(false);
  const [pipActive, setPipActive]         = useState(false);
  const timerRef    = useRef(null);
  const inputRef    = useRef(null);
  const debounceRef = useRef(null);
  const pipWindowRef = useRef(null);
  const activeTimerRef = useRef(null);
  const pipActiveRef   = useRef(false);

  const sidebarOpen = sidebarPinned || sidebarHover;
  const sidebarW    = sidebarOpen ? SIDEBAR_W : SIDEBAR_COLLAPSED_W;

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

  // ─── Completion sound ───
  const playCompleteSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.12 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.5);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.5);
      });
      setTimeout(() => ctx.close(), 1500);
    } catch {}
  };

  // ─── Helper: recarregar tarefas ───
  const reloadTasks = useCallback(async () => {
    try { setTasks(await loadTasks()); }
    catch (err) { flash(`Erro ao recarregar: ${err.message}`); }
  }, []);

  // ─── Tarefa recorrente — idempotente ───
  const processRecurring = useCallback(async () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: doneRecurring } = await supabase
      .from("tasks").select("title, category, priority, duration")
      .eq("recurring", true).eq("completed", true).lt("date", todayStr);
    if (!doneRecurring?.length) return;
    const uniq = new Map();
    for (const r of doneRecurring) {
      uniq.set(`${r.title}|${r.category}|${r.priority}|${r.duration}`, r);
    }
    const { data: todayTasks } = await supabase
      .from("tasks").select("title, category, priority, duration").eq("date", todayStr);
    const existsToday = new Set((todayTasks || []).map(t => `${t.title}|${t.category}|${t.priority}|${t.duration}`));
    const toCreate = [...uniq.values()].filter(r => !existsToday.has(`${r.title}|${r.category}|${r.priority}|${r.duration}`));
    if (toCreate.length > 0) {
      const { data: { user: u } } = await supabase.auth.getUser();
      await supabase.from("tasks").insert(toCreate.map(r => ({
        ...r, user_id: u.id, recurring: true, date: todayStr,
        completed: false, timer_started: false, actual_seconds: 0,
      })));
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
        if (prefs.sidebarPinned !== undefined) setSidebarPinned(prefs.sidebarPinned);
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
      const now = new Date(), nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      timeoutId = setTimeout(async () => {
        await processRecurring();
        scheduleNextMidnight();
      }, nextMidnight.getTime() - now.getTime());
    };
    scheduleNextMidnight();
    return () => clearTimeout(timeoutId);
  }, [processRecurring]);

  // ─── availableTime com debounce ───
  const persistPrefs = useCallback((time) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try { await savePrefs({ availableTime: time }); }
      catch (err) { flash(`Erro ao salvar tempo: ${err.message}`); }
    }, 500);
  }, []);

  const handleAvailableTimeChange = (value) => { setAvailableTime(value); persistPrefs(value); };

  // ─── Tema ───
  const applyTheme = async (key) => {
    setTheme(key); flash("Tema aplicado");
    try { await savePrefs({ theme: key }); }
    catch (err) { flash(`Erro ao salvar tema: ${err.message}`); }
  };

  // ─── Sidebar toggle ───
  const toggleSidebarPin = async () => {
    const next = !sidebarPinned;
    setSidebarPinned(next);
    try { await savePrefs({ sidebarPinned: next }); } catch {}
  };

  // ─── Timer tick ───
  useEffect(() => {
    if (activeTimer) timerRef.current = setInterval(() => setTimerSec(s => s + 1), 1000);
    else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [activeTimer]);

  // ─── PiP: atualiza conteúdo ───
  useEffect(() => {
    if (!pipActive || !pipWindowRef.current || pipWindowRef.current.closed) {
      if (pipActive && (!pipWindowRef.current || pipWindowRef.current.closed)) setPipActive(false);
      return;
    }
    const t = tasks.find(x => x.id === activeTimer);
    if (!t) { closePip(); return; }
    const acc = (t.actualSeconds || 0) + timerSec;
    const est = t.duration * 60;
    const rem = Math.max(est - acc, 0);
    const over = acc > est;
    const overS = acc - est;
    const pct = Math.min((acc / est) * 100, 100);

    const doc = pipWindowRef.current.document;
    const timeEl = doc.getElementById("pip-time");
    const titleEl = doc.getElementById("pip-title");
    const barEl = doc.getElementById("pip-bar");
    const statusEl = doc.getElementById("pip-status");
    const metaEl = doc.getElementById("pip-meta");

    if (timeEl) timeEl.textContent = over ? `+${fmtSec(overS)}` : fmtSec(rem);
    if (timeEl) timeEl.style.color = over ? "#E8A93A" : "#E85D3A";
    if (titleEl) titleEl.textContent = t.title;
    if (barEl) barEl.style.width = `${pct}%`;
    if (barEl) barEl.style.background = over ? "#2EBD6B" : "#E85D3A";
    if (statusEl) statusEl.textContent = over ? "Prazo atingido" : "Focando";
    if (statusEl) statusEl.style.color = over ? "#2EBD6B" : "#E85D3A";
    if (metaEl) metaEl.textContent = `Real: ${fmtSec(acc)} / Est: ${fmt(t.duration)}`;
  }, [pipActive, activeTimer, timerSec, tasks]);

  // ─── PiP: abrir ───
  const openPip = async () => {
    if (!activeTimer) { flash("Inicie um timer antes"); return; }

    // Tentar Document PiP (Chrome 116+)
    if ("documentPictureInPicture" in window) {
      try {
        const pip = await window.documentPictureInPicture.requestWindow({
          width: 260, height: 155,
        });
        pipWindowRef.current = pip;
        pip.addEventListener("pagehide", () => { setPipActive(false); pipWindowRef.current = null; });

        const t = tasks.find(x => x.id === activeTimer);
        const tName = t ? t.title : "";

        pip.document.head.innerHTML = `<style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: #0D0D0F; color: #E8E8ED;
            display: flex; flex-direction: column;
            justify-content: center; align-items: center;
            height: 100vh; width: 100vw;
            padding: 2.5vh 3vw;
            user-select: none; overflow: hidden;
          }
          #pip-status {
            font-size: clamp(7px, 1.8vh, 10px); font-weight: 700;
            letter-spacing: 1.5px; text-transform: uppercase;
            color: #E85D3A; margin-bottom: 0.5vh;
          }
          #pip-title {
            font-size: clamp(10px, 2.2vh, 13px); font-weight: 600;
            margin-bottom: 0.8vh; text-align: center;
            width: 90vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          }
          #pip-time {
            font-size: clamp(26px, 9vh, 48px); font-weight: 800;
            font-family: 'Courier New', monospace; color: #E85D3A;
            line-height: 1; margin-bottom: 0.8vh;
          }
          #pip-bar-bg {
            width: 85vw; height: clamp(3px, 0.8vh, 5px);
            background: rgba(255,255,255,0.08); border-radius: 2px;
            margin-bottom: 0.6vh;
          }
          #pip-bar { height: 100%; border-radius: 2px; background: #E85D3A; transition: width 1s linear; }
          #pip-meta {
            font-size: clamp(8px, 1.6vh, 10px);
            color: rgba(232,232,237,0.4); margin-bottom: 1.2vh;
          }
          .pip-btns { display: flex; gap: 1.5vw; }
          .pip-btn {
            padding: clamp(4px,1vh,7px) clamp(10px,3.5vw,18px);
            border-radius: 6px; border: none;
            font-size: clamp(9px, 1.8vh, 12px); font-weight: 600;
            cursor: pointer; font-family: inherit; transition: opacity 0.2s;
          }
          .pip-btn:hover { opacity: 0.85; }
          .pip-btn-pause { background: rgba(255,255,255,0.08); color: #E8E8ED; border: 1px solid rgba(255,255,255,0.1); }
          .pip-btn-done  { background: #2EBD6B; color: #fff; }
        </style>`;

        pip.document.body.innerHTML = `
          <div id="pip-status">Focando</div>
          <div id="pip-title">${tName}</div>
          <div id="pip-time">00:00</div>
          <div id="pip-bar-bg"><div id="pip-bar" style="width:0%"></div></div>
          <div id="pip-meta">Real: 00:00 / Est: 0min</div>
          <div class="pip-btns">
            <button class="pip-btn pip-btn-pause" id="pip-pause">Pausar</button>
            <button class="pip-btn pip-btn-done" id="pip-done">Concluir</button>
          </div>
        `;

        pip.document.getElementById("pip-pause").addEventListener("click", () => {
          if (activeTimer) toggle(activeTimer);
        });
        pip.document.getElementById("pip-done").addEventListener("click", () => {
          if (activeTimer) { complete(activeTimer); closePip(); }
        });

        setPipActive(true);
        return;
      } catch (err) {
        console.warn("Document PiP failed, fallback to window.open", err);
      }
    }

    // Fallback: popout window
    const w = 260, h = 160;
    const left = window.screenX + window.outerWidth - w - 20;
    const top = window.screenY + 40;
    const popup = window.open("", "pip_timer", `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,resizable=yes`);
    if (!popup) { flash("Popup bloqueado pelo navegador"); return; }

    pipWindowRef.current = popup;

    const t = tasks.find(x => x.id === activeTimer);
    const tName = t ? t.title : "";

    popup.document.write(`<!DOCTYPE html><html><head><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body {
        font-family: 'Segoe UI', system-ui, sans-serif;
        background: #0D0D0F; color: #E8E8ED;
        display: flex; flex-direction: column;
        justify-content: center; align-items: center;
        height: 100vh; width: 100vw;
        padding: 2.5vh 3vw; user-select: none; overflow: hidden;
      }
      #pip-status {
        font-size: clamp(7px, 1.8vh, 10px); font-weight: 700;
        letter-spacing: 1.5px; text-transform: uppercase;
        color: #E85D3A; margin-bottom: 0.5vh;
      }
      #pip-title {
        font-size: clamp(10px, 2.2vh, 13px); font-weight: 600;
        margin-bottom: 0.8vh; text-align: center;
        width: 90vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      #pip-time {
        font-size: clamp(26px, 9vh, 48px); font-weight: 800;
        font-family: 'Courier New', monospace; color: #E85D3A;
        line-height: 1; margin-bottom: 0.8vh;
      }
      #pip-bar-bg {
        width: 85vw; height: clamp(3px, 0.8vh, 5px);
        background: rgba(255,255,255,0.08); border-radius: 2px;
        margin-bottom: 0.6vh;
      }
      #pip-bar { height: 100%; border-radius: 2px; background: #E85D3A; transition: width 1s linear; }
      #pip-meta {
        font-size: clamp(8px, 1.6vh, 10px);
        color: rgba(232,232,237,0.4); margin-bottom: 1.2vh;
      }
      .pip-btns { display: flex; gap: 1.5vw; }
      .pip-btn {
        padding: clamp(4px,1vh,7px) clamp(10px,3.5vw,18px);
        border-radius: 6px; border: none;
        font-size: clamp(9px, 1.8vh, 12px); font-weight: 600;
        cursor: pointer; font-family: inherit; transition: opacity 0.2s;
      }
      .pip-btn:hover { opacity: 0.85; }
      .pip-btn-pause { background: rgba(255,255,255,0.08); color: #E8E8ED; border: 1px solid rgba(255,255,255,0.1); }
      .pip-btn-done  { background: #2EBD6B; color: #fff; }
    </style></head><body>
      <div id="pip-status">Focando</div>
      <div id="pip-title">${tName}</div>
      <div id="pip-time">00:00</div>
      <div id="pip-bar-bg"><div id="pip-bar" style="width:0%"></div></div>
      <div id="pip-meta">Real: 00:00 / Est: 0min</div>
      <div class="pip-btns">
        <button class="pip-btn pip-btn-pause" id="pip-pause">Pausar</button>
        <button class="pip-btn pip-btn-done" id="pip-done">Concluir</button>
      </div>
    </body></html>`);
    popup.document.close();
    popup.document.title = "Performance Engine — Timer";

    // Precisamos delegar ações ao app via window.opener
    popup.document.getElementById("pip-pause").addEventListener("click", () => {
      try { if (window.opener !== null || true) toggle(activeTimer); } catch {}
    });
    popup.document.getElementById("pip-done").addEventListener("click", () => {
      try { complete(activeTimer); closePip(); } catch {}
    });

    const checkClosed = setInterval(() => {
      if (popup.closed) { clearInterval(checkClosed); setPipActive(false); pipWindowRef.current = null; }
    }, 500);

    setPipActive(true);
  };

  const closePip = () => {
    try { pipWindowRef.current?.close(); } catch {}
    pipWindowRef.current = null;
    setPipActive(false);
  };

  // Sync refs (para acesso em event listeners sem stale closure)
  useEffect(() => { activeTimerRef.current = activeTimer; }, [activeTimer]);
  useEffect(() => { pipActiveRef.current = pipActive; }, [pipActive]);

  // Fechar PiP quando timer para
  useEffect(() => {
    if (!activeTimer && pipActive) closePip();
  }, [activeTimer, pipActive]);

  // ─── Auto-abrir PiP ao trocar de aba (como streaming) ───
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && activeTimerRef.current && !pipActiveRef.current) {
        // Pequeno delay para garantir que o evento está completo
        setTimeout(() => openPip(), 100);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ─── Streak ───
  const streak = (() => {
    const doneDates = [...new Set(tasks.filter(t => t.completed).map(t => t.date))];
    if (!doneDates.length) return 0;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yestStr = yesterday.toISOString().split("T")[0];
    const lastDone = doneDates.sort().reverse()[0];
    if (lastDone < yestStr) return 0;
    let count = 1;
    const dSet = new Set(doneDates);
    const cur = new Date(lastDone + "T12:00:00");
    for (let i = 0; i < 365; i++) {
      cur.setDate(cur.getDate() - 1);
      const s = cur.toISOString().split("T")[0];
      if (dSet.has(s)) count++; else break;
    }
    return count;
  })();

  // ─── Actions ───
  const addTaskFn = async () => {
    if (!newTask.title.trim()) return;
    const optimistic = { id: uid(), ...newTask, date: dayDate, completed: false, timerStarted: false, actualSeconds: 0, createdAt: new Date().toISOString() };
    setTasks(prev => [...prev, optimistic]);
    setNewTask({ title: "", category: "work", priority: "medium", duration: 30, recurring: false });
    setTab("tasks"); flash("Tarefa adicionada!");
    try {
      const serverTask = await createTask(optimistic);
      setTasks(prev => prev.map(t => t.id === optimistic.id ? serverTask : t));
    } catch (err) { setTasks(prev => prev.filter(t => t.id !== optimistic.id)); flash(`Erro: ${err.message}`); }
  };

  const complete = async (id) => {
    const t = tasks.find(x => x.id === id); if (!t) return;
    if (!t.timerStarted) { flash("Inicie o timer antes!"); return; }
    let sec = t.actualSeconds || 0;
    if (activeTimer === id) { sec += timerSec; setActiveTimer(null); setTimerSec(0); }
    const patch = { completed: true, actualSeconds: sec };
    const prev = tasks.find(x => x.id === id);
    setTasks(tasks.map(x => x.id === id ? { ...x, ...patch } : x));
    playCompleteSound();
    try { await updateTask(id, patch); }
    catch (err) { setTasks(ts => ts.map(x => x.id === id ? prev : x)); flash(`Erro: ${err.message}`); }
  };

  const uncomplete = async (id) => {
    const prev = tasks.find(x => x.id === id);
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: false } : t));
    try { await updateTask(id, { completed: false }); }
    catch (err) { setTasks(ts => ts.map(x => x.id === id ? prev : x)); flash(`Erro: ${err.message}`); }
  };

  const del = async (id) => {
    const prev = [...tasks];
    setTasks(tasks.filter(t => t.id !== id));
    if (activeTimer === id) { setActiveTimer(null); setTimerSec(0); }
    if (editingId === id) { setEditingId(null); setEditData(null); }
    try { await deleteTask(id); }
    catch (err) { setTasks(prev); flash(`Erro: ${err.message}`); }
  };

  const startEdit = (id) => {
    const t = tasks.find(x => x.id === id); if (!t) return;
    setEditingId(id);
    setEditData({ title: t.title, category: t.category, priority: t.priority, duration: t.duration, recurring: t.recurring });
  };

  const saveEdit = async () => {
    if (!editData || !editingId) return;
    if (!editData.title.trim()) { flash("Digite um nome"); return; }
    const prev = tasks.find(t => t.id === editingId);
    setTasks(tasks.map(t => t.id === editingId ? { ...t, ...editData } : t));
    setEditingId(null); setEditData(null); flash("Tarefa atualizada!");
    try { await updateTask(editingId, editData); }
    catch (err) { setTasks(ts => ts.map(x => x.id === editingId ? prev : x)); flash(`Erro: ${err.message}`); }
  };

  const cancelEdit = () => { setEditingId(null); setEditData(null); };

  const toggle = async (id) => {
    if (activeTimer === id) {
      const sec = timerSec;
      setTasks(prev => prev.map(t => t.id === id ? { ...t, actualSeconds: (t.actualSeconds || 0) + sec } : t));
      setActiveTimer(null); setTimerSec(0);
      try { const t = tasks.find(x => x.id === id); await updateTask(id, { actualSeconds: (t?.actualSeconds || 0) + sec }); }
      catch (err) { flash(`Erro: ${err.message}`); }
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
    const prevTasks = [...tasks]; setTasks([]); setAvailableTime(480);
    try { await Promise.all(prevTasks.map(t => deleteTask(t.id))); await savePrefs({ availableTime: 480 }); }
    catch (err) { setTasks(prevTasks); flash(`Erro: ${err.message}`); }
  };

  // ─── Sidebar nav item ───
  const navItem = (key, label) => (
    <button key={key} onClick={() => setTab(key)} title={label} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", borderRadius: 8, marginBottom: 2,
      width: "100%", border: "none",
      background: tab === key ? a("var(--accent)", 15) : "transparent",
      color: tab === key ? "var(--accent)" : "var(--textDim)",
      cursor: "pointer", fontFamily: "inherit", fontSize: 13,
      fontWeight: tab === key ? 600 : 400,
      transition: "all 0.2s", textAlign: "left",
      overflow: "hidden", whiteSpace: "nowrap",
    }}>
      {/* Icon dot indicating active tab */}
      <span style={{
        width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
        background: tab === key ? "var(--accent)" : a("var(--text)", 12),
      }} />
      {sidebarOpen && <span>{label}</span>}
    </button>
  );

  // ─── Loading ───
  if (dataLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0D0D0F", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Outfit',sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 32, height: 32, border: "3px solid rgba(232,93,58,0.2)", borderTopColor: "#E85D3A", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
          <div style={{ fontSize: 11, color: "rgba(232,232,237,0.3)", marginTop: 14, letterSpacing: 2, textTransform: "uppercase" }}>Carregando...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const PAGE_TITLES = {
    tasks:     "Minhas Tarefas",
    add:       "Nova Tarefa",
    stats:     "Estatísticas",
    customize: "Personalizar",
  };

  return (
    <div style={{
      display: "flex", minHeight: "100vh",
      background: `linear-gradient(165deg, var(--bg1) 0%, var(--bg2) 40%, var(--bg3) 100%)`,
      fontFamily: "'Outfit', sans-serif", color: "var(--text)",
    }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: a("var(--accent)", 95), color: "var(--text)", padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: `0 4px 20px ${a("var(--accent)", 40)}`, animation: "slideD 0.3s ease", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      {/* ═══════════════════ SIDEBAR ═══════════════════ */}
      <aside
        onMouseEnter={() => !sidebarPinned && setSidebarHover(true)}
        onMouseLeave={() => !sidebarPinned && setSidebarHover(false)}
        style={{
          width: sidebarW, flexShrink: 0,
          background: `color-mix(in srgb, var(--bg1) 94%, black)`,
          borderRight: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
          position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 50,
          transition: "width 0.25s ease",
          overflow: "hidden",
        }}>
        {/* Logo */}
        <div style={{ padding: sidebarOpen ? "20px 16px 16px" : "20px 10px 16px", borderBottom: "1px solid var(--border)", minHeight: 80, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {sidebarOpen ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ color: "var(--accent)", fontSize: 14 }}>●</span>
                <div style={{ fontSize: 8, fontFamily: "'Space Mono', monospace", color: "var(--accent)", letterSpacing: 2, textTransform: "uppercase", lineHeight: 1.5 }}>
                  PERFORMANCE<br />ENGINE
                </div>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2, color: "var(--text)" }}>
                Seu Dia, <span style={{ color: "var(--accent)" }}>Otimizado</span>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center" }}>
              <span style={{ color: "var(--accent)", fontSize: 14, fontWeight: 700 }}>PE</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: sidebarOpen ? "12px 8px" : "12px 6px", overflowY: "auto" }}>
          {navItem("tasks",     "Tarefas")}
          {navItem("add",       "Adicionar")}
          {navItem("stats",     "Estatísticas")}
          {navItem("customize", "Personalizar")}
        </nav>

        {/* Bottom: quote + pin + sair */}
        <div style={{ padding: sidebarOpen ? "12px 12px 16px" : "12px 6px 16px", borderTop: "1px solid var(--border)" }}>
          {sidebarOpen && (
            <div style={{ ...card({ padding: "12px 14px", marginBottom: 8 }), fontSize: 11, fontStyle: "italic", color: "var(--textFaint)", lineHeight: 1.6 }}>
              "{motivation}"
            </div>
          )}

          {/* Pin toggle */}
          <button onClick={toggleSidebarPin} title={sidebarPinned ? "Retrair barra lateral" : "Fixar barra lateral"} style={{
            width: "100%", padding: sidebarOpen ? "7px 12px" : "7px", borderRadius: 8,
            border: "1px solid var(--border)", background: sidebarPinned ? a("var(--accent)", 8) : "transparent",
            color: sidebarPinned ? "var(--accent)" : "var(--textFaint)", fontSize: 12, cursor: "pointer",
            fontFamily: "inherit", transition: "all 0.2s", textAlign: "center", marginBottom: 6,
            display: "flex", alignItems: "center", justifyContent: sidebarOpen ? "flex-start" : "center", gap: 8,
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{sidebarPinned ? "◀" : "▶"}</span>
            {sidebarOpen && <span>{sidebarPinned ? "Retrair" : "Fixar"}</span>}
          </button>

          {sidebarOpen && (
            <button onClick={onSignOut} style={{
              width: "100%", padding: "8px 12px", borderRadius: 8,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--textFaint)", fontSize: 12, cursor: "pointer",
              fontFamily: "inherit", transition: "all 0.2s", textAlign: "left",
            }}>
              Sair
            </button>
          )}
        </div>
      </aside>

      {/* ═══════════════════ MAIN CONTENT ═══════════════════ */}
      <main style={{ marginLeft: sidebarW, flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh", transition: "margin-left 0.25s ease" }}>

        {/* Top header */}
        <div style={{
          padding: "22px 32px 18px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          borderBottom: "1px solid var(--border)",
          background: a("var(--bg1)", 40),
          backdropFilter: "blur(8px)",
          position: "sticky", top: 0, zIndex: 10,
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, margin: 0, color: "var(--text)" }}>{PAGE_TITLES[tab]}</h1>
          <div style={{ fontSize: 12, color: "var(--textFaint)", textTransform: "capitalize" }}>{fmtDate()}</div>
        </div>

        {/* ─── ACTIVE TIMER ─── */}
        {activeTimer && (() => {
          const t = tasks.find(x => x.id === activeTimer); if (!t) return null;
          const acc = (t.actualSeconds || 0) + timerSec, est = t.duration * 60;
          const rem = Math.max(est - acc, 0), over = acc > est, overS = acc - est;
          const p = Math.min((acc / est) * 100, 100);
          return (
            <div style={{ margin: "16px 32px 0", ...card({ padding: "14px 20px" }), borderColor: over ? a("var(--green)", 25) : a("var(--accent)", 25), background: over ? a("var(--green)", 5) : a("var(--accent)", 5), display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: over ? "var(--green)" : "var(--accent)", marginBottom: 3 }}>
                  {over ? "Prazo atingido" : "Focando"}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{t.title}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                  <div style={{ height: "100%", width: `${p}%`, background: over ? "var(--green)" : "var(--accent)", transition: "width 1s linear", borderRadius: 2 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--textFaint)" }}>
                  <span>Real: {fmtSec(acc)}</span><span>Est: {fmt(t.duration)}</span>
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: over ? "var(--yellow)" : "var(--accent)", flexShrink: 0 }}>
                {over ? `+${fmtSec(overS)}` : fmtSec(rem)}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => toggle(activeTimer)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Pausar</button>
                <button onClick={() => complete(activeTimer)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "var(--green)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Concluir</button>
                <button onClick={pipActive ? closePip : openPip} title={pipActive ? "Fechar pop-out" : "Timer pop-out (PiP)"} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: pipActive ? a("var(--accent)", 15) : "var(--card)", color: pipActive ? "var(--accent)" : "var(--textFaint)", fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {/* PiP icon: small square overlapping big square */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="1" y="2" width="14" height="11" rx="1.5" />
                    <rect x="8" y="7" width="6" height="5" rx="1" fill="currentColor" opacity="0.3" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })()}

        {/* ─── CONTENT AREA ─── */}
        <div style={{ padding: "24px 32px", flex: 1 }}>

          {/* ══════════ TAB: TAREFAS ══════════ */}
          {tab === "tasks" && (
            <div>
              {/* Top row: Time slider + Progress */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>

                {/* Tempo hoje */}
                <div style={card()}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: "var(--textDim)", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>Tempo hoje</span>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)", fontFamily: "'Space Mono', monospace" }}>{fmt(availableTime)}</span>
                  </div>
                  <input type="range" min={30} max={960} step={15} value={availableTime}
                    onChange={e => handleAvailableTimeChange(+e.target.value)}
                    style={{ width: "100%", height: 5, appearance: "none", background: `linear-gradient(to right, var(--accent) ${(availableTime / 960) * 100}%, var(--border) ${(availableTime / 960) * 100}%)`, borderRadius: 3, outline: "none", cursor: "pointer" }} />
                </div>

                {/* Progresso */}
                <div style={card()}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Progresso</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: rate >= 80 ? "var(--green)" : rate >= 40 ? "var(--yellow)" : "var(--accent)", fontFamily: "'Space Mono', monospace" }}>{rate}%</span>
                  </div>
                  <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ height: "100%", borderRadius: 3, width: `${pctDone}%`, background: pctDone >= 80 ? `linear-gradient(90deg,var(--green),${a("var(--green)", 80)})` : pctDone >= 40 ? `linear-gradient(90deg,var(--yellow),${a("var(--yellow)", 80)})` : `linear-gradient(90deg,var(--accent),var(--yellow))`, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--textFaint)" }}>
                    <span>{done.length}/{todayT.length} tarefas / Real: {fmtS2M(totalRealSec)}</span>
                    <span>{freeMin >= 0 ? `${fmt(freeMin)} livre` : `${fmt(-freeMin)} extra`}</span>
                  </div>
                  {timeSaved > 0 && done.length > 0 && (
                    <div style={{ marginTop: 8, padding: "5px 10px", borderRadius: 6, background: a("var(--green)", 8), border: `1px solid ${a("var(--green)", 15)}`, fontSize: 11, color: "var(--green)", textAlign: "center" }}>
                      {fmtS2M(timeSaved)} ganhos — {eff}% mais rápido
                    </div>
                  )}
                  {streak > 0 && <div style={{ marginTop: 6, fontSize: 11, color: "var(--textFaint)", textAlign: "center" }}>{streak} dias consecutivos</div>}
                </div>
              </div>

              {/* Task list */}
              {sorted.length === 0 && done.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", ...card(), border: `1px dashed var(--border)` }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>Nenhuma tarefa</div>
                  <div style={{ fontSize: 13, color: "var(--textFaint)" }}>Clique em <strong>Adicionar</strong> para começar</div>
                </div>
              ) : (
                <>
                  {sorted.length > 0 && (
                    <div style={{ fontSize: 10, color: "var(--textFaint)", marginBottom: 10, letterSpacing: 0.5, textTransform: "uppercase" }}>
                      Inicie o timer para poder concluir
                    </div>
                  )}

                  {sorted.map(t => {
                    const cat = CATEGORIES[t.category], pri = PRIORITIES[t.priority];
                    const active = activeTimer === t.id;
                    const acc = (t.actualSeconds || 0) + (active ? timerSec : 0);
                    const started = t.timerStarted;
                    const isEditing = editingId === t.id;
                    return (
                      <div key={t.id} style={{
                        ...card({ marginBottom: 8, padding: "12px 16px" }),
                        borderLeft: `3px solid ${pri.color}`,
                        borderColor: isEditing ? a("var(--blue)", 30) : active ? a("var(--accent)", 25) : undefined,
                        background: isEditing ? a("var(--blue)", 4) : active ? a("var(--accent)", 5) : "var(--card)",
                      }}>
                        {!isEditing ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <button onClick={() => complete(t.id)} title={started ? "Concluir" : "Inicie o timer"}
                              style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${started ? a("var(--green)", 40) : a("var(--text)", 7)}`, background: "transparent", cursor: started ? "pointer" : "not-allowed", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: started ? "var(--green)" : a("var(--text)", 12) }}>
                              {started ? "✓" : "—"}
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, color: "var(--text)" }}>
                                {t.title}{t.recurring ? " ↺" : ""}
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, flexWrap: "wrap" }}>
                                <span style={{ color: cat.color }}>{cat.icon} {cat.label}</span>
                                <span style={{ color: a("var(--text)", 20) }}>·</span>
                                <span style={{ color: "var(--textFaint)", fontFamily: "'Space Mono', monospace" }}>{fmt(t.duration)}</span>
                                {acc > 0 && <>
                                  <span style={{ color: a("var(--text)", 20) }}>·</span>
                                  <span style={{ color: acc > t.duration * 60 ? "var(--yellow)" : "var(--green)", fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>{fmtSec(acc)}</span>
                                </>}
                              </div>
                            </div>
                            <button onClick={() => toggle(t.id)} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid var(--border)", background: active ? a("var(--accent)", 15) : "var(--card)", color: active ? "var(--accent)" : "var(--textFaint)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                              {active ? "||" : "▶"}
                            </button>
                            <button onClick={() => startEdit(t.id)} style={{ width: 30, height: 30, borderRadius: 7, border: "none", background: "var(--card)", color: "var(--textFaint)", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z"/></svg>
                            </button>
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
                                <button key={k} onClick={() => setEditData({ ...editData, category: k })} style={{ padding: "5px 10px", borderRadius: 6, fontSize: 11, border: "1px solid", cursor: "pointer", fontFamily: "inherit", borderColor: editData.category === k ? c.color + "55" : "var(--border)", background: editData.category === k ? c.color + "15" : "transparent", color: editData.category === k ? c.color : "var(--textFaint)" }}>
                                  {c.icon} {c.label}
                                </button>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                              {Object.entries(PRIORITIES).map(([k, p]) => (
                                <button key={k} onClick={() => setEditData({ ...editData, priority: k })} style={{ flex: 1, padding: "6px", borderRadius: 6, fontSize: 11, fontWeight: 600, border: "1px solid", cursor: "pointer", fontFamily: "inherit", borderColor: editData.priority === k ? a(p.color, 35) : "var(--border)", background: editData.priority === k ? a(p.color, 15) : "transparent", color: editData.priority === k ? p.color : "var(--textFaint)" }}>
                                  {p.label}
                                </button>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                              {[5, 10, 15, 30, 45, 60, 90, 120].map(d => (
                                <button key={d} onClick={() => setEditData({ ...editData, duration: d })} style={{ padding: "5px 8px", borderRadius: 6, fontSize: 10, border: "1px solid", cursor: "pointer", fontFamily: "'Space Mono', monospace", borderColor: editData.duration === d ? a("var(--accent)", 35) : "var(--border)", background: editData.duration === d ? a("var(--accent)", 10) : "transparent", color: editData.duration === d ? "var(--accent)" : "var(--textFaint)" }}>
                                  {fmt(d)}
                                </button>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={saveEdit} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "var(--blue)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Salvar</button>
                              <button onClick={cancelEdit} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--textDim)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {done.length > 0 && (
                    <>
                      <button onClick={() => setShowDone(!showDone)} style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${a("var(--green)", 10)}`, background: a("var(--green)", 3), color: "var(--green)", fontSize: 11, cursor: "pointer", marginTop: 6, fontFamily: "inherit" }}>
                        {done.length} concluída{done.length > 1 ? "s" : ""} {showDone ? "▲" : "▼"}
                      </button>
                      {showDone && done.map(t => {
                        const cat = CATEGORIES[t.category], est = t.duration * 60, real = t.actualSeconds || 0, diff = est - real;
                        return (
                          <div key={t.id} style={{ ...card({ marginTop: 6, padding: "10px 16px" }), background: a("var(--green)", 3), borderColor: a("var(--green)", 8) }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <button onClick={() => uncomplete(t.id)} style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "var(--green)", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✓</button>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, textDecoration: "line-through", color: a("var(--text)", 40) }}>{t.title}</div>
                                <div style={{ fontSize: 10, color: "var(--textFaint)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  <span>{cat.icon} {cat.label}</span><span>·</span>
                                  <span style={{ fontFamily: "'Space Mono', monospace" }}>Est: {fmt(t.duration)}</span><span>·</span>
                                  <span style={{ fontFamily: "'Space Mono', monospace", color: "var(--green)" }}>Real: {fmtS2M(real)}</span>
                                  {diff > 0 && <span style={{ color: "var(--green)", fontWeight: 600 }}>-{fmtS2M(diff)}</span>}
                                  {diff < 0 && <span style={{ color: "var(--yellow)", fontWeight: 600 }}>+{fmtS2M(-diff)}</span>}
                                </div>
                              </div>
                              <button onClick={() => del(t.id)} style={{ border: "none", background: "transparent", color: a("var(--text)", 15), cursor: "pointer", fontSize: 12 }}>✕</button>
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

          {/* ══════════ TAB: ADICIONAR ══════════ */}
          {tab === "add" && (
            <div style={{ maxWidth: 680 }}>
              <div style={card()}>
                <label style={{ fontSize: 11, color: "var(--textDim)", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, display: "block" }}>Nome da tarefa</label>
                <input ref={inputRef} value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="Ex: Revisar relatório trimestral"
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: a("var(--text)", 4), color: "var(--text)", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 20 }}
                  onKeyDown={e => e.key === "Enter" && addTaskFn()} />

                <label style={{ fontSize: 11, color: "var(--textDim)", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, display: "block" }}>Categoria</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                  {Object.entries(CATEGORIES).map(([k, c]) => (
                    <button key={k} onClick={() => setNewTask({ ...newTask, category: k })} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", borderColor: newTask.category === k ? c.color + "55" : "var(--border)", background: newTask.category === k ? c.color + "15" : "transparent", color: newTask.category === k ? c.color : "var(--textDim)" }}>
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>

                <label style={{ fontSize: 11, color: "var(--textDim)", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, display: "block" }}>Prioridade</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  {Object.entries(PRIORITIES).map(([k, p]) => (
                    <button key={k} onClick={() => setNewTask({ ...newTask, priority: k })} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", borderColor: newTask.priority === k ? a(p.color, 35) : "var(--border)", background: newTask.priority === k ? a(p.color, 15) : "transparent", color: newTask.priority === k ? p.color : "var(--textDim)" }}>
                      {p.label}
                    </button>
                  ))}
                </div>

                <label style={{ fontSize: 11, color: "var(--textDim)", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, display: "block" }}>
                  Duração estimada: <span style={{ color: "var(--accent)", fontFamily: "'Space Mono', monospace" }}>{fmt(newTask.duration)}</span>
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                  {[5, 10, 15, 30, 45, 60, 90, 120].map(d => (
                    <button key={d} onClick={() => setNewTask({ ...newTask, duration: d })} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid", fontSize: 12, cursor: "pointer", fontFamily: "'Space Mono', monospace", borderColor: newTask.duration === d ? a("var(--accent)", 35) : "var(--border)", background: newTask.duration === d ? a("var(--accent)", 10) : "transparent", color: newTask.duration === d ? "var(--accent)" : "var(--textDim)" }}>
                      {fmt(d)}
                    </button>
                  ))}
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, fontSize: 13, color: "var(--textDim)", cursor: "pointer" }}>
                  <input type="checkbox" checked={newTask.recurring} onChange={e => setNewTask({ ...newTask, recurring: e.target.checked })} style={{ accentColor: "var(--accent)" }} />
                  Tarefa recorrente (repete todo dia)
                </label>

                <button onClick={addTaskFn} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: newTask.title.trim() ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.3s", background: newTask.title.trim() ? `linear-gradient(135deg, var(--accent), var(--yellow))` : "var(--card)", color: newTask.title.trim() ? "#fff" : a("var(--text)", 20), boxShadow: newTask.title.trim() ? `0 4px 20px ${a("var(--accent)", 30)}` : "none" }}>
                  Adicionar Tarefa
                </button>
              </div>
            </div>
          )}

          {/* ══════════ TAB: ESTATÍSTICAS ══════════ */}
          {tab === "stats" && (
            <div>
              {/* 4-column stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                {[
                  { l: "Tarefas",    v: todayT.length,       sub: null },
                  { l: "Concluídas", v: done.length,          sub: null },
                  { l: "Estimado",   v: fmt(totalPlan),       sub: "planejado" },
                  { l: "Tempo Real", v: fmtS2M(totalRealSec), sub: "cronômetro" },
                ].map(({ l, v, sub }) => (
                  <div key={l} style={card({ padding: "14px 16px" })}>
                    <div style={{ fontSize: 10, color: "var(--textFaint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{l}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "var(--text)" }}>{v}</div>
                    {sub && <div style={{ fontSize: 9, color: "var(--textFaint)", marginTop: 2 }}>{sub}</div>}
                  </div>
                ))}
              </div>

              {/* Eficiência */}
              {done.length > 0 && (
                <div style={{ ...card({ marginBottom: 16 }), display: "flex", alignItems: "center", gap: 20, background: timeSaved >= 0 ? a("var(--green)", 6) : a("var(--yellow)", 6), borderColor: timeSaved >= 0 ? a("var(--green)", 15) : a("var(--yellow)", 15) }}>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: "var(--textFaint)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Eficiência</div>
                    <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: timeSaved >= 0 ? "var(--green)" : "var(--yellow)" }}>
                      {timeSaved >= 0 ? "+" : "-"}{fmtS2M(Math.abs(timeSaved))}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--textFaint)" }}>{timeSaved >= 0 ? "de tempo ganho" : "além do estimado"}</div>
                  </div>
                  <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: "var(--textFaint)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Por tarefa</div>
                    {done.map(t => {
                      const e2 = t.duration * 60, r = t.actualSeconds || 0, d = e2 - r, p = e2 > 0 ? Math.round((d / e2) * 100) : 0;
                      return (
                        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${a("var(--text)", 3)}`, fontSize: 12 }}>
                          <span style={{ flex: 1, color: "var(--textDim)" }}>{t.title}</span>
                          <span style={{ color: "var(--textFaint)", fontFamily: "'Space Mono', monospace", fontSize: 10, marginRight: 10 }}>{fmtS2M(r)}/{fmt(t.duration)}</span>
                          <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, color: d > 0 ? "var(--green)" : d < 0 ? "var(--yellow)" : "var(--textFaint)", minWidth: 52, textAlign: "right" }}>
                            {d > 0 ? `-${p}%` : d < 0 ? `+${Math.abs(p)}%` : "="}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Por categoria */}
              <div style={card({ marginBottom: 16 })}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--textFaint)", marginBottom: 14 }}>Por Categoria</div>
                {Object.entries(CATEGORIES).map(([k, c]) => {
                  const ct = todayT.filter(t => t.category === k), cd = ct.filter(t => t.completed), rs = cd.reduce((s, t) => s + (t.actualSeconds || 0), 0);
                  if (!ct.length) return null;
                  return (
                    <div key={k} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: c.color, fontWeight: 600 }}>{c.icon} {c.label}</span>
                        <span style={{ fontSize: 11, color: "var(--textFaint)", fontFamily: "'Space Mono', monospace" }}>{cd.length}/{ct.length} · {fmtS2M(rs)}</span>
                      </div>
                      <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 3, width: `${(cd.length / ct.length) * 100}%`, background: c.color, transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom row: Streak + Gerenciar */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ ...card({ textAlign: "center" }), background: a("var(--accent)", 6), borderColor: a("var(--accent)", 10) }}>
                  <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "var(--accent)", marginBottom: 4 }}>{streak}</div>
                  <div style={{ fontSize: 12, color: "var(--textFaint)" }}>dias consecutivos</div>
                </div>
                <div style={card()}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--textFaint)", marginBottom: 14 }}>Gerenciar dados</div>
                  <button onClick={resetAll} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--textFaint)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    Resetar tudo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════ TAB: PERSONALIZAR ══════════ */}
          {tab === "customize" && (
            <div style={{ maxWidth: 700 }}>
              <div style={{ fontSize: 13, color: "var(--textDim)", marginBottom: 20 }}>
                Escolha a aparência do app. A preferência é salva na sua conta.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 24 }}>
                {Object.entries(THEMES).map(([key, t]) => {
                  const isActive = theme === key;
                  return (
                    <div key={key} onClick={() => applyTheme(key)} style={{ borderRadius: 14, border: isActive ? `2px solid var(--accent)` : `1px solid var(--border)`, padding: "14px", cursor: "pointer", background: t.bg2, transition: "all 0.2s", transform: isActive ? "scale(1.02)" : "scale(1)", boxShadow: isActive ? `0 0 0 3px ${t.accent}22` : "none" }}>
                      <div style={{ display: "flex", gap: 4, marginBottom: 10, height: 28, borderRadius: 8, overflow: "hidden" }}>
                        <div style={{ flex: 3, background: t.bg1 }} />
                        <div style={{ flex: 1, background: t.accent }} />
                        <div style={{ flex: 1, background: t.green }} />
                      </div>
                      <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, padding: "6px 8px", marginBottom: 8 }}>
                        <div style={{ width: "60%", height: 6, borderRadius: 3, background: t.text, opacity: 0.7, marginBottom: 4 }} />
                        <div style={{ width: "35%", height: 4, borderRadius: 3, background: t.accent, opacity: 0.6 }} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{t.label}</div>
                      {isActive && <div style={{ fontSize: 9, color: t.accent, marginTop: 3, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>Ativo</div>}
                    </div>
                  );
                })}
              </div>

              <div style={card()}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--textFaint)", marginBottom: 12 }}>
                  Paleta — {THEMES[theme]?.label}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {[
                    { label: "Accent", color: "var(--accent)" },
                    { label: "Verde",  color: "var(--green)" },
                    { label: "Amarelo", color: "var(--yellow)" },
                    { label: "Azul",   color: "var(--blue)" },
                    { label: "Roxo",   color: "var(--purple)" },
                  ].map(({ label, color }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: color, marginBottom: 4, border: "1px solid var(--border)" }} />
                      <div style={{ fontSize: 9, color: "var(--textFaint)" }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

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
        nav button:hover { background: color-mix(in srgb, var(--accent) 8%, transparent) !important; }
      `}</style>
    </div>
  );
}
