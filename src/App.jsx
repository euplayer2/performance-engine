import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "daily-organizer-v4";
const CATEGORIES = {
  work: { label: "Trabalho", icon: "💼", color: "#E85D3A" },
  study: { label: "Estudo", icon: "📚", color: "#3A8FE8" },
  health: { label: "Saúde", icon: "🏃", color: "#2EBD6B" },
  personal: { label: "Pessoal", icon: "🧘", color: "#B45CE8" },
  home: { label: "Casa", icon: "🏠", color: "#E8A93A" },
};
const PRIORITIES = {
  high: { label: "Alta", color: "#E85D3A", weight: 3 },
  medium: { label: "Média", color: "#E8A93A", weight: 2 },
  low: { label: "Baixa", color: "#3A8FE8", weight: 1 },
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
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (min) => { if (min < 60) return `${min}min`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h}h${m}` : `${h}h`; };
const fmtSec = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const fmtS2M = (s) => fmt(Math.round(s / 60));
const today = () => new Date().toISOString().split("T")[0];

// ─── Shared card style ───
const card = (extra = {}) => ({
  background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 16, padding: "16px 18px", ...extra,
});

// ─── Voice guide helper ───
const getPlatform = () => {
  const u = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(u)) return "ios";
  if (/Android/.test(u)) return "android";
  if (/Mac/.test(u)) return "mac";
  if (/Win/.test(u)) return "windows";
  return "other";
};

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [availableTime, setAvailableTime] = useState(480);
  const [tab, setTab] = useState("tasks");
  const [newTask, setNewTask] = useState({ title: "", category: "work", priority: "medium", duration: 30, recurring: false });
  const [motivation] = useState(MOTIV[Math.floor(Math.random() * MOTIV.length)]);
  const [dayDate] = useState(today());
  const [showDone, setShowDone] = useState(false);
  const [activeTimer, setActiveTimer] = useState(null);
  const [timerSec, setTimerSec] = useState(0);
  const [toast, setToast] = useState(null);
  const [voiceGuide, setVoiceGuide] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const timerRef = useRef(null);
  const inputRef = useRef(null);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  // ─── Completion sound via Web Audio API ───
  const playCompleteSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 — major chord arpeggio
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

  // ─── Storage ───
  useEffect(() => {
    (async () => { try { const r = await window.storage.get(STORAGE_KEY); if (r) { const d = JSON.parse(r.value); setTasks(d.tasks || []); setAvailableTime(d.availableTime || 480); } } catch {} })();
  }, []);
  useEffect(() => {
    if (tasks.length || availableTime !== 480) (async () => { try { await window.storage.set(STORAGE_KEY, JSON.stringify({ tasks, availableTime })); } catch {} })();
  }, [tasks, availableTime]);

  // ─── Timer tick ───
  useEffect(() => {
    if (activeTimer) timerRef.current = setInterval(() => setTimerSec(s => s + 1), 1000);
    else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [activeTimer]);

  // ─── Derived ───
  const todayT = tasks.filter(t => t.date === dayDate);
  const pending = todayT.filter(t => !t.completed);
  const done = todayT.filter(t => t.completed);
  const sorted = [...pending].sort((a, b) => { const d = PRIORITIES[b.priority].weight - PRIORITIES[a.priority].weight; return d || a.duration - b.duration; });
  const totalPlan = todayT.reduce((s, t) => s + t.duration, 0);
  const totalRealSec = done.reduce((s, t) => s + (t.actualSeconds || 0), 0);
  const totalEstSec = done.reduce((s, t) => s + t.duration * 60, 0);
  const saved = totalEstSec - totalRealSec;
  const doneMin = done.reduce((s, t) => s + t.duration, 0);
  const freeMin = availableTime - totalPlan;
  const pctDone = availableTime > 0 ? Math.min((doneMin / availableTime) * 100, 100) : 0;
  const rate = todayT.length ? Math.round((done.length / todayT.length) * 100) : 0;
  const eff = totalEstSec > 0 ? Math.round((saved / totalEstSec) * 100) : 0;

  const streak = (() => {
    const ds = [...new Set(tasks.filter(t => t.completed).map(t => t.date))].sort().reverse();
    let s = 0, d = new Date();
    for (let i = 0; i < 30; i++) { const c = d.toISOString().split("T")[0]; if (ds.includes(c)) { s++; d.setDate(d.getDate() - 1); } else if (i === 0) { d.setDate(d.getDate() - 1); } else break; }
    return s;
  })();

  // ─── Actions ───
  const addTaskFn = () => {
    if (!newTask.title.trim()) return;
    setTasks([...tasks, { id: uid(), ...newTask, date: dayDate, completed: false, createdAt: Date.now(), timerStarted: false, actualSeconds: 0 }]);
    setNewTask({ title: "", category: "work", priority: "medium", duration: 30, recurring: false });
    setTab("tasks");
    flash("✅ Tarefa adicionada!");
  };
  const complete = (id) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    if (!t.timerStarted) { flash("⏱ Inicie o timer antes!"); return; }
    let sec = t.actualSeconds || 0;
    if (activeTimer === id) { sec += timerSec; setActiveTimer(null); setTimerSec(0); }
    setTasks(tasks.map(x => x.id === id ? { ...x, completed: true, actualSeconds: sec } : x));
    playCompleteSound();
  };
  const uncomplete = (id) => setTasks(tasks.map(t => t.id === id ? { ...t, completed: false } : t));
  const del = (id) => { setTasks(tasks.filter(t => t.id !== id)); if (activeTimer === id) { setActiveTimer(null); setTimerSec(0); } if (editingId === id) { setEditingId(null); setEditData(null); } };
  const startEdit = (id) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    setEditingId(id);
    setEditData({ title: t.title, category: t.category, priority: t.priority, duration: t.duration, recurring: t.recurring });
  };
  const saveEdit = () => {
    if (!editData || !editingId) return;
    if (!editData.title.trim()) { flash("Digite um nome"); return; }
    setTasks(tasks.map(t => t.id === editingId ? { ...t, ...editData } : t));
    setEditingId(null); setEditData(null);
    flash("✏️ Tarefa atualizada!");
  };
  const cancelEdit = () => { setEditingId(null); setEditData(null); };
  const toggle = (id) => {
    if (activeTimer === id) {
      setTasks(tasks.map(t => t.id === id ? { ...t, actualSeconds: (t.actualSeconds || 0) + timerSec } : t));
      setActiveTimer(null); setTimerSec(0);
    } else {
      if (activeTimer) setTasks(p => p.map(t => t.id === activeTimer ? { ...t, actualSeconds: (t.actualSeconds || 0) + timerSec } : t));
      setTasks(p => p.map(t => t.id === id ? { ...t, timerStarted: true } : t));
      setActiveTimer(id); setTimerSec(0);
    }
  };

  // ─── Shared styles ───
  const tabBtn = (key, icon, label) => (
    <button key={key} onClick={() => setTab(key)} style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
      padding: "8px 0", border: "none", background: "transparent", cursor: "pointer",
      color: tab === key ? "#E85D3A" : "rgba(232,232,237,0.35)",
      fontSize: 10, fontWeight: tab === key ? 700 : 400, fontFamily: "inherit",
      transition: "color 0.2s",
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>{label}
    </button>
  );

  const pageTitle = (icon, text) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{text}</span>
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(165deg, #0D0D0F 0%, #1A1A2E 40%, #16213E 100%)",
      fontFamily: "'Outfit', sans-serif", color: "#E8E8ED", position: "relative",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* Ambient */}
      <div style={{ position: "fixed", top: -200, right: -200, width: 600, height: 600, background: "radial-gradient(circle, rgba(232,93,58,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Toast */}
      {toast && <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(232,93,58,0.95)", color: "#fff", padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: "0 4px 20px rgba(232,93,58,0.4)", animation: "slideD 0.3s ease" }}>{toast}</div>}

      {/* ═══════════ CONTENT ═══════════ */}
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "16px 16px 90px" }}>

        {/* Mini header — always visible */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontFamily: "'Space Mono', monospace", color: "#E85D3A", letterSpacing: 4, textTransform: "uppercase", marginBottom: 4 }}>⚡ Performance Engine</div>
          <div style={{ fontSize: 12, color: "rgba(232,232,237,0.3)", fontStyle: "italic" }}>"{motivation}"</div>
        </div>

        {/* ─── ACTIVE TIMER (floating, above any tab) ─── */}
        {activeTimer && (() => {
          const t = tasks.find(x => x.id === activeTimer); if (!t) return null;
          const acc = (t.actualSeconds || 0) + timerSec, est = t.duration * 60;
          const rem = Math.max(est - acc, 0), over = acc > est, overS = acc - est;
          const p = Math.min((acc / est) * 100, 100);
          return (
            <div style={{ ...card({ marginBottom: 14 }), borderColor: over ? "rgba(46,189,107,0.25)" : "rgba(232,93,58,0.25)", background: over ? "rgba(46,189,107,0.06)" : "rgba(232,93,58,0.06)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: over ? "#2EBD6B" : "#E85D3A", marginBottom: 6 }}>
                {over ? "⚡ Prazo atingido" : "⏱ Focando"}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{t.title}</div>
              {!over ? (
                <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#E85D3A", textAlign: "center" }}>
                  {fmtSec(rem)}
                </div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "#2EBD6B" }}>✅ Concluído no prazo!</div>
                  <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#E8A93A" }}>+{fmtSec(overS)}</div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(232,232,237,0.35)", margin: "6px 0 4px" }}>
                <span>Real: {fmtSec(acc)}</span><span>Est: {fmt(t.duration)}</span>
              </div>
              <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${p}%`, borderRadius: 2, background: over ? "#2EBD6B" : "#E85D3A", transition: "width 1s linear" }} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => toggle(activeTimer)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#E8E8ED", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>⏸ Pausar</button>
                <button onClick={() => complete(activeTimer)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "#2EBD6B", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Concluir ✓</button>
              </div>
            </div>
          );
        })()}

        {/* ════════════════════════════════════════ */}
        {/* ─── TAB: TAREFAS ─── */}
        {/* ════════════════════════════════════════ */}
        {tab === "tasks" && (
          <div>
            {pageTitle("📋", "Minhas Tarefas")}

            {/* Time slider */}
            <div style={card({ marginBottom: 14 })}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: "rgba(232,232,237,0.45)", fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase" }}>Tempo hoje</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: "#E85D3A", fontFamily: "'Space Mono', monospace" }}>{fmt(availableTime)}</span>
              </div>
              <input type="range" min={30} max={960} step={15} value={availableTime} onChange={e => setAvailableTime(+e.target.value)}
                style={{ width: "100%", height: 5, appearance: "none", background: `linear-gradient(to right, #E85D3A ${(availableTime / 960) * 100}%, rgba(255,255,255,0.07) ${(availableTime / 960) * 100}%)`, borderRadius: 3, outline: "none", cursor: "pointer" }} />
            </div>

            {/* Progress */}
            <div style={card({ marginBottom: 14 })}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Progresso</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: rate >= 80 ? "#2EBD6B" : rate >= 40 ? "#E8A93A" : "#E85D3A", fontFamily: "'Space Mono', monospace" }}>{rate}%</span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${pctDone}%`, background: pctDone >= 80 ? "linear-gradient(90deg,#2EBD6B,#3AE88A)" : pctDone >= 40 ? "linear-gradient(90deg,#E8A93A,#E8C83A)" : "linear-gradient(90deg,#E85D3A,#E88A3A)", transition: "width 0.5s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "rgba(232,232,237,0.3)" }}>
                <span>{done.length}/{todayT.length} tarefas • Real: {fmtS2M(totalRealSec)}</span>
                <span>{freeMin >= 0 ? `${fmt(freeMin)} livre` : `⚠ ${fmt(-freeMin)} extra`}</span>
              </div>
              {saved > 0 && done.length > 0 && (
                <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(46,189,107,0.08)", border: "1px solid rgba(46,189,107,0.15)", fontSize: 11, color: "#2EBD6B", textAlign: "center" }}>
                  ⚡ {fmtS2M(saved)} ganhos — {eff}% mais rápido
                </div>
              )}
              {streak > 0 && <div style={{ marginTop: 6, fontSize: 11, color: "rgba(232,232,237,0.3)", textAlign: "center" }}>🔥 {streak} dias consecutivos</div>}
            </div>

            {/* Task list */}
            {sorted.length === 0 && done.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", ...card(), border: "1px dashed rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🚀</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Nenhuma tarefa ainda</div>
                <div style={{ fontSize: 12, color: "rgba(232,232,237,0.35)" }}>Toque em <strong>Adicionar</strong> para começar</div>
              </div>
            ) : (
              <>
                {sorted.length > 0 && <div style={{ fontSize: 10, color: "rgba(232,232,237,0.25)", marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>🔒 Inicie o timer (▶) para poder concluir</div>}

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
                      borderColor: isEditing ? "rgba(58,143,232,0.3)" : active ? "rgba(232,93,58,0.25)" : undefined,
                      background: isEditing ? "rgba(58,143,232,0.04)" : active ? "rgba(232,93,58,0.05)" : card().background,
                    }}>
                      {!isEditing ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <button onClick={() => complete(t.id)} title={started ? "Concluir" : "Inicie o timer"}
                            style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${started ? "rgba(46,189,107,0.4)" : "rgba(255,255,255,0.07)"}`, background: "transparent", cursor: started ? "pointer" : "not-allowed", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: started ? "#2EBD6B" : "rgba(255,255,255,0.12)" }}>
                            {started ? "✓" : "🔒"}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t.title}</div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, flexWrap: "wrap" }}>
                              <span style={{ color: cat.color }}>{cat.icon} {cat.label}</span>
                              <span style={{ color: "rgba(232,232,237,0.2)" }}>•</span>
                              <span style={{ color: "rgba(232,232,237,0.35)", fontFamily: "'Space Mono', monospace" }}>{fmt(t.duration)}</span>
                              {acc > 0 && <>
                                <span style={{ color: "rgba(232,232,237,0.2)" }}>•</span>
                                <span style={{ color: acc > t.duration * 60 ? "#E8A93A" : "#2EBD6B", fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>{fmtSec(acc)}</span>
                              </>}
                            </div>
                          </div>
                          <button onClick={() => toggle(t.id)} style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,0.07)", background: active ? "rgba(232,93,58,0.15)" : "rgba(255,255,255,0.03)", color: active ? "#E85D3A" : "rgba(232,232,237,0.35)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>{active ? "⏸" : "▶"}</button>
                          <button onClick={() => startEdit(t.id)} style={{ width: 30, height: 30, borderRadius: 7, border: "none", background: "rgba(255,255,255,0.03)", color: "rgba(232,232,237,0.3)", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✏️</button>
                          <button onClick={() => del(t.id)} style={{ width: 30, height: 30, borderRadius: 7, border: "none", background: "transparent", color: "rgba(232,232,237,0.2)", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 10, color: "#3A8FE8", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>✏️ Editando tarefa</div>
                          <input value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })}
                            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(58,143,232,0.3)", background: "rgba(255,255,255,0.04)", color: "#E8E8ED", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
                            onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                            autoFocus
                          />
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                            {Object.entries(CATEGORIES).map(([k, c]) => (
                              <button key={k} onClick={() => setEditData({ ...editData, category: k })} style={{
                                padding: "5px 10px", borderRadius: 6, fontSize: 10, border: "1px solid", cursor: "pointer", fontFamily: "inherit",
                                borderColor: editData.category === k ? c.color + "55" : "rgba(255,255,255,0.06)",
                                background: editData.category === k ? c.color + "15" : "transparent",
                                color: editData.category === k ? c.color : "rgba(232,232,237,0.35)",
                              }}>{c.icon} {c.label}</button>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                            {Object.entries(PRIORITIES).map(([k, p]) => (
                              <button key={k} onClick={() => setEditData({ ...editData, priority: k })} style={{
                                flex: 1, padding: "5px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: "1px solid", cursor: "pointer", fontFamily: "inherit",
                                borderColor: editData.priority === k ? p.color + "55" : "rgba(255,255,255,0.06)",
                                background: editData.priority === k ? p.color + "15" : "transparent",
                                color: editData.priority === k ? p.color : "rgba(232,232,237,0.35)",
                              }}>{p.label}</button>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                            {[15, 30, 45, 60, 90, 120].map(d => (
                              <button key={d} onClick={() => setEditData({ ...editData, duration: d })} style={{
                                padding: "5px 10px", borderRadius: 6, fontSize: 10, border: "1px solid", cursor: "pointer", fontFamily: "'Space Mono', monospace",
                                borderColor: editData.duration === d ? "#E85D3A55" : "rgba(255,255,255,0.06)",
                                background: editData.duration === d ? "rgba(232,93,58,0.1)" : "transparent",
                                color: editData.duration === d ? "#E85D3A" : "rgba(232,232,237,0.35)",
                              }}>{fmt(d)}</button>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={saveEdit} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "#3A8FE8", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Salvar ✓</button>
                            <button onClick={cancelEdit} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(232,232,237,0.5)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {done.length > 0 && (
                  <>
                    <button onClick={() => setShowDone(!showDone)} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid rgba(46,189,107,0.1)", background: "rgba(46,189,107,0.03)", color: "#2EBD6B", fontSize: 11, cursor: "pointer", marginTop: 6, fontFamily: "inherit" }}>
                      ✅ {done.length} concluída{done.length > 1 ? "s" : ""} {showDone ? "▲" : "▼"}
                    </button>
                    {showDone && done.map(t => {
                      const cat = CATEGORIES[t.category], est = t.duration * 60, real = t.actualSeconds || 0, diff = est - real;
                      return (
                        <div key={t.id} style={{ ...card({ marginTop: 6, padding: "10px 14px" }), background: "rgba(46,189,107,0.03)", borderColor: "rgba(46,189,107,0.08)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <button onClick={() => uncomplete(t.id)} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "#2EBD6B", color: "#fff", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✓</button>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, textDecoration: "line-through", color: "rgba(232,232,237,0.4)" }}>{t.title}</div>
                              <div style={{ fontSize: 10, color: "rgba(232,232,237,0.25)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <span>{cat.icon} {cat.label}</span><span>•</span>
                                <span style={{ fontFamily: "'Space Mono', monospace" }}>Est: {fmt(t.duration)}</span><span>•</span>
                                <span style={{ fontFamily: "'Space Mono', monospace", color: "#2EBD6B" }}>Real: {fmtS2M(real)}</span>
                                {diff > 0 && <span style={{ color: "#2EBD6B", fontWeight: 600 }}>⚡-{fmtS2M(diff)}</span>}
                                {diff < 0 && <span style={{ color: "#E8A93A", fontWeight: 600 }}>🐢+{fmtS2M(-diff)}</span>}
                              </div>
                            </div>
                            <button onClick={() => del(t.id)} style={{ border: "none", background: "transparent", color: "rgba(232,232,237,0.15)", cursor: "pointer", fontSize: 11 }}>✕</button>
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

        {/* ════════════════════════════════════════ */}
        {/* ─── TAB: ADICIONAR ─── */}
        {/* ════════════════════════════════════════ */}
        {tab === "add" && (
          <div>
            {pageTitle("➕", "Nova Tarefa")}

            <div style={card()}>
              {/* Title input + voice */}
              <label style={{ fontSize: 11, color: "rgba(232,232,237,0.45)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, display: "block" }}>Nome da tarefa</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input ref={inputRef} value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="Ex: Revisar relatório trimestral"
                  style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#E8E8ED", fontSize: 15, outline: "none", boxSizing: "border-box" }}
                  onKeyDown={e => e.key === "Enter" && addTaskFn()}
                />
                <button onClick={() => { setVoiceGuide(!voiceGuide); if (!voiceGuide) setTimeout(() => inputRef.current?.focus(), 50); }}
                  style={{ width: 46, height: 46, borderRadius: 10, border: "none", background: voiceGuide ? "linear-gradient(135deg,#E85D3A,#E83A5D)" : "rgba(255,255,255,0.05)", color: voiceGuide ? "#fff" : "rgba(232,232,237,0.4)", fontSize: 18, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.3s" }}>
                  🎤
                </button>
              </div>

              {voiceGuide && (() => {
                const p = getPlatform();
                const instructions = {
                  mac: { title: "💻 Mac", text: "Com o cursor no campo, pressione Fn duas vezes. Precisa estar ativado em Ajustes → Teclado → Ditado." },
                  windows: { title: "💻 Windows", text: "Com o cursor no campo, pressione Win + H para ativar Ditado por Voz." },
                  ios: { title: "📱 iPhone", text: "Toque no campo e depois no ícone 🎙️ no canto inferior do teclado." },
                  android: { title: "📱 Android", text: "Toque no campo e depois no ícone 🎙️ no teclado (Gboard)." },
                  other: { title: "🎙️ Ditado", text: "Celular: toque no 🎙️ do teclado. Mac: Fn Fn. Windows: Win+H." },
                };
                const i = instructions[p] || instructions.other;
                return (
                  <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: "rgba(232,93,58,0.06)", border: "1px solid rgba(232,93,58,0.12)" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#E85D3A", marginBottom: 4 }}>{i.title}</div>
                    <div style={{ fontSize: 12, color: "rgba(232,232,237,0.55)", lineHeight: 1.5 }}>{i.text}</div>
                    <button onClick={() => { setVoiceGuide(false); setTimeout(() => inputRef.current?.focus(), 50); }}
                      style={{ marginTop: 8, padding: "6px 14px", borderRadius: 6, border: "none", background: "#E85D3A", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      Entendi, focar no campo →
                    </button>
                  </div>
                );
              })()}

              {/* Category */}
              <label style={{ fontSize: 11, color: "rgba(232,232,237,0.45)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, display: "block" }}>Categoria</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {Object.entries(CATEGORIES).map(([k, c]) => (
                  <button key={k} onClick={() => setNewTask({ ...newTask, category: k })} style={{
                    padding: "6px 12px", borderRadius: 8, border: "1px solid", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
                    borderColor: newTask.category === k ? c.color + "55" : "rgba(255,255,255,0.06)",
                    background: newTask.category === k ? c.color + "15" : "transparent",
                    color: newTask.category === k ? c.color : "rgba(232,232,237,0.4)",
                  }}>{c.icon} {c.label}</button>
                ))}
              </div>

              {/* Priority */}
              <label style={{ fontSize: 11, color: "rgba(232,232,237,0.45)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, display: "block" }}>Prioridade</label>
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                {Object.entries(PRIORITIES).map(([k, p]) => (
                  <button key={k} onClick={() => setNewTask({ ...newTask, priority: k })} style={{
                    flex: 1, padding: 8, borderRadius: 8, border: "1px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    borderColor: newTask.priority === k ? p.color + "55" : "rgba(255,255,255,0.06)",
                    background: newTask.priority === k ? p.color + "15" : "transparent",
                    color: newTask.priority === k ? p.color : "rgba(232,232,237,0.4)",
                  }}>{p.label}</button>
                ))}
              </div>

              {/* Duration */}
              <label style={{ fontSize: 11, color: "rgba(232,232,237,0.45)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, display: "block" }}>
                Duração estimada: <span style={{ color: "#E85D3A", fontFamily: "'Space Mono', monospace" }}>{fmt(newTask.duration)}</span>
              </label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {[15, 30, 45, 60, 90, 120].map(d => (
                  <button key={d} onClick={() => setNewTask({ ...newTask, duration: d })} style={{
                    padding: "6px 14px", borderRadius: 8, border: "1px solid", fontSize: 12, cursor: "pointer", fontFamily: "'Space Mono', monospace",
                    borderColor: newTask.duration === d ? "#E85D3A55" : "rgba(255,255,255,0.06)",
                    background: newTask.duration === d ? "rgba(232,93,58,0.1)" : "transparent",
                    color: newTask.duration === d ? "#E85D3A" : "rgba(232,232,237,0.4)",
                  }}>{fmt(d)}</button>
                ))}
              </div>

              {/* Recurring */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 12, color: "rgba(232,232,237,0.5)", cursor: "pointer" }}>
                <input type="checkbox" checked={newTask.recurring} onChange={e => setNewTask({ ...newTask, recurring: e.target.checked })} style={{ accentColor: "#E85D3A" }} />
                Tarefa recorrente (repete todo dia)
              </label>

              {/* Submit */}
              <button onClick={addTaskFn} style={{
                width: "100%", padding: 14, borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: newTask.title.trim() ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.3s",
                background: newTask.title.trim() ? "linear-gradient(135deg, #E85D3A, #E88A3A)" : "rgba(255,255,255,0.05)",
                color: newTask.title.trim() ? "#fff" : "rgba(232,232,237,0.2)",
                boxShadow: newTask.title.trim() ? "0 4px 20px rgba(232,93,58,0.3)" : "none",
              }}>Adicionar Tarefa</button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════ */}
        {/* ─── TAB: ESTATÍSTICAS ─── */}
        {/* ════════════════════════════════════════ */}
        {tab === "stats" && (
          <div>
            {pageTitle("📊", "Estatísticas")}

            {/* Summary grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                { l: "Tarefas", v: todayT.length, i: "📋", s: null },
                { l: "Concluídas", v: done.length, i: "✅", s: null },
                { l: "Estimado", v: fmt(totalPlan), i: "📐", s: "planejado" },
                { l: "Tempo Real", v: fmtS2M(totalRealSec), i: "⏱", s: "cronômetro" },
              ].map(({ l, v, i, s }) => (
                <div key={l} style={card({ padding: "14px 16px" })}>
                  <div style={{ fontSize: 10, color: "rgba(232,232,237,0.35)", marginBottom: 4 }}>{i} {l}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Space Mono', monospace" }}>{v}</div>
                  {s && <div style={{ fontSize: 9, color: "rgba(232,232,237,0.2)", marginTop: 2 }}>{s}</div>}
                </div>
              ))}
            </div>

            {/* Efficiency */}
            {done.length > 0 && (
              <div style={{
                ...card({ marginBottom: 14, textAlign: "center" }),
                background: saved >= 0 ? "linear-gradient(135deg,rgba(46,189,107,0.08),rgba(46,189,107,0.02))" : "linear-gradient(135deg,rgba(232,169,58,0.08),rgba(232,93,58,0.02))",
                borderColor: saved >= 0 ? "rgba(46,189,107,0.15)" : "rgba(232,169,58,0.15)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "rgba(232,232,237,0.4)", marginBottom: 10 }}>⚡ Eficiência</div>
                <div style={{ fontSize: 38, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: saved >= 0 ? "#2EBD6B" : "#E8A93A" }}>
                  {saved >= 0 ? "+" : "-"}{fmtS2M(Math.abs(saved))}
                </div>
                <div style={{ fontSize: 12, color: "rgba(232,232,237,0.4)", marginTop: 2 }}>{saved >= 0 ? "de tempo ganho" : "além do estimado"}</div>

                <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 20, fontSize: 11 }}>
                  <div><div style={{ color: "rgba(232,232,237,0.35)" }}>Estimado</div><div style={{ fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>{fmtS2M(totalEstSec)}</div></div>
                  <div style={{ width: 1, background: "rgba(255,255,255,0.06)" }} />
                  <div><div style={{ color: "rgba(232,232,237,0.35)" }}>Real</div><div style={{ fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>{fmtS2M(totalRealSec)}</div></div>
                  <div style={{ width: 1, background: "rgba(255,255,255,0.06)" }} />
                  <div><div style={{ color: "rgba(232,232,237,0.35)" }}>Taxa</div><div style={{ fontWeight: 700, fontFamily: "'Space Mono', monospace", color: saved >= 0 ? "#2EBD6B" : "#E8A93A" }}>{Math.abs(eff)}% <span style={{ fontSize: 9 }}>{saved >= 0 ? "rápido" : "lento"}</span></div></div>
                </div>

                {/* Per task */}
                <div style={{ marginTop: 14, textAlign: "left" }}>
                  <div style={{ fontSize: 10, color: "rgba(232,232,237,0.3)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Por tarefa</div>
                  {done.map(t => {
                    const e2 = t.duration * 60, r = t.actualSeconds || 0, d = e2 - r, p = e2 > 0 ? Math.round((d / e2) * 100) : 0;
                    return (
                      <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", fontSize: 11 }}>
                        <span style={{ flex: 1, color: "rgba(232,232,237,0.55)" }}>{t.title}</span>
                        <span style={{ color: "rgba(232,232,237,0.3)", fontFamily: "'Space Mono', monospace", fontSize: 10, marginRight: 8 }}>{fmtS2M(r)}/{fmt(t.duration)}</span>
                        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, color: d > 0 ? "#2EBD6B" : d < 0 ? "#E8A93A" : "rgba(232,232,237,0.3)", minWidth: 48, textAlign: "right" }}>
                          {d > 0 ? `⚡${p}%` : d < 0 ? `🐢${Math.abs(p)}%` : "="}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Categories */}
            <div style={card({ marginBottom: 14 })}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "rgba(232,232,237,0.4)", marginBottom: 12 }}>Por Categoria</div>
              {Object.entries(CATEGORIES).map(([k, c]) => {
                const ct = todayT.filter(t => t.category === k), cd = ct.filter(t => t.completed), rs = cd.reduce((s, t) => s + (t.actualSeconds || 0), 0);
                if (!ct.length) return null;
                return (
                  <div key={k} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: c.color, fontWeight: 600 }}>{c.icon} {c.label}</span>
                      <span style={{ fontSize: 11, color: "rgba(232,232,237,0.35)", fontFamily: "'Space Mono', monospace" }}>{cd.length}/{ct.length} • {fmtS2M(rs)}</span>
                    </div>
                    <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 3, width: `${(cd.length / ct.length) * 100}%`, background: c.color, transition: "width 0.4s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Streak */}
            <div style={{ ...card({ textAlign: "center", marginBottom: 14 }), background: "linear-gradient(135deg,rgba(232,93,58,0.06),rgba(232,169,58,0.03))", borderColor: "rgba(232,93,58,0.1)" }}>
              <div style={{ fontSize: 36, marginBottom: 4 }}>🔥</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#E85D3A" }}>{streak}</div>
              <div style={{ fontSize: 12, color: "rgba(232,232,237,0.4)", marginTop: 2 }}>dias consecutivos</div>
            </div>

            {/* Reset */}
            <button onClick={async () => { if (confirm("Limpar tudo?")) { setTasks([]); setAvailableTime(480); try { await window.storage.delete(STORAGE_KEY); } catch {} } }}
              style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)", background: "transparent", color: "rgba(232,232,237,0.2)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
              🗑 Resetar dados
            </button>
          </div>
        )}
      </div>

      {/* ═══════════ BOTTOM NAV ═══════════ */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "rgba(13,13,15,0.92)", backdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex", maxWidth: 520, margin: "0 auto",
        padding: "6px 0 env(safe-area-inset-bottom, 8px)",
        zIndex: 100,
      }}>
        {tabBtn("tasks", "📋", "Tarefas")}
        {tabBtn("add", "➕", "Adicionar")}
        {tabBtn("stats", "📊", "Estatísticas")}
      </div>

      <style>{`
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; width:18px; height:18px; border-radius:50%; background:#E85D3A; cursor:pointer; box-shadow:0 2px 8px rgba(232,93,58,0.4); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.85} }
        @keyframes slideD { from{transform:translateX(-50%) translateY(-16px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} }
        *{box-sizing:border-box} button{font-family:inherit} ::placeholder{color:rgba(232,232,237,0.2)}
      `}</style>
    </div>
  );
}
