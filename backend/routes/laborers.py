"""
backend/routes/laborers.py

Laborer availability and directory endpoints.
"""

from __future__ import annotations

import json
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel
from database import get_one, query, run

router = APIRouter(prefix="/api/laborers", tags=["laborers"])


class AvailabilityRequest(BaseModel):
    date: Optional[str] = "Tomorrow"
    status: Optional[str] = "AVAILABLE"


@router.put("/availability")
async def set_availability(
    payload: AvailabilityRequest,
    x_user_uid: Optional[str] = Header(None, alias="x-user-uid"),
):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    target_date = payload.date or "Tomorrow"
    status_val = payload.status or "AVAILABLE"

    await run(
        """
        INSERT INTO laborer_availability (laborer_id, available_date, status)
        VALUES (:uid, :dt, :st)
        ON CONFLICT(laborer_id, available_date) 
        DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP
        """,
        {"uid": x_user_uid, "dt": target_date, "st": status_val},
    )

    await run(
        "UPDATE users SET availability = :st WHERE uid = :uid",
        {"st": status_val, "uid": x_user_uid},
    )

    return {"success": True, "date": target_date, "status": status_val}


@router.get("/availability")
async def get_availability(x_user_uid: Optional[str] = Header(None, alias="x-user-uid")):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    record = await get_one(
        "SELECT status FROM laborer_availability WHERE laborer_id = :uid ORDER BY id DESC LIMIT 1",
        {"uid": x_user_uid},
    )
    return {"status": record["status"] if record else "AVAILABLE"}


def _format_laborer(l: dict) -> dict:
    parsed_skills = []
    raw_skills = l.get("skills")
    if raw_skills:
        try:
            if isinstance(raw_skills, str) and raw_skills.startswith("["):
                parsed_skills = json.loads(raw_skills)
            elif isinstance(raw_skills, list):
                parsed_skills = raw_skills
            else:
                parsed_skills = [s.strip() for s in str(raw_skills).split(",") if s.strip()]
        except Exception:
            parsed_skills = [str(raw_skills)]

    return {
        "id": l.get("uid") or str(l.get("id")),
        "uid": l.get("uid"),
        "name": l.get("name") or "Laborer",
        "phone": l.get("phone") or l.get("uid"),
        "location": l.get("location") or "",
        "skills": parsed_skills,
        "experience": l.get("experience") or "",
        "dailyWage": l.get("dailyWage") or l.get("expected_wage") or "",
        "availability": l.get("availability") or "Available",
        "gender": l.get("gender") or "Unspecified",
        "profileImage": "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=150&auto=format&fit=crop&q=80",
    }


@router.get("")
async def list_laborers(
    search: Optional[str] = None,
    location: Optional[str] = None,
    availability: Optional[str] = None,
    gender: Optional[str] = None,
):
    sql = """
    SELECT id, uid, name, phone_number as phone, location, skills, experience,
           expected_wage as dailyWage, availability, gender 
    FROM users 
    WHERE role = 'laborer'
    """
    params = {}

    if availability:
        sql += " AND availability = :availability"
        params["availability"] = availability
    if location:
        sql += " AND location LIKE :location"
        params["location"] = f"%{location}%"
    if gender and gender.lower() != "all":
        sql += " AND gender = :gender"
        params["gender"] = gender

    sql += " ORDER BY id DESC"

    laborers = await query(sql, params)
    formatted = [_format_laborer(l) for l in laborers]

    if search:
        q = search.lower()
        formatted = [
            l for l in formatted
            if q in l["name"].lower()
            or q in l["location"].lower()
            or any(q in s.lower() for s in l["skills"])
        ]

    return formatted


@router.get("/{uid}")
async def get_laborer_by_uid(uid: str):
    l = await get_one(
        """
        SELECT id, uid, name, phone_number as phone, location, skills, experience,
               expected_wage as dailyWage, availability, gender 
        FROM users 
        WHERE uid = :uid OR id = :uid
        """,
        {"uid": uid},
    )
    if not l:
        raise HTTPException(status_code=404, detail="Laborer not found")

    return _format_laborer(l)
