"""
agent-service/agents/job_search_agent.py

LangGraph agent: natural-language job search for labourers + RAG wage check.

Nodes (mirrors Node backend jobSearchGraph.js):
  parse_intent → [rag_check | retrieve → rank → present]
"""

from __future__ import annotations

import logging
import re
from typing import Any

from langgraph.graph import StateGraph, END, START
from typing_extensions import TypedDict

from agents.base import BaseAgent
from sessions import ConversationSession

logger = logging.getLogger(__name__)


# ── State ──────────────────────────────────────────────────────────────────────

class JobSearchState(TypedDict):
    user_query:      str
    laborer_uid:     str
    laborer_gender:  str
    laborer_location: str
    language:        str

    filters:         dict
    retrieved_jobs:  list[dict]
    ranked_jobs:     list[dict]

    voice_summary:   str
    rag_answer:      dict | None
    results_count:   int


# ── Helper: multilingual keyword tables ────────────────────────────────────────

RAG_KEYWORDS = [
    "fair", "minimum wage", "is this wage", "legal", "rights", "enough",
    "நியாயமானதா", "குறைந்தபட்ச கூலி",
    "उचित", "न्यूनतम मजदूरी",
    "ನ್ಯಾಯಯುತ", "ಕನಿಷ್ಠ ಕೂಲಿ",
]


# ── Nodes ──────────────────────────────────────────────────────────────────────

async def parse_intent_node(state: JobSearchState) -> dict:
    text = (state.get("user_query") or "").lower()
    filters = {
        "work_type":     None,
        "min_wage":      None,
        "location":      state.get("laborer_location") or None,
        "date":          "Tomorrow",
        "gender":        state.get("laborer_gender", "Any"),
        "is_rag_question": any(kw in text for kw in RAG_KEYWORDS),
    }

    # Work type
    work_map = {
        "Harvesting": ["harvest", "அறுவடை", "कटाई", "ಕಟಾವು"],
        "Weeding":    ["weed", "களை", "निराई", "ಕಳೆ"],
        "Plowing":    ["plow", "tractor", "உழு", "जुताई"],
        "Spraying":   ["spray", "மருந்து", "छिड़काव"],
        "Sowing":     ["sow", "plant", "நாற்று", "बुवाई"],
    }
    for wtype, kws in work_map.items():
        if any(kw in text for kw in kws):
            filters["work_type"] = wtype
            break

    # Minimum wage
    wage_match = re.search(r"(\d{3,4})", text)
    if wage_match:
        filters["min_wage"] = int(wage_match.group(1))
    elif any(kw in text for kw in ["good pay", "high pay", "அதிக கூலி", "अच्छी मजदूरी"]):
        filters["min_wage"] = 500

    # Date
    if any(kw in text for kw in ["today", "urgent", "இன்று", "आज"]):
        filters["date"] = "Today"
    elif any(kw in text for kw in ["tomorrow", "நாளை", "कल"]):
        filters["date"] = "Tomorrow"

    return {"filters": filters}


async def rag_check_node(state: JobSearchState) -> dict:
    """Retrieve labour rights / minimum wage info from ChromaDB."""
    try:
        from rag import get_collection
        from config import settings

        col = get_collection(settings.CHROMA_LABOUR_RIGHTS_COLLECTION)
        results = col.query(
            query_texts=[state.get("user_query", "minimum wage")],
            n_results=3,
        )
        docs = results.get("documents", [[]])[0]
        combined = "\n\n".join(docs) if docs else "No specific data found."

        lang = state.get("language", "en")
        prefix = {
            "ta": "📋 உங்கள் கேள்விக்கு பதில்:",
            "hi": "📋 आपके सवाल का जवाब:",
        }.get(lang, "📋 Based on labour rights data:")

        rag_answer = {
            "grounded_answer": f"{prefix}\n\n{combined}",
            "sources": results.get("metadatas", [[]])[0],
        }
        return {
            "rag_answer": rag_answer,
            "voice_summary": rag_answer["grounded_answer"][:300],
        }
    except Exception as exc:
        logger.warning("rag_check_node error: %s", exc)
        return {
            "rag_answer": {"grounded_answer": "Could not retrieve labour rights data."},
            "voice_summary": "Could not retrieve labour rights data.",
        }


