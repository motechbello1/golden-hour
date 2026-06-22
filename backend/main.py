import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import exams, monitoring, retake, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(monitoring.heartbeat_watchdog())
    yield
    task.cancel()


app = FastAPI(title="Golden Hour Exam Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# This ensures ANY unhandled crash still returns a proper response
# that goes through CORSMiddleware (which adds the CORS headers).
@app.exception_handler(Exception)
async def catch_everything(request: Request, exc: Exception):
    import traceback
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"detail": str(exc)})


app.include_router(exams.router)
app.include_router(monitoring.router)
app.include_router(retake.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/debug/test-db")
def test_db():
    """Hit this endpoint directly to check if the database works."""
    from config import get_supabase
    supabase = get_supabase()
    try:
        tracks = supabase.table("tracks").select("slug").execute().data
        sessions_count = supabase.table("exam_sessions").select("id", count="exact").execute().count
        events_count = supabase.table("proctor_events").select("id", count="exact").execute().count
        return {
            "tracks": tracks,
            "sessions": sessions_count,
            "events": events_count,
            "status": "database connected"
        }
    except Exception as e:
        return {"error": str(e), "status": "database failed"}
