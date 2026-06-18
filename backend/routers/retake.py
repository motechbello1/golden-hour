from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from config import supabase
from routers.auth import get_current_student

router = APIRouter()

ADMIN_KEY = "icbm-admin-2024"  # Change this to something secret in production


class RetakeRequestBody(BaseModel):
    exam_id: str
    reason: Optional[str] = None


def verify_admin(x_admin_key: str = Header(...)):
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(403, "Invalid admin key")


@router.post("/exams/retake-request")
def request_retake(body: RetakeRequestBody, student: dict = Depends(get_current_student)):
    # Check the student actually has a completed session for this exam
    session = (
        supabase.table("exam_sessions")
        .select("id, status")
        .eq("exam_id", body.exam_id)
        .eq("student_id", student["id"])
        .execute()
        .data
    )
    if not session:
        raise HTTPException(404, "No session found for this exam")
    if session[0]["status"] not in ("submitted", "auto_submitted", "expired"):
        raise HTTPException(409, "Exam is not yet completed — no retake needed")

    # Check if a pending request already exists
    existing = (
        supabase.table("retake_requests")
        .select("id, status")
        .eq("student_id", student["id"])
        .eq("exam_id", body.exam_id)
        .execute()
        .data
    )
    if existing and existing[0]["status"] == "pending":
        raise HTTPException(409, "You already have a pending retake request for this exam")

    supabase.table("retake_requests").insert({
        "student_id": student["id"],
        "exam_id": body.exam_id,
        "session_id": session[0]["id"],
        "reason": body.reason or "",
        "status": "pending",
    }).execute()

    return {"message": "Retake request submitted. Your instructor will review it."}


@router.get("/admin/retake-requests")
def list_retake_requests(_=Depends(verify_admin)):
    requests = (
        supabase.table("retake_requests")
        .select("*, students(full_name, unique_code), exams(title)")
        .order("created_at", desc=False)
        .execute()
        .data
    )
    return requests


@router.post("/admin/retake-requests/{request_id}/approve")
def approve_retake(request_id: str, _=Depends(verify_admin)):
    req = supabase.table("retake_requests").select("*").eq("id", request_id).single().execute().data
    if not req:
        raise HTTPException(404, "Request not found")
    if req["status"] != "pending":
        raise HTTPException(409, f"Request is already {req['status']}")

    # Reset the old session so the student can start fresh
    supabase.table("exam_sessions").update({"status": "reset"}).eq("id", req["session_id"]).execute()

    # Mark request approved
    supabase.table("retake_requests").update({
        "status": "approved",
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()

    return {"message": "Retake approved. Student can now retake the exam."}


@router.post("/admin/retake-requests/{request_id}/deny")
def deny_retake(request_id: str, _=Depends(verify_admin)):
    req = supabase.table("retake_requests").select("*").eq("id", request_id).single().execute().data
    if not req:
        raise HTTPException(404, "Request not found")

    supabase.table("retake_requests").update({
        "status": "denied",
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()

    return {"message": "Retake denied."}
