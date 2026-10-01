"""
agent-service/main.py

FastAPI entry point for the Farm Connect agent microservice.

Endpoints:
  GET  /health                   — liveness check
  GET  /health/deep              — checks DB + ChromaDB connectivity
  POST /agent/post-job           — job posting agent (farmers)
  POST /agent/find-job           — job search agent (labourers)
  POST /agent/admin-query        — admin analytics / moderation agent
  DELETE /agent/session/{id}     — clear a session (start over)

Run locally:
  cd agent-service
  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from config import settings

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")


# ── Lifespan: startup + shutdown hooks ────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks before accepting requests, shutdown tasks on exit."""
    logger.info("🚀 Starting %s v%s", settings.APP_NAME, settings.APP_VERSION)

    # 1. Connect to DB
    from db.connection import connect_db, disconnect_db
    await connect_db()

    # 2. Warm up ChromaDB + seed if empty
    from rag.chroma_client import init_rag
    await init_rag()

    # 3. Warm up session store
    from sessions import get_session_store
    get_session_store()

    logger.info("✅ All services ready — listening on port %s", settings.PORT)

    yield  # ← app is running here

    # Shutdown
    logger.info("🛑 Shutting down...")
    await disconnect_db()


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Python agent microservice for Farm Connect. "
        "Hosts LangGraph agents for job posting, job search, and admin queries."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request-timing middleware ──────────────────────────────────────────────────

@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = round((time.perf_counter() - start) * 1000, 1)
    response.headers["X-Response-Time-Ms"] = str(elapsed)
    return response


# ── Global error handler ──────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error on %s: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


# ─────────────────────────────────────────────────────────────────────────────
# REQUEST / RESPONSE SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class AgentRequest(BaseModel):
    session_id: str = Field(..., description="Unique session ID, e.g. '{uid}_job_posting'")
    message:    str = Field(..., min_length=1, max_length=2000)
    language:   str = Field(default="en", pattern="^(en|ta|hi|kn|te)$")
    uid:        str = Field(..., description="Authenticated user UID")

    # Optional context fields (used by specific agents)
    hirer_name:  Optional[str] = None
    hirer_phone: Optional[str] = None
    gender:      Optional[str] = None
    location:    Optional[str] = None


class AdminRequest(BaseModel):
    session_id: str = Field(..., description="Admin session ID")
    message:    str = Field(..., min_length=1, max_length=2000)
    uid:        str = Field(..., description="Admin user UID")


class AgentResponse(BaseModel):
    reply:      str
    done:       bool
    data:       Optional[Any] = None
    session_id: str


# ─────────────────────────────────────────────────────────────────────────────
# HEALTH ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
async def health_check():
    """
    Basic liveness check — returns 200 if the service is up.
    The Node backend proxy calls this to decide whether to use the agent
    or fall back to the manual form.
    """
    return {
        "status":  "ok",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "llm":     settings.LLM_PROVIDER.value,
        "db":      settings.DB_DRIVER.value,
    }


@app.get("/health/deep", tags=["Health"])
async def deep_health_check():
    """
    Deep health check — verifies DB and ChromaDB connectivity.
    Slower than /health; call periodically, not on every request.
    """
    results: dict[str, Any] = {"status": "ok"}

    # DB check
    try:
        from db.connection import engine
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        results["db"] = {"status": "ok", "driver": settings.DB_DRIVER.value}
    except Exception as exc:
        results["db"] = {"status": "error", "detail": str(exc)}
        results["status"] = "degraded"

    # ChromaDB check
    try:
        from rag.chroma_client import get_chroma_client, get_collection
        col = get_collection(settings.CHROMA_LABOUR_RIGHTS_COLLECTION, create_if_missing=False)
        results["chroma"] = {"status": "ok", "docs": col.count(), "mode": settings.CHROMA_MODE}
    except Exception as exc:
        results["chroma"] = {"status": "error", "detail": str(exc)}
        results["status"] = "degraded"

    # Session store check
    try:
        from sessions import get_session_store
        store = get_session_store()
        results["sessions"] = {"status": "ok", "backend": settings.SESSION_BACKEND}
    except Exception as exc:
        results["sessions"] = {"status": "error", "detail": str(exc)}

    http_status = 200 if results["status"] == "ok" else 503
    return JSONResponse(content=results, status_code=http_status)


