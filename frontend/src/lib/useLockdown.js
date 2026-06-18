import { useEffect, useRef } from "react";

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
 * Browser-level exam lockdown.
 *
 * Important honesty note baked into the design, not just the docs: a
 * website cannot intercept OS-level shortcuts (Alt+Tab, Win+D, Cmd+Tab) —
 * the browser sandbox is built specifically so pages can't reach the OS.
 * What this hook does instead is detect the *effect* of leaving, no
 * matter how the student tried it: the moment focus leaves the tab or
 * fullscreen is exited, `onViolation` fires immediately. That covers the
 * thing that actually matters (did they leave the exam) rather than
 * trying to enumerate every possible key combination, which is a losing
 * game in a browser.
 *
 * For a true OS-level lock (blocking Alt+Tab itself), this same React
 * app would need to run inside a native kiosk wrapper (e.g. Electron)
 * instead of a regular browser tab — that's a phase-2 hardening step,
 * not something any website can do.
 */
export function useLockdown({ containerRef, onViolation, armDelayMs = 1500, enabled = true }) {
  const armedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;

    let armTimer = setTimeout(() => {
      armedRef.current = true;
    }, armDelayMs);

    el.requestFullscreen?.().catch(() => {
      // Some browsers require a direct user gesture; the "Begin exam"
      // button click that mounts this component usually satisfies that.
    });

    const handleVisibility = () => {
      if (armedRef.current && document.hidden) onViolation("tab_blur", { reason: "visibilitychange" });
    };
    const handleBlur = () => {
      if (armedRef.current) onViolation("tab_blur", { reason: "window_blur" });
    };
    const handleFullscreenChange = () => {
      if (armedRef.current && !document.fullscreenElement) {
        onViolation("fullscreen_exit", { reason: "fullscreenchange" });
      }
    };
    const handleContextMenu = (e) => e.preventDefault();
    const handleKeyDown = (e) => {
      if (DEVTOOLS_COMBOS.some((test) => test(e))) {
        e.preventDefault();
        if (armedRef.current) onViolation("devtools_attempt", { key: e.key });
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

    return () => {
      clearTimeout(armTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [containerRef, onViolation, armDelayMs, enabled]);
}
