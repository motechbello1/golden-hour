import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, proctorSocketUrl } from "../lib/api";
import { setupLockdown } from "../lib/useLockdown";
import { ProctorCamera } from "../components/ProctorCamera";

const HEARTBEAT_INTERVAL_MS = 5000;
const OPTION_LABELS = ["A", "B", "C", "D", "E"];

export default function Exam() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const lockdownTeardownRef = useRef(null);
  const questionStartRef = useRef(null);

  const [phase, setPhase] = useState("camera-check");
  const [cameraOk, setCameraOk] = useState(false);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [error, setError] = useState(null);
  const [endReason, setEndReason] = useState(null);

  const sendEvent = useCallback((payload) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const handleViolation = useCallback((eventType, meta) => {
    sendEvent({ type: "violation", event_type: eventType, meta });
  }, [sendEvent]);

  const handleFlag = useCallback(({ event_type, meta, snapshot_base64 }) => {
    sendEvent({ type: "flag", event_type, meta, snapshot_base64 });
  }, [sendEvent]);

  const connectSocket = useCallback((sessionId) => {
    const ws = new WebSocket(proctorSocketUrl(sessionId));
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === "auto_submitted") {
        setEndReason(data.reason);
        setPhase("ended");
      }
    };
    socketRef.current = ws;
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "heartbeat" }));
    }, HEARTBEAT_INTERVAL_MS);
    ws.onclose = () => clearInterval(heartbeat);
  }, []);

  const advance = useCallback(async (selectedOptionId, autoAdvanced) => {
    if (!question) return;
    const timeTakenMs = Date.now() - questionStartRef.current;
    setPhase("submitting");
    try {
      const result = await api.submitAnswer({
        session_id: question.session_id,
        question_id: question.question_id,
        selected_option_id: selectedOptionId,
        time_taken_ms: timeTakenMs,
        auto_advanced: autoAdvanced,
      });
      if (result.finished) {
        setEndReason("completed");
        setPhase("ended");
      } else {
        setQuestion(result.next_question);
        setSelected(null);
        setTimeLeft(result.next_question.time_seconds);
        questionStartRef.current = Date.now();
        setPhase("in-progress");
      }
    } catch (err) {
      setError(err.message);
      setPhase("in-progress");
    }
  }, [question]);

  // Timer tick
  useEffect(() => {
    if (phase !== "in-progress" || !question) return;
    setTimeLeft(question.time_seconds);
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [question?.question_id, phase]);

  // Auto-advance when timer hits 0
  useEffect(() => {
    if (timeLeft === 0 && phase === "in-progress") {
      advance(selected, true);
    }
  }, [timeLeft, phase]);

  // Cleanup on exam end
  useEffect(() => {
    if (phase === "ended") {
      const sid = question?.session_id;
      socketRef.current?.close();
      lockdownTeardownRef.current?.();
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      const t = setTimeout(() => navigate(`/results/${sid}`), 2000);
      return () => clearTimeout(t);
    }
  }, [phase]);

  async function beginExam() {
    setError(null);
    try {
      // Enter fullscreen ONCE via the user's click gesture — never again.
      // This is the fix for the in/out fullscreen loop: the old code called
      // requestFullscreen inside a useEffect that re-ran on every phase change.
      try {
        await document.documentElement.requestFullscreen();
      } catch (_) {
        // Fullscreen not available or denied — continue anyway
      }

      const q = await api.startExam(examId);
      setQuestion(q);
      setTimeLeft(q.time_seconds);
      connectSocket(q.session_id);
      questionStartRef.current = Date.now();

      // Set up lockdown listeners exactly once
      lockdownTeardownRef.current = setupLockdown(handleViolation);
      setPhase("in-progress");
    } catch (err) {
      setError(err.message);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }
  }

  // ─── Camera check screen ───────────────────────────────────────────────────
  if (phase === "camera-check") {
    return (
      <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-6 text-center">
        <div className="w-full max-w-md space-y-6">
          <div>
            <p className="text-ash text-xs uppercase tracking-widest mb-2 font-mono">ICBM Bootcamp</p>
            <h1 className="font-display text-3xl text-ivory">Before you begin</h1>
          </div>

          <div className="text-left bg-surface rounded-xl p-5 space-y-2 text-sm text-ash border border-surface2">
            <p>📷 &nbsp;Camera must stay on for the full session</p>
            <p>🖥️ &nbsp;Exam runs in fullscreen — exiting auto-submits</p>
            <p>🔒 &nbsp;Switching tabs auto-submits immediately</p>
            <p>🔄 &nbsp;Lost connection? Reopen this page to resume</p>
          </div>

          <ProctorCamera
            onFlag={handleFlag}
            onCameraReady={() => setCameraOk(true)}
            onCameraError={() => setCameraOk(false)}
          />

          {error && <p className="text-alert text-sm">{error}</p>}

          <button
            disabled={!cameraOk}
            onClick={beginExam}
            className="w-full py-4 rounded-xl bg-hour text-ink font-semibold text-lg disabled:opacity-30 disabled:cursor-not-allowed transition hover:bg-hour/90"
          >
            Begin exam
          </button>
        </div>
      </div>
    );
  }

  // ─── Ended screen ──────────────────────────────────────────────────────────
  if (phase === "ended") {
    return (
      <div className="min-h-screen bg-ink flex flex-col items-center justify-center text-center px-6">
        <h1 className="font-display text-3xl text-ivory mb-3">
          {endReason === "completed" ? "Exam submitted" : "Exam ended"}
        </h1>
        <p className="text-ash">
          {endReason === "completed"
            ? "Calculating your score…"
            : `Ended automatically — ${endReason?.replaceAll("_", " ")}. Redirecting…`}
        </p>
      </div>
    );
  }

  // ─── Active exam ───────────────────────────────────────────────────────────
  const timerPct = question ? (timeLeft / question.time_seconds) * 100 : 100;
  const timerColor = timerPct > 40 ? "bg-hour" : timerPct > 20 ? "bg-orange-400" : "bg-alert";
  const isSubmitting = phase === "submitting";

  return (
    <div className="h-screen bg-ink flex flex-col overflow-hidden select-none">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-surface border-b border-surface2 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-ash text-xs font-mono uppercase tracking-widest hidden sm:block">Golden Hour</span>
          <span className="text-ivory font-mono text-sm">
            Q <span className="text-hour font-bold">{question.index + 1}</span>
            <span className="text-ash"> / {question.total}</span>
          </span>
        </div>

        <div className="font-mono text-3xl font-bold tabular-nums" style={{
          color: timerPct > 40 ? '#E8A33D' : timerPct > 20 ? '#fb923c' : '#C84B31'
        }}>
          {timeLeft}
        </div>

        <ProctorCamera onFlag={handleFlag} includeSnapshots />
      </div>

      {/* ── Timer bar ── */}
      <div className="h-1.5 w-full bg-surface2 shrink-0">
        <div
          className={`h-full transition-none ${timerColor}`}
          style={{ width: `${timerPct}%`, transition: "width 1s linear" }}
        />
      </div>

      {/* ── Question + options ── */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto px-5 py-6">

          {/* Question text */}
          <div className="mb-6">
            <p className={`leading-relaxed text-ivory ${question.type === "code" ? "font-mono text-sm whitespace-pre-wrap bg-surface rounded-xl p-5 border border-surface2" : "text-base"}`}>
              {question.prompt}
            </p>
          </div>

          {/* Options */}
          <div className="space-y-3 flex-1">
            {question.options.map((opt, i) => {
              const isSelected = selected === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => !isSubmitting && setSelected(opt.id)}
                  disabled={isSubmitting}
                  className={`w-full text-left rounded-xl border-2 px-5 py-4 flex items-start gap-4 transition-all duration-150 ${
                    isSelected
                      ? "border-hour bg-hour/10 text-ivory shadow-lg shadow-hour/10"
                      : "border-surface2 bg-surface text-ash hover:border-hourDim hover:text-ivory"
                  }`}
                >
                  <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-mono mt-0.5 ${
                    isSelected ? "bg-hour text-ink" : "bg-surface2 text-ash"
                  }`}>
                    {OPTION_LABELS[i]}
                  </span>
                  <span className="text-sm leading-relaxed pt-0.5">{opt.text}</span>
                </button>
              );
            })}
          </div>

          {/* Confirm button */}
          <div className="mt-6 space-y-2">
            {error && <p className="text-alert text-xs text-center">{error}</p>}
            <button
              onClick={() => advance(selected, false)}
              disabled={!selected || isSubmitting}
              className="w-full py-4 rounded-xl font-semibold text-ink bg-hour disabled:opacity-25 disabled:cursor-not-allowed transition hover:bg-hour/90 text-base"
            >
              {isSubmitting ? "Saving…" : "Confirm answer →"}
            </button>
            <p className="text-center text-xs text-ash/60">No going back — choose carefully</p>
          </div>

        </div>
      </div>
    </div>
  );
}
