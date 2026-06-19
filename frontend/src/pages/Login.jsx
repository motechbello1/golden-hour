import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ThemeToggle } from "../lib/ThemeContext.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    navigate("/track");
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-5">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm animate-slide-up">
        <div className="text-center mb-8">
          <Link to="/" className="font-display text-2xl text-ivory hover:text-hour transition">Golden Hour</Link>
          <p className="text-ash text-sm mt-2">Log in to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
          {error && <p className="text-alert text-sm bg-alert/10 rounded-xl px-4 py-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-xl bg-hour text-ink font-bold disabled:opacity-50 transition hover:shadow-lg hover:shadow-hour/20 active:scale-[.98]">
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

function Field({ label, type = "text", value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-ash text-xs uppercase tracking-wider block mb-1.5">{label}</label>
      <input required type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl bg-surface border border-surface2 px-4 py-3 text-ivory placeholder:text-ash/40 focus:outline-none focus:ring-2 focus:ring-hour focus:border-transparent transition" />
    </div>
  );
}
