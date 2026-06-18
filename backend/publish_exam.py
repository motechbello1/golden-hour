"""
Run after seed_questions.py to publish or update the exam.
python publish_exam.py
"""
from config import supabase

SECONDS_PER_QUESTION = 15
QUESTIONS_PER_EXAM = 25   # drawn randomly from the 100-question bank per student


def main():
    track = supabase.table("tracks").select("id").eq("slug", "ai-ml").single().execute().data

    existing = supabase.table("exams").select("id").eq("track_id", track["id"]).execute()
    if existing.data:
        supabase.table("exams").update({
            "objective_time_seconds": SECONDS_PER_QUESTION,
            "code_time_seconds": SECONDS_PER_QUESTION,
            "objective_count": QUESTIONS_PER_EXAM,
            "code_count": 0,
            "is_published": True,
        }).eq("track_id", track["id"]).execute()
        print(f"Updated exam — {QUESTIONS_PER_EXAM} questions at {SECONDS_PER_QUESTION}s each.")
        return

    exam = supabase.table("exams").insert({
        "track_id": track["id"],
        "title": "AI & ML — Cohort Two Assessment",
        "objective_count": QUESTIONS_PER_EXAM,
        "code_count": 0,
        "objective_time_seconds": SECONDS_PER_QUESTION,
        "code_time_seconds": SECONDS_PER_QUESTION,
        "paraphrase": False,
        "is_published": True,
    }).execute()
    print(f"Published: {exam.data[0]['id']}")


if __name__ == "__main__":
    main()
