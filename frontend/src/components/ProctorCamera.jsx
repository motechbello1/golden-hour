import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

const CHECK_INTERVAL_MS = 2500;
const LIVE_SNAPSHOT_INTERVAL_MS = 2500; // send a low-res frame to admin every 2.5s
const SUSTAINED_STREAK_TO_FLAG = 2;
const GAZE_DEVIATION_THRESHOLD = 0.18;

export function ProctorCamera({ onFlag, onLiveSnapshot, onCameraReady, onCameraError, includeSnapshots = true }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streaksRef = useRef({ no_face: 0, multiple_faces: 0, looking_away: 0 });
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let stream;
    let checkInterval;
    let liveInterval;
    let cancelled = false;

    async function setup() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models"),
        ]);
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        if (cancelled) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus("ready");
        onCameraReady?.();
        checkInterval = setInterval(runCheck, CHECK_INTERVAL_MS);
        // Periodic live snapshots for admin monitoring
        if (onLiveSnapshot) {
          liveInterval = setInterval(() => {
            const snap = captureSnapshot(0.15); // minimal quality for fast transmission
            if (snap) onLiveSnapshot(snap);
          }, LIVE_SNAPSHOT_INTERVAL_MS);
        }
      } catch (err) {
        setStatus("error");
        onCameraError?.(err);
      }
    }

    async function runCheck() {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
        .withFaceLandmarks(true);
      const streaks = streaksRef.current;

      if (detections.length === 0) {
        streaks.no_face += 1; streaks.multiple_faces = 0; streaks.looking_away = 0;
        maybeFlag("no_face", streaks.no_face); return;
      }
      if (detections.length > 1) {
        streaks.multiple_faces += 1; streaks.no_face = 0;
        maybeFlag("multiple_faces", streaks.multiple_faces); return;
      }
      streaks.no_face = 0; streaks.multiple_faces = 0;
      const box = detections[0].detection.box;
      const nose = detections[0].landmarks.getNose();
      const noseX = nose[Math.floor(nose.length / 2)].x;
      const deviation = Math.abs(noseX - (box.x + box.width / 2)) / box.width;
      if (deviation > GAZE_DEVIATION_THRESHOLD) {
        streaks.looking_away += 1;
        maybeFlag("looking_away", streaks.looking_away, { deviation: Number(deviation.toFixed(2)) });
      } else { streaks.looking_away = 0; }
    }

    function maybeFlag(eventType, streakCount, meta) {
      if (streakCount !== SUSTAINED_STREAK_TO_FLAG) return;
      const snapshot = includeSnapshots ? captureSnapshot(0.6) : null;
      onFlag?.({ event_type: eventType, meta, snapshot_base64: snapshot });
    }

    function captureSnapshot(quality = 0.6) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return null;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      return canvas.toDataURL("image/jpeg", quality).split(",")[1];
    }

    setup();
    return () => {
      cancelled = true;
      clearInterval(checkInterval);
      clearInterval(liveInterval);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-hourDim/40 bg-surface px-3 py-2">
      <video ref={videoRef} muted playsInline className="h-16 w-20 rounded object-cover" style={{ transform: "scaleX(-1)" }} />
      <canvas ref={canvasRef} className="hidden" />
      <div className="text-xs text-ash">
        {status === "loading" && "Starting camera…"}
        {status === "ready" && <span className="text-good">● Proctoring active</span>}
        {status === "error" && <span className="text-alert">Camera required</span>}
      </div>
    </div>
  );
}
