import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { api } from "../lib/api";

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
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { navigate("/login"); return; }
    const userId = sessionData.session.user.id;

    const { data: studentRow } = await supabase.from("students").select("*").eq("id", userId).single();
    setStudent(studentRow);

    const { data: trackRow } = await supabase.from("tracks").select("*").eq("id", studentRow.track_id).single();
    setTrack(trackRow);

    const { data: examRows } = await supabase
      .from("exams").select("*").eq("track_id", studentRow.track_id).eq("is_published", true);
    setExams(examRows || []);

    // Load session statuses for each exam
    const { data: sessionRows } = await supabase
      .from("exam_sessions").select("exam_id, status, id, score, max_score")
      .eq("student_id", userId);
    const map = {};
    (sessionRows || []).forEach(s => { map[s.exam_id] = s; });
    setSessions(map);

    // Load retake requests
    const { data: retakeRows } = await supabase
      .from("retake_requests").select("exam_id, status").eq("student_id", userId);
    const rmap = {};
    (retakeRows || []).forEach(r => { rmap[r.exam_id] = r; });
    setRetakeRequests(rmap);

    setLoading(false);
  }

  async function submitRetakeRequest(examId) {
    setRequestStatus(s => ({ ...s, [examId]: "sending" }));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/exams/retake-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ exam_id: examId, reason: retakeReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      setRequestStatus(s => ({ ...s, [examId]: "sent" }));
      setRetakeRequests(r => ({ ...r, [examId]: { status: "pending" } }));
      setRequestingFor(null);
      setRetakeReason("");
    } catch (err) {
      setRequestStatus(s => ({ ...s, [examId]: "error: " + err.message }));
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  if (loading) return <Centered><p className="text-ash">Loading your track…</p></Centered>;

  return (
    <div className="min-h-screen bg-ink px-4 py-10 max-w-lg mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl text-ivory">
            {student.full_name.split(" ")[0]}
          </h1>
          <p className="text-ash text-sm mt-0.5">{track?.name}</p>
          <p className="text-ash text-xs mt-1 font-mono">{student.unique_code}</p>
        </div>
        <button onClick={handleLogout} className="text-ash text-xs hover:text-ivory">Log out</button>
      </div>

      {exams.length === 0 && (
        <p className="text-ash text-sm">No assessments published yet — check back shortly.</p>
      )}

      <div className="space-y-4">
        {exams.map((exam) => {
          const session = sessions[exam.id];
          const isDone = session && ["submitted", "auto_submitted", "expired"].includes(session.status);
          const isReset = session?.status === "reset";
          const retakeReq = retakeRequests[exam.id];
          const isOpen = requestingFor === exam.id;

          return (
            <div key={exam.id} className="rounded-xl bg-surface border border-surface2 overflow-hidden">
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-ivory font-medium">{exam.title}</p>
                    <p className="text-ash text-xs mt-1">
                      {exam.objective_count + exam.code_count} questions · {exam.objective_time_seconds}s per question
                    </p>
                  </div>
                  {isDone && (
                    <span className="text-xs font-mono text-good bg-good/10 border border-good/20 rounded-full px-2.5 py-0.5 shrink-0">
                      {session.score != null ? `${Math.round((session.score / session.max_score) * 100)}%` : "Done"}
                    </span>
                  )}
                </div>

                {/* Action area */}
                {!session || isReset ? (
                  <button
                    onClick={() => navigate(`/exam/${exam.id}`)}
                    className="mt-4 w-full py-3 rounded-lg bg-hour text-ink font-semibold hover:bg-hour/90 transition"
                  >
                    {isReset ? "Start retake →" : "Start exam →"}
                  </button>
                ) : isDone ? (
                  <div className="mt-4 space-y-2">
                    <button
                      onClick={() => navigate(`/results/${session.id}`)}
                      className="w-full py-2.5 rounded-lg border border-surface2 text-ash text-sm hover:text-ivory transition"
                    >
                      View result
                    </button>
                    {!retakeReq && (
                      <button
                        onClick={() => setRequestingFor(isOpen ? null : exam.id)}
                        className="w-full py-2.5 rounded-lg border border-hourDim/40 text-hour text-sm hover:border-hour transition"
                      >
                        Request retake
                      </button>
                    )}
                    {retakeReq?.status === "pending" && (
                      <p className="text-center text-xs text-ash py-1">
                        ⏳ Retake request pending instructor approval
                      </p>
                    )}
                    {retakeReq?.status === "denied" && (
                      <p className="text-center text-xs text-alert py-1">
                        Retake request was denied
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => navigate(`/exam/${exam.id}`)}
                    className="mt-4 w-full py-3 rounded-lg border border-hour text-hour font-medium hover:bg-hour/10 transition"
                  >
                    Resume exam →
                  </button>
                )}

                {/* Retake request form */}
                {isOpen && !retakeReq && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={retakeReason}
                      onChange={e => setRetakeReason(e.target.value)}
                      placeholder="Reason (optional)"
                      rows={2}
                      className="w-full rounded-lg bg-surface2 border border-surface2 px-3 py-2 text-sm text-ivory placeholder:text-ash resize-none focus:outline-none focus:border-hourDim"
                    />
                    <button
                      onClick={() => submitRetakeRequest(exam.id)}
                      disabled={requestStatus[exam.id] === "sending"}
                      className="w-full py-2.5 rounded-lg bg-hourDim text-ivory text-sm disabled:opacity-50"
                    >
                      {requestStatus[exam.id] === "sending" ? "Sending…" : "Submit request"}
                    </button>
                    {requestStatus[exam.id]?.startsWith("error") && (
                      <p className="text-alert text-xs">{requestStatus[exam.id]}</p>
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

function Centered({ children }) {
  return <div className="min-h-screen flex items-center justify-center">{children}</div>;
}
