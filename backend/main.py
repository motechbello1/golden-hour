import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from routers import exams, monitoring, retake, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(monitoring.heartbeat_watchdog())
    yield
    task.cancel()


app = FastAPI(title="Golden Hour Exam Engine", lifespan=lifespan)


# Custom CORS middleware that ALWAYS adds headers — no conditions, no edge cases.
class AlwaysCORS(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Handle preflight OPTIONS directly
        if request.method == "OPTIONS":
            return Response(
                status_code=200,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Max-Age": "86400",
                },
            )

        try:
            response = await call_next(request)
        except Exception:
            response = Response(status_code=500, content="Internal Server Error")

        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response


app.add_middleware(AlwaysCORS)

app.include_router(exams.router)
app.include_router(monitoring.router)
app.include_router(retake.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}
