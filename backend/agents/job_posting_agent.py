"""
backend/agents/job_posting_agent.py

LangGraph conversational multi-turn Job Posting Agent for Farmers.
Extracts workType, location, wage, worker_count, date via LLM + heuristic fallback.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langchain_core.messages import HumanMessage, SystemMessage

from agents.base import BaseAgent
from agents.llm import get_llm
from sessions import ConversationSession, get_session_store
from database import run, get_one

logger = logging.getLogger("job_posting_agent")

REQUIRED_FIELDS = ["title", "location", "work_date", "wage", "worker_count"]


class JobPostingState(TypedDict):
    user_input: str
    hirer_uid: str
    hirer_name: str
    hirer_phone: str
    language: str

    title: str | None
    location: str | None
    work_date: str | None
    work_time: str | None
    wage: str | None
    worker_count: int | None
    gender_preference: str | None
    description: str | None

    stage: str
    next_question: str
    all_fields_valid: bool
    awaiting_confirm: bool
    confirmed: bool
    submitted_job_id: int | None
    response_text: str
    missing_field: str | None
    confirmation_summary: str | None


def _heuristic_extract(text: str) -> dict[str, Any]:
    extracted: dict[str, Any] = {}
    lower = text.lower()

    # Work title / type
    work_types = [
        ("harvesting", "Harvesting"),
        ("harvest", "Harvesting"),
        ("weeding", "Weeding"),
        ("weed", "Weeding"),
        ("plowing", "Plowing"),
        ("ploughing", "Plowing"),
        ("sowing", "Sowing"),
        ("seeding", "Sowing"),
        ("planting", "Planting"),
        ("irrigation", "Irrigation"),
        ("watering", "Irrigation"),
        ("spraying", "Pesticide Spraying"),
        ("pesticide", "Pesticide Spraying"),
        ("fertilizer", "Fertilizing"),
        ("loading", "Loading / Transport"),
        ("அறுவடை", "Harvesting"),
        ("களை", "Weeding"),
        ("உழவு", "Plowing"),
        ("कटाई", "Harvesting"),
        ("निराई", "Weeding"),
        ("जुताई", "Plowing"),
    ]
    for pattern, label in work_types:
        if pattern in lower:
            extracted["title"] = label
            break

    # Wage detection (e.g. 500 rs, 600 rupees, ₹550, 500)
    wage_match = re.search(r'(?:₹|rs\.?|rupees|கூலி|रुपये)?\s*([3-9]\d{2}|1\d{3})\s*(?:₹|rs\.?|rupees|per day|day|நாள்|दिन)?', lower)
    if wage_match:
        extracted["wage"] = wage_match.group(1)

    # Worker count (e.g. 3 workers, 5 people, 2 laborers, 4 பேர்)
    count_match = re.search(r'(\d+)\s*(?:workers?|laborers?|labourers?|people|persons?|men|women|பேர்|मजदूर|लोग)?', lower)
    if count_match:
        val = int(count_match.group(1))
        if 1 <= val <= 100 and (not extracted.get("wage") or str(val) != extracted.get("wage")):
            extracted["worker_count"] = val

    # Date
    if any(k in lower for k in ["tomorrow", "நாளை", "कल"]):
        extracted["work_date"] = "Tomorrow"
    elif any(k in lower for k in ["today", "இன்று", "आज"]):
        extracted["work_date"] = "Today"

    # Time
    if any(k in lower for k in ["morning", "காலை", "सुबह"]):
        extracted["work_time"] = "Morning (7:00 AM - 1:00 PM)"
    elif any(k in lower for k in ["afternoon", "மதியம்", "दोपहर"]):
        extracted["work_time"] = "Afternoon (1:00 PM - 6:00 PM)"
    elif any(k in lower for k in ["full day", "day", "முழு நாள்", "पूरा दिन"]):
        extracted["work_time"] = "Full Day (7:00 AM - 5:00 PM)"

    return extracted


async def collect_info_node(state: JobPostingState) -> dict:
    user_input = (state.get("user_input") or "").strip()
    lang = state.get("language", "en")
    extracted: dict[str, Any] = {}

    if user_input and user_input.lower() not in ("start", "hello", "hi", "confirm", "yes"):
        # First try heuristic
        extracted = _heuristic_extract(user_input)

        # Then try LLM if available
        try:
            llm = get_llm()
            if llm:
                prompt = (
                    f"You are an assistant for Indian farmers.\n"
                    f"Extract job details from this text (language: {lang}): \"{user_input}\"\n"
                    f"Return ONLY valid JSON with keys: title, location, work_date, work_time, wage, worker_count, gender_preference, description.\n"
                    f"Use null for unmentioned keys."
                )
                resp = await llm.ainvoke([SystemMessage(content=prompt), HumanMessage(content=user_input)])
                match = re.search(r'\{.*\}', resp.content, re.DOTALL)
                if match:
                    llm_data = json.loads(match.group())
                    for k, v in llm_data.items():
                        if v is not None and not extracted.get(k):
                            extracted[k] = v
        except Exception as err:
            logger.debug("LLM extraction fallback to heuristic: %s", err)

    updates: dict[str, Any] = {}
    for f in ["title", "location", "work_date", "work_time", "wage", "worker_count", "gender_preference", "description"]:
        val = extracted.get(f)
        if val is not None:
            updates[f] = val

    return updates


async def validate_node(state: JobPostingState) -> dict:
    lang = state.get("language", "en")
    questions = {
        "en": {
            "title": "🌾 What type of work do you need? (Harvesting / Weeding / Plowing / Sowing)",
            "location": "📍 Where is your farm located? (e.g., Village or Town name)",
            "work_date": "📅 When is the work scheduled? (Today / Tomorrow / specific date)",
            "wage": "💰 What is the daily wage per worker in ₹? (e.g. 500)",
            "worker_count": "👥 How many workers do you need?",
        },
        "ta": {
            "title": "🌾 என்ன வேலை தேவை? (அறுவடை / களை / உழவு / விதைப்பு)",
            "location": "📍 உங்கள் பண்ணை எங்கு உள்ளது?",
            "work_date": "📅 எப்போது வேலை வேண்டும்? (நாளை / இன்று)",
            "wage": "💰 ஒரு தொழிலாளிக்கு நாளொன்றுக்கு கூலி எவ்வளவு? (₹)",
            "worker_count": "👥 எத்தனை தொழிலாளர்கள் தேவை?",
        },
        "hi": {
            "title": "🌾 किस प्रकार का कृषि कार्य है? (कटाई / निराई / जुताई)",
            "location": "📍 आपका खेत किस गाँव/क्षेत्र में है?",
            "work_date": "📅 काम कब से है? (कल / आज)",
            "wage": "💰 प्रति मजदूर दैनिक वेतन कितना है? (₹)",
            "worker_count": "👥 कितने मजदूरों की आवश्यकता है?",
        },
    }
    q_map = questions.get(lang, questions["en"])

    for fld in REQUIRED_FIELDS:
        if not state.get(fld):
            return {
                "all_fields_valid": False,
                "stage": "collect_info",
                "missing_field": fld,
                "next_question": q_map.get(fld, f"Please provide {fld}"),
                "response_text": q_map.get(fld, f"Please provide {fld}"),
            }

    return {
        "all_fields_valid": True,
        "missing_field": None,
        "next_question": "",
    }


async def confirm_node(state: JobPostingState) -> dict:
    lang = state.get("language", "en")
    summary = (
        f"Work: {state.get('title')} | Workers: {state.get('worker_count')} | "
        f"Wage: ₹{state.get('wage')}/day | Date: {state.get('work_date')} | Location: {state.get('location')}"
    )

    prompts = {
        "en": f"✅ Please confirm your job alert:\n\n{summary}\n\nSay 'Yes' or click Confirm to broadcast to laborers.",
        "ta": f"✅ உங்கள் வேலை அறிவிப்பை உறுதிப்படுத்தவும்:\n\n{summary}\n\nஉறுதி செய்ய 'ஆம்' என்று சொல்லவும் அல்லது உறுதி பொத்தானை அழுத்தவும்.",
        "hi": f"✅ कृपया अपने कार्य विवरण की पुष्टि करें:\n\n{summary}\n\nपुष्टि के लिए 'हाँ' कहें या कन्फर्म दबाएँ।",
    }

    return {
        "stage": "confirm",
        "awaiting_confirm": True,
        "confirmation_summary": summary,
        "response_text": prompts.get(lang, prompts["en"]),
    }


async def submit_node(state: JobPostingState) -> dict:
    h_uid = state.get("hirer_uid", "")
    h_name = state.get("hirer_name", "Farm Owner")
    h_phone = state.get("hirer_phone", h_uid)

    try:
        await run(
            """
            INSERT INTO jobs (hirer_id, title, description, location, work_date, work_time, wage, laborers_required, hirer_name, hirer_phone, status)
            VALUES (:hid, :title, :desc, :loc, :wdate, :wtime, :wage, :req, :hname, :hphone, 'OPEN')
            """,
            {
                "hid": h_uid,
                "title": state.get("title", "Farm Work"),
                "desc": state.get("description") or "",
                "loc": state.get("location", ""),
                "wdate": state.get("work_date", "Tomorrow"),
                "wtime": state.get("work_time", "Morning"),
                "wage": str(state.get("wage", "")),
                "req": int(state.get("worker_count", 1)),
                "hname": h_name,
                "hphone": h_phone,
            },
        )

        created = await get_one("SELECT id FROM jobs WHERE hirer_id = :hid ORDER BY id DESC LIMIT 1", {"hid": h_uid})
        job_id = created["id"] if created else None

        lang = state.get("language", "en")
        msgs = {
            "en": "🎉 Work alert successfully posted! Laborers nearby have been notified.",
            "ta": "🎉 வேலை அறிவிப்பு வெற்றிகரமாக வெளியிடப்பட்டது! தொழிலாளர்களுக்கு அறிவிக்கப்பட்டுள்ளது.",
            "hi": "🎉 काम सफलतापूर्वक पोस्ट किया गया! आसपास के मजदूरों को सूचना भेज दी गई है।",
        }

        return {
            "stage": "completed",
            "submitted_job_id": job_id,
            "response_text": msgs.get(lang, msgs["en"]),
        }
    except Exception as exc:
        logger.error("Job submit error: %s", exc)
        return {
            "stage": "confirm",
            "submitted_job_id": None,
            "response_text": f"⚠️ Failed to post job: {exc}",
        }


def _route_after_validate(state: JobPostingState) -> str:
    if not state.get("all_fields_valid"):
        return "ask_question"
    if state.get("confirmed"):
        return "submit"
    return "confirm"


def _build_job_posting_graph():
    workflow = StateGraph(JobPostingState)
    workflow.add_node("collect_info", collect_info_node)
    workflow.add_node("validate", validate_node)
    workflow.add_node("confirm", confirm_node)
    workflow.add_node("submit", submit_node)

    async def ask_question_node(state: JobPostingState):
        return {"response_text": state.get("next_question", "Please provide more details.")}

    workflow.add_node("ask_question", ask_question_node)

    workflow.add_edge(START, "collect_info")
    workflow.add_edge("collect_info", "validate")
    workflow.add_conditional_edges("validate", _route_after_validate)
    workflow.add_edge("ask_question", END)
    workflow.add_edge("confirm", END)
    workflow.add_edge("submit", END)

    return workflow.compile()


class JobPostingAgent:
    def __init__(self):
        self.graph = _build_job_posting_graph()

    async def run(
        self,
        session_id: str,
        user_input: str,
        hirer_uid: str,
        hirer_name: str = "",
        hirer_phone: str = "",
        language: str = "en",
    ) -> dict[str, Any]:
        store = get_session_store()
        session = await store.get(session_id)
        if session is None:
            session = await store.create_session(session_id, "job_posting", hirer_uid, language)

        state: dict[str, Any] = dict(session.state)
        state["user_input"] = user_input
        state["language"] = language
        state["hirer_uid"] = hirer_uid
        state["hirer_name"] = hirer_name or state.get("hirer_name", "")
        state["hirer_phone"] = hirer_phone or state.get("hirer_phone", "")

        confirm_tokens = ["yes", "confirm", "ஆம்", "சரி", "हाँ", "ha", "theek", "ok"]
        if any(tok in user_input.lower() for tok in confirm_tokens):
            if state.get("all_fields_valid"):
                state["confirmed"] = True

        final_state = await self.graph.ainvoke(state)
        session.state = dict(final_state)
        session.touch()
        await store.set(session)

        is_sub = final_state.get("stage") == "completed" and final_state.get("submitted_job_id") is not None
        if is_sub:
            await store.delete(session_id)

        return {
            "stage": final_state.get("stage", "collect_info"),
            "bot_message": final_state.get("response_text", ""),
            "missing_field": final_state.get("missing_field"),
            "confirmation_summary": final_state.get("confirmation_summary"),
            "is_submitted": is_sub,
            "created_job_id": final_state.get("submitted_job_id"),
            "job_state": {
                "title": final_state.get("title"),
                "worker_count": final_state.get("worker_count"),
                "wage": final_state.get("wage"),
                "location": final_state.get("location"),
                "gender_preference": final_state.get("gender_preference"),
                "work_date": final_state.get("work_date"),
                "work_time": final_state.get("work_time"),
            },
        }


_agent_instance = None


def get_job_posting_agent() -> JobPostingAgent:
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = JobPostingAgent()
    return _agent_instance
