"""
backend/agents/job_search_agent.py

LangGraph agent: natural language job search for laborers + ChromaDB RAG for legal rights & schemes.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from langgraph.graph import StateGraph, START, END
from typing_extensions import TypedDict
from database import query, get_one
from sessions import get_session_store

logger = logging.getLogger("job_search_agent")

RAG_KEYWORDS = [
    "fair", "minimum wage", "is this wage", "legal", "rights", "enough", "scheme", "insurance", "pension", "dispute", "helpline",
    "நியாயமானதா", "குறைந்தபட்ச கூலி", "திட்டம்", "உரிமை",
    "उचित", "न्यूनतम मजदूरी", "योजना", "अधिकार",
]


class JobSearchState(TypedDict):
    user_query: str
    laborer_uid: str
    laborer_gender: str
    laborer_location: str
    language: str

    filters: dict
    retrieved_jobs: list[dict]
    ranked_jobs: list[dict]
    schemes: list[dict]
    rights: list[dict]
    voice_summary: str


async def parse_intent_node(state: JobSearchState) -> dict:
    text = (state.get("user_query") or "").lower()
    filters = {
        "work_type": None,
        "min_wage": None,
        "location": state.get("laborer_location") or None,
        "date": "Tomorrow",
        "gender": state.get("laborer_gender", "Any"),
        "is_rag_question": any(kw in text for kw in RAG_KEYWORDS),
    }

    # Work type mapping
    work_map = {
        "Harvesting": ["harvest", "அறுவடை", "कटाई", "களத்துமேடு"],
        "Weeding": ["weed", "களை", "निराई"],
        "Plowing": ["plow", "plough", "tractor", "உழவு", "உழு", "जुताई"],
        "Spraying": ["spray", "pesticide", "மருந்து", "छिड़काव"],
        "Sowing": ["sow", "plant", "நாற்று", "விதைப்பு", "बुवाई"],
    }
    for wtype, kws in work_map.items():
        if any(kw in text for kw in kws):
            filters["work_type"] = wtype
            break

    # Wage matching
    wage_match = re.search(r"(\d{3,4})", text)
    if wage_match:
        filters["min_wage"] = int(wage_match.group(1))

    if any(kw in text for kw in ["today", "urgent", "இன்று", "आज"]):
        filters["date"] = "Today"
    elif any(kw in text for kw in ["tomorrow", "நாளை", "कल"]):
        filters["date"] = "Tomorrow"

    return {"filters": filters}


async def retrieve_and_rag_node(state: JobSearchState) -> dict:
    filters = state.get("filters", {})
    l_uid = state.get("laborer_uid", "")
    query_text = state.get("user_query", "")

    # Retrieve jobs from SQLite
    jobs = await query(
        """
        SELECT * FROM jobs 
        WHERE status = 'OPEN' 
          AND id NOT IN (SELECT job_id FROM job_rejections WHERE laborer_id = :uid)
        ORDER BY id DESC LIMIT 20
        """,
        {"uid": l_uid},
    )

    formatted_jobs = []
    for job in jobs:
        cnt_row = await get_one("SELECT COUNT(*) as cnt FROM job_acceptances WHERE job_id = :jid", {"jid": job["id"]})
        accepted_cnt = cnt_row["cnt"] if cnt_row else 0
        if accepted_cnt < job["laborers_required"]:
            formatted_jobs.append({
                "id": job["id"],
                "title": job["title"],
                "ownerName": job.get("hirer_name") or "Farm Owner",
                "ownerPhone": job.get("hirer_phone"),
                "location": job["location"],
                "wage": job["wage"],
                "workDate": job["work_date"],
                "workTime": job["work_time"],
                "laborersRequired": job["laborers_required"],
                "acceptedCount": accepted_cnt,
            })

    # Filter according to extracted intent
    ranked = []
    for j in formatted_jobs:
        score = 0
        if filters.get("work_type") and filters["work_type"].lower() in j["title"].lower():
            score += 10
        if filters.get("min_wage"):
            try:
                if int(re.sub(r"\D", "", str(j["wage"]))) >= filters["min_wage"]:
                    score += 5
            except Exception:
                pass
        if filters.get("location") and filters["location"].lower() in j["location"].lower():
            score += 3
        j["_score"] = score
        ranked.append(j)

    ranked.sort(key=lambda x: x.get("_score", 0), reverse=True)

    # RAG lookup from ChromaDB or built-in fallback
    rights_list = []
    schemes_list = []

    try:
        from rag.chroma_client import search_knowledge
        rag_hits = await search_knowledge(query_text or "minimum wage agricultural rights", n_results=3)
        for doc in rag_hits:
            cat = doc.get("metadata", {}).get("category", "")
            item = {
                "id": doc.get("id"),
                "title": doc.get("metadata", {}).get("state", "Labour Rights") + " Advisory",
                "details": doc.get("text"),
                "category": cat,
            }
            if "scheme" in cat or "pm" in doc.get("text", "").lower():
                schemes_list.append(item)
            else:
                rights_list.append(item)
    except Exception as e:
        logger.debug("ChromaDB search fallback: %s", e)
        rights_list.append({
            "title": "Agricultural Minimum Wage Advisory",
            "details": "Statutory minimum farm wages: ₹400 - ₹550 / day. Equal remuneration is legally mandated.",
        })
        schemes_list.append({
            "title": "PM-KMY Pension Scheme",
            "details": "Assured ₹3,000/month pension for agricultural labourers and small landholders after age 60.",
        })

    # Build multilingual summary
    lang = state.get("language", "en")
    count = len(ranked)
    if lang == "ta":
        summary = f"உங்களுக்காக {count} பண்ணை வேலை வாய்ப்புகள் கண்டறியப்பட்டுள்ளன."
    elif lang == "hi":
        summary = f"आपके लिए {count} कृषि कार्य उपलब्ध हैं।"
    else:
        summary = f"Found {count} available farm work alerts matching your search."

    return {
        "retrieved_jobs": formatted_jobs,
        "ranked_jobs": ranked,
        "rights": rights_list,
        "schemes": schemes_list,
        "voice_summary": summary,
    }


def _build_job_search_graph():
    wf = StateGraph(JobSearchState)
    wf.add_node("parse_intent", parse_intent_node)
    wf.add_node("retrieve_and_rag", retrieve_and_rag_node)

    wf.add_edge(START, "parse_intent")
    wf.add_edge("parse_intent", "retrieve_and_rag")
    wf.add_edge("retrieve_and_rag", END)
    return wf.compile()


class JobSearchAgent:
    def __init__(self):
        self.graph = _build_job_search_graph()

    async def run(
        self,
        session_id: str,
        user_input: str,
        laborer_uid: str,
        gender: str = "Any",
        location: str = "",
        language: str = "en",
    ) -> dict[str, Any]:
        store = get_session_store()
        session = await store.get(session_id)
        if session is None:
            session = await store.create_session(session_id, "job_search", laborer_uid, language)

        state = {
            "user_query": user_input,
            "laborer_uid": laborer_uid,
            "laborer_gender": gender,
            "laborer_location": location,
            "language": language,
            "filters": {},
            "retrieved_jobs": [],
            "ranked_jobs": [],
            "schemes": [],
            "rights": [],
            "voice_summary": "",
        }

        final_state = await self.graph.ainvoke(state)
        session.state = dict(final_state)
        session.touch()
        await store.set(session)

        return {
            "reply": final_state.get("voice_summary", ""),
            "jobs": final_state.get("ranked_jobs", []),
            "schemes": final_state.get("schemes", []),
            "rights": final_state.get("rights", []),
            "extracted_criteria": final_state.get("filters", {}),
        }


_search_agent_instance = None


def get_job_search_agent() -> JobSearchAgent:
    global _search_agent_instance
    if _search_agent_instance is None:
        _search_agent_instance = JobSearchAgent()
    return _search_agent_instance
