import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const TRACKS = [
  { slug: "ai-ml", name: "AI & Machine Learning" },
  { slug: "full-stack", name: "Software Development (Full Stack)" },
];

function generateUniqueCode(cohort = "C2") {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `ICBM-${cohort}-${n}`;
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
      const { data: track, error: trackError } = await supabase
        .from("tracks")
        .select("id")
        .eq("slug", trackSlug)
        .single();
      if (trackError) throw trackError;
      const { error: studentError } = await supabase.from("students").insert({
        id: signUpData.user.id,
        full_name: fullName,
        unique_code: generateUniqueCode(),
        track_id: track.id,
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
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
        <div>
          <h1 className="font-display text-3xl text-ivory">Golden Hour</h1>
          <p className="text-ash text-sm mt-1">Register for your cohort's assessment.</p>
        </div>
        <div className="space-y-3">
          <input
            required
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg bg-surface border border-hourDim/30 px-4 py-2.5 text-ivory placeholder:text-ash focus:outline-none focus:ring-2 focus:ring-hour"
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-surface border border-hourDim/30 px-4 py-2.5 text-ivory placeholder:text-ash focus:outline-none focus:ring-2 focus:ring-hour"
          />
          <input
            required
            type="password"
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-surface border border-hourDim/30 px-4 py-2.5 text-ivory placeholder:text-ash focus:outline-none focus:ring-2 focus:ring-hour"
          />
          <select
            value={trackSlug}
            onChange={(e) => setTrackSlug(e.target.value)}
            className="w-full rounded-lg bg-surface border border-hourDim/30 px-4 py-2.5 text-ivory focus:outline-none focus:ring-2 focus:ring-hour"
          >
            {TRACKS.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-alert text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-hour text-ink font-medium py-2.5 hover:bg-hour/90 disabled:opacity-50"
        >
          {loading ? "Registering…" : "Register"}
        </button>
        <p className="text-center text-sm text-ash">
          Already have an account? <Link to="/login" className="text-hour hover:underline">Log in</Link>
        </p>
      </form>
    </div>
  );
}