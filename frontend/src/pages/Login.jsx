import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    navigate("/track");
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" className="text-hour text-xs font-mono uppercase tracking-[.25em]">ICBM Bootcamp</Link>
          <h1 className="font-display text-3xl text-ivory mt-2">Welcome back</h1>
          <p className="text-ash text-sm mt-1">Log in to continue your assessment</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-ash text-xs uppercase tracking-wider block mb-1.5">Email</label>
            <input
              required type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl bg-surface border border-surface2 px-4 py-3 text-ivory placeholder:text-ash/50 focus:outline-none focus:ring-2 focus:ring-hour focus:border-transparent transition"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-ash text-xs uppercase tracking-wider block mb-1.5">Password</label>
            <input
              required type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full rounded-xl bg-surface border border-surface2 px-4 py-3 text-ivory placeholder:text-ash/50 focus:outline-none focus:ring-2 focus:ring-hour focus:border-transparent transition"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-alert text-sm bg-alert/10 rounded-lg px-4 py-2">{error}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full py-3.5 rounded-xl bg-hour text-ink font-bold text-base disabled:opacity-50 transition hover:shadow-lg hover:shadow-hour/20 active:scale-[.98]"
          >
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="text-center text-sm text-ash mt-6">
          New here? <Link to="/register" className="text-hour hover:underline font-medium">Register</Link>
        </p>
      </div>
    </div>
  );
}