async def retrieve_node(state: JobSearchState) -> dict:
    """Query the jobs table with parsed filters."""
    filters = state.get("filters", {})
    try:
        from db import db_session, DBQueries
        async with db_session() as db:
            jobs = await DBQueries.get_open_jobs(
                db,
                location=filters.get("location"),
                min_wage=filters.get("min_wage"),
                work_type=filters.get("work_type"),
                work_date=filters.get("date"),
                limit=20,
            )
        return {"retrieved_jobs": jobs}
    except Exception as exc:
        logger.error("retrieve_node error: %s", exc)
        return {"retrieved_jobs": []}


async def rank_node(state: JobSearchState) -> dict:
    """Rank jobs by wage, location proximity, gender match."""
    jobs = state.get("retrieved_jobs", [])
    user_loc = (state.get("laborer_location") or "").lower()
    user_gender = state.get("laborer_gender", "Any")

    def score(job: dict) -> float:
        s = float(job.get("wage") or 0) / 50
        if user_loc and job.get("location", "").lower().find(user_loc) != -1:
            s += 10
        pref = job.get("gender_preference", "Any")
        s += 5 if pref in ("Any", user_gender) else -5
        return s

    ranked = sorted(jobs, key=score, reverse=True)
    return {"ranked_jobs": ranked}


async def present_node(state: JobSearchState) -> dict:
    """Format top-3 as a short voice-readable summary."""
    top3 = (state.get("ranked_jobs") or [])[:3]
    lang = state.get("language", "en")

    if not top3:
        no_job = {
            "en": "No matching jobs right now. You'll be notified when new work is posted nearby.",
            "ta": "தற்போது வேலைகள் இல்லை. புதிய வேலை வரும்போது தகவல் வரும்.",
            "hi": "अभी काम नहीं है। नया काम आने पर सूचना मिलेगी।",
        }
        return {"voice_summary": no_job.get(lang, no_job["en"]), "results_count": 0}

    if lang == "ta":
        summary = f"{len(top3)} சிறந்த வேலைகள்:\n" + "\n".join(
            f"{i+1}. {j.get('title')} • ₹{j.get('wage')}/நாள் • {j.get('location')}"
            for i, j in enumerate(top3)
        )
    elif lang == "hi":
        summary = f"{len(top3)} काम मिले:\n" + "\n".join(
            f"{i+1}. {j.get('title')} • ₹{j.get('wage')}/दिन • {j.get('location')}"
            for i, j in enumerate(top3)
        )
    else:
        summary = f"Found {len(top3)} matching jobs:\n" + "\n".join(
            f"{i+1}. {j.get('title')} • ₹{j.get('wage')}/day at {j.get('location')} ({j.get('work_date')})"
            for i, j in enumerate(top3)
        )

    return {"voice_summary": summary, "results_count": len(top3)}


# ── Router ─────────────────────────────────────────────────────────────────────

def intent_router(state: JobSearchState) -> str:
    return "rag_check" if state.get("filters", {}).get("is_rag_question") else "retrieve"


# ── Graph ──────────────────────────────────────────────────────────────────────

def _build_job_search_graph():
    workflow = StateGraph(JobSearchState)
    workflow.add_node("parse_intent", parse_intent_node)
    workflow.add_node("rag_check", rag_check_node)
    workflow.add_node("retrieve", retrieve_node)
    workflow.add_node("rank", rank_node)
    workflow.add_node("present", present_node)

    workflow.add_edge(START, "parse_intent")
    workflow.add_conditional_edges("parse_intent", intent_router, {
        "rag_check": "rag_check",
        "retrieve":  "retrieve",
    })
    workflow.add_edge("rag_check", END)
    workflow.add_edge("retrieve", "rank")
    workflow.add_edge("rank", "present")
    workflow.add_edge("present", END)

    return workflow.compile()


# ── Agent class ────────────────────────────────────────────────────────────────

class JobSearchAgent(BaseAgent):
    agent_name = "job_search"

    def _build_graph(self):
        return _build_job_search_graph()

    def _initial_state(self, input_text: str, session: ConversationSession, **kw) -> dict:
        return {
            "user_query":      input_text,
            "laborer_uid":     session.user_uid,
            "laborer_gender":  kw.get("gender", "Any"),
            "laborer_location": kw.get("location", ""),
            "language":        session.language,
        }

    def _extract_response(self, final_state: dict) -> dict:
        return {
            "voice_summary": final_state.get("voice_summary", ""),
            "jobs":          (final_state.get("ranked_jobs") or [])[:3],
            "rag_answer":    final_state.get("rag_answer"),
            "filters":       final_state.get("filters", {}),
            "results_count": final_state.get("results_count", 0),
        }


job_search_agent = JobSearchAgent()
