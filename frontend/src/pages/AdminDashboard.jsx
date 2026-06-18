import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const ADMIN_KEY = "icbm-admin-2024"; // must match backend

export default function AdminDashboard() {
  const [unlocked, setUnlocked] = useState(sessionStorage.getItem("gh_admin") === "1");
  const [keyInput, setKeyInput] = useState("");
  const [tab, setTab] = useState("sessions"); // sessions | retakes
  const [sessions, setSessions] = useState([]);
  const [events, setEvents] = useState([]);
  const [retakeRequests, setRetakeRequests] = useState([]);
  const [actionStatus, setActionStatus] = useState({});
  const wsRef = useRef(null);

  useEffect(() => {
    if (!unlocked) return;
    loadSessions();
    loadRetakeRequests();
    const poll = setInterval(() => { loadSessions(); loadRetakeRequests(); }, 8000);

    const ws = new WebSocket(`${API_BASE.replace(/^http/, "ws")}/ws/admin/live`);
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      setEvents(prev => [{ ...data, at: new Date().toLocaleTimeString() }, ...prev].slice(0, 60));
      loadSessions();
    };
    wsRef.current = ws;
    return () => { clearInterval(poll); ws.close(); };
  }, [unlocked]);

  async function loadSessions() {
    const { data } = await supabase
      .from("exam_sessions")
      .select("id, status, current_index, score, max_score, started_at, students(full_name, unique_code)")
      .order("started_at", { ascending: false })
      .limit(100);
    setSessions(data || []);
  }

  async function loadRetakeRequests() {
    const res = await fetch(`${API_BASE}/admin/retake-requests`, {
      headers: { "x-admin-key": ADMIN_KEY }
    });
    if (res.ok) setRetakeRequests(await res.json());
  }

  async function handleRetake(requestId, action) {
    setActionStatus(s => ({ ...s, [requestId]: "loading" }));
    const res = await fetch(`${API_BASE}/admin/retake-requests/${requestId}/${action}`, {
      method: "POST",
      headers: { "x-admin-key": ADMIN_KEY }
    });
    if (res.ok) {
      setActionStatus(s => ({ ...s, [requestId]: action === "approve" ? "approved" : "denied" }));
      loadRetakeRequests();
    } else {
      setActionStatus(s => ({ ...s, [requestId]: "error" }));
    }
  }

  function unlock() {
    if (keyInput.trim() === ADMIN_KEY) {
      sessionStorage.setItem("gh_admin", "1");
      setUnlocked(true);
    } else {
      alert("Wrong key");
    }
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="space-y-4 text-center w-72">
          <h1 className="font-display text-2xl text-ivory">Instructor Access</h1>
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && unlock()}
            placeholder="Admin key"
            className="w-full rounded-lg bg-surface border border-surface2 px-4 py-2.5 text-ivory placeholder:text-ash focus:outline-none focus:ring-2 focus:ring-hour"
          />
          <button onClick={unlock} className="w-full rounded-lg bg-hour text-ink font-medium py-2.5">
            Enter
          </button>
        </div>
      </div>
    );
  }

  const pending = retakeRequests.filter(r => r.status === "pending");

  return (
    <div className="min-h-screen bg-ink px-4 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl text-ivory">Instructor Dashboard</h1>
        <div className="flex gap-1 bg-surface rounded-lg p-1">
          {["sessions", "retakes"].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition capitalize ${
                tab === t ? "bg-hour text-ink" : "text-ash hover:text-ivory"
              }`}
            >
              {t}
              {t === "retakes" && pending.length > 0 && (
                <span className="ml-1.5 bg-alert text-ivory text-xs rounded-full px-1.5">{pending.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === "sessions" && (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-ash text-xs uppercase tracking-widest mb-3">Active Sessions</h2>
            <div className="space-y-1.5">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2.5 text-sm">
                  <div>
                    <span className="text-ivory font-medium">{s.students?.full_name}</span>
                    <span className="text-ash font-mono text-xs ml-2">{s.students?.unique_code}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.score != null && (
                      <span className="text-ash text-xs font-mono">{s.score}/{s.max_score}</span>
                    )}
                    <StatusBadge status={s.status} />
                  </div>
                </div>
              ))}
              {sessions.length === 0 && <p className="text-ash text-sm">No sessions yet.</p>}
            </div>
          </div>

          <div>
            <h2 className="text-ash text-xs uppercase tracking-widest mb-3">Live Events</h2>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {events.map((e, i) => (
                <div key={i} className="text-xs rounded-lg bg-surface px-3 py-2">
                  <span className="text-ash font-mono mr-2">{e.at}</span>
                  <span className={e.severity === "hard" ? "text-alert" : "text-ivory"}>
                    {e.type} — {e.event_type || e.status}
                  </span>
                </div>
              ))}
              {events.length === 0 && <p className="text-ash text-sm">No events yet.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === "retakes" && (
        <div>
          <h2 className="text-ash text-xs uppercase tracking-widest mb-3">Retake Requests</h2>
          {retakeRequests.length === 0 && <p className="text-ash text-sm">No retake requests yet.</p>}
          <div className="space-y-3">
            {retakeRequests.map(r => (
              <div key={r.id} className={`rounded-xl border px-5 py-4 ${
                r.status === "pending" ? "bg-surface border-hourDim/30" :
                r.status === "approved" ? "bg-good/5 border-good/20" : "bg-surface border-surface2 opacity-60"
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-ivory font-medium">{r.students?.full_name}
                      <span className="text-ash font-mono text-xs ml-2">{r.students?.unique_code}</span>
                    </p>
                    <p className="text-ash text-xs mt-0.5">{r.exams?.title}</p>
                    {r.reason && <p className="text-ash text-xs mt-1 italic">"{r.reason}"</p>}
                    <p className="text-ash text-xs mt-1">{new Date(r.created_at).toLocaleString()}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    {r.status === "pending" ? (
                      <>
                        <button
                          onClick={() => handleRetake(r.id, "approve")}
                          disabled={actionStatus[r.id] === "loading"}
                          className="px-4 py-1.5 rounded-lg bg-good text-ink text-sm font-medium disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRetake(r.id, "deny")}
                          disabled={actionStatus[r.id] === "loading"}
                          className="px-4 py-1.5 rounded-lg bg-surface2 text-ash text-sm hover:text-ivory"
                        >
                          Deny
                        </button>
                      </>
                    ) : (
                      <span className={`text-xs font-mono px-2 py-1 rounded-full ${
                        r.status === "approved" ? "bg-good/20 text-good" : "bg-surface2 text-ash"
                      }`}>
                        {r.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    in_progress: "text-good",
    disconnected: "text-hour",
    submitted: "text-ash",
    auto_submitted: "text-alert",
    expired: "text-alert",
    reset: "text-hour",
  };
  return <span className={`font-mono text-xs ${styles[status] || "text-ash"}`}>{status}</span>;
}
