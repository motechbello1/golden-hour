import asyncio
import base64
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from config import get_supabase, RECONNECT_GRACE_SECONDS
from services.scoring import summarize_session

router = APIRouter()

HEARTBEAT_TIMEOUT_SECONDS = 30
HARD_VIOLATIONS = {"fullscreen_exit", "tab_blur", "devtools_attempt"}

_last_heartbeat: dict[str, float] = {}
_admin_sockets: set[WebSocket] = set()


async def _broadcast_to_admins(message: dict):
    dead = []
    for ws in _admin_sockets:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _admin_sockets.discard(ws)


def _log_event(session_id, event_type, severity, meta=None, snapshot_b64=None):
    snapshot_url = None
    if snapshot_b64:
        try:
            path = f"{session_id}/{uuid.uuid4()}.jpg"
            get_supabase().storage.from_("proctor-snapshots").upload(
                path, base64.b64decode(snapshot_b64), {"content-type": "image/jpeg"}
            )
            snapshot_url = path
        except Exception:
            pass
    get_supabase().table("proctor_events").insert({
        "session_id": session_id, "event_type": event_type,
        "severity": severity, "meta": meta or {}, "snapshot_url": snapshot_url,
    }).execute()


def _calculate_and_store_score(session_id):
    """Calculate score from answers submitted so far and store it on the session."""
    try:
        answers = get_supabase().table("exam_answers").select("is_correct").eq("session_id", session_id).execute().data
        summary = summarize_session(answers)
        get_supabase().table("exam_sessions").update({
            "score": summary["score"],
            "max_score": summary["max_score"],
        }).eq("id", session_id).execute()
    except Exception:
        pass


def _auto_submit_session(session_id, reason):
    """Mark session as auto-submitted with reason, calculate score."""
    get_supabase().table("exam_sessions").update({
        "status": "auto_submitted",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", session_id).execute()
    # Log the specific reason as a hard event
    _log_event(session_id, reason, "hard", {"auto_submit_reason": reason})
    # Calculate score from whatever they answered so far
    _calculate_and_store_score(session_id)


async def heartbeat_watchdog():
    while True:
        await asyncio.sleep(5)
        now = time.time()
        for session_id, last_seen in list(_last_heartbeat.items()):
            silence = now - last_seen
            if silence < HEARTBEAT_TIMEOUT_SECONDS:
                continue
            try:
                session = get_supabase().table("exam_sessions").select("*").eq("id", session_id).single().execute().data
            except Exception:
                continue
            if session["status"] == "in_progress":
                get_supabase().table("exam_sessions").update({
                    "status": "disconnected",
                    "disconnected_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", session_id).execute()
                _log_event(session_id, "heartbeat_lost", "soft")
                await _broadcast_to_admins({"type": "status", "session_id": session_id, "status": "disconnected"})
            elif session["status"] == "disconnected" and silence > RECONNECT_GRACE_SECONDS:
                _auto_submit_session(session_id, "connection_timeout")
                await _broadcast_to_admins({"type": "status", "session_id": session_id, "status": "expired"})
                _last_heartbeat.pop(session_id, None)


@router.websocket("/ws/proctor/{session_id}")
async def proctor_socket(ws: WebSocket, session_id: str):
    await ws.accept()
    _last_heartbeat[session_id] = time.time()

    # Get student info for admin display
    student_info = {}
    try:
        session = get_supabase().table("exam_sessions").select("*, students(full_name, unique_code)").eq("id", session_id).single().execute().data
        if session:
            student_info = {
                "name": session.get("students", {}).get("full_name", ""),
                "code": session.get("students", {}).get("unique_code", ""),
            }
            if session["status"] == "disconnected":
                get_supabase().table("exam_sessions").update({"status": "in_progress", "disconnected_at": None}).eq("id", session_id).execute()
                _log_event(session_id, "heartbeat_resumed", "soft")
                await _broadcast_to_admins({"type": "status", "session_id": session_id, "status": "in_progress", **student_info})
    except Exception:
        pass

    await _broadcast_to_admins({"type": "student_connected", "session_id": session_id, **student_info})

    try:
        while True:
            msg = await ws.receive_json()
            msg_type = msg.get("type")

            if msg_type == "heartbeat":
                _last_heartbeat[session_id] = time.time()

            elif msg_type == "violation":
                event_type = msg.get("event_type", "tab_blur")
                severity = "hard" if event_type in HARD_VIOLATIONS else "soft"
                _log_event(session_id, event_type, severity, msg.get("meta"))

                if severity == "hard":
                    _auto_submit_session(session_id, event_type)
                    await ws.send_json({"type": "auto_submitted", "reason": event_type})
                    await _broadcast_to_admins({
                        "type": "violation", "session_id": session_id,
                        "event_type": event_type, "severity": "hard",
                        "reason": event_type, **student_info
                    })
                else:
                    await _broadcast_to_admins({
                        "type": "violation", "session_id": session_id,
                        "event_type": event_type, "severity": "soft", **student_info
                    })

            elif msg_type == "flag":
                _log_event(session_id, msg.get("event_type", "no_face"), "soft", msg.get("meta"), msg.get("snapshot_base64"))
                await _broadcast_to_admins({
                    "type": "flag", "session_id": session_id,
                    "event_type": msg.get("event_type"), **student_info
                })

            elif msg_type == "live_snapshot":
                # Forward the live camera frame to all admin sockets — not stored, just real-time
                await _broadcast_to_admins({
                    "type": "live_snapshot", "session_id": session_id,
                    "snapshot_base64": msg.get("snapshot_base64"),
                    **student_info
                })

    except WebSocketDisconnect:
        pass
    finally:
        _last_heartbeat.pop(session_id, None)
        await _broadcast_to_admins({"type": "student_disconnected", "session_id": session_id, **student_info})


@router.websocket("/ws/admin/live")
async def admin_live(ws: WebSocket):
    await ws.accept()
    _admin_sockets.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _admin_sockets.discard(ws)
