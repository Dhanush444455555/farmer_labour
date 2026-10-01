"""
backend/routes/notifications.py

User notification management endpoints.
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Header, HTTPException
from database import query, run

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def get_notifications(x_user_uid: Optional[str] = Header(None, alias="x-user-uid")):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    notifications = await query(
        """
        SELECT id, type, title, message, is_read, created_at as time 
        FROM notifications 
        WHERE user_id = :uid 
        ORDER BY id DESC
        """,
        {"uid": x_user_uid},
    )

    formatted = [
        {
            "id": str(n["id"]),
            "type": n["type"],
            "title": n["title"],
            "message": n["message"],
            "time": n.get("time") or "Today",
            "unread": n["is_read"] == 0,
        }
        for n in notifications
    ]
    return formatted


@router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    x_user_uid: Optional[str] = Header(None, alias="x-user-uid"),
):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    await run(
        "UPDATE notifications SET is_read = 1 WHERE id = :nid AND user_id = :uid",
        {"nid": notification_id, "uid": x_user_uid},
    )
    return {"success": True}


@router.put("/read-all")
async def mark_all_read(x_user_uid: Optional[str] = Header(None, alias="x-user-uid")):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    await run(
        "UPDATE notifications SET is_read = 1 WHERE user_id = :uid",
        {"uid": x_user_uid},
    )
    return {"success": True}
