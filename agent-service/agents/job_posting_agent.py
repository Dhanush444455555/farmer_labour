"""
agent-service/agents/job_posting_agent.py

LangGraph agent: conversational job posting for farmers.

Nodes (mirrors Node backend jobPostingGraph.js):
  collect_info  →  validate  →  confirm  →  submit

State is persisted in the session store across HTTP turns so the farmer
can answer one question per request (voice or text).
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from typing_extensions import Annotated, TypedDict

from agents.base import BaseAgent
from agents.llm import get_llm
from sessions import ConversationSession

logger = logging.getLogger(__name__)

# ── State schema ───────────────────────────────────────────────────────────────

class JobPostingState(TypedDict):
    user_input:       str
    hirer_uid:        str
    hirer_name:       str
    hirer_phone:      str
    language:         str

    # Collected fields
    title:            str | None
    location:         str | None
    work_date:        str | None
    work_time:        str | None
    wage:             str | None
    worker_count:     int | None
    gender_preference: str | None
    description:      str | None

    # Agent control
    next_question:    str          # The question to ask the user next
    all_fields_valid: bool
    awaiting_confirm: bool
    confirmed:        bool
    submitted_job_id: int | None
    response_text:    str          # Final text returned to the user


# ── Nodes ──────────────────────────────────────────────────────────────────────

REQUIRED_FIELDS = ["title", "location", "work_date", "wage", "worker_count"]


async def collect_info_node(state: JobPostingState) -> dict:
    """
    Parse the user's free-text input and extract job fields using the LLM.
    Asks the next missing field as a question.
    """
    llm = get_llm()
    lang = state.get("language", "en")
    user_input = state.get("user_input", "")

    system_prompt = f"""You are a helpful assistant for farmers in India.
