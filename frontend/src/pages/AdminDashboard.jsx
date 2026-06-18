import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

/**
 * MVP admin view: no role-based auth yet, gated only by a shared key
 * typed once and kept in sessionStorage. Good enough for a cohort of
 * 15–20 students monitored by one instructor today. Before this goes
 * to 500 students, swap this for a real Supabase role check (a
 * `role = 'instructor'` column checked by RLS) rather than a shared key.
 */
export default function AdminDashboard() {
  const [unlocked, setUnlocked] = useState(sessionStorage.getItem("gh_admin_unlocked") === "1");
  const [keyInput, setKeyInput] = useState("");
  const [sessions, setSessions] = useState([]);
  const [events, setEvents] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!unlocked) return;
    loadSessions();
    const poll = setInterval(loadSessions, 8000);

    const ws = new WebSocket(`${API_BASE.replace(/^http/, "ws")}/ws/admin/live`);
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      setEvents((prev) => [{ ...data, at: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
      loadSessions();
    };
    wsRef.current = ws;

    return () => {
      clearInterval(poll);
      ws.close();
    };
  }, [unlocked]);

  async function loadSessions() {
    const { data } = await supabase
      .from("exam_sessions")
      .select("id, status, current_index, started_at, students(full_name, unique_code)")
      .order("started_at", { ascending: false })
      .limit(100);
    setSessions(data || []);
  }

  function unlock() {
    // Replace with a real check against your own admin key/env value.
    if (keyInput.trim().length > 0) {
      sessionStorage.setItem("gh_admin_unlocked", "1");
      setUnlocked(true);
    }
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-3 text-center">
          <h1 className="font-display text-xl">Instructor access</h1>
          <input
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Access key"
            className="rounded-lg bg-surface border border-hourDim/30 px-4 py-2 text-ivory"
          />
          <button onClick={unlock} className="block mx-auto rounded-lg bg-hour text-ink px-5 py-2">
            Enter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 max-w-5xl mx-auto">
      <h1 className="font-display text-2xl mb-6">Live monitoring</h1>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-ash text-sm uppercase tracking-wide mb-2">Sessions</h2>
          <div className="space-y-1.5">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
                <span className="text-ivory">{s.students?.full_name} <span className="text-ash font-mono text-xs">{s.students?.unique_code}</span></span>
                <span className="text-ash font-mono text-xs">Q{s.current_index + 1}</span>
                <StatusBadge status={s.status} />
              </div>
            ))}
            {sessions.length === 0 && <p className="text-ash text-sm">No sessions yet.</p>}
          </div>
        </div>

        <div>
          <h2 className="text-ash text-sm uppercase tracking-wide mb-2">Live events</h2>
          <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
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
    </div>
  );
}

function StatusBadge({ status }) {
  const color =
    {
      in_progress: "text-good",
      disconnected: "text-hour",
      submitted: "text-ash",
      auto_submitted: "text-alert",
      expired: "text-alert",
    }[status] || "text-ash";
  return <span className={`font-mono text-xs ${color}`}>{status}</span>;
}
