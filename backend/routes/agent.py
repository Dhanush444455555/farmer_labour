"""
backend/routes/agent.py

Direct in-process LangGraph agent endpoints for:
1. Multi-turn Conversational Job Posting (Farmers)
2. Semantic Job Search & ChromaDB Labour Rights RAG (Laborers)
3. Admin natural language query / analytics agent
4. Session store management & health
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from database import get_one, query, run
from socket_manager import sio, create_notification

logger = logging.getLogger("agent_router")
router = APIRouter(prefix="/api/agent", tags=["agent"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class JobPostAgentRequest(BaseModel):
    message: Optional[str] = ""
    language: Optional[str] = "en"
    reset: Optional[bool] = False
    confirm: Optional[bool] = False


class JobSearchAgentRequest(BaseModel):
    query: Optional[str] = ""
    language: Optional[str] = "en"


class FastApiJobPostRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    language: Optional[str] = "en"
    uid: Optional[str] = None
    hirer_name: Optional[str] = None
    hirer_phone: Optional[str] = None


class FastApiJobSearchRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    language: Optional[str] = "en"
    uid: Optional[str] = None
    gender: Optional[str] = "Any"
    location: Optional[str] = ""


class FastApiAdminQueryRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    uid: Optional[str] = None


# ── Health & Liveness ──────────────────────────────────────────────────────────

@router.get("/health")
async def agent_health():
    return {"status": "ok", "service": "Farm Connect Agent Core"}


# ── 1. Job Posting Agent (Used by LangGraphJobPostingAgent.jsx) ────────────────

@router.post("/job-post")
async def run_job_post_agent(
    payload: JobPostAgentRequest,
    x_user_uid: Optional[str] = Header(None, alias="x-user-uid"),
):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    session_id = f"{x_user_uid}_job_posting"
    input_text = payload.message or ""
    if payload.confirm:
        input_text = "confirm"

    user = await get_one("SELECT name, phone_number FROM users WHERE uid = :uid", {"uid": x_user_uid})
    h_name = (user.get("name") if user else None) or "Farm Owner"
    h_phone = (user.get("phone_number") if user else None) or x_user_uid

    try:
        from agents.job_posting_agent import get_job_posting_agent
        agent = get_job_posting_agent()

        if payload.reset:
            from sessions import get_session_store
            store = get_session_store()
            await store.delete(session_id)

        result = await agent.run(
            session_id=session_id,
            user_input=input_text,
            hirer_uid=x_user_uid,
            hirer_name=h_name,
            hirer_phone=h_phone,
            language=payload.language or "en",
        )

        job_state = result.get("job_state", {})

        # If job was submitted, emit real-time event & create notifications
        if result.get("is_submitted") and result.get("created_job_id"):
            created_job = await get_one("SELECT * FROM jobs WHERE id = :jid", {"jid": result["created_job_id"]})
            if created_job:
                job_payload = {
                    "id": created_job["id"],
                    "hirerId": created_job["hirer_id"],
                    "ownerName": created_job["hirer_name"],
                    "workTitle": created_job["title"],
                    "workerWage": created_job["wage"],
                    "workDate": created_job["work_date"],
                    "workTime": created_job["work_time"],
                    "location": created_job["location"],
                    "laborersRequired": created_job["laborers_required"],
                    "status": created_job["status"],
                    "acceptedCount": 0,
                }
                await sio.emit("new-work-alert", job_payload)

                available_laborers = await query("SELECT uid FROM users WHERE role = 'laborer'")
                for l in available_laborers:
                    await create_notification(
                        user_id=l["uid"],
                        notif_type="new_job",
                        title="New Work Alert",
                        message=f"{job_payload['ownerName']} posted: {job_payload['workTitle']}",
                        related_job_id=created_job["id"],
                    )

        return {
            "stage": result.get("stage", "collect_info"),
            "botMessage": result.get("bot_message", ""),
            "missingField": result.get("missing_field"),
            "confirmationSummary": result.get("confirmation_summary"),
            "isSubmitted": result.get("is_submitted", False),
            "createdJobId": result.get("created_job_id"),
            "jobState": {
                "workType": job_state.get("title"),
                "laborersRequired": job_state.get("worker_count"),
                "wage": job_state.get("wage"),
                "location": job_state.get("location"),
                "genderPreference": job_state.get("gender_preference"),
                "workDate": job_state.get("work_date"),
                "workTime": job_state.get("work_time"),
            },
        }
    except Exception as exc:
        logger.error("Job posting agent error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc) or "Agent turn failed")


# ── 2. Job Search & RAG Agent (Used by LaborerDashboard.jsx) ──────────────────

@router.post("/job-search")
async def run_job_search_agent(
    payload: JobSearchAgentRequest,
    x_user_uid: Optional[str] = Header(None, alias="x-user-uid"),
):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    session_id = f"{x_user_uid}_job_search"
    query_text = payload.query or ""

    user = await get_one("SELECT location, gender FROM users WHERE uid = :uid", {"uid": x_user_uid})
    user_location = (user.get("location") if user else None) or ""
    user_gender = (user.get("gender") if user else None) or "Any"

    try:
        from agents.job_search_agent import get_job_search_agent
        agent = get_job_search_agent()

        result = await agent.run(
            session_id=session_id,
            user_input=query_text,
            laborer_uid=x_user_uid,
            gender=user_gender,
            location=user_location,
            language=payload.language or "en",
        )

        return {
            "reply": result.get("reply", ""),
            "jobs": result.get("jobs", []),
            "schemes": result.get("schemes", []),
            "rights": result.get("rights", []),
            "extracted_criteria": result.get("extracted_criteria", {}),
        }
    except Exception as exc:
        logger.error("Job search agent error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc) or "Job search agent failed")


# ── FastAPI / Python REST compatibility routes (/api/agent/post-job etc.) ─────

@router.post("/post-job")
async def post_job_compat(payload: FastApiJobPostRequest, x_user_uid: Optional[str] = Header(None, alias="x-user-uid")):
    uid = payload.uid or x_user_uid
    if not uid:
        raise HTTPException(status_code=401, detail="Missing UID header or field")
    return await run_job_post_agent(
        JobPostAgentRequest(message=payload.message, language=payload.language),
        x_user_uid=uid,
    )


@router.post("/find-job")
async def find_job_compat(payload: FastApiJobSearchRequest, x_user_uid: Optional[str] = Header(None, alias="x-user-uid")):
    uid = payload.uid or x_user_uid
    if not uid:
        raise HTTPException(status_code=401, detail="Missing UID header or field")
    return await run_job_search_agent(
        JobSearchAgentRequest(query=payload.message, language=payload.language),
        x_user_uid=uid,
    )


@router.post("/admin-query")
async def admin_query_compat(payload: FastApiAdminQueryRequest, x_user_uid: Optional[str] = Header(None, alias="x-user-uid")):
    uid = payload.uid or x_user_uid
    if not uid:
        raise HTTPException(status_code=401, detail="Missing UID header or field")
    from routes.admin import admin_agent_query, AdminAgentQueryRequest
    return await admin_agent_query(AdminAgentQueryRequest(queryText=payload.message), admin={"uid": uid})


@router.delete("/session/{session_id}")
async def clear_session(session_id: str):
    from sessions import get_session_store
    store = get_session_store()
    await store.delete(session_id)
    return {"cleared": True, "session_id": session_id}
