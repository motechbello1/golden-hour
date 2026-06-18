import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const TRACKS = [
  { slug: "ai-ml", name: "AI & Machine Learning" },
  { slug: "full-stack", name: "Software Development (Full Stack)" },
];

function generateUniqueCode(cohort = "C2") {
  return `ICBM-${cohort}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [trackSlug, setTrackSlug] = useState(TRACKS[0].slug);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;
      const { data: track, error: trackError } = await supabase.from("tracks").select("id").eq("slug", trackSlug).single();
      if (trackError) throw trackError;
      const { error: studentError } = await supabase.from("students").insert({
        id: signUpData.user.id, full_name: fullName, unique_code: generateUniqueCode(), track_id: track.id,
      });
      if (studentError) throw studentError;
      navigate("/track");
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" className="text-hour text-xs font-mono uppercase tracking-[.25em]">ICBM Bootcamp</Link>
          <h1 className="font-display text-3xl text-ivory mt-2">Create your account</h1>
          <p className="text-ash text-sm mt-1">Register for your cohort assessment</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-ash text-xs uppercase tracking-wider block mb-1.5">Full name</label>
            <input required value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full rounded-xl bg-surface border border-surface2 px-4 py-3 text-ivory placeholder:text-ash/50 focus:outline-none focus:ring-2 focus:ring-hour focus:border-transparent transition"
              placeholder="Bello Muhammad" />
          </div>
          <div>
            <label className="text-ash text-xs uppercase tracking-wider block mb-1.5">Email</label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl bg-surface border border-surface2 px-4 py-3 text-ivory placeholder:text-ash/50 focus:outline-none focus:ring-2 focus:ring-hour focus:border-transparent transition"
              placeholder="you@example.com" />
          </div>
          <div>
            <label className="text-ash text-xs uppercase tracking-wider block mb-1.5">Password</label>
            <input required type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)}
              className="w-full rounded-xl bg-surface border border-surface2 px-4 py-3 text-ivory placeholder:text-ash/50 focus:outline-none focus:ring-2 focus:ring-hour focus:border-transparent transition"
              placeholder="At least 6 characters" />
          </div>
          <div>
            <label className="text-ash text-xs uppercase tracking-wider block mb-1.5">Track</label>
            <select value={trackSlug} onChange={e => setTrackSlug(e.target.value)}
              className="w-full rounded-xl bg-surface border border-surface2 px-4 py-3 text-ivory focus:outline-none focus:ring-2 focus:ring-hour focus:border-transparent transition">
              {TRACKS.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select>
          </div>

          {error && <p className="text-alert text-sm bg-alert/10 rounded-lg px-4 py-2">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-xl bg-hour text-ink font-bold text-base disabled:opacity-50 transition hover:shadow-lg hover:shadow-hour/20 active:scale-[.98]">
            {loading ? "Registering…" : "Register"}
          </button>
        </form>

        <p className="text-center text-sm text-ash mt-6">
          Already have an account? <Link to="/login" className="text-hour hover:underline font-medium">Log in</Link>
        </p>
      </div>
    </div>
  );
}
