from fastapi import Header, HTTPException
from config import supabase


def get_current_student(authorization: str = Header(...)) -> dict:
    """
    Expects 'Authorization: Bearer <supabase-access-token>'. Verifies the
    token against Supabase Auth, then loads the matching student row.
    Every exam-related endpoint depends on this — there is no path that
    accepts a student_id directly from the client.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()

    try:
        user_res = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired session")

    user = user_res.user
    if not user:
        raise HTTPException(401, "Invalid or expired session")

    student_res = supabase.table("students").select("*").eq("id", user.id).single().execute()
    if not student_res.data:
        raise HTTPException(404, "No student record for this account yet — complete registration first")

    return student_res.data
