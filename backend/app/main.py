"""FastAPI-app. Start met:  uvicorn app.main:app --reload --port 8000"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import action_items, dashboard, meetings, projects, settings
from .seed import seed_if_empty


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Vult de database automatisch met demodata bij de eerste start.
    await asyncio.to_thread(seed_if_empty)
    yield


app = FastAPI(
    title="AI Meeting Intelligence System",
    description="Van vergaderingen naar concrete resultaten. Prototype-API (mock-AI).",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (projects.router, meetings.router, action_items.router, dashboard.router, settings.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health", tags=["Systeem"])
def health() -> dict[str, str]:
    settings = get_settings()
    return {"status": "ok", "ai_provider": settings.ai_provider.lower(), "transcriber": settings.transcriber.lower()}
