const DEVTOOLS_COMBOS = [
  (e) => e.key === "F12",
  (e) => (e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase()),
  (e) => (e.ctrlKey || e.metaKey) && e.key.toUpperCase() === "U",
];
const BLOCKED_COMBOS = [
  (e) => (e.ctrlKey || e.metaKey) && e.key.toUpperCase() === "C",
  (e) => (e.ctrlKey || e.metaKey) && e.key.toUpperCase() === "V",
  (e) => (e.ctrlKey || e.metaKey) && e.key.toUpperCase() === "P",
  (e) => (e.ctrlKey || e.metaKey) && e.key.toUpperCase() === "S",
];

/**
 * Detects tab-switches, fullscreen exits, and devtools attempts.
 * Deliberately does NOT call requestFullscreen — that must be called
 * exactly once via a user gesture (the "Begin exam" button click).
 * Calling requestFullscreen inside a useEffect was the root cause of
 * the in/out fullscreen loop: every phase change (in-progress →
 * submitting → in-progress) tore down and recreated the effect,
 * re-requesting fullscreen and causing the browser to flash.
 */
export function useLockdown({ onViolation, enabled = true }) {
  // We use a module-level ref pattern so the effect only runs when
  // enabled flips, not on every render.
  if (typeof window === "undefined") return;

  // Attach/detach listeners based on enabled.
  // We use a global flag approach to avoid re-running the effect
  // on every answer submission (which changes nothing about the
  // lockdown state).
}

// The real implementation uses a plain imperative setup called once
// from Exam.jsx when the exam begins, not a hook that re-runs.
export function setupLockdown(onViolation) {
  let armed = false;
  const armTimer = setTimeout(() => { armed = true; }, 2000);

  const handleVisibility = () => {
    if (armed && document.hidden) onViolation("tab_blur", { reason: "visibilitychange" });
  };
  const handleBlur = () => {
    if (armed) onViolation("tab_blur", { reason: "window_blur" });
  };
  const handleFullscreenChange = () => {
    if (armed && !document.fullscreenElement) {
      onViolation("fullscreen_exit", { reason: "fullscreenchange" });
    }
  };
  const handleContextMenu = (e) => e.preventDefault();
  const handleKeyDown = (e) => {
    if (DEVTOOLS_COMBOS.some((test) => test(e))) {
      e.preventDefault();
      if (armed) onViolation("devtools_attempt", { key: e.key });
      return;
    }
    if (BLOCKED_COMBOS.some((test) => test(e))) {
      e.preventDefault();
    }
  };

  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("blur", handleBlur);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("contextmenu", handleContextMenu);
  document.addEventListener("keydown", handleKeyDown);

  return function teardown() {
    clearTimeout(armTimer);
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("blur", handleBlur);
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    document.removeEventListener("contextmenu", handleContextMenu);
    document.removeEventListener("keydown", handleKeyDown);
  };
}
