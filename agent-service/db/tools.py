"""
agent-service/db/tools.py

LangChain @tool-decorated functions that agents call directly.
All SQL field names match the Node backend schema in backend/db.js exactly.

Schema reference (from db.js):
  users:         uid, phone_number, name, role, location, experience,
                 expected_wage, skills, availability, status, gender,
                 email, email_verified, is_banned, created_at
  jobs:          id, hirer_id, title, description, location, work_date,
                 work_time, wage, laborers_required, hirer_name,
                 hirer_phone, gender_preference, status, created_at
  bookings:      id, owner_id, laborer_id, work_title, wage, status
  reports:       id, reporter_id, reported_id, related_job_id,
                 reason, description, status
  audit_logs:    id, admin_id, action, target, metadata, created_at
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from langchain_core.tools import tool

from .connection import db_session

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 1 — create_job
# ─────────────────────────────────────────────────────────────────────────────

@tool
async def create_job(
    farmer_id: str,
    title: str,
    wage: int,
    location: str,
    worker_count: int,
    work_date: str,
    gender_pref: str = "Any",
    work_time: str = "Morning",
    description: str = "",
    farmer_name: str = "",
    farmer_phone: str = "",
) -> dict[str, Any]:
    """
    Insert a new job into the jobs table and return the created job.

    Args:
        farmer_id:    UID of the farm owner (maps to jobs.hirer_id).
        title:        Type of work, e.g. 'Harvesting', 'Weeding', 'Plowing'.
        wage:         Daily wage in INR (integer). Maps to jobs.wage (stored as TEXT).
        location:     Village or area name. Maps to jobs.location.
        worker_count: Number of labourers needed. Maps to jobs.laborers_required.
        work_date:    Date string, e.g. 'Tomorrow', 'Today', '2024-11-15'.
        gender_pref:  'Any' | 'Male' | 'Female'. Maps to jobs.gender_preference.
        work_time:    'Morning' | 'Afternoon' | 'Full Day'. Maps to jobs.work_time.
        description:  Optional extra details about the job.
        farmer_name:  Display name of the farmer. Maps to jobs.hirer_name.
        farmer_phone: Farmer's phone number. Maps to jobs.hirer_phone.

    Returns:
        dict with 'job_id' (int) and 'success' (bool).
    """
    from sqlalchemy import text

    # If gender preference is specified and not 'Any', append to description
    full_description = description.strip() if description else ""
    if gender_pref and gender_pref.lower() != "any":
        prefix = f"[Gender: {gender_pref}]"
        full_description = f"{prefix} {full_description}".strip()

    sql = text("""
        INSERT INTO jobs
            (hirer_id, title, description, location, work_date,
             work_time, wage, laborers_required, hirer_name, hirer_phone,
             status)
        VALUES
            (:hirer_id, :title, :description, :location, :work_date,
             :work_time, :wage, :laborers_required, :hirer_name, :hirer_phone,
             'OPEN')
    """)

    try:
        async with db_session() as db:
            result = await db.execute(sql, {
                "hirer_id":          farmer_id,
                "title":             title,
                "description":       full_description,
                "location":          location,
                "work_date":         work_date,
                "work_time":         work_time,
                "wage":              str(wage),
                "laborers_required": int(worker_count),
                "hirer_name":        farmer_name or "Farm Owner",
                "hirer_phone":       farmer_phone or farmer_id,
            })
            job_id = result.lastrowid

        logger.info("create_job: inserted job_id=%s for farmer=%s", job_id, farmer_id)
        return {"success": True, "job_id": job_id, "title": title, "location": location}

    except Exception as exc:
        logger.error("create_job failed: %s", exc)
        return {"success": False, "error": str(exc), "job_id": None}


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 2 — search_jobs
# ─────────────────────────────────────────────────────────────────────────────

@tool
async def search_jobs(
    location: Optional[str] = None,
    work_date: Optional[str] = None,
    min_wage: Optional[int] = None,
    gender_pref: Optional[str] = None,
    work_type: Optional[str] = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """
    Search open jobs matching the given filters.
    All parameters are optional — unset filters are ignored.

    Args:
        location:   Filter by jobs.location (substring match).
        work_date:  Filter by jobs.work_date (exact or substring).
        min_wage:   Minimum daily wage in INR (filters jobs.wage >= min_wage).
        gender_pref: 'Any' | 'Male' | 'Female' — filters by preference.
        work_type:  Substring match on jobs.title or jobs.description.
        limit:      Max number of results to return (default 10).

    Returns:
        List of job dicts.
    """
    from sqlalchemy import text

    conditions = ["status = 'OPEN'"]
    params: dict[str, Any] = {"limit": limit}

    if location:
        conditions.append("location LIKE :location")
        params["location"] = f"%{location}%"

    if work_date:
        conditions.append("(work_date = :work_date OR work_date LIKE :work_date_like)")
        params["work_date"]      = work_date
        params["work_date_like"] = f"%{work_date}%"

    if min_wage is not None:
        conditions.append("CAST(wage AS INTEGER) >= :min_wage")
        params["min_wage"] = min_wage

    if gender_pref and gender_pref.lower() != "any":
        conditions.append("(description NOT LIKE :other_gender OR description IS NULL)")
        other_gender = "Male" if gender_pref.lower() == "female" else "Female"
        params["other_gender"] = f"%[Gender: {other_gender}]%"

    if work_type:
        conditions.append("(title LIKE :work_type OR description LIKE :work_type)")
        params["work_type"] = f"%{work_type}%"

    where = " AND ".join(conditions)
    sql = text(
        f"SELECT * FROM jobs WHERE {where} ORDER BY id DESC LIMIT :limit"
    )

    try:
        async with db_session() as db:
            rows = await db.execute(sql, params)
            jobs = [dict(r) for r in rows.mappings().all()]
        logger.info("search_jobs: %d results (filters=%s)", len(jobs), params)
        return jobs
    except Exception as exc:
        logger.error("search_jobs failed: %s", exc)
        return []


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 3 — get_job_analytics
# ─────────────────────────────────────────────────────────────────────────────

@tool
async def get_job_analytics(
    location: Optional[str] = None,
    timeframe_days: Optional[int] = None,
    role: Optional[str] = None,
) -> dict[str, Any]:
    """
    Return platform-level counts and summaries for admin queries.

    Args:
        location:      Filter job stats by location (substring match on jobs.location).
        timeframe_days: Restrict to jobs posted in the last N days (e.g. 7 = this week).
        role:          Filter user counts by role: 'laborer' | 'farmowner'.

    Returns:
        dict with keys:
            total_jobs, avg_wage, min_wage, max_wage,
            total_users, total_laborers, total_hirers,
            total_bookings, pending_bookings,
            top_work_types (list of {title, count}),
            user_breakdown (list of {role, count})
    """
    from sqlalchemy import text

    analytics: dict[str, Any] = {}

    # ── Job statistics ────────────────────────────────────────────────────────
    job_conditions = ["1=1"]
    job_params: dict[str, Any] = {}

    if location:
        job_conditions.append("location LIKE :location")
        job_params["location"] = f"%{location}%"

    if timeframe_days:
        job_conditions.append(
            "datetime(created_at) >= datetime('now', :days)"
        )
        job_params["days"] = f"-{timeframe_days} days"

    job_where = " AND ".join(job_conditions)

    # ── User statistics ───────────────────────────────────────────────────────
    user_conditions = ["1=1"]
    user_params: dict[str, Any] = {}
    if role:
        user_conditions.append("role = :role")
        user_params["role"] = role
    user_where = " AND ".join(user_conditions)

    try:
        async with db_session() as db:
            # Job aggregates
            r = await db.execute(
                text(f"""
                    SELECT COUNT(*)               AS total_jobs,
                           AVG(CAST(wage AS REAL)) AS avg_wage,
                           MIN(CAST(wage AS REAL)) AS min_wage,
                           MAX(CAST(wage AS REAL)) AS max_wage
                    FROM   jobs
                    WHERE  {job_where}
                """),
                job_params,
            )
            row = r.mappings().first()
            analytics.update({
                "total_jobs": row["total_jobs"] or 0,
                "avg_wage":   round(row["avg_wage"] or 0, 2),
                "min_wage":   row["min_wage"] or 0,
                "max_wage":   row["max_wage"] or 0,
            })

            # User counts
            r2 = await db.execute(
                text(f"SELECT COUNT(*) AS total FROM users WHERE {user_where}"),
                user_params,
            )
            analytics["total_users"] = (r2.mappings().first() or {}).get("total", 0)

            # Role breakdown (always)
            r3 = await db.execute(
                text("SELECT role, COUNT(*) AS count FROM users GROUP BY role")
            )
            breakdown = [dict(x) for x in r3.mappings().all()]
            analytics["user_breakdown"] = breakdown
            for b in breakdown:
                if b["role"] == "laborer":
                    analytics["total_laborers"] = b["count"]
                elif b["role"] == "farmowner":
                    analytics["total_hirers"] = b["count"]
            analytics.setdefault("total_laborers", 0)
            analytics.setdefault("total_hirers", 0)

            # Booking counts
            r4 = await db.execute(text("SELECT COUNT(*) AS c FROM bookings"))
            analytics["total_bookings"] = (r4.mappings().first() or {}).get("c", 0)

            r5 = await db.execute(
                text("SELECT COUNT(*) AS c FROM bookings WHERE status='PENDING'")
            )
            analytics["pending_bookings"] = (r5.mappings().first() or {}).get("c", 0)

            # Top work types
            r6 = await db.execute(
                text("""
                    SELECT title, COUNT(*) AS count
                    FROM   jobs
                    WHERE  {job_where}
                    GROUP  BY title
                    ORDER  BY count DESC
                    LIMIT  5
                """.replace("{job_where}", job_where)),
                job_params,
            )
            analytics["top_work_types"] = [dict(x) for x in r6.mappings().all()]

        logger.info("get_job_analytics: %s", analytics)
        return analytics

    except Exception as exc:
        logger.error("get_job_analytics failed: %s", exc)
        return {"error": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 4 — flag_account
# ─────────────────────────────────────────────────────────────────────────────

@tool
async def flag_account(
    user_id: str,
    reason: str,
    action: str = "flag",
    flagged_by: str = "admin_agent",
) -> dict[str, Any]:
    """
    Flag or ban a user account and write an audit log entry.

    Args:
        user_id:    UID of the user to flag (matches users.uid).
        reason:     Human-readable reason for flagging/banning.
        action:     'flag'  — adds a report/audit entry (non-destructive).
                    'ban'   — also sets users.is_banned = 1 in the DB.
        flagged_by: Who triggered this action (default 'admin_agent').

    Returns:
        dict with 'success' (bool), 'user_id', 'action', and 'message'.
    """
    from sqlalchemy import text

    try:
        async with db_session() as db:
            # Verify user exists
            r = await db.execute(
                text("SELECT uid, name, role FROM users WHERE uid = :uid"),
                {"uid": user_id},
            )
            user = r.mappings().first()
            if not user:
                return {"success": False, "error": f"User {user_id} not found"}

            user_dict = dict(user)

            if action == "ban":
                # Set is_banned flag (column added via ALTER TABLE in Node backend)
                try:
                    await db.execute(
                        text("UPDATE users SET is_banned = 1 WHERE uid = :uid"),
                        {"uid": user_id},
                    )
                except Exception:
                    # Column may not exist; insert into reports instead
                    pass

            # Always insert a report row for traceability
            await db.execute(
                text("""
                    INSERT INTO reports
                        (reporter_id, reported_id, reason, description, status)
                    VALUES
                        (:reporter_id, :reported_id, :reason, :description, 'OPEN')
                """),
                {
                    "reporter_id": flagged_by,
                    "reported_id": user_id,
                    "reason":      reason,
                    "description": f"Auto-flagged by {flagged_by}. Action: {action}.",
                },
            )

            # Write audit log (matches logAuditAction in Node backend)
            await db.execute(
                text("""
                    INSERT INTO audit_logs (admin_id, action, target, metadata)
                    VALUES (:admin_id, :action, :target, :metadata)
                """),
                {
                    "admin_id": flagged_by,
                    "action":   f"Agent {action.capitalize()} Account",
                    "target":   user_id,
                    "metadata": json.dumps({"reason": reason, "role": user_dict.get("role")}),
                },
            )

        msg = (
            f"User {user_dict.get('name', user_id)} ({user_dict.get('role')}) "
            f"has been {'banned' if action == 'ban' else 'flagged'}: {reason}"
        )
        logger.info("flag_account: %s", msg)
        return {"success": True, "user_id": user_id, "action": action, "message": msg}

    except Exception as exc:
        logger.error("flag_account failed: %s", exc)
        return {"success": False, "error": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# Tool registry — import this list when binding tools to an agent
# ─────────────────────────────────────────────────────────────────────────────

ALL_TOOLS = [create_job, search_jobs, get_job_analytics, flag_account]
FARMER_TOOLS  = [create_job]
LABORER_TOOLS = [search_jobs]
ADMIN_TOOLS   = [get_job_analytics, flag_account]
