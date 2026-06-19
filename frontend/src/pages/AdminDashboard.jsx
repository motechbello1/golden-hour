import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { ThemeToggle } from "../lib/ThemeContext.jsx";

const API = import.meta.env.VITE_API_BASE_URL;
const ADMIN_KEY = "golden-hour-admin-2024";

export default function AdminDashboard() {
  const [unlocked, setUnlocked] = useState(sessionStorage.getItem("gh_a") === "1");
  const [keyInput, setKeyInput] = useState("");
  const [tab, setTab] = useState("sessions");
  const [sessions, setSessions] = useState([]);
  const [events, setEvents] = useState([]);
  const [retakes, setRetakes] = useState([]);
  const [exams, setExams] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [proctorEvents, setProctorEvents] = useState([]);
  const [editingExam, setEditingExam] = useState(null);
  const [actionStatus, setActionStatus] = useState({});
  const wsRef = useRef(null);

  useEffect(() => {
    if (!unlocked) return;
    loadAll();
    const poll = setInterval(loadAll, 10000);
    const ws = new WebSocket(`${API.replace(/^http/, "ws")}/ws/admin/live`);
    ws.onmessage = (msg) => {
      const d = JSON.parse(msg.data);
      setEvents((p) => [{ ...d, at: new Date().toLocaleTimeString() }, ...p].slice(0, 80));
    };
    wsRef.current = ws;
    return () => { clearInterval(poll); ws.close(); };
  }, [unlocked]);

  async function loadAll() {
    const [sessRes, retakeRes, examRes, trackRes, eventsRes] = await Promise.all([
      supabase.from("exam_sessions").select("*, students(full_name, unique_code, id)").order("started_at", { ascending: false }).limit(200),
      fetch(`${API}/admin/retake-requests`, { headers: { "x-admin-key": ADMIN_KEY } }).then(r => r.ok ? r.json() : []),
      supabase.from("exams").select("*, tracks(name, slug)").order("created_at", { ascending: false }),
      supabase.from("tracks").select("*"),
      supabase.from("proctor_events").select("*, exam_sessions(students(full_name, unique_code))").order("created_at", { ascending: false }).limit(100),
    ]);
    setSessions(sessRes.data || []);
    setRetakes(retakeRes);
    setExams(examRes.data || []);
    setTracks(trackRes.data || []);
    setProctorEvents(eventsRes.data || []);
  }

  async function handleRetake(id, action) {
    setActionStatus(s => ({ ...s, [id]: "..." }));
    const r = await fetch(`${API}/admin/retake-requests/${id}/${action}`, {
      method: "POST", headers: { "x-admin-key": ADMIN_KEY }
    });
    setActionStatus(s => ({ ...s, [id]: r.ok ? action + "d" : "error" }));
    loadAll();
  }

  async function saveExamConfig(exam) {
    await supabase.from("exams").update({
      objective_count: exam.objective_count,
      code_count: exam.code_count,
      objective_time_seconds: exam.objective_time_seconds,
      code_time_seconds: exam.code_time_seconds,
      paraphrase: exam.paraphrase,
    }).eq("id", exam.id);
    setEditingExam(null);
    loadAll();
  }

  function unlock() {
    if (keyInput.trim() === ADMIN_KEY) {
      sessionStorage.setItem("gh_a", "1");
      setUnlocked(true);
    }
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="w-80 space-y-5 text-center animate-fade-in">
          <h1 className="font-display text-2xl text-ivory">Admin Access</h1>
          <p className="text-ash text-sm">Enter your admin key to continue</p>
          <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && unlock()}
            placeholder="Admin key"
            className="w-full rounded-xl bg-surface border border-surface2 px-4 py-3 text-ivory placeholder:text-ash/50 focus:outline-none focus:ring-2 focus:ring-hour" />
          <button onClick={unlock} className="w-full rounded-xl bg-hour text-ink font-bold py-3 hover:shadow-lg hover:shadow-hour/20 transition">
            Enter
          </button>
        </div>
      </div>
    );
  }

  const pendingRetakes = retakes.filter(r => r.status === "pending").length;
  const hardEvents = proctorEvents.filter(e => e.severity === "hard").length;
  const activeSessions = sessions.filter(s => s.status === "in_progress").length;
  const tabs = [
    { id: "sessions", label: "Sessions", badge: activeSessions || null },
    { id: "retakes", label: "Retakes", badge: pendingRetakes || null },
    { id: "integrity", label: "Integrity", badge: hardEvents || null },
    { id: "exams", label: "Exam Config" },
    { id: "live", label: "Live Feed" },
  ];

  return (
    <div className="min-h-screen bg-ink">
      {/* Header */}
      <header className="border-b border-surface2 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-xl text-ivory">Golden Hour</h1>
          <span className="text-ash text-xs font-mono bg-surface px-2 py-0.5 rounded">Admin</span>
        </div>
        <ThemeToggle />
      </header>

      {/* Stats bar */}
      <div className="border-b border-surface2 px-5 py-3 flex gap-6">
        {[
          ["Active", activeSessions, "text-good"],
          ["Total Sessions", sessions.length, "text-ivory"],
          ["Pending Retakes", pendingRetakes, pendingRetakes ? "text-hour" : "text-ash"],
          ["Hard Violations", hardEvents, hardEvents ? "text-alert" : "text-ash"],
        ].map(([label, val, color]) => (
          <div key={label} className="text-center">
            <p className={`font-mono text-lg font-bold ${color}`}>{val}</p>
            <p className="text-ash text-xs">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-surface2 px-5 flex gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              tab === t.id ? "border-hour text-ivory" : "border-transparent text-ash hover:text-ivory"
            }`}>
            {t.label}
            {t.badge > 0 && (
              <span className="ml-1.5 bg-alert text-ivory text-xs rounded-full px-1.5 py-0.5 font-mono">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      <div className="px-5 py-5 max-w-6xl mx-auto animate-fade-in">

        {/* ─── SESSIONS ─── */}
        {tab === "sessions" && (
          <div className="space-y-2">
            {sessions.length === 0 && <Empty>No sessions yet</Empty>}
            {sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-xl bg-surface border border-surface2 px-4 py-3 animate-slide-up">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    s.status === "in_progress" ? "bg-good animate-pulse" :
                    s.status === "submitted" ? "bg-ash" :
                    s.status === "auto_submitted" ? "bg-alert" : "bg-hourDim"
                  }`} />
                  <div>
                    <p className="text-ivory text-sm font-medium">{s.students?.full_name}</p>
                    <p className="text-ash text-xs font-mono">{s.students?.unique_code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-ash text-xs font-mono">Q{s.current_index}/{s.question_order?.length || "?"}</span>
                  {s.score != null && (
                    <span className="text-ivory text-xs font-mono bg-surface2 rounded-lg px-2 py-0.5">
                      {s.score}/{s.max_score} ({Math.round((s.score / s.max_score) * 100)}%)
                    </span>
                  )}
                  <Badge status={s.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── RETAKES ─── */}
        {tab === "retakes" && (
          <div className="space-y-3">
            {retakes.length === 0 && <Empty>No retake requests</Empty>}
            {retakes.map(r => (
              <div key={r.id} className={`rounded-xl border px-5 py-4 animate-slide-up ${
                r.status === "pending" ? "bg-surface border-hour/30" :
                r.status === "approved" ? "bg-good/5 border-good/20" : "bg-surface border-surface2 opacity-50"
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-ivory font-medium">{r.students?.full_name}
                      <span className="text-ash font-mono text-xs ml-2">{r.students?.unique_code}</span>
                    </p>
                    <p className="text-ash text-xs mt-0.5">{r.exams?.title}</p>
                    {r.reason && <p className="text-ash text-xs mt-1 italic bg-surface2/50 rounded-lg px-3 py-1.5 mt-2">"{r.reason}"</p>}
                    <p className="text-ash/50 text-xs mt-2">{new Date(r.created_at).toLocaleString()}</p>
                  </div>
                  <div className="shrink-0 flex flex-col gap-2">
                    {r.status === "pending" ? (<>
                      <button onClick={() => handleRetake(r.id, "approve")}
                        className="px-5 py-2 rounded-lg bg-good text-ink text-sm font-semibold hover:shadow-lg transition">
                        {actionStatus[r.id] === "..." ? "..." : "Approve"}
                      </button>
                      <button onClick={() => handleRetake(r.id, "deny")}
                        className="px-5 py-2 rounded-lg bg-surface2 text-ash text-sm hover:text-ivory transition">
                        Deny
                      </button>
                    </>) : (
                      <span className={`text-xs font-mono px-3 py-1 rounded-full ${
                        r.status === "approved" ? "bg-good/20 text-good" : "bg-surface2 text-ash"
                      }`}>{r.status}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── INTEGRITY ─── */}
        {tab === "integrity" && (
          <div className="space-y-2">
            {proctorEvents.length === 0 && <Empty>No integrity events recorded</Empty>}
            {proctorEvents.map(e => (
              <div key={e.id} className={`rounded-xl border px-4 py-3 flex items-center justify-between animate-slide-up ${
                e.severity === "hard" ? "bg-alert/5 border-alert/20" : "bg-surface border-surface2"
              }`}>
                <div className="flex items-center gap-3">
                  <span className={`text-lg ${e.severity === "hard" ? "text-alert" : "text-hour"}`}>
                    {e.severity === "hard" ? "⚠" : "◉"}
                  </span>
                  <div>
                    <p className="text-ivory text-sm">
                      <span className="font-medium">{e.exam_sessions?.students?.full_name}</span>
                      <span className="text-ash font-mono text-xs ml-2">{e.exam_sessions?.students?.unique_code}</span>
                    </p>
                    <p className="text-ash text-xs font-mono mt-0.5">
                      {e.event_type.replaceAll("_", " ")} · {e.severity} · {new Date(e.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                {e.snapshot_url && (
                  <span className="text-hour text-xs font-mono bg-hour/10 rounded-lg px-2 py-1">📷 Snapshot saved</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ─── EXAM CONFIG ─── */}
        {tab === "exams" && (
          <div className="space-y-4">
            {exams.map(exam => {
              const editing = editingExam?.id === exam.id;
              const e = editing ? editingExam : exam;
              return (
                <div key={exam.id} className="rounded-xl bg-surface border border-surface2 p-5 animate-slide-up">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-ivory font-semibold">{exam.title}</p>
                      <p className="text-ash text-xs mt-0.5">{exam.tracks?.name} · {exam.is_published ? "Published" : "Draft"}</p>
                    </div>
                    {!editing ? (
                      <button onClick={() => setEditingExam({ ...exam })}
                        className="text-hour text-sm font-medium hover:underline">Edit</button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => saveExamConfig(editingExam)}
                          className="px-4 py-1.5 rounded-lg bg-good text-ink text-sm font-semibold">Save</button>
                        <button onClick={() => setEditingExam(null)}
                          className="px-4 py-1.5 rounded-lg bg-surface2 text-ash text-sm">Cancel</button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <ConfigField label="Questions" value={e.objective_count + (e.code_count || 0)} editing={editing}
                      onChange={v => setEditingExam(x => ({ ...x, objective_count: parseInt(v) || 0 }))} />
                    <ConfigField label="Seconds / question" value={e.objective_time_seconds} editing={editing}
                      onChange={v => setEditingExam(x => ({ ...x, objective_time_seconds: parseInt(v) || 15, code_time_seconds: parseInt(v) || 15 }))} />
                    <div>
                      <p className="text-ash text-xs uppercase tracking-wider mb-1.5">Paraphrase</p>
                      {editing ? (
                        <button onClick={() => setEditingExam(x => ({ ...x, paraphrase: !x.paraphrase }))}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                            e.paraphrase ? "bg-good/20 text-good" : "bg-surface2 text-ash"
                          }`}>
                          {e.paraphrase ? "ON" : "OFF"}
                        </button>
                      ) : (
                        <p className={`text-sm font-mono ${e.paraphrase ? "text-good" : "text-ash"}`}>
                          {e.paraphrase ? "ON" : "OFF"}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-ash text-xs uppercase tracking-wider mb-1.5">Shuffle</p>
                      <p className="text-good text-sm font-mono">Always ON</p>
                      <p className="text-ash text-xs mt-0.5">Per-student seed</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── LIVE FEED ─── */}
        {tab === "live" && (
          <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
            {events.length === 0 && <Empty>Waiting for events…</Empty>}
            {events.map((e, i) => (
              <div key={i} className="text-xs rounded-lg bg-surface border border-surface2 px-4 py-2.5 flex items-center gap-3 animate-fade-in">
                <span className="text-ash font-mono shrink-0">{e.at}</span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.severity === "hard" ? "bg-alert" : "bg-good"}`} />
                <span className={e.severity === "hard" ? "text-alert" : "text-ivory"}>
                  {e.type} — {e.event_type || e.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ status }) {
  const map = {
    in_progress: ["bg-good/15 text-good", "Active"],
    disconnected: ["bg-hour/15 text-hour", "Disconnected"],
    submitted: ["bg-ash/15 text-ash", "Submitted"],
    auto_submitted: ["bg-alert/15 text-alert", "Auto-submitted"],
    expired: ["bg-alert/15 text-alert", "Expired"],
    reset: ["bg-hour/15 text-hour", "Reset"],
  };
  const [cls, label] = map[status] || ["bg-ash/15 text-ash", status];
  return <span className={`text-xs font-mono px-2.5 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function ConfigField({ label, value, editing, onChange }) {
  return (
    <div>
      <p className="text-ash text-xs uppercase tracking-wider mb-1.5">{label}</p>
      {editing ? (
        <input type="number" value={value} onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg bg-surface2 border border-surface2 px-3 py-1.5 text-ivory text-sm font-mono focus:outline-none focus:ring-1 focus:ring-hour" />
      ) : (
        <p className="text-ivory text-sm font-mono">{value}</p>
      )}
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-ash text-sm text-center py-8">{children}</p>;
}
