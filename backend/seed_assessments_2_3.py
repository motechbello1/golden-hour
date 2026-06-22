"""
Seeds assessment 2 and 3 questions, then publishes both exams.

    python seed_assessments_2_3.py

Run AFTER applying supabase/assessment_groups_patch.sql
"""
import json
from config import get_supabase as _gc
supabase = _gc()

def main():
    # Get track
    track = supabase.table("tracks").select("id").eq("slug", "ai-ml").single().execute().data
    track_id = track["id"]

    # Load questions
    with open("data/questions_assessment_2_3.json") as f:
        questions = json.load(f)

    # Check if already seeded
    existing_a2 = supabase.table("question_bank").select("id").eq("track_id", track_id).eq("question_group", "assessment-2").limit(1).execute().data
    existing_a3 = supabase.table("question_bank").select("id").eq("track_id", track_id).eq("question_group", "assessment-3").limit(1).execute().data

    # Seed assessment-2 questions
    a2 = [q for q in questions if q["group"] == "assessment-2"]
    if not existing_a2:
        rows = [{"type": q["type"], "track_id": track_id, "prompt": q["prompt"], "options": q["options"],
                 "correct_option_id": q["correct_option_id"], "question_group": "assessment-2"} for q in a2]
        supabase.table("question_bank").insert(rows).execute()
        print(f"Inserted {len(rows)} assessment-2 questions")
    else:
        print("Assessment-2 questions already exist — skipping")

    # Seed assessment-3 questions
    a3 = [q for q in questions if q["group"] == "assessment-3"]
    if not existing_a3:
        rows = [{"type": q["type"], "track_id": track_id, "prompt": q["prompt"], "options": q["options"],
                 "correct_option_id": q["correct_option_id"], "question_group": "assessment-3"} for q in a3]
        supabase.table("question_bank").insert(rows).execute()
        print(f"Inserted {len(rows)} assessment-3 questions")
    else:
        print("Assessment-3 questions already exist — skipping")

    # Publish Assessment 2
    existing_exam_2 = supabase.table("exams").select("id").eq("track_id", track_id).eq("question_group", "assessment-2").execute().data
    if not existing_exam_2:
        supabase.table("exams").insert({
            "track_id": track_id,
            "title": "AI & ML — Assessment 2 (Loops, Lists, Dicts, Functions)",
            "objective_count": 25,
            "code_count": 0,
            "objective_time_seconds": 25,
            "code_time_seconds": 25,
            "paraphrase": False,
            "is_published": True,
            "question_group": "assessment-2",
        }).execute()
        print("Published Assessment 2")
    else:
        print("Assessment 2 exam already exists — skipping")

    # Publish Assessment 3
    existing_exam_3 = supabase.table("exams").select("id").eq("track_id", track_id).eq("question_group", "assessment-3").execute().data
    if not existing_exam_3:
        supabase.table("exams").insert({
            "track_id": track_id,
            "title": "AI & ML — Assessment 3 (Strings, NumPy, Pandas, Outliers)",
            "objective_count": 25,
            "code_count": 0,
            "objective_time_seconds": 25,
            "code_time_seconds": 25,
            "paraphrase": False,
            "is_published": True,
            "question_group": "assessment-3",
        }).execute()
        print("Published Assessment 3")
    else:
        print("Assessment 3 exam already exists — skipping")


if __name__ == "__main__":
    main()