The user is speaking in language code: {lang}.
Extract any job posting information from the user's input and return ONLY a JSON object with these fields
(use null for missing fields):
{{
  "title": "type of farm work (e.g. Harvesting, Weeding, Plowing)",
  "location": "village or area name",
  "work_date": "Tomorrow / Today / specific date",
  "work_time": "Morning / Afternoon / Full Day",
  "wage": "daily wage in rupees as a number",
  "worker_count": "number of workers needed as integer",
  "gender_preference": "Any / Male / Female",
  "description": "optional extra details"
}}
Return ONLY the JSON. No explanation."""

    try:
        resp = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_input or "start"),
        ])
        import json, re
        json_match = re.search(r'\{.*\}', resp.content, re.DOTALL)
        extracted = json.loads(json_match.group()) if json_match else {}
    except Exception as exc:
        logger.warning("collect_info LLM parse error: %s", exc)
        extracted = {}

    # Merge extracted into state (don't overwrite already-collected fields with null)
    updates: dict[str, Any] = {}
    for field in ["title", "location", "work_date", "work_time", "wage",
                  "worker_count", "gender_preference", "description"]:
        val = extracted.get(field)
        if val is not None and not state.get(field):
            updates[field] = val

    return updates


async def validate_node(state: JobPostingState) -> dict:
    """Check for missing required fields and set next_question."""
    lang = state.get("language", "en")

    QUESTIONS = {
        "en": {
            "title":        "🌾 What type of work do you need? (Harvesting / Weeding / Plowing / Other)",
            "location":     "📍 Where is the farm located? (Village / Town name)",
            "work_date":    "📅 When do you need workers? (Today / Tomorrow / specific date)",
            "wage":         "💰 How much will you pay per day? (in ₹)",
            "worker_count": "👥 How many workers do you need?",
        },
        "ta": {
            "title":        "🌾 என்ன வேலை தேவை? (அறுவடை / களை / உழவு / மற்றவை)",
            "location":     "📍 பண்ணை எங்கு உள்ளது?",
            "work_date":    "📅 எப்போது தொழிலாளர்கள் வேண்டும்?",
            "wage":         "💰 நாளொன்றுக்கு எவ்வளவு கூலி? (₹)",
            "worker_count": "👥 எத்தனை பேர் வேண்டும்?",
        },
        "hi": {
            "title":        "🌾 किस प्रकार का काम चाहिए?",
            "location":     "📍 खेत कहाँ है?",
            "work_date":    "📅 कब मजदूर चाहिए?",
            "wage":         "💰 रोज का वेतन कितना? (₹ में)",
            "worker_count": "👥 कितने मजदूर चाहिए?",
        },
    }
    q = QUESTIONS.get(lang, QUESTIONS["en"])

    for fld in REQUIRED_FIELDS:
        if not state.get(fld):
            return {"all_fields_valid": False, "next_question": q.get(fld, f"Please provide: {fld}")}

    return {"all_fields_valid": True, "next_question": ""}


async def confirm_node(state: JobPostingState) -> dict:
    """Read back the collected job in plain language and ask for confirmation."""
    lang = state.get("language", "en")

    if lang == "ta":
        text = (
            f"✅ உங்கள் வேலை விவரங்கள்:\n"
            f"வேலை: {state.get('title')}\n"
            f"இடம்: {state.get('location')}\n"
            f"தேதி: {state.get('work_date')}\n"
            f"கூலி: ₹{state.get('wage')}/நாள்\n"
            f"தொழிலாளர்கள்: {state.get('worker_count')} பேர்\n\n"
            f"சரியா? 'ஆம்' என்று சொல்லவும்."
        )
    elif lang == "hi":
        text = (
            f"✅ आपके काम की जानकारी:\n"
            f"काम: {state.get('title')}\n"
            f"जगह: {state.get('location')}\n"
            f"तारीख: {state.get('work_date')}\n"
            f"वेतन: ₹{state.get('wage')}/दिन\n"
            f"मजदूर: {state.get('worker_count')}\n\n"
            f"क्या यह सही है? 'हाँ' कहें।"
        )
    else:
        text = (
            f"✅ Here's your job summary:\n"
            f"Work: {state.get('title')}\n"
            f"Location: {state.get('location')}\n"
            f"Date: {state.get('work_date')}\n"
            f"Wage: ₹{state.get('wage')}/day\n"
            f"Workers needed: {state.get('worker_count')}\n\n"
            f"Is this correct? Reply 'yes' to post."
        )

    return {"awaiting_confirm": True, "response_text": text}


async def submit_node(state: JobPostingState) -> dict:
    """Write the job to the database."""
    from db import db_session, DBQueries

    job_data = {
        "hirer_id":          state.get("hirer_uid", ""),
        "hirer_name":        state.get("hirer_name", ""),
        "hirer_phone":       state.get("hirer_phone", ""),
        "title":             state.get("title", "Farm Work"),
        "location":          state.get("location", ""),
        "work_date":         state.get("work_date", "Tomorrow"),
        "work_time":         state.get("work_time", "Morning"),
        "wage":              state.get("wage", ""),
        "worker_count":      state.get("worker_count", 1),
        "gender_preference": state.get("gender_preference", "Any"),
        "description":       state.get("description", ""),
    }

    lang = state.get("language", "en")
    success_msgs = {
        "en": "🎉 Job posted! Workers nearby will be notified.",
        "ta": "🎉 வேலை பதிவிடப்பட்டது! அருகில் உள்ள தொழிலாளர்களுக்கு தகவல் அனுப்பப்படும்.",
        "hi": "🎉 काम पोस्ट हो गया! पास के मजदूरों को सूचना मिलेगी।",
    }

    try:
        async with db_session() as db:
            job_id = await DBQueries.insert_job(db, job_data)
        return {
            "submitted_job_id": job_id,
            "response_text": success_msgs.get(lang, success_msgs["en"]),
        }
    except Exception as exc:
        logger.error("submit_node DB error: %s", exc)
        return {
            "submitted_job_id": None,
            "response_text": f"⚠️ Failed to post job: {exc}",
        }


# ── Graph wiring ───────────────────────────────────────────────────────────────

def _route_after_validate(state: JobPostingState) -> str:
    if not state.get("all_fields_valid"):
        return "ask_question"
    if state.get("awaiting_confirm") and not state.get("confirmed"):
        return "confirm"
    if state.get("confirmed"):
        return "submit"
    return "confirm"


def _build_job_posting_graph():
    workflow = StateGraph(JobPostingState)

    workflow.add_node("collect_info", collect_info_node)
    workflow.add_node("validate", validate_node)
    workflow.add_node("confirm", confirm_node)
    workflow.add_node("submit", submit_node)

    # ask_question is a pass-through that returns the next_question as response_text
    async def ask_question_node(state):
        return {"response_text": state.get("next_question", "Please provide more details.")}

    workflow.add_node("ask_question", ask_question_node)

    workflow.add_edge(START, "collect_info")
    workflow.add_edge("collect_info", "validate")
    workflow.add_conditional_edges("validate", _route_after_validate)
    workflow.add_edge("ask_question", END)
    workflow.add_edge("confirm", END)
    workflow.add_edge("submit", END)

    return workflow.compile()


# ── Agent class ────────────────────────────────────────────────────────────────

class JobPostingAgent(BaseAgent):
    agent_name = "job_posting"

    def _build_graph(self):
        return _build_job_posting_graph()

    def _initial_state(
        self,
        input_text: str,
        session: ConversationSession,
        **kwargs: Any,
    ) -> dict:
        # Merge persisted state + new user input
        state = dict(session.state)
        state["user_input"] = input_text
        state["language"]   = session.language
        state.setdefault("hirer_uid",   session.user_uid)
        state.setdefault("hirer_name",  kwargs.get("hirer_name", ""))
        state.setdefault("hirer_phone", kwargs.get("hirer_phone", ""))

        # Handle confirmation turn
        confirm_words = ["yes", "ஆம்", "हाँ", "ha", "confirm", "ok", "சரி", "ठीक"]
        if any(w in input_text.lower() for w in confirm_words):
            state["confirmed"] = True

        return state

    def _extract_response(self, final_state: dict) -> dict:
        return {
            "response":      final_state.get("response_text", ""),
            "job_submitted": final_state.get("submitted_job_id") is not None,
            "job_id":        final_state.get("submitted_job_id"),
            "fields":        {
                k: final_state.get(k)
                for k in ["title", "location", "work_date", "wage", "worker_count"]
            },
        }


# Singleton
job_posting_agent = JobPostingAgent()
