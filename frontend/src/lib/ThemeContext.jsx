import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem("gh-theme") || "system");

  useEffect(() => {
    localStorage.setItem("gh-theme", mode);
    const root = document.documentElement;

    if (mode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      root.classList.toggle("dark", mq.matches);
      root.classList.toggle("light", !mq.matches);
      const handler = (e) => {
        root.classList.toggle("dark", e.matches);
        root.classList.toggle("light", !e.matches);
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      root.classList.toggle("dark", mode === "dark");
      root.classList.toggle("light", mode === "light");
    }
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const modes = ["light", "dark", "system"];
  const icons = { light: "☀️", dark: "🌙", system: "💻" };

  return (
    <div className="flex bg-surface rounded-lg p-0.5 gap-0.5">
      {modes.map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`px-2.5 py-1 rounded-md text-xs transition-all ${
            mode === m
              ? "bg-hour text-ink font-semibold"
              : "text-ash hover:text-primary"
          }`}
        >
          {icons[m]}
        </button>
      ))}
    </div>
  );
}
