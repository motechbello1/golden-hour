import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

const CHECK_INTERVAL_MS = 2500;
const SUSTAINED_STREAK_TO_FLAG = 2;
const GAZE_DEVIATION_THRESHOLD = 0.18;

export function ProctorCamera({ onFlag, onCameraReady, onCameraError, includeSnapshots = true }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streaksRef = useRef({ no_face: 0, multiple_faces: 0, looking_away: 0 });
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let stream;
    let interval;
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

        interval = setInterval(runCheck, CHECK_INTERVAL_MS);
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
        streaks.no_face += 1;
        streaks.multiple_faces = 0;
        streaks.looking_away = 0;
        maybeFlag("no_face", streaks.no_face);
        return;
      }

      if (detections.length > 1) {
        streaks.multiple_faces += 1;
        streaks.no_face = 0;
        maybeFlag("multiple_faces", streaks.multiple_faces);
        return;
      }

      streaks.no_face = 0;
      streaks.multiple_faces = 0;

      const box = detections[0].detection.box;
      const landmarks = detections[0].landmarks;
      const nose = landmarks.getNose();
      const noseX = nose[Math.floor(nose.length / 2)].x;
      const faceCenterX = box.x + box.width / 2;
      const deviation = Math.abs(noseX - faceCenterX) / box.width;

      if (deviation > GAZE_DEVIATION_THRESHOLD) {
        streaks.looking_away += 1;
        maybeFlag("looking_away", streaks.looking_away, { deviation: Number(deviation.toFixed(2)) });
      } else {
        streaks.looking_away = 0;
      }
    }

    function maybeFlag(eventType, streakCount, meta) {
      if (streakCount !== SUSTAINED_STREAK_TO_FLAG) return;
      const snapshot = includeSnapshots ? captureSnapshot() : null;
      onFlag?.({ event_type: eventType, meta, snapshot_base64: snapshot });
    }

    function captureSnapshot() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return null;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
    }

    setup();
    return () => {
      cancelled = true;
      clearInterval(interval);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-hourDim/40 bg-surface px-3 py-2">
      <video
        ref={videoRef}
        muted
        playsInline
        className="h-16 w-20 rounded object-cover"
        style={{ transform: "scaleX(-1)" }}
      />
      <canvas ref={canvasRef} className="hidden" />
      <div className="text-xs text-ash">
        {status === "loading" && "Starting camera check…"}
        {status === "ready" && <span className="text-good">● Proctoring active</span>}
        {status === "error" && <span className="text-alert">Camera required to continue</span>}
      </div>
    </div>
  );
}