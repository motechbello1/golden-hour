import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import ALLOWED_ORIGINS
from routers import exams, monitoring
from routers import retake


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(monitoring.heartbeat_watchdog())
    yield
    task.cancel()


app = FastAPI(title="Golden Hour Exam Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(exams.router)
app.include_router(monitoring.router)
app.include_router(retake.router)


@app.get("/health")
def health():
    return {"status": "ok"}
