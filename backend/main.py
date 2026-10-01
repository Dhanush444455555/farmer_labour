"""
backend/main.py

Unified FastAPI + Socket.IO Backend Server for Farm Connect.
Provides full REST APIs, real-time WebSocket communication, and
LangGraph AI multi-agent orchestration for Farmers, Laborers, and Admins.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Add current directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import settings
from database import init_db
from socket_manager import sio
from routes import (
    admin,
    agent,
    auth,
    bookings,
    cms,
    jobs,
    laborers,
    notifications,
    users,
)

# ── Logging Configuration ──────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("server")


# ── Periodic 24h Background Task ──────────────────────────────────────────────
async def periodic_refresh_task():
    while True:
        try:
            await asyncio.sleep(24 * 60 * 60)
            await sio.emit("force-refresh")
            logger.info("[Socket.IO] Emitted 24h force-refresh to all clients")
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Periodic refresh error: %s", exc)


# ── Lifespan Context Manager ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🌾 Starting %s v%s on port %s", settings.APP_NAME, settings.APP_VERSION, settings.PORT)

    # 1. Initialize SQLite Database Tables & Migrations
    await init_db()

    # 2. Warm up ChromaDB Vector Knowledge Store
    try:
        from rag.chroma_client import init_rag
        await init_rag()
    except Exception as exc:
        logger.warning("RAG initialization skipped / deferred: %s", exc)

    # 3. Start background periodic timer
    refresh_bg = asyncio.create_task(periodic_refresh_task())

    logger.info("✅ Farm Connect Python Backend is fully online & operational.")
    yield

    # Shutdown
    refresh_bg.cancel()
    logger.info("🛑 Farm Connect Python Backend shutting down...")


# ── FastAPI App Creation ───────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Unified Python Backend & AI Agent Core for Farm Connect",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Mount Routers ─────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(laborers.router)
app.include_router(jobs.router)
app.include_router(bookings.router)
app.include_router(notifications.router)
app.include_router(cms.router)
app.include_router(admin.router)
app.include_router(agent.router)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


# ── Mount Socket.IO ASGI App ───────────────────────────────────────────────────
# Wrap FastAPI with python-socketio ASGIApp so HTTP and Socket.IO share the exact same port!
socket_app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="socket.io")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:socket_app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
