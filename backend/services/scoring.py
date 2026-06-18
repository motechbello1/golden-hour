def grade_answer(question: dict, selected_option_id: str | None) -> bool:
    if selected_option_id is None:
        return False
    return selected_option_id == question["correct_option_id"]


def summarize_session(answers: list[dict]) -> dict:
    correct = sum(1 for a in answers if a["is_correct"])
    total = len(answers)
    return {
        "score": correct,
        "max_score": total,
        "percentage": round((correct / total) * 100, 1) if total else 0.0,
    }
