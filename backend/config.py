import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",")]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
RECONNECT_GRACE_SECONDS = int(os.environ.get("RECONNECT_GRACE_SECONDS", "90"))


def get_supabase() -> Client:
    """Fresh client per call — prevents stale HTTP/2 connections
    from crashing every query after a Render cold start."""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


# Keep a global one for backward compat, but admin endpoints will use get_supabase()
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
