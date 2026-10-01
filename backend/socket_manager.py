"""
backend/socket_manager.py

Socket.IO integration for FastAPI using python-socketio.
Handles rooms (user_{uid}, hirer_{uid}) and real-time events.
"""

from __future__ import annotations

import logging
import socketio
from typing import Any
from database import run, get_one

logger = logging.getLogger("socket_manager")

# Create Async Socket.IO Server
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

# Active users tracker (socket_id -> uid)
active_sockets: dict[str, str] = {}


@sio.event
async def connect(sid, environ):
    logger.info("[Socket.IO] Client connected: %s", sid)


@sio.event
async def disconnect(sid):
    uid = active_sockets.pop(sid, None)
    logger.info("[Socket.IO] Client disconnected: %s (uid=%s)", sid, uid)


@sio.event
async def join_room(sid, uid):
    """Handle 'join-room' emitted by frontend socket.js."""
    if uid:
        clean_uid = str(uid)
        await sio.enter_room(sid, f"user_{clean_uid}")
        await sio.enter_room(sid, f"hirer_{clean_uid}")
        active_sockets[sid] = clean_uid
        logger.info("[Socket.IO] Socket %s joined user_%s & hirer_%s", sid, clean_uid, clean_uid)


async def get_active_user_uids() -> list[str]:
    """Return unique UIDs of currently connected socket users."""
    return list(set(active_sockets.values()))


async def create_notification(
    user_id: str,
    notif_type: str,
    title: str,
    message: str,
    related_job_id: int | None = None,
    related_booking_id: int | None = None,
) -> dict[str, Any] | None:
    """Create a persistent notification in DB and emit real-time event to the user's socket room."""
    try:
        res = await run(
            """
            INSERT INTO notifications (user_id, type, title, message, related_job_id, related_booking_id, is_read)
            VALUES (:uid, :type, :title, :msg, :jid, :bid, 0)
            """,
            {
                "uid": str(user_id),
                "type": notif_type,
                "title": title,
                "msg": message,
                "jid": related_job_id,
                "bid": related_booking_id,
            },
        )
        
        last_id = getattr(res, "lastrowid", None)
        if last_id:
            notif = await get_one("SELECT * FROM notifications WHERE id = :id", {"id": last_id})
        else:
            notif = await get_one(
                "SELECT * FROM notifications WHERE user_id = :uid ORDER BY id DESC LIMIT 1",
                {"uid": str(user_id)},
            )
        
        if notif:
            # Emit to user's room
            await sio.emit(
                "notification-created",
                {
                    "id": str(notif["id"]),
                    "type": notif["type"],
                    "title": notif["title"],
                    "message": notif["message"],
                    "related_job_id": notif.get("related_job_id"),
                    "related_booking_id": notif.get("related_booking_id"),
                    "unread": True,
                    "time": "Just now",
                },
                room=f"user_{user_id}",
            )
        return notif
    except Exception as exc:
        logger.error("Failed to create notification: %s", exc)
        return None
