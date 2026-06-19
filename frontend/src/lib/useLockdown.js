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
 * Lockdown for both desktop and mobile.
 *
 * Desktop: detects fullscreen exit, tab switch, devtools.
 * Mobile: detects tab switch and app minimize via visibilitychange + pagehide.
 *
 * onViolation is called when a hard violation is detected.
 * onLeave is called when the page is hidden (mobile or desktop) — the
 * caller should record the timestamp so it can check session status
 * when the user returns.
 */
export function setupLockdown(onViolation, onLeave) {
  let armed = false;
  const armTimer = setTimeout(() => { armed = true; }, 3000);

  const handleVisibility = () => {
    if (!armed) return;
    if (document.hidden) {
      onViolation("tab_blur");
      onLeave?.();
    }
  };

  const handlePageHide = () => {
    if (armed) {
      onViolation("tab_blur");
      onLeave?.();
    }
  };

  const handleFullscreenChange = () => {
    const isFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (armed && !isFs) {
      onViolation("fullscreen_exit");
    }
  };

  const handleContextMenu = (e) => e.preventDefault();

  const handleKeyDown = (e) => {
    if (DEVTOOLS_COMBOS.some((t) => t(e))) {
      e.preventDefault();
      if (armed) onViolation("devtools_attempt");
      return;
    }
    if (BLOCKED_COMBOS.some((t) => t(e))) e.preventDefault();
  };

  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", handlePageHide);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  document.addEventListener("contextmenu", handleContextMenu);
  document.addEventListener("keydown", handleKeyDown);

  return function teardown() {
    clearTimeout(armTimer);
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("pagehide", handlePageHide);
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.removeEventListener("contextmenu", handleContextMenu);
    document.removeEventListener("keydown", handleKeyDown);
  };
}
