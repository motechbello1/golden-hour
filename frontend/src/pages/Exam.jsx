import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, proctorSocketUrl } from "../lib/api";
import { setupLockdown } from "../lib/useLockdown";
import { ProctorCamera } from "../components/ProctorCamera";

const HEARTBEAT_MS = 5000;
const LABELS = ["A", "B", "C", "D", "E"];

export default function Exam() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const wsRef = useRef(null);
  const teardownRef = useRef(null);
  const startTimeRef = useRef(null);
  const advancingRef = useRef(false);
  const violatedRef = useRef(false);

  const [phase, setPhase] = useState("camera-check");
  const [cameraOk, setCameraOk] = useState(false);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState(null);
  const [endReason, setEndReason] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const sendEvent = useCallback((p) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(p));
  }, []);

  const handleFlag = useCallback(
    ({ event_type, meta, snapshot_base64 }) =>
      sendEvent({ type: "flag", event_type, meta, snapshot_base64 }),
    [sendEvent]
  );

  const connectSocket = useCallback((sid) => {
    const ws = new WebSocket(proctorSocketUrl(sid));
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "auto_submitted") {
        setEndReason(d.reason);
        setPhase("ended");
      }
    };
    wsRef.current = ws;
    const hb = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "heartbeat" }));
    }, HEARTBEAT_MS);
    ws.onclose = () => clearInterval(hb);
  }, []);

  // ── Advance to next question ──
  const advance = useCallback(
    async (optId, auto) => {
      if (!question || advancingRef.current) return;
      advancingRef.current = true;
      setSubmitting(true);
      try {
        const res = await api.submitAnswer({
          session_id: question.session_id,
          question_id: question.question_id,
          selected_option_id: optId,
          time_taken_ms: Date.now() - startTimeRef.current,
          auto_advanced: auto,
        });
        if (res.finished) {
          setEndReason("completed");
          setPhase("ended");
        } else {
          setQuestion(res.next_question);
          setTimeLeft(res.next_question.time_seconds);
          setSelected(null);
          startTimeRef.current = Date.now();
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setSubmitting(false);
        advancingRef.current = false;
      }
    },
    [question]
  );

  // ── Timer ──
  const selectedRef = useRef(null);
  selectedRef.current = selected;

  useEffect(() => {
    if (phase !== "exam" || !question) return;
    const iv = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(iv);
          setTimeout(() => advance(selectedRef.current, true), 0);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [question?.question_id, phase]);

  // ── When page comes back after being hidden, check if session was killed ──
  useEffect(() => {
    if (phase !== "exam") return;
    const handleReturn = () => {
      if (!document.hidden && violatedRef.current && question?.session_id) {
        // Page is visible again after a violation — check if backend killed the session
        api.getResult(question.session_id)
          .then(() => {
            // If getResult succeeds, the session is done
            setEndReason("tab_blur");
            setPhase("ended");
          })
          .catch(() => {
            // Session might still be alive (grace period, or websocket handled it)
            // Either way, the violation was already sent
          });
      }
    };
    document.addEventListener("visibilitychange", handleReturn);
    return () => document.removeEventListener("visibilitychange", handleReturn);
  }, [phase, question?.session_id]);

  // ── End cleanup ──
  useEffect(() => {
    if (phase !== "ended") return;
    const sid = question?.session_id;
    wsRef.current?.close();
    teardownRef.current?.();
    const exitFs = document.exitFullscreen || document.webkitExitFullscreen;
    if ((document.fullscreenElement || document.webkitFullscreenElement) && exitFs)
      exitFs.call(document).catch(() => {});
    const t = setTimeout(() => navigate(`/results/${sid}`), 2000);
    return () => clearTimeout(t);
  }, [phase]);

  // ── Begin ──
  async function beginExam() {
    setError(null);
    try {
      const el = document.documentElement;
      const requestFs = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (requestFs) {
        try { await requestFs.call(el); } catch (_) {}
      }

      const q = await api.startExam(examId);
      setQuestion(q);
      setTimeLeft(q.time_seconds);
      startTimeRef.current = Date.now();
      connectSocket(q.session_id);

      teardownRef.current = setupLockdown(
        (evType) => {
          violatedRef.current = true;
          sendEvent({ type: "violation", event_type: evType });
        },
        () => { violatedRef.current = true; }
      );

      setPhase("exam");
    } catch (err) {
      setError(err.message);
      const exitFs = document.exitFullscreen || document.webkitExitFullscreen;
      if ((document.fullscreenElement || document.webkitFullscreenElement) && exitFs)
        exitFs.call(document).catch(() => {});
    }
  }

  // ──────── CAMERA CHECK ────────
  if (phase === "camera-check") {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-5">
        <div className="w-full max-w-md space-y-6 text-center animate-slide-up">
          <div>
            <h1 className="font-display text-4xl text-ivory">Golden Hour</h1>
            <p className="text-ash text-sm mt-2">Assessment environment</p>
          </div>

          <div className="bg-surface/50 backdrop-blur rounded-2xl border border-surface2 p-6 text-left space-y-3">
            <h2 className="text-ivory text-sm font-semibold mb-2">Before you start</h2>
            <Rule icon="◉" color="text-hour">Camera stays on for the full session</Rule>
            <Rule icon="◉" color="text-hour">Runs in fullscreen — leaving auto-submits</Rule>
            <Rule icon="◉" color="text-hour">Switching tabs or apps auto-submits immediately</Rule>
            <Rule icon="◉" color="text-good">Lost connection? Reopen to resume</Rule>
          </div>

          <div className="flex justify-center">
            <ProctorCamera onFlag={handleFlag} onCameraReady={() => setCameraOk(true)} onCameraError={() => setCameraOk(false)} />
          </div>

          {error && <p className="text-alert text-sm bg-alert/10 rounded-lg px-4 py-2">{error}</p>}

          <button disabled={!cameraOk} onClick={beginExam}
            className="w-full py-4 rounded-2xl bg-hour text-ink font-bold text-lg disabled:opacity-20 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-hour/20 active:scale-[.98]">
            Begin Exam
          </button>
        </div>
      </div>
    );
  }

  // ──────── ENDED ────────
  if (phase === "ended") {
    return (
      <div className="min-h-screen bg-ink flex flex-col items-center justify-center text-center px-6">
        <div className="w-16 h-16 rounded-full bg-hour/20 flex items-center justify-center mb-6">
          <span className="text-hour text-3xl">{endReason === "completed" ? "✓" : "⚠"}</span>
        </div>
        <h1 className="font-display text-3xl text-ivory mb-2">
          {endReason === "completed" ? "Exam Complete" : "Exam Ended"}
        </h1>
        <p className="text-ash text-sm">
          {endReason === "completed" ? "Calculating your score…" : `Auto-submitted. Redirecting…`}
        </p>
      </div>
    );
  }

  // ──────── ACTIVE EXAM ────────
  const pct = question ? (timeLeft / question.time_seconds) * 100 : 100;
  const timerUrgent = pct <= 20;
  const timerWarn = pct <= 40 && !timerUrgent;

  return (
    <div className="h-screen bg-ink flex flex-col overflow-hidden select-none">
      <header className="shrink-0 flex items-center justify-between px-5 py-3 bg-surface border-b border-surface2">
        <div className="flex items-center gap-4">
          <span className="text-ash text-xs font-mono tracking-widest hidden sm:block">GOLDEN HOUR</span>
          <div className="flex items-baseline gap-1">
            <span className="text-ivory font-mono text-sm font-bold">{question.index + 1}</span>
            <span className="text-ash font-mono text-xs">/{question.total}</span>
          </div>
        </div>
        <div className={`font-mono text-3xl font-black tabular-nums transition-colors ${
          timerUrgent ? "text-alert animate-pulse" : timerWarn ? "text-orange-400" : "text-hour"
        }`}>{timeLeft}</div>
        <ProctorCamera onFlag={handleFlag} includeSnapshots />
      </header>

      <div className="shrink-0 h-1 bg-surface2">
        <div className={`h-full transition-[width] duration-1000 linear rounded-r-full ${
          timerUrgent ? "bg-alert" : timerWarn ? "bg-orange-400" : "bg-hour"
        }`} style={{ width: `${pct}%` }} />
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6 flex flex-col min-h-full">
          <div className="mb-8">
            <span className="text-hour text-xs font-mono uppercase tracking-widest">Question {question.index + 1}</span>
            <div className={`mt-3 text-ivory leading-relaxed ${
              question.prompt.includes("\n")
                ? "font-mono text-sm whitespace-pre-wrap bg-surface rounded-xl p-5 border border-surface2"
                : "text-lg"
            }`}>{question.prompt}</div>
          </div>

          <div className="space-y-3 flex-1">
            {question.options.map((opt, i) => {
              const active = selected === opt.id;
              return (
                <button key={opt.id} onClick={() => !submitting && setSelected(opt.id)} disabled={submitting}
                  className={`group w-full text-left rounded-xl border-2 px-5 py-4 flex items-start gap-4 transition-all duration-100 ${
                    active ? "border-hour bg-hour/10 shadow-lg shadow-hour/5" : "border-surface2 bg-surface hover:border-hourDim/60 hover:bg-surface2"
                  }`}>
                  <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold font-mono transition-colors ${
                    active ? "bg-hour text-ink" : "bg-surface2 text-ash group-hover:text-ivory"
                  }`}>{LABELS[i]}</span>
                  <span className={`text-sm leading-relaxed pt-1 transition-colors ${
                    active ? "text-ivory" : "text-ash group-hover:text-ivory"
                  }`}>{opt.text}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-8 pb-4">
            {error && <p className="text-alert text-xs text-center mb-3">{error}</p>}
            <button onClick={() => advance(selected, false)} disabled={!selected || submitting}
              className="w-full py-4 rounded-xl font-bold text-ink bg-hour text-base disabled:opacity-20 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-hour/20 active:scale-[.98]">
              {submitting ? "Saving…" : "Confirm →"}
            </button>
            <p className="text-center text-xs text-ash/40 mt-3 tracking-wide">No going back</p>
          </div>
        </div>
      </main>
    </div>
  );
}

function Rule({ icon, color, children }) {
  return (
    <div className="flex gap-3 items-start text-sm text-ash">
      <span className={`${color} text-lg leading-none mt-0.5`}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}
