import hashlib
import random
from typing import Optional
from anthropic import Anthropic
from config import ANTHROPIC_API_KEY

_anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None


def _seed_for(exam_id: str, unique_code: str) -> random.Random:
    """
    Deterministic seed from (exam, student unique_code). Same student +
    same exam always reproduces the exact same paper — important so a
    reconnect resumes the identical question set rather than rerolling
    a new one, while every other student still gets a different draw.
    """
    digest = hashlib.sha256(f"{exam_id}:{unique_code}".encode()).hexdigest()
    return random.Random(int(digest, 16))


def build_paper(exam: dict, question_bank: list[dict], unique_code: str) -> tuple[list[str], dict]:
    """
    Returns (question_order, option_shuffles) for one student.

    question_order: list of question_bank ids, in the order this student
                     will see them (objective + code interleaved).
    option_shuffles: { question_id: [option_id, ...] } — the display
                     order of options for this student. Option *ids*
                     never change, only their on-screen order, so
                     grading stays a simple id comparison.
    """
    rng = _seed_for(exam["id"], unique_code)

    objective_pool = [q for q in question_bank if q["type"] == "objective"]
    code_pool = [q for q in question_bank if q["type"] == "code"]
    rng.shuffle(objective_pool)
    rng.shuffle(code_pool)

    objective_count = min(exam["objective_count"], len(objective_pool))
    code_count = min(exam["code_count"], len(code_pool))
    selected = objective_pool[:objective_count] + code_pool[:code_count]
    rng.shuffle(selected)  # interleave objective/code rather than blocking them

    question_order = [q["id"] for q in selected]
    option_shuffles = {}
    for q in selected:
        opt_ids = [o["id"] for o in q["options"]]
        shuffled = opt_ids[:]
        rng.shuffle(shuffled)
        option_shuffles[q["id"]] = shuffled

    return question_order, option_shuffles


def render_question_for_student(question: dict, option_order: list[str], paraphrase: bool) -> dict:
    """
    Builds the exact payload sent to the client: options reordered per
    option_order, optionally paraphrased so a question reused across
    cohorts doesn't read identically every time.
    """
    options_by_id = {o["id"]: o["text"] for o in question["options"]}
    options = [{"id": oid, "text": options_by_id[oid]} for oid in option_order]
    prompt = question["prompt"]

    if paraphrase and _anthropic_client:
        prompt, options = _paraphrase(prompt, options)

    return {"prompt": prompt, "options": options}


def _paraphrase(prompt: str, options: list[dict]) -> tuple[str, list[dict]]:
    """
    Best-effort rewrite of the question text and option wording, with
    the original meaning and correctness untouched. Falls back to the
    original text on any failure — paraphrasing is a polish feature,
    never a point where the exam should break.
    """
    try:
        option_lines = "\n".join(f"{o['id']}: {o['text']}" for o in options)
        message = _anthropic_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=600,
            system=(
                "Rewrite the exam question and its options in different wording "
                "without changing their technical meaning or which option is correct. "
                "Keep code blocks character-for-character identical. "
                "Respond with strict JSON only: "
                '{"prompt": "...", "options": [{"id": "a", "text": "..."}, ...]}'
            ),
            messages=[{"role": "user", "content": f"QUESTION:\n{prompt}\n\nOPTIONS:\n{option_lines}"}],
        )
        import json
        text = message.content[0].text.strip()
        parsed = json.loads(text)
        return parsed["prompt"], parsed["options"]
    except Exception:
        return prompt, options
