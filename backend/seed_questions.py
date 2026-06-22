"""
Run once after applying supabase/schema.sql:

    python seed_questions.py ai-ml data/questions_ai_ml.json

Loads a question bank JSON file into the question_bank table under the
given track slug. Safe to re-run — it skips if that track already has
questions, so it won't duplicate on a second run.
"""
import sys
import json
from config import get_supabase as _gc
supabase = _gc()


def main():
    if len(sys.argv) != 3:
        print("Usage: python seed_questions.py <track-slug> <questions.json>")
        sys.exit(1)

    track_slug, path = sys.argv[1], sys.argv[2]

    track_res = supabase.table("tracks").select("id").eq("slug", track_slug).single().execute()
    track_id = track_res.data["id"]

    existing = supabase.table("question_bank").select("id").eq("track_id", track_id).limit(1).execute()
    if existing.data:
        print(f"Track '{track_slug}' already has questions — skipping. Delete them first if you want to reseed.")
        return

    with open(path) as f:
        questions = json.load(f)

    rows = [{**q, "track_id": track_id} for q in questions]
    supabase.table("question_bank").insert(rows).execute()
    print(f"Inserted {len(rows)} questions into track '{track_slug}'.")


if __name__ == "__main__":
    main()
