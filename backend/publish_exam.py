"""
Run once after seed_questions.py:

    python publish_exam.py

Creates and publishes the Cohort Two AI/ML assessment: 20 objective
questions at 7s each, 5 code questions at 12s each, drawn from the
42-question bank already seeded.
"""
from config import supabase


def main():
    track = supabase.table("tracks").select("id").eq("slug", "ai-ml").single().execute().data

    existing = supabase.table("exams").select("id").eq("track_id", track["id"]).execute()
    if existing.data:
        print("An exam already exists for this track — skipping. Delete it first if you want a fresh one.")
        return

    exam = (
        supabase.table("exams")
        .insert(
            {
                "track_id": track["id"],
                "title": "AI & ML — Cohort Two Assessment",
                "objective_count": 20,
                "code_count": 5,
                "objective_time_seconds": 7,
                "code_time_seconds": 12,
                "paraphrase": False,
                "is_published": True,
            }
        )
        .execute()
    )
    print(f"Published exam: {exam.data[0]['id']}")


if __name__ == "__main__":
    main()
