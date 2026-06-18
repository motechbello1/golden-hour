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

export function setupLockdown(onViolation) {
  let armed = false;
  const armTimer = setTimeout(() => { armed = true; }, 3000);

  const handleVisibility = () => {
    if (armed && document.hidden) onViolation("tab_blur");
  };
  const handleFullscreenChange = () => {
    if (armed && !document.fullscreenElement) {
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
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("contextmenu", handleContextMenu);
  document.addEventListener("keydown", handleKeyDown);

  return function teardown() {
    clearTimeout(armTimer);
    document.removeEventListener("visibilitychange", handleVisibility);
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    document.removeEventListener("contextmenu", handleContextMenu);
    document.removeEventListener("keydown", handleKeyDown);
  };
}
