import { Link } from "react-router-dom";
import { ThemeToggle } from "../lib/ThemeContext.jsx";

export default function Landing() {
  return (
    <div className="min-h-screen bg-ink flex flex-col">
      <nav className="flex items-center justify-between px-6 py-4">
        <span className="font-display text-xl text-ivory">Golden Hour</span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link to="/login" className="px-5 py-2 rounded-xl text-sm text-ash hover:text-ivory border border-surface2 hover:border-hourDim transition">Log in</Link>
          <Link to="/register" className="px-5 py-2 rounded-xl text-sm font-semibold text-ink bg-hour hover:bg-hour/90 transition">Register</Link>
        </div>
      </nav>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 pb-20">
        <div className="w-20 h-1 bg-hour rounded-full mb-8 animate-fade-in" />
        <h1 className="font-display text-5xl sm:text-6xl text-ivory leading-tight max-w-xl animate-slide-up">
          Golden Hour
        </h1>
        <p className="text-ash text-base mt-4 max-w-md leading-relaxed animate-slide-up">
          AI-proctored assessment platform. Timed questions, webcam monitoring, randomized papers per student.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3 animate-slide-up">
          <Link to="/register" className="px-8 py-4 rounded-2xl text-ink bg-hour font-bold text-base hover:shadow-lg hover:shadow-hour/20 transition active:scale-[.98]">
            Register for your exam
          </Link>
          <Link to="/login" className="px-8 py-4 rounded-2xl text-ivory border-2 border-surface2 font-medium text-base hover:border-hourDim transition">
            Already registered? Log in
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center max-w-lg animate-fade-in">
          {[["25", "Questions"], ["25s", "Per question"], ["100+", "Question bank"], ["AI", "Proctored"]].map(([n, l]) => (
            <div key={l}><p className="font-mono text-2xl font-bold text-hour">{n}</p><p className="text-ash text-xs mt-1">{l}</p></div>
          ))}
        </div>
      </div>

      <footer className="text-center py-4 text-ash/40 text-xs border-t border-surface2">Golden Hour Assessment Platform</footer>
    </div>
  );
}
