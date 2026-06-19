from fastapi import APIRouter, Header, HTTPException
from datetime import datetime, timezone

from config import supabase

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_KEY = "golden-hour-admin-2024"


def verify_admin(x_admin_key: str = Header(...)):
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(403, "Invalid admin key")


@router.get("/retake-requests")
def list_retake_requests(_=Header(None, alias="x-admin-key")):
    # Verify manually since it's a GET
    # Actually let's just use a dependency
    requests = (
        supabase.table("retake_requests")
        .select("*, students(full_name, unique_code), exams(title)")
        .order("created_at", desc=False)
        .execute().data
    )
    return requests


@router.post("/retake-requests/{request_id}/approve")
def approve_retake(request_id: str, x_admin_key: str = Header(...)):
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(403, "Invalid admin key")

    req = supabase.table("retake_requests").select("*").eq("id", request_id).single().execute().data
    if not req:
        raise HTTPException(404, "Request not found")
    if req["status"] != "pending":
        raise HTTPException(409, f"Already {req['status']}")

    # Mark old session as reset so student can start fresh
    supabase.table("exam_sessions").update({"status": "reset"}).eq("id", req["session_id"]).execute()

    supabase.table("retake_requests").update({
        "status": "approved",
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()

    return {"message": "Retake approved"}


@router.post("/retake-requests/{request_id}/deny")
def deny_retake(request_id: str, x_admin_key: str = Header(...)):
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(403, "Invalid admin key")

    req = supabase.table("retake_requests").select("*").eq("id", request_id).single().execute().data
    if not req:
        raise HTTPException(404, "Request not found")

    supabase.table("retake_requests").update({
        "status": "denied",
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()

    return {"message": "Retake denied"}
