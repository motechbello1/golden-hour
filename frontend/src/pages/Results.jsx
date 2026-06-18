import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";

export default function Results() {
  const { sessionId } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getResult(sessionId).then(setResult).catch(e => setError(e.message));
  }, [sessionId]);

  if (error) return <C><p className="text-alert">{error}</p></C>;
  if (!result) return <C><p className="text-ash">Loading…</p></C>;

  const pct = result.percentage;
  const grade = pct >= 70 ? "Excellent" : pct >= 50 ? "Good effort" : "Needs improvement";
  const gradeColor = pct >= 70 ? "text-good" : pct >= 50 ? "text-hour" : "text-alert";

  return (
    <C>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-ash text-xs font-mono uppercase tracking-widest mb-4">Assessment Result</p>

          <div className="relative w-36 h-36 mx-auto mb-4">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#262019" strokeWidth="6" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="#E8A33D" strokeWidth="6"
                strokeLinecap="round" strokeDasharray={`${pct * 2.64} 264`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-4xl font-black text-hour">{pct}%</span>
            </div>
          </div>

          <p className={`text-lg font-semibold ${gradeColor}`}>{grade}</p>
          <p className="text-ivory mt-1">
            {result.score} / {result.max_score} correct
          </p>
          <p className="text-ash text-sm capitalize mt-1">
            {result.status.replaceAll("_", " ")}
          </p>
        </div>

        {result.flag_count > 0 && (
          <div className="bg-surface rounded-xl border border-surface2 px-4 py-3 text-center">
            <p className="text-ash text-xs">
              {result.flag_count} integrity event{result.flag_count > 1 ? "s" : ""} logged for instructor review
            </p>
          </div>
        )}

        <Link
          to="/track"
          className="block w-full text-center py-3 rounded-xl border border-surface2 text-ash text-sm hover:text-ivory hover:border-hourDim transition"
        >
          ← Back to your track
        </Link>
      </div>
    </C>
  );
}

function C({ children }) {
  return <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-5">{children}</div>;
}
