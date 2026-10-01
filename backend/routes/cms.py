"""
backend/routes/cms.py

Public CMS content endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter
from database import query

router = APIRouter(prefix="/api/cms", tags=["cms"])


@router.get("")
async def get_public_cms():
    content = await query("SELECT * FROM cms_content WHERE is_active = 1 ORDER BY created_at DESC")
    return content
