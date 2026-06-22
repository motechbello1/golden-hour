"""Student-facing retake request endpoint only. Admin side is in admin.py."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import get_supabase
from routers.auth import get_current_student

router = APIRouter()


class RetakeRequestBody(BaseModel):
    exam_id: str
    reason: Optional[str] = None


@router.post("/exams/retake-request")
def request_retake(body: RetakeRequestBody, student: dict = Depends(get_current_student)):
    session = (
        get_supabase().table("exam_sessions").select("id, status")
        .eq("exam_id", body.exam_id).eq("student_id", student["id"])
        .neq("status", "reset")
        .execute().data
    )
    if not session:
        raise HTTPException(404, "No completed session found")
    if session[0]["status"] not in ("submitted", "auto_submitted", "expired"):
        raise HTTPException(409, "Exam not yet completed")

    existing = (
        get_supabase().table("retake_requests").select("id, status")
        .eq("student_id", student["id"]).eq("exam_id", body.exam_id)
        .eq("status", "pending").execute().data
    )
    if existing:
        raise HTTPException(409, "You already have a pending retake request")

    get_supabase().table("retake_requests").insert({
        "student_id": student["id"], "exam_id": body.exam_id,
        "session_id": session[0]["id"], "reason": body.reason or "", "status": "pending",
    }).execute()
    return {"message": "Retake request submitted."}
