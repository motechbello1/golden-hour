import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",")]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
RECONNECT_GRACE_SECONDS = int(os.environ.get("RECONNECT_GRACE_SECONDS", "90"))

# Service-role client: full DB access, used only on the server. The
# frontend talks to Supabase directly with the anon key for auth, but
# every exam read/write goes through this backend so the lockdown and
# timing rules can never be bypassed by editing client-side code.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
