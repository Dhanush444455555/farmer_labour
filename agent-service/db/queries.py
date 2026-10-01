"""
agent-service/db/queries.py

Shared, reusable async DB queries used across all agents.
Mirrors the tables created by the Node backend's db.js:
    users, jobs, job_acceptances, job_rejections, bookings,
    notifications, audit_logs, cms_content, platform_settings

All methods accept an AsyncSession and return plain dicts / lists of dicts
so they are easy to pass through LangGraph state objects.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class DBQueries:
    """
    Namespace for all shared queries.

    Usage::

        from db import get_db, DBQueries
        db: AsyncSession = Depends(get_db)
        jobs = await DBQueries.get_open_jobs(db)
    """

    # ── Users ──────────────────────────────────────────────────────────────────

    @staticmethod
    async def get_user_by_uid(db: AsyncSession, uid: str) -> dict | None:
        row = await db.execute(
            text("SELECT * FROM users WHERE uid = :uid"), {"uid": uid}
        )
        r = row.mappings().first()
        return dict(r) if r else None

    @staticmethod
    async def get_users(
        db: AsyncSession,
        role: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        if role:
            rows = await db.execute(
                text("SELECT * FROM users WHERE role = :role ORDER BY id DESC LIMIT :limit"),
                {"role": role, "limit": limit},
            )
        else:
            rows = await db.execute(
                text("SELECT * FROM users ORDER BY id DESC LIMIT :limit"),
                {"limit": limit},
            )
        return [dict(r) for r in rows.mappings().all()]

    @staticmethod
    async def get_platform_stats(db: AsyncSession) -> dict[str, Any]:
        """Aggregate counts used by the admin analytics agent."""
        stats: dict[str, Any] = {}
        queries = {
            "total_users":      "SELECT COUNT(*) FROM users",
            "total_laborers":   "SELECT COUNT(*) FROM users WHERE role='laborer'",
            "total_hirers":     "SELECT COUNT(*) FROM users WHERE role='farmowner'",
            "total_jobs":       "SELECT COUNT(*) FROM jobs",
            "open_jobs":        "SELECT COUNT(*) FROM jobs WHERE status='OPEN'",
            "total_bookings":   "SELECT COUNT(*) FROM bookings",
            "pending_bookings": "SELECT COUNT(*) FROM bookings WHERE status='PENDING'",
            "banned_users":     "SELECT COUNT(*) FROM users WHERE is_banned=1",
        }
        for key, sql in queries.items():
            try:
                result = await db.execute(text(sql))
                stats[key] = result.scalar() or 0
            except Exception as exc:
                logger.warning("Stats query failed for %s: %s", key, exc)
                stats[key] = 0
        return stats

    @staticmethod
    async def get_suspicious_users(db: AsyncSession, limit: int = 20) -> list[dict]:
        rows = await db.execute(
            text(
                """
                SELECT uid, name, phone_number, role, is_banned,
                       is_email_verified, created_at
                FROM   users
                WHERE  is_banned = 1
                   OR  is_email_verified = 0
                   OR  name IS NULL
                   OR  name = ''
                   OR  length(phone_number) < 10
                ORDER  BY id DESC
                LIMIT  :limit
                """
            ),
            {"limit": limit},
        )
        return [dict(r) for r in rows.mappings().all()]

    # ── Jobs ───────────────────────────────────────────────────────────────────

    @staticmethod
    async def get_open_jobs(
        db: AsyncSession,
        location: str | None = None,
        min_wage: int | None = None,
        work_type: str | None = None,
        work_date: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """
        Flexible job query used by the job-search agent.
        All filters are optional and combined with AND.
        """
        conditions = ["status = 'OPEN'"]
        params: dict[str, Any] = {"limit": limit}

        if location:
            conditions.append("(location LIKE :location OR hirer_name LIKE :location)")
            params["location"] = f"%{location}%"

        if min_wage is not None:
            conditions.append("CAST(wage AS INTEGER) >= :min_wage")
            params["min_wage"] = min_wage

        if work_type:
            conditions.append(
                "(title LIKE :work_type OR description LIKE :work_type)"
            )
            params["work_type"] = f"%{work_type}%"

        if work_date:
            conditions.append("(work_date = :work_date OR work_date LIKE :work_date_like)")
            params["work_date"] = work_date
            params["work_date_like"] = f"%{work_date}%"

        where = " AND ".join(conditions)
        sql = text(f"SELECT * FROM jobs WHERE {where} ORDER BY id DESC LIMIT :limit")
        rows = await db.execute(sql, params)
        return [dict(r) for r in rows.mappings().all()]

    @staticmethod
    async def insert_job(db: AsyncSession, job_data: dict) -> int:
        """
        Insert a new job row.  Returns the new job's id.
        Matches the columns created by the Node backend.
        """
        result = await db.execute(
            text(
                """
                INSERT INTO jobs
                    (hirer_id, title, description, location, work_date,
                     work_time, wage, laborers_required, hirer_name, hirer_phone,
                     gender_preference, status)
                VALUES
                    (:hirer_id, :title, :description, :location, :work_date,
                     :work_time, :wage, :laborers_required, :hirer_name, :hirer_phone,
                     :gender_preference, 'OPEN')
                """
            ),
            {
                "hirer_id":          job_data.get("hirer_id", ""),
                "title":             job_data.get("title", "Farm Work"),
                "description":       job_data.get("description", ""),
                "location":          job_data.get("location", ""),
                "work_date":         job_data.get("work_date", ""),
                "work_time":         job_data.get("work_time", "Morning"),
                "wage":              str(job_data.get("wage", "")),
                "laborers_required": int(job_data.get("worker_count", 1)),
                "hirer_name":        job_data.get("hirer_name", ""),
                "hirer_phone":       job_data.get("hirer_phone", ""),
                "gender_preference": job_data.get("gender_preference", "Any"),
            },
        )
        return result.lastrowid

    # ── Analytics ──────────────────────────────────────────────────────────────

    @staticmethod
    async def get_job_stats(
        db: AsyncSession,
        location: str | None = None,
        timeframe_days: int | None = None,
    ) -> dict[str, Any]:
        conditions = ["1=1"]
        params: dict[str, Any] = {}

        if location:
            conditions.append("(location LIKE :location OR hirer_name LIKE :location)")
            params["location"] = f"%{location}%"

        if timeframe_days:
            conditions.append(
                "datetime(created_at) >= datetime('now', :days)"
            )
            params["days"] = f"-{timeframe_days} days"

        where = " AND ".join(conditions)
        result = await db.execute(
            text(
                f"""
                SELECT COUNT(*) AS total_jobs,
                       AVG(CAST(wage AS REAL)) AS avg_wage,
                       MIN(CAST(wage AS REAL)) AS min_wage,
                       MAX(CAST(wage AS REAL)) AS max_wage
                FROM   jobs
                WHERE  {where}
                """
            ),
            params,
        )
        row = result.mappings().first()
        return dict(row) if row else {}

    @staticmethod
    async def get_top_work_types(db: AsyncSession, limit: int = 5) -> list[dict]:
        rows = await db.execute(
            text(
                """
                SELECT title, COUNT(*) AS count
                FROM   jobs
                GROUP  BY title
                ORDER  BY count DESC
                LIMIT  :limit
                """
            ),
            {"limit": limit},
        )
        return [dict(r) for r in rows.mappings().all()]

    # ── Audit ──────────────────────────────────────────────────────────────────

    @staticmethod
    async def get_audit_logs(db: AsyncSession, limit: int = 20) -> list[dict]:
        rows = await db.execute(
            text(
                """
                SELECT user_id, action, target, timestamp
                FROM   audit_logs
                ORDER  BY id DESC
                LIMIT  :limit
                """
            ),
            {"limit": limit},
        )
        return [dict(r) for r in rows.mappings().all()]

    @staticmethod
    async def insert_audit_log(
        db: AsyncSession,
        user_id: str,
        action: str,
        target: str = "",
        details: dict | None = None,
    ) -> None:
        try:
            await db.execute(
                text(
                    """
                    INSERT INTO audit_logs (user_id, action, target, details)
                    VALUES (:user_id, :action, :target, :details)
                    """
                ),
                {
                    "user_id": user_id,
                    "action":  action,
                    "target":  target,
                    "details": json.dumps(details or {}),
                },
            )
        except Exception as exc:
            # Non-critical — log and continue
            logger.warning("Audit log insert failed: %s", exc)
