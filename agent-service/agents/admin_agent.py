"""
agent-service/agents/admin_agent.py

LangGraph admin query agent — 3 nodes:
  parse_query → route → summarize

Accepts natural-language queries like:
  "How many jobs posted this week in Tamil Nadu?"
  "Flag suspicious accounts"
  "Give me a full platform report"

Uses LangChain @tool calls (get_job_analytics, flag_account) for all DB access.
Returns (agent_reply, updated_state, done=True) — admin queries are single-turn.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Literal

from langgraph.graph import StateGraph, END, START
from typing_extensions import TypedDict

from agents.base import BaseAgent
from db.tools import get_job_analytics, flag_account
from sessions import ConversationSession

logger = logging.getLogger(__name__)

# ── State ──────────────────────────────────────────────────────────────────────

Category = Literal["analytics", "moderation", "report"]

class AdminQueryState(TypedDict):
    query_text:        str
    admin_uid:         str

    # parse_query output
    category:          str          # "analytics" | "moderation" | "report"
    extracted_entities: dict        # {location, timeframe_days, role, user_id, reason}

    # route output
    tool_result:       dict | None

    # summarize output
    final_answer:      str
    done:              bool


# ── Keyword tables ─────────────────────────────────────────────────────────────

MODERATION_KW = [
    "suspicious", "flag", "ban", "banned", "fraud", "unverified",
    "fake", "security", "account", "block", "report user",
]
REPORT_KW = [
    "report", "summary", "audit", "log", "overview", "export",
    "activity", "total", "breakdown", "platform",
]
LOCATION_LIST = [
    "tamil nadu", "karnataka", "andhra", "telangana", "salem",
    "madurai", "coimbatore", "chennai", "mysore", "bangalore",
    "erode", "trichy", "hyderabad", "vijayawada",
]


# ── Nodes ──────────────────────────────────────────────────────────────────────

async def parse_query_node(state: AdminQueryState) -> dict:
    """
    Classify query type and extract entities via keyword matching.
    (Intentionally no LLM here — keeps admin queries fast and deterministic.)
    """
    text = (state.get("query_text") or "").lower()
    entities: dict[str, Any] = {}

    # ── Classify ──────────────────────────────────────────────────────────────
    if any(kw in text for kw in MODERATION_KW):
        category: Category = "moderation"
    elif any(kw in text for kw in REPORT_KW):
        category = "report"
    else:
        category = "analytics"

    # ── Location ──────────────────────────────────────────────────────────────
    for loc in LOCATION_LIST:
        if loc in text:
            entities["location"] = loc
            break

    # ── Timeframe ─────────────────────────────────────────────────────────────
    if any(kw in text for kw in ["this week", "past week", "7 days", "last 7"]):
        entities["timeframe_days"] = 7
    elif any(kw in text for kw in ["today", "24 hours", "last 24"]):
        entities["timeframe_days"] = 1
    elif any(kw in text for kw in ["this month", "30 days", "last month"]):
        entities["timeframe_days"] = 30

    # ── Role ──────────────────────────────────────────────────────────────────
    if any(kw in text for kw in ["farmer", "owner", "hirer", "farm owner"]):
        entities["role"] = "farmowner"
    elif any(kw in text for kw in ["laborer", "labourer", "worker"]):
        entities["role"] = "laborer"

    # ── User ID for flag/ban commands ─────────────────────────────────────────
    uid_match = re.search(r"\buid[:\s]+([a-f0-9\-]{8,})\b", text)
    if uid_match:
        entities["user_id"] = uid_match.group(1)

    reason_match = re.search(r"(?:reason|because)[:\s]+(.+?)(?:\.|$)", text)
    if reason_match:
        entities["reason"] = reason_match.group(1).strip()

    return {"category": category, "extracted_entities": entities}


async def route_node(state: AdminQueryState) -> dict:
    """
    Dispatch to the right LangChain tool based on classification.
    """
    category = state.get("category", "analytics")
    entities = state.get("extracted_entities", {})

    tool_result: dict = {}

    try:
        if category == "moderation":
            user_id = entities.get("user_id")
            if user_id:
                # Direct flag command with a specific UID
                tool_result = await flag_account.ainvoke({
                    "user_id":    user_id,
                    "reason":     entities.get("reason", "Flagged by admin agent query"),
                    "action":     "flag",
                    "flagged_by": state.get("admin_uid", "admin_agent"),
                })
            else:
                # Return suspicious user list via analytics tool
                tool_result = await get_job_analytics.ainvoke({
                    "location":       entities.get("location"),
                    "timeframe_days": entities.get("timeframe_days"),
                    "role":           entities.get("role"),
                })
                tool_result["_mode"] = "suspicious_users"

        elif category == "report":
            tool_result = await get_job_analytics.ainvoke({
                "location":       entities.get("location"),
                "timeframe_days": entities.get("timeframe_days"),
                "role":           entities.get("role"),
            })
            tool_result["_mode"] = "full_report"

        else:  # analytics
            tool_result = await get_job_analytics.ainvoke({
                "location":       entities.get("location"),
                "timeframe_days": entities.get("timeframe_days"),
                "role":           entities.get("role"),
            })
            tool_result["_mode"] = "analytics"

    except Exception as exc:
        logger.error("route_node error: %s", exc)
        tool_result = {"error": str(exc)}

    return {"tool_result": tool_result}


async def summarize_node(state: AdminQueryState) -> dict:
    """
    Convert tool_result into a plain-language markdown answer.
    """
    category    = state.get("category", "analytics")
    entities    = state.get("extracted_entities", {})
    query_text  = state.get("query_text", "")
    result      = state.get("tool_result") or {}

    if result.get("error"):
        return {
            "final_answer": f"⚠️ Error running query: `{result['error']}`",
            "done": True,
        }

    answer = ""

    # ── Moderation ─────────────────────────────────────────────────────────────
    if category == "moderation":
        if result.get("success") is True:
            # flag_account was called
            answer = (
                f"### 🛡️ Moderation Action\n\n"
                f"{result.get('message', 'Action completed.')}\n\n"
                f"- **User ID**: `{result.get('user_id')}`\n"
                f"- **Action**: {result.get('action', 'flag').capitalize()}\n"
                f"- **Audit log**: Written ✅"
            )
        else:
            # Suspicious user summary from analytics
            total_users   = result.get("total_users", 0)
            banned        = result.get("banned_users", 0)
            unverified    = total_users - (result.get("total_laborers", 0) + result.get("total_hirers", 0))
            answer = (
                f"### 🛡️ Account Security Overview\n\n"
                f"- **Total Users**: {total_users}\n"
                f"- **Banned Accounts**: {banned}\n"
                f"- **Unclassified / Incomplete Profiles**: {max(0, unverified)}\n\n"
                f"To flag a specific account, run:\n"
                f"> *\"Flag account UID: [user-uid] reason: [reason]\"*"
            )

    # ── Report ─────────────────────────────────────────────────────────────────
    elif category == "report":
        wt = result.get("top_work_types", [])
        ub = result.get("user_breakdown", [])
        answer = (
            f"### 📊 Platform Activity Report\n\n"
            f"| Metric | Value |\n|:---|:---|\n"
            f"| Total Users | **{result.get('total_users', 0)}** |\n"
            f"| Total Laborers | **{result.get('total_laborers', 0)}** |\n"
            f"| Total Farm Owners | **{result.get('total_hirers', 0)}** |\n"
            f"| Total Jobs Posted | **{result.get('total_jobs', 0)}** |\n"
            f"| Avg Daily Wage | **₹{result.get('avg_wage', 0):.0f}** |\n"
            f"| Total Bookings | **{result.get('total_bookings', 0)}** |\n"
            f"| Pending Bookings | **{result.get('pending_bookings', 0)}** |\n"
        )
        if wt:
            answer += "\n**Top Work Types:**\n"
            for w in wt:
                answer += f"- {w.get('title', 'General')}: {w.get('count', 0)} jobs\n"

    # ── Analytics ──────────────────────────────────────────────────────────────
    else:
        loc_note  = f" in **{entities['location'].title()}**" if entities.get("location") else ""
        time_note = (
            f" in the past **{entities['timeframe_days']} days**"
            if entities.get("timeframe_days") else ""
        )
        wt = result.get("top_work_types", [])
        answer = (
            f"### 📈 Analytics: *\"{query_text}\"*\n\n"
            f"- **Jobs Posted{loc_note}{time_note}**: **{result.get('total_jobs', 0)}**\n"
        )
        if result.get("avg_wage"):
            answer += (
                f"- **Avg Daily Wage**: ₹{result['avg_wage']:.0f}/day  "
                f"*(range: ₹{result.get('min_wage', 0):.0f} – ₹{result.get('max_wage', 0):.0f})*\n"
            )
        answer += (
            f"- **Total Laborers**: {result.get('total_laborers', 0)}\n"
            f"- **Total Farm Owners**: {result.get('total_hirers', 0)}\n"
        )
        if wt:
            answer += "\n**Most Demanded Work Types:**\n"
            for w in wt:
                answer += f"- {w.get('title', 'General')}: {w.get('count', 0)} postings\n"

    return {"final_answer": answer, "done": True}


# ── Graph ──────────────────────────────────────────────────────────────────────

def _build_admin_graph():
    workflow = StateGraph(AdminQueryState)
    workflow.add_node("parse_query", parse_query_node)
    workflow.add_node("route",       route_node)
    workflow.add_node("summarize",   summarize_node)

    workflow.add_edge(START,        "parse_query")
    workflow.add_edge("parse_query", "route")
    workflow.add_edge("route",       "summarize")
    workflow.add_edge("summarize",   END)

    return workflow.compile()


# ── Agent class ────────────────────────────────────────────────────────────────

class AdminQueryAgent(BaseAgent):
    agent_name = "admin_query"

    def _build_graph(self):
        return _build_admin_graph()

    def _initial_state(
        self,
        input_text: str,
        session: ConversationSession,
        **kw: Any,
    ) -> dict:
        return {
            "query_text": input_text,
            "admin_uid":  session.user_uid,
        }

    def _extract_response(self, final_state: dict) -> dict:
        return {
            "reply":    final_state.get("final_answer", ""),
            "done":     True,                   # admin queries are always single-turn
            "category": final_state.get("category"),
            "entities": final_state.get("extracted_entities", {}),
            "data":     final_state.get("tool_result"),
        }


admin_query_agent = AdminQueryAgent()
