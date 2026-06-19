import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ThemeToggle } from "../lib/ThemeContext.jsx";

const TRACKS = [
  { slug: "ai-ml", name: "AI & Machine Learning" },
  { slug: "full-stack", name: "Software Development (Full Stack)" },
];

function generateCode() {
  return `GH-${Math.floor(100000 + Math.random() * 900000)}`;
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
    e.preventDefault(); setLoading(true); setError(null);
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;
      const { data: track, error: trackError } = await supabase.from("tracks").select("id").eq("slug", trackSlug).single();
      if (trackError) throw trackError;
      const { error: studentError } = await supabase.from("students").insert({
        id: signUpData.user.id, full_name: fullName, unique_code: generateCode(), track_id: track.id,
      });
      if (studentError) throw studentError;
      navigate("/track");
    } catch (err) { setError(err.message || "Registration failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-5">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm animate-slide-up">
        <div className="text-center mb-8">
          <Link to="/" className="font-display text-2xl text-ivory hover:text-hour transition">Golden Hour</Link>
          <p className="text-ash text-sm mt-2">Create your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Your full name" />
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" min={6} />
          <div>
            <label className="text-ash text-xs uppercase tracking-wider block mb-1.5">Track</label>
            <select value={trackSlug} onChange={e => setTrackSlug(e.target.value)}
              className="w-full rounded-xl bg-surface border border-surface2 px-4 py-3 text-ivory focus:outline-none focus:ring-2 focus:ring-hour transition">
              {TRACKS.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select>
          </div>
          {error && <p className="text-alert text-sm bg-alert/10 rounded-xl px-4 py-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-xl bg-hour text-ink font-bold disabled:opacity-50 transition hover:shadow-lg hover:shadow-hour/20 active:scale-[.98]">
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

function Field({ label, type = "text", value, onChange, placeholder, min }) {
  return (
    <div>
      <label className="text-ash text-xs uppercase tracking-wider block mb-1.5">{label}</label>
      <input required type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} minLength={min}
        className="w-full rounded-xl bg-surface border border-surface2 px-4 py-3 text-ivory placeholder:text-ash/40 focus:outline-none focus:ring-2 focus:ring-hour focus:border-transparent transition" />
    </div>
  );
}
