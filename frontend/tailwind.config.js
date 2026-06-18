/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14110F",        // background — near-black, low eye strain for a focused exam room
        surface: "#1E1A16",    // cards / panels
        surface2: "#262019",   // raised surface (active question card)
        hour: "#E8A33D",       // the "golden hour" accent — timer, primary actions
        hourDim: "#7A5A26",
        alert: "#C84B31",      // violations — warm red-orange, not a jarring pure red
        good: "#6B9E78",       // correct / resolved states
        ivory: "#F2EDE4",      // primary text
        ash: "#9A9186",        // secondary text
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
