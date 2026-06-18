import asyncio
import base64
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from config import supabase, RECONNECT_GRACE_SECONDS

router = APIRouter()

# How long without a heartbeat before we consider a student disconnected
# (not yet a violation — just "we lost their connection").
HEARTBEAT_TIMEOUT_SECONDS = 15
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


def _log_event(session_id: str, event_type: str, severity: str, meta: dict | None = None, snapshot_b64: str | None = None):
    snapshot_url = None
    if snapshot_b64:
        try:
            path = f"{session_id}/{uuid.uuid4()}.jpg"
            supabase.storage.from_("proctor-snapshots").upload(
                path, base64.b64decode(snapshot_b64), {"content-type": "image/jpeg"}
            )
            snapshot_url = path
        except Exception:
            pass  # snapshot storage is best-effort, never blocks the exam

    supabase.table("proctor_events").insert(
        {
            "session_id": session_id,
            "event_type": event_type,
            "severity": severity,
            "meta": meta or {},
            "snapshot_url": snapshot_url,
        }
    ).execute()


async def heartbeat_watchdog():
    """
    Background loop: flips a session to 'disconnected' if its heartbeat
    goes quiet, and to 'expired' if it stays quiet past the grace
    window. This is what lets a real network/PC outage bypass the exam
    cleanly instead of being treated as a cheating violation.
    """
    while True:
        await asyncio.sleep(5)
        now = time.time()
        for session_id, last_seen in list(_last_heartbeat.items()):
            silence = now - last_seen
            if silence < HEARTBEAT_TIMEOUT_SECONDS:
                continue
            try:
                session = supabase.table("exam_sessions").select("*").eq("id", session_id).single().execute().data
            except Exception:
                continue
            if session["status"] == "in_progress":
                supabase.table("exam_sessions").update(
                    {"status": "disconnected", "disconnected_at": datetime.now(timezone.utc).isoformat()}
                ).eq("id", session_id).execute()
                _log_event(session_id, "heartbeat_lost", "soft")
                await _broadcast_to_admins({"type": "status", "session_id": session_id, "status": "disconnected"})
            elif session["status"] == "disconnected" and silence > RECONNECT_GRACE_SECONDS:
                supabase.table("exam_sessions").update({"status": "expired"}).eq("id", session_id).execute()
                await _broadcast_to_admins({"type": "status", "session_id": session_id, "status": "expired"})
                _last_heartbeat.pop(session_id, None)


@router.websocket("/ws/proctor/{session_id}")
async def proctor_socket(ws: WebSocket, session_id: str):
    await ws.accept()
    _last_heartbeat[session_id] = time.time()

    try:
        session = supabase.table("exam_sessions").select("*").eq("id", session_id).single().execute().data
        if session and session["status"] == "disconnected":
            supabase.table("exam_sessions").update({"status": "in_progress", "disconnected_at": None}).eq(
                "id", session_id
            ).execute()
            _log_event(session_id, "heartbeat_resumed", "soft")
            await _broadcast_to_admins({"type": "status", "session_id": session_id, "status": "in_progress"})
    except Exception:
        pass

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
                    supabase.table("exam_sessions").update({"status": "auto_submitted"}).eq("id", session_id).execute()
                    await ws.send_json({"type": "auto_submitted", "reason": event_type})
                    await _broadcast_to_admins(
                        {"type": "violation", "session_id": session_id, "event_type": event_type, "severity": "hard"}
                    )
                else:
                    await _broadcast_to_admins(
                        {"type": "violation", "session_id": session_id, "event_type": event_type, "severity": "soft"}
                    )

            elif msg_type == "flag":
                # Soft camera-AI flags: no_face, multiple_faces, looking_away, phone_detected.
                # Logged for review, never auto-punished on their own — lighting and
                # webcam quality vary too much for a single flag to be reliable proof.
                _log_event(session_id, msg.get("event_type", "no_face"), "soft", msg.get("meta"), msg.get("snapshot_base64"))
                await _broadcast_to_admins(
                    {"type": "flag", "session_id": session_id, "event_type": msg.get("event_type")}
                )

    except WebSocketDisconnect:
        pass
    finally:
        _last_heartbeat.pop(session_id, None)


@router.websocket("/ws/admin/live")
async def admin_live(ws: WebSocket):
    await ws.accept()
    _admin_sockets.add(ws)
    try:
        while True:
            await ws.receive_text()  # admin socket is receive-only from our side; ignore client pings
    except WebSocketDisconnect:
        pass
    finally:
        _admin_sockets.discard(ws)
