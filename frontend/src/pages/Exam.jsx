import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, proctorSocketUrl } from "../lib/api";
import { supabase } from "../lib/supabaseClient";
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
  const busyRef = useRef(false);
  const violatedRef = useRef(false);
  const timerRef = useRef(null);

  const [phase, setPhase] = useState("loading");
  const [cameraOk, setCameraOk] = useState(false);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState(null);
  const [endReason, setEndReason] = useState(null);
  const [busy, setBusy] = useState(false);

  // Auth gate
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate("/login");
      else setPhase("camera-check");
    });
  }, []);

  const sendEvent = useCallback((p) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(p));
  }, []);

  const handleFlag = useCallback(
    ({ event_type, meta, snapshot_base64 }) =>
      sendEvent({ type: "flag", event_type, meta, snapshot_base64 }),
    [sendEvent]
  );

  const handleLiveSnapshot = useCallback(
    (snapshot_base64) => sendEvent({ type: "live_snapshot", snapshot_base64 }),
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

  // ── Submit answer — single-threaded, no double-fire ──
  const selectedRef = useRef(null);
  selectedRef.current = selected;

  const doAdvance = useCallback(async (optId, auto) => {
    if (!question || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    clearInterval(timerRef.current); // stop timer while submitting

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
      // If session was already ended server-side, redirect to results
      if (err.message.includes("Session is") || err.message.includes("409")) {
        setEndReason("server_ended");
        setPhase("ended");
      } else {
        setError(err.message);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [question]);

  // ── Timer — stops while busy, auto-advances at 0 ──
  useEffect(() => {
    if (phase !== "exam" || !question || busy) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setTimeout(() => doAdvance(selectedRef.current, true), 50);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [question?.question_id, phase, busy]);

  // ── Return from background — check if session was killed ──
  useEffect(() => {
    if (phase !== "exam") return;
    const check = () => {
      if (!document.hidden && violatedRef.current && question?.session_id) {
        api.getResult(question.session_id)
          .then(() => { setEndReason("violation"); setPhase("ended"); })
          .catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
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

  async function beginExam() {
    setError(null);
    try {
      const el = document.documentElement;
      const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (rfs) { try { await rfs.call(el); } catch (_) {} }

      const q = await api.startExam(examId);
      setQuestion(q);
      setTimeLeft(q.time_seconds);
      startTimeRef.current = Date.now();
      connectSocket(q.session_id);
      teardownRef.current = setupLockdown(
        (evType) => { violatedRef.current = true; sendEvent({ type: "violation", event_type: evType }); },
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

  // ──── LOADING ────
  if (phase === "loading") {
    return <Center><p className="text-ash animate-pulse">Loading…</p></Center>;
  }

  // ──── CAMERA CHECK ────
  if (phase === "camera-check") {
    return (
      <Center>
        <div className="w-full max-w-md space-y-6 text-center animate-slide-up">
          <div>
            <h1 className="font-display text-4xl text-ivory">Golden Hour</h1>
            <p className="text-ash text-sm mt-2">Assessment environment</p>
          </div>
          <div className="bg-surface/50 backdrop-blur rounded-2xl border border-surface2 p-6 text-left space-y-3">
            <h2 className="text-ivory text-sm font-semibold mb-2">Before you start</h2>
            <R c="text-hour">Camera stays on for the full session</R>
            <R c="text-hour">Runs in fullscreen — leaving auto-submits</R>
            <R c="text-hour">Switching tabs or apps auto-submits immediately</R>
            <R c="text-good">Lost connection? Reopen to resume</R>
          </div>
          <div className="flex justify-center">
            <ProctorCamera onFlag={handleFlag} onCameraReady={() => setCameraOk(true)} onCameraError={() => setCameraOk(false)} />
          </div>
          {error && <p className="text-alert text-sm bg-alert/10 rounded-lg px-4 py-2">{error}</p>}
          <button disabled={!cameraOk} onClick={beginExam}
            className="w-full py-4 rounded-2xl bg-hour text-ink font-bold text-lg disabled:opacity-20 transition-all hover:shadow-lg hover:shadow-hour/20 active:scale-[.98]">
            Begin Exam
          </button>
        </div>
      </Center>
    );
  }

  // ──── ENDED ────
  if (phase === "ended") {
    return (
      <Center>
        <div className="w-16 h-16 rounded-full bg-hour/20 flex items-center justify-center mb-6">
          <span className="text-hour text-3xl">{endReason === "completed" ? "✓" : "⚠"}</span>
        </div>
        <h1 className="font-display text-3xl text-ivory mb-2">
          {endReason === "completed" ? "Exam Complete" : "Exam Ended"}
        </h1>
        <p className="text-ash text-sm">Redirecting to your result…</p>
      </Center>
    );
  }

  // ──── ACTIVE EXAM ────
  const pct = question ? (timeLeft / question.time_seconds) * 100 : 100;
  const urgent = pct <= 20;
  const warn = pct <= 40 && !urgent;

  return (
    <div className="h-screen bg-ink flex flex-col overflow-hidden select-none">
      <header className="shrink-0 flex items-center justify-between px-5 py-3 bg-surface border-b border-surface2">
        <div className="flex items-baseline gap-2">
          <span className="text-ivory font-mono text-sm font-bold">{question.index + 1}</span>
          <span className="text-ash font-mono text-xs">/{question.total}</span>
        </div>
        <div className={`font-mono text-3xl font-black tabular-nums transition-colors ${
          urgent ? "text-alert animate-pulse" : warn ? "text-orange-400" : "text-hour"
        }`}>{timeLeft}</div>
        <ProctorCamera onFlag={handleFlag} onLiveSnapshot={handleLiveSnapshot} includeSnapshots />
      </header>

      <div className="shrink-0 h-1 bg-surface2">
        <div className={`h-full transition-[width] duration-1000 linear rounded-r-full ${
          urgent ? "bg-alert" : warn ? "bg-orange-400" : "bg-hour"
        }`} style={{ width: `${pct}%` }} />
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6 flex flex-col min-h-full">
          <div className="mb-6">
            <span className="text-hour text-xs font-mono uppercase tracking-widest">Question {question.index + 1}</span>
            <div className={`mt-3 text-ivory leading-relaxed ${
              question.prompt.includes("\n") ? "font-mono text-sm whitespace-pre-wrap bg-surface rounded-xl p-5 border border-surface2" : "text-lg"
            }`}>{question.prompt}</div>
          </div>

          <div className="space-y-3 flex-1">
            {question.options.map((opt, i) => {
              const on = selected === opt.id;
              return (
                <button key={opt.id} onClick={() => !busy && setSelected(opt.id)} disabled={busy}
                  className={`group w-full text-left rounded-xl border-2 px-5 py-4 flex items-start gap-4 transition-all ${
                    on ? "border-hour bg-hour/10" : "border-surface2 bg-surface hover:border-hourDim/60"
                  }`}>
                  <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold font-mono ${
                    on ? "bg-hour text-ink" : "bg-surface2 text-ash"
                  }`}>{LABELS[i]}</span>
                  <span className={`text-sm leading-relaxed pt-1 ${on ? "text-ivory" : "text-ash"}`}>{opt.text}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 pb-4">
            {error && <p className="text-alert text-xs text-center mb-3">{error}</p>}
            <button onClick={() => doAdvance(selected, false)} disabled={!selected || busy}
              className="w-full py-4 rounded-xl font-bold text-ink bg-hour disabled:opacity-20 transition active:scale-[.98]">
              {busy ? "Saving…" : "Confirm →"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Center({ children }) {
  return <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-5">{children}</div>;
}
function R({ c, children }) {
  return <div className="flex gap-3 items-start text-sm text-ash"><span className={`${c} text-lg leading-none mt-0.5`}>◉</span><span>{children}</span></div>;
}
