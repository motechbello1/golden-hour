from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone

from config import supabase
from routers.auth import get_current_student
from schemas import StartExamRequest, QuestionOut, AnswerRequest, ResultOut
from services.question_engine import build_paper, render_question_for_student
from services.scoring import grade_answer, summarize_session

router = APIRouter(prefix="/exams", tags=["exams"])


def _question_bank_for_track(track_id):
    return supabase.table("question_bank").select("*").eq("track_id", track_id).execute().data


def _question_by_id(bank, qid):
    return next(q for q in bank if q["id"] == qid)


def _session_to_question_out(session, exam, bank):
    order = session["question_order"]
    idx = session["current_index"]
    if idx >= len(order):
        return None
    qid = order[idx]
    question = _question_by_id(bank, qid)
    option_order = session["option_shuffles"].get(qid, [o["id"] for o in question["options"]])
    rendered = render_question_for_student(question, option_order, exam["paraphrase"])
    time_seconds = exam["objective_time_seconds"] if question["type"] == "objective" else exam["code_time_seconds"]
    return QuestionOut(
        session_id=session["id"], question_id=qid, index=idx, total=len(order),
        type=question["type"], prompt=rendered["prompt"], options=rendered["options"], time_seconds=time_seconds,
    )


@router.post("/start", response_model=QuestionOut)
def start_or_resume_exam(req: StartExamRequest, student=Depends(get_current_student)):
    exam = supabase.table("exams").select("*").eq("id", req.exam_id).single().execute().data
    if not exam or not exam["is_published"]:
        raise HTTPException(404, "Exam not found or not published")
    if exam["track_id"] != student["track_id"]:
        raise HTTPException(403, "This exam is not for your track")

    # Find active (non-reset) sessions for this student+exam
    existing = (
        supabase.table("exam_sessions").select("*")
        .eq("exam_id", exam["id"]).eq("student_id", student["id"])
        .neq("status", "reset")
        .execute()
    )

    if existing.data:
        session = existing.data[0]
        if session["status"] in ("submitted", "auto_submitted", "expired"):
            raise HTTPException(409, "You have already completed this exam. Request a retake from your track page.")
        if session["status"] == "disconnected":
            supabase.table("exam_sessions").update(
                {"status": "in_progress", "disconnected_at": None}
            ).eq("id", session["id"]).execute()
            session["status"] = "in_progress"
    else:
        bank = _question_bank_for_track(exam["track_id"])
        question_order, option_shuffles = build_paper(exam, bank, student["unique_code"])
        created = supabase.table("exam_sessions").insert({
            "exam_id": exam["id"], "student_id": student["id"],
            "question_order": question_order, "option_shuffles": option_shuffles,
            "max_score": len(question_order),
        }).execute()
        session = created.data[0]

    bank = _question_bank_for_track(exam["track_id"])
    q = _session_to_question_out(session, exam, bank)
    if q is None:
        raise HTTPException(409, "No questions left")
    return q


@router.post("/answer")
def submit_answer(req: AnswerRequest, student=Depends(get_current_student)):
    session = supabase.table("exam_sessions").select("*").eq("id", req.session_id).single().execute().data
    if not session or session["student_id"] != student["id"]:
        raise HTTPException(404, "Session not found")
    if session["status"] != "in_progress":
        raise HTTPException(409, f"Session is {session['status']}")

    exam = supabase.table("exams").select("*").eq("id", session["exam_id"]).single().execute().data
    bank = _question_bank_for_track(exam["track_id"])
    question = _question_by_id(bank, req.question_id)

    is_correct = grade_answer(question, req.selected_option_id)
    supabase.table("exam_answers").insert({
        "session_id": session["id"], "question_id": req.question_id,
        "selected_option_id": req.selected_option_id, "is_correct": is_correct,
        "time_taken_ms": req.time_taken_ms, "auto_advanced": req.auto_advanced,
    }).execute()

    next_index = session["current_index"] + 1
    is_last = next_index >= len(session["question_order"])
    update = {"current_index": next_index}
    if is_last:
        update["status"] = "submitted"
        update["submitted_at"] = datetime.now(timezone.utc).isoformat()

    # Always update the running score so it's accurate even on auto-submit
    all_answers = supabase.table("exam_answers").select("is_correct").eq("session_id", session["id"]).execute().data
    summary = summarize_session(all_answers)
    update["score"] = summary["score"]
    update["max_score"] = summary["max_score"]

    supabase.table("exam_sessions").update(update).eq("id", session["id"]).execute()
    session.update(update)

    if is_last:
        return {"finished": True}
    return {"finished": False, "next_question": _session_to_question_out(session, exam, bank)}


@router.get("/sessions/{session_id}/result", response_model=ResultOut)
def get_result(session_id: str, student=Depends(get_current_student)):
    session = supabase.table("exam_sessions").select("*").eq("id", session_id).single().execute().data
    if not session or session["student_id"] != student["id"]:
        raise HTTPException(404, "Session not found")
    if session["status"] not in ("submitted", "auto_submitted", "expired"):
        raise HTTPException(409, "Exam still in progress")

    answers = supabase.table("exam_answers").select("*").eq("session_id", session_id).execute().data
    summary = summarize_session(answers)
    flags = supabase.table("proctor_events").select("id", count="exact").eq("session_id", session_id).execute()

    return ResultOut(
        session_id=session_id, score=summary["score"], max_score=summary["max_score"],
        percentage=summary["percentage"], status=session["status"], flag_count=flags.count or 0,
    )
