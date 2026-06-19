import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ThemeToggle } from "../lib/ThemeContext.jsx";

export default function TrackSelect() {
  const [student, setStudent] = useState(null);
  const [track, setTrack] = useState(null);
  const [exams, setExams] = useState([]);
  const [sessions, setSessions] = useState({});
  const [retakeRequests, setRetakeRequests] = useState({});
  const [loading, setLoading] = useState(true);
  const [retakeReason, setRetakeReason] = useState("");
  const [requestingFor, setRequestingFor] = useState(null);
  const [requestStatus, setRequestStatus] = useState({});
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: sd } = await supabase.auth.getSession();
    if (!sd.session) { navigate("/login"); return; }
    const uid = sd.session.user.id;
    const { data: stu } = await supabase.from("students").select("*").eq("id", uid).single();
    if (!stu) { navigate("/login"); return; }
    setStudent(stu);
    const { data: tr } = await supabase.from("tracks").select("*").eq("id", stu.track_id).single();
    setTrack(tr);
    const { data: ex } = await supabase.from("exams").select("*").eq("track_id", stu.track_id).eq("is_published", true);
    setExams(ex || []);
    // Get all sessions including reset ones for proper display
    const { data: sess } = await supabase.from("exam_sessions").select("exam_id,status,id,score,max_score").eq("student_id", uid);
    const sm = {};
    (sess || []).forEach(s => {
      // Keep the non-reset session, or the most recent if all reset
      if (!sm[s.exam_id] || s.status !== "reset") sm[s.exam_id] = s;
    });
    setSessions(sm);
    const { data: rr } = await supabase.from("retake_requests").select("exam_id,status").eq("student_id", uid);
    const rm = {};
    (rr || []).forEach(r => {
      // Keep the most recent retake request per exam
      if (!rm[r.exam_id] || r.status === "pending") rm[r.exam_id] = r;
    });
    setRetakeRequests(rm);
    setLoading(false);
  }

  async function submitRetakeRequest(examId) {
    setRequestStatus(s => ({ ...s, [examId]: "sending" }));
    try {
      const { data: sd } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/exams/retake-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sd.session?.access_token}` },
        body: JSON.stringify({ exam_id: examId, reason: retakeReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      setRequestStatus(s => ({ ...s, [examId]: "sent" }));
      setRetakeRequests(r => ({ ...r, [examId]: { status: "pending" } }));
      setRequestingFor(null); setRetakeReason("");
    } catch (err) {
      setRequestStatus(s => ({ ...s, [examId]: err.message }));
    }
  }

  if (loading) return <div className="min-h-screen bg-ink flex items-center justify-center"><p className="text-ash animate-pulse">Loading…</p></div>;

  return (
    <div className="min-h-screen bg-ink px-5 py-8 max-w-lg mx-auto animate-fade-in">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-hour text-xs font-mono uppercase tracking-widest mb-1">Golden Hour</p>
          <h1 className="font-display text-2xl text-ivory">{student.full_name}</h1>
          <p className="text-ash text-sm mt-0.5">{track?.name}</p>
          <p className="text-ash/50 text-xs mt-1 font-mono">{student.unique_code}</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button onClick={async () => { await supabase.auth.signOut(); navigate("/login"); }}
            className="text-ash text-xs hover:text-ivory transition">Log out</button>
        </div>
      </div>

      {exams.length === 0 && <p className="text-ash text-sm bg-surface rounded-xl p-6 text-center">No assessments published yet.</p>}

      <div className="space-y-4">
        {exams.map(exam => {
          const session = sessions[exam.id];
          const isReset = session?.status === "reset";
          const isDone = session && ["submitted", "auto_submitted", "expired"].includes(session.status);
          const isActive = session?.status === "in_progress" || session?.status === "disconnected";
          const retake = retakeRequests[exam.id];
          const canStartFresh = !session || isReset;
          const isOpen = requestingFor === exam.id;

          return (
            <div key={exam.id} className="rounded-2xl bg-surface border border-surface2 overflow-hidden animate-slide-up">
              <div className="px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-ivory font-semibold">{exam.title}</p>
                    <p className="text-ash text-xs mt-1">{exam.objective_count + exam.code_count} questions · {exam.objective_time_seconds}s each</p>
                  </div>
                  {isDone && session.score != null && session.max_score != null && (
                    <span className={`text-xs font-mono px-3 py-1 rounded-full ${
                      Math.round((session.score / session.max_score) * 100) >= 70 ? "bg-good/15 text-good" : "bg-hour/15 text-hour"
                    }`}>{Math.round((session.score / session.max_score) * 100)}%</span>
                  )}
                </div>

                {/* Can start fresh (no session or reset) */}
                {canStartFresh && (
                  <button onClick={() => navigate(`/exam/${exam.id}`)}
                    className="mt-4 w-full py-3.5 rounded-xl bg-hour text-ink font-bold hover:shadow-lg hover:shadow-hour/20 transition active:scale-[.98]">
                    {isReset ? "Start retake →" : "Start exam →"}
                  </button>
                )}

                {/* Active session */}
                {isActive && (
                  <button onClick={() => navigate(`/exam/${exam.id}`)}
                    className="mt-4 w-full py-3.5 rounded-xl border-2 border-hour text-hour font-bold hover:bg-hour/10 transition">
                    Resume exam →
                  </button>
                )}

                {/* Completed */}
                {isDone && (
                  <div className="mt-4 space-y-2">
                    <button onClick={() => navigate(`/results/${session.id}`)}
                      className="w-full py-3 rounded-xl border border-surface2 text-ash text-sm hover:text-ivory hover:border-hourDim transition">
                      View result ({session.score}/{session.max_score} correct)
                    </button>

                    {/* Retake request flow */}
                    {!retake && (
                      <button onClick={() => setRequestingFor(isOpen ? null : exam.id)}
                        className="w-full py-3 rounded-xl border border-hourDim/40 text-hour text-sm hover:border-hour transition">
                        Request retake
                      </button>
                    )}
                    {retake?.status === "pending" && (
                      <p className="text-center text-xs text-ash py-2 bg-surface2 rounded-xl">⏳ Retake request pending approval</p>
                    )}
                    {retake?.status === "denied" && (
                      <p className="text-center text-xs text-alert py-2">Retake request denied</p>
                    )}

                    {isOpen && !retake && (
                      <div className="space-y-2 animate-scale-in">
                        <textarea value={retakeReason} onChange={e => setRetakeReason(e.target.value)}
                          placeholder="Reason (optional)" rows={2}
                          className="w-full rounded-xl bg-surface2 border border-surface2 px-4 py-2.5 text-sm text-ivory placeholder:text-ash/40 resize-none focus:outline-none focus:ring-1 focus:ring-hour" />
                        <button onClick={() => submitRetakeRequest(exam.id)}
                          disabled={requestStatus[exam.id] === "sending"}
                          className="w-full py-3 rounded-xl bg-hourDim text-ivory text-sm font-medium disabled:opacity-50 transition">
                          {requestStatus[exam.id] === "sending" ? "Sending…" : "Submit request"}
                        </button>
                        {requestStatus[exam.id] && requestStatus[exam.id] !== "sending" && requestStatus[exam.id] !== "sent" && (
                          <p className="text-alert text-xs">{requestStatus[exam.id]}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
