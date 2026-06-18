import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";

export default function Results() {
  const { sessionId } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getResult(sessionId).then(setResult).catch((e) => setError(e.message));
  }, [sessionId]);

  if (error) return <Centered><p className="text-alert">{error}</p></Centered>;
  if (!result) return <Centered><p className="text-ash">Loading your result…</p></Centered>;

  return (
    <Centered>
      <h1 className="font-display text-xl text-ash mb-2">Your result</h1>
      <div className="font-mono text-6xl text-hour mb-2">{result.percentage}%</div>
      <p className="text-ivory mb-1">
        {result.score} / {result.max_score} correct
      </p>
      <p className="text-ash text-sm capitalize mb-6">{result.status.replace("_", " ")}</p>
      {result.flag_count > 0 && (
        <p className="text-ash text-xs mb-6">
          {result.flag_count} integrity event{result.flag_count > 1 ? "s" : ""} logged during your session for
          instructor review.
        </p>
      )}
      <Link to="/track" className="text-hour text-sm hover:underline">Back to your track</Link>
    </Centered>
  );
}

function Centered({ children }) {
  return <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">{children}</div>;
}
