import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, proctorSocketUrl } from "../lib/api";
import { useLockdown } from "../lib/useLockdown";
import { ProctorCamera } from "../components/ProctorCamera";
import { QuestionTimer } from "../components/QuestionTimer";

const HEARTBEAT_INTERVAL_MS = 5000;

export default function Exam() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const socketRef = useRef(null);
  const questionStartRef = useRef(null);

  const [phase, setPhase] = useState("camera-check"); // camera-check | ready | in-progress | submitting | ended
  const [cameraOk, setCameraOk] = useState(false);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [endReason, setEndReason] = useState(null);

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

  const sendEvent = useCallback((payload) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const handleViolation = useCallback(
    (eventType, meta) => {
      sendEvent({ type: "violation", event_type: eventType, meta });
    },
    [sendEvent]
  );

  const handleFlag = useCallback(
    ({ event_type, meta, snapshot_base64 }) => {
      sendEvent({ type: "flag", event_type, meta, snapshot_base64 });
    },
    [sendEvent]
  );

  useLockdown({ containerRef, onViolation: handleViolation, enabled: phase === "in-progress" });

  async function beginExam() {
    setError(null);
    try {
      const q = await api.startExam(examId);
      setQuestion(q);
      connectSocket(q.session_id);
      questionStartRef.current = Date.now();
      setPhase("in-progress");
    } catch (err) {
      setError(err.message);
    }
  }

  const advance = useCallback(
    async (selectedOptionId, autoAdvanced) => {
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
          questionStartRef.current = Date.now();
          setPhase("in-progress");
        }
      } catch (err) {
        setError(err.message);
        setPhase("in-progress");
      }
    },
    [question]
  );

  const handleExpire = useCallback(() => advance(selected, true), [advance, selected]);

  useEffect(() => {
    if (phase === "ended") {
      const sid = question?.session_id;
      socketRef.current?.close();
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      const t = setTimeout(() => navigate(`/results/${sid}`), 1500);
      return () => clearTimeout(t);
    }
  }, [phase, question, navigate]);

  if (phase === "camera-check") {
    return (
      <Gate>
        <h1 className="font-display text-2xl mb-2">Before you begin</h1>
        <p className="text-ash text-sm mb-6 max-w-sm">
          This assessment requires your camera on for the full session, runs in fullscreen, and submits
          automatically if you leave the tab or exit fullscreen. A lost connection is not held against
          you — just reopen this page to resume where you left off.
        </p>
        <ProctorCamera
          onFlag={handleFlag}
          onCameraReady={() => setCameraOk(true)}
          onCameraError={() => setCameraOk(false)}
        />
        <button
          disabled={!cameraOk}
          onClick={beginExam}
          className="mt-6 rounded-lg bg-hour text-ink font-medium px-6 py-2.5 disabled:opacity-40"
        >
          Begin exam
        </button>
        {error && <p className="text-alert text-sm mt-3">{error}</p>}
      </Gate>
    );
  }

  if (phase === "ended") {
    return (
      <Gate>
        <h1 className="font-display text-2xl mb-2">
          {endReason === "completed" ? "Exam submitted" : "Exam ended"}
        </h1>
        <p className="text-ash text-sm">
          {endReason === "completed"
            ? "Calculating your score…"
            : `Ended automatically (${endReason?.replace("_", " ")}). Taking you to your result…`}
        </p>
      </Gate>
    );
  }

  return (
    <div ref={containerRef} className="min-h-screen bg-ink px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <span className="text-ash text-sm font-mono">
            Question {question.index + 1} / {question.total}
          </span>
          <ProctorCamera onFlag={handleFlag} includeSnapshots />
        </div>

        <QuestionTimer questionId={question.question_id} seconds={question.time_seconds} onExpire={handleExpire} />

        <div className="mt-6 rounded-xl bg-surface border border-hourDim/30 p-6">
          <p className="font-mono text-ivory whitespace-pre-wrap leading-relaxed">{question.prompt}</p>

          <div className="mt-5 space-y-2">
            {question.options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSelected(opt.id)}
                disabled={phase === "submitting"}
                className={`w-full text-left rounded-lg border px-4 py-3 transition ${
                  selected === opt.id
                    ? "border-hour bg-hour/10 text-ivory"
                    : "border-hourDim/30 bg-surface2 text-ash hover:border-hour/50"
                }`}
              >
                {opt.text}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => advance(selected, false)}
          disabled={!selected || phase === "submitting"}
          className="mt-5 w-full rounded-lg bg-hour text-ink font-medium py-2.5 disabled:opacity-40"
        >
          {phase === "submitting" ? "Submitting…" : "Confirm answer"}
        </button>
        <p className="text-center text-xs text-ash mt-3">You cannot go back to a previous question.</p>
      </div>
    </div>
  );
}

function Gate({ children }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">{children}</div>
  );
}