# ─────────────────────────────────────────────────────────────────────────────
# AGENT ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@app.post(
    "/agent/post-job",
    response_model=AgentResponse,
    tags=["Agents"],
    summary="Job posting agent (farmers)",
)
async def post_job_agent(req: AgentRequest):
    """
    Multi-turn conversational job posting for farmers.

    - Asks one question at a time (work type, location, date, wage, workers).
    - Accepts voice or text input.
    - Returns `done: true` once the job is submitted to the DB.
    - `data` contains the final job details when `done` is true.

    **Session state is persisted** across turns using `session_id`.
    Use the same `session_id` for all turns of one job posting flow.
    Send a new `session_id` to start a fresh posting.
    """
    from agents.job_posting_agent import job_posting_agent

    try:
        result = await job_posting_agent.run(
            input_text=req.message,
            session_id=req.session_id,
            uid=req.uid,
            language=req.language,
            hirer_name=req.hirer_name or "",
            hirer_phone=req.hirer_phone or "",
        )
    except Exception as exc:
        logger.error("[post-job] %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    return AgentResponse(
        reply=result.get("response", ""),
        done=result.get("job_submitted", False),
        data=result if result.get("job_submitted") else None,
        session_id=req.session_id,
    )


@app.post(
    "/agent/find-job",
    response_model=AgentResponse,
    tags=["Agents"],
    summary="Job search agent (labourers)",
)
async def find_job_agent(req: AgentRequest):
    """
    Natural-language job search for labourers.

    - Parses intent (work type, location, wage, date) from free text.
    - Queries the live jobs DB with extracted filters.
    - Ranks results by wage + proximity + gender match.
    - For fairness/rights questions ("is ₹300 fair?"), triggers RAG
      retrieval from the labour_knowledge ChromaDB collection.
    - Returns `done: true` always (single-turn search).
    - `data.jobs` contains up to 3 ranked job objects.
    - `data.rag_answer` is set when a labour-rights question was detected.
    """
    from agents.job_search_agent import job_search_agent

    try:
        result = await job_search_agent.run(
            input_text=req.message,
            session_id=req.session_id,
            uid=req.uid,
            language=req.language,
            gender=req.gender or "Any",
            location=req.location or "",
        )
    except Exception as exc:
        logger.error("[find-job] %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    return AgentResponse(
        reply=result.get("voice_summary", ""),
        done=True,
        data={
            "jobs":        result.get("jobs", []),
            "rag_answer":  result.get("rag_answer"),
            "filters":     result.get("filters", {}),
            "count":       result.get("results_count", 0),
        },
        session_id=req.session_id,
    )


@app.post(
    "/agent/admin-query",
    response_model=AgentResponse,
    tags=["Agents"],
    summary="Admin analytics / moderation agent",
)
async def admin_query_agent_endpoint(req: AdminRequest):
    """
    Admin natural-language query agent.

    - Classifies query as analytics, moderation, or report.
    - Runs the appropriate DB query (via LangChain tools).
    - Returns a plain-language markdown answer.
    - Always single-turn (`done: true`).
    - Every query is written to the audit_log table.

    Example queries:
    - "How many jobs posted this week in Tamil Nadu?"
    - "Flag suspicious accounts"
    - "Give me a full platform activity report"
    - "How many laborers vs farmers are registered?"
    """
    from agents.admin_agent import admin_query_agent

    try:
        result = await admin_query_agent.run(
            input_text=req.message,
            session_id=req.session_id,
            uid=req.uid,
            language="en",  # admin portal is English-only
        )
    except Exception as exc:
        logger.error("[admin-query] %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    return AgentResponse(
        reply=result.get("reply", ""),
        done=True,
        data={
            "category": result.get("category"),
            "entities": result.get("entities", {}),
            "raw":      result.get("data"),
        },
        session_id=req.session_id,
    )


# ─────────────────────────────────────────────────────────────────────────────
# SESSION MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────

@app.delete("/agent/session/{session_id}", tags=["Sessions"])
async def clear_session(session_id: str):
    """
    Clear a session so the user can start a fresh conversation.
    Call this when:
      - Farmer wants to start a new job posting (clear old partial state).
      - Labourer wants to reset their search filters.
      - Frontend detects an abandoned multi-turn flow.
    """
    from sessions import get_session_store

    store = get_session_store()
    await store.delete(session_id)
    return {"cleared": True, "session_id": session_id}


@app.get("/agent/session/{session_id}", tags=["Sessions"])
async def get_session_state(session_id: str):
    """Inspect the current state of a session (dev/debug only)."""
    from sessions import get_session_store

    store = get_session_store()
    session = await store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    return session.to_dict()
