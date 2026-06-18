import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function TrackSelect() {
  const [student, setStudent] = useState(null);
  const [track, setTrack] = useState(null);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      navigate("/login");
      return;
    }
    const userId = sessionData.session.user.id;

    const { data: studentRow } = await supabase.from("students").select("*").eq("id", userId).single();
    setStudent(studentRow);

    const { data: trackRow } = await supabase.from("tracks").select("*").eq("id", studentRow.track_id).single();
    setTrack(trackRow);

    const { data: examRows } = await supabase
      .from("exams")
      .select("*")
      .eq("track_id", studentRow.track_id)
      .eq("is_published", true);
    setExams(examRows || []);
    setLoading(false);
  }

  if (loading) return <Centered>Loading your track…</Centered>;

  return (
    <div className="min-h-screen px-4 py-12 max-w-lg mx-auto">
      <h1 className="font-display text-2xl text-ivory mb-1">Welcome, {student.full_name.split(" ")[0]}</h1>
      <p className="text-ash text-sm mb-1">Track: <span className="text-ivory">{track?.name}</span></p>
      <p className="text-ash text-xs mb-8 font-mono">Your code: {student.unique_code}</p>

      {exams.length === 0 && (
        <p className="text-ash">No assessments are published for your track yet — check back shortly.</p>
      )}

      <div className="space-y-3">
        {exams.map((exam) => (
          <button
            key={exam.id}
            onClick={() => navigate(`/exam/${exam.id}`)}
            className="w-full text-left rounded-lg bg-surface border border-hourDim/30 px-4 py-4 hover:border-hour transition"
          >
            <div className="text-ivory font-medium">{exam.title}</div>
            <div className="text-ash text-xs mt-1">
              {exam.objective_count + exam.code_count} questions · camera required · cannot be paused once started
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Centered({ children }) {
  return <div className="min-h-screen flex items-center justify-center text-ash">{children}</div>;
}
