from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
import traceback

from config import supabase

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_KEY = "golden-hour-admin-2024"


def _check_key(key: str):
    if key != ADMIN_KEY:
        raise HTTPException(403, "Invalid admin key")


@router.get("/sessions")
def list_sessions(x_admin_key: str = Header(...)):
    _check_key(x_admin_key)
    try:
        data = (
            supabase.table("exam_sessions")
            .select("*, students(full_name, unique_code)")
            .order("started_at", desc=True)
            .limit(200)
            .execute().data
        )
        return data or []
    except Exception as e:
        print(f"[ADMIN] /sessions error: {e}")
        traceback.print_exc()
        return []


@router.get("/proctor-events")
def list_proctor_events(x_admin_key: str = Header(...)):
    _check_key(x_admin_key)
    try:
        data = (
            supabase.table("proctor_events")
            .select("*, exam_sessions(students(full_name, unique_code))")
            .order("created_at", desc=True)
            .limit(200)
            .execute().data
        )
        return data or []
    except Exception as e:
        print(f"[ADMIN] /proctor-events error: {e}")
        traceback.print_exc()
        return []


@router.get("/retake-requests")
def list_retake_requests(x_admin_key: str = Header(...)):
    _check_key(x_admin_key)
    try:
        data = (
            supabase.table("retake_requests")
            .select("*, students(full_name, unique_code), exams(title)")
            .order("created_at", desc=True)
            .execute().data
        )
        return data or []
    except Exception as e:
        print(f"[ADMIN] /retake-requests error: {e}")
        traceback.print_exc()
        return []


@router.post("/retake-requests/{request_id}/approve")
def approve_retake(request_id: str, x_admin_key: str = Header(...)):
    _check_key(x_admin_key)
    req = supabase.table("retake_requests").select("*").eq("id", request_id).single().execute().data
    if not req:
        raise HTTPException(404, "Not found")
    if req["status"] != "pending":
        raise HTTPException(409, f"Already {req['status']}")
    supabase.table("exam_sessions").update({"status": "reset"}).eq("id", req["session_id"]).execute()
    supabase.table("retake_requests").update({
        "status": "approved", "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()
    return {"message": "Retake approved"}


@router.post("/retake-requests/{request_id}/deny")
def deny_retake(request_id: str, x_admin_key: str = Header(...)):
    _check_key(x_admin_key)
    supabase.table("retake_requests").update({
        "status": "denied", "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()
    return {"message": "Retake denied"}


@router.get("/exams")
def list_exams(x_admin_key: str = Header(...)):
    _check_key(x_admin_key)
    try:
        data = (
            supabase.table("exams")
            .select("*, tracks(name, slug)")
            .order("created_at", desc=True)
            .execute().data
        )
        return data or []
    except Exception as e:
        print(f"[ADMIN] /exams error: {e}")
        traceback.print_exc()
        return []


@router.get("/scores")
def list_scores(x_admin_key: str = Header(...)):
    _check_key(x_admin_key)
    try:
        data = (
            supabase.table("exam_sessions")
            .select("id, status, score, max_score, started_at, submitted_at, current_index, students(full_name, unique_code), exams(title)")
            .in_("status", ["submitted", "auto_submitted", "expired"])
            .order("submitted_at", desc=True)
            .limit(500)
            .execute().data
        )
        return data or []
    except Exception as e:
        print(f"[ADMIN] /scores error: {e}")
        traceback.print_exc()
        return []


@router.get("/snapshot")
def get_snapshot_url(path: str, x_admin_key: str = Header(...)):
    _check_key(x_admin_key)
    try:
        signed = supabase.storage.from_("proctor-snapshots").create_signed_url(path, 300)
        return {"url": signed["signedURL"]}
    except Exception as e:
        raise HTTPException(500, f"Could not load: {str(e)}")


class ExamConfigUpdate(BaseModel):
    objective_count: int
    code_count: int = 0
    objective_time_seconds: int
    code_time_seconds: int
    paraphrase: bool


@router.put("/exams/{exam_id}")
def update_exam_config(exam_id: str, body: ExamConfigUpdate, x_admin_key: str = Header(...)):
    _check_key(x_admin_key)
    supabase.table("exams").update({
        "objective_count": body.objective_count,
        "code_count": body.code_count,
        "objective_time_seconds": body.objective_time_seconds,
        "code_time_seconds": body.code_time_seconds,
        "paraphrase": body.paraphrase,
    }).eq("id", exam_id).execute()
    return {"message": "Updated"}
