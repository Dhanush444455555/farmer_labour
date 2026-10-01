"""
backend/routes/users.py

User profile management endpoints.
"""

from __future__ import annotations

import json
from typing import Any, Optional
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from database import get_one, run

router = APIRouter(prefix="/api/users", tags=["users"])


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    location: Optional[str] = None
    experience: Optional[str] = None
    expected_wage: Optional[str] = None
    skills: Optional[Any] = None
    gender: Optional[str] = None
    email: Optional[str] = None


@router.put("/profile")
async def update_profile(
    payload: ProfileUpdateRequest,
    x_user_uid: Optional[str] = Header(None, alias="x-user-uid"),
):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    skills_val = payload.skills
    if isinstance(skills_val, list):
        skills_val = json.dumps(skills_val)

    await run(
        """
        UPDATE users 
        SET name = COALESCE(:name, name), 
            role = COALESCE(:role, role), 
            location = COALESCE(:location, location), 
            experience = COALESCE(:experience, experience), 
            expected_wage = COALESCE(:expected_wage, expected_wage), 
            skills = COALESCE(:skills, skills),
            gender = COALESCE(:gender, gender),
            email = COALESCE(:email, email),
            updated_at = CURRENT_TIMESTAMP
        WHERE uid = :uid
        """,
        {
            "name": payload.name,
            "role": payload.role,
            "location": payload.location,
            "experience": payload.experience,
            "expected_wage": payload.expected_wage,
            "skills": skills_val,
            "gender": payload.gender,
            "email": payload.email,
            "uid": x_user_uid,
        },
    )

    user = await get_one("SELECT * FROM users WHERE uid = :uid", {"uid": x_user_uid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_dict = dict(user)
    user_dict.pop("password_hash", None)
    user_dict.pop("password_salt", None)
    return user_dict


@router.get("/me")
async def get_me(x_user_uid: Optional[str] = Header(None, alias="x-user-uid")):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    user = await get_one("SELECT * FROM users WHERE uid = :uid", {"uid": x_user_uid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_dict = dict(user)
    user_dict.pop("password_hash", None)
    user_dict.pop("password_salt", None)
    return user_dict
