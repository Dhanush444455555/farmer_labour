"""
backend/routes/bookings.py

Direct farmer-to-laborer booking endpoints with Socket.IO notifications.
"""

from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel
from database import get_one, query, run
from socket_manager import sio, create_notification

logger = logging.getLogger("bookings")
router = APIRouter(prefix="/api/bookings", tags=["bookings"])


class CreateBookingRequest(BaseModel):
    laborerId: str
    workTitle: str
    wage: str


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: CreateBookingRequest,
    x_user_uid: Optional[str] = Header(None, alias="x-user-uid"),
):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    owner = await get_one("SELECT name, phone_number FROM users WHERE uid = :uid", {"uid": x_user_uid})
    owner_name = (owner.get("name") if owner else None) or "Farm Owner"

    await run(
        """
        INSERT INTO bookings (owner_id, laborer_id, work_title, wage, status)
        VALUES (:oid, :lid, :title, :wage, 'PENDING')
        """,
        {
            "oid": x_user_uid,
            "lid": str(payload.laborerId),
            "title": payload.workTitle,
            "wage": payload.wage,
        },
    )

    booking = await get_one(
        "SELECT * FROM bookings WHERE owner_id = :oid ORDER BY id DESC LIMIT 1",
        {"oid": x_user_uid},
    )
    if not booking:
        raise HTTPException(status_code=500, detail="Failed to create booking")

    notif_msg = f"{owner_name} sent you a direct booking request for {payload.workTitle} ({payload.wage})"
    await create_notification(
        user_id=payload.laborerId,
        notif_type="booking_request",
        title="New Booking Request",
        message=notif_msg,
        related_booking_id=booking["id"],
    )

    await sio.emit(
        "booking-request",
        {
            "bookingId": booking["id"],
            "ownerId": x_user_uid,
            "ownerName": owner_name,
            "workTitle": payload.workTitle,
            "wage": payload.wage,
            "status": "PENDING",
        },
        room=f"user_{payload.laborerId}",
    )

    return booking


@router.get("/received")
async def get_received_bookings(x_user_uid: Optional[str] = Header(None, alias="x-user-uid")):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    bookings = await query(
        """
        SELECT b.*, u.name as ownerName, u.phone_number as ownerPhone 
        FROM bookings b 
        LEFT JOIN users u ON b.owner_id = u.uid 
        WHERE b.laborer_id = :uid 
        ORDER BY b.id DESC
        """,
        {"uid": x_user_uid},
    )
    return bookings


@router.get("/my-bookings")
async def get_my_bookings(x_user_uid: Optional[str] = Header(None, alias="x-user-uid")):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    bookings = await query(
        """
        SELECT b.*, u.name as laborerName, u.phone_number as laborerPhone, u.location 
        FROM bookings b 
        LEFT JOIN users u ON b.laborer_id = u.uid 
        WHERE b.owner_id = :uid 
        ORDER BY b.id DESC
        """,
        {"uid": x_user_uid},
    )

    formatted = []
    for b in bookings:
        status_raw = (b.get("status") or "PENDING").upper()
        status_map = {
            "ACCEPTED": "Accepted",
            "REJECTED": "Rejected",
            "COMPLETED": "Completed",
            "PENDING": "Pending",
        }
        formatted.append({
            "id": str(b["id"]),
            "laborerId": b["laborer_id"],
            "laborerName": b.get("laborerName") or "Laborer",
            "laborerPhone": b.get("laborerPhone") or b["laborer_id"],
            "workType": b["work_title"],
            "workDate": "",
            "location": b.get("location") or "",
            "wage": b["wage"],
            "status": status_map.get(status_raw, "Pending"),
        })

    return formatted


@router.post("/{booking_id}/accept")
async def accept_booking(
    booking_id: int,
    x_user_uid: Optional[str] = Header(None, alias="x-user-uid"),
):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    await run(
        "UPDATE bookings SET status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP WHERE id = :bid AND laborer_id = :uid",
        {"bid": booking_id, "uid": x_user_uid},
    )

    booking = await get_one("SELECT * FROM bookings WHERE id = :bid", {"bid": booking_id})
    if booking:
        laborer = await get_one("SELECT name FROM users WHERE uid = :uid", {"uid": x_user_uid})
        laborer_name = (laborer.get("name") if laborer else None) or "Laborer"

        await create_notification(
            user_id=booking["owner_id"],
            notif_type="booking_accepted",
            title="Booking Accepted",
            message=f"{laborer_name} accepted your direct booking request!",
            related_booking_id=booking["id"],
        )

        await sio.emit(
            "booking-accepted",
            {"bookingId": booking["id"], "laborerName": laborer_name},
            room=f"user_{booking['owner_id']}",
        )

    return {"success": True, "status": "ACCEPTED"}


@router.post("/{booking_id}/reject")
async def reject_booking(
    booking_id: int,
    x_user_uid: Optional[str] = Header(None, alias="x-user-uid"),
):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    await run(
        "UPDATE bookings SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP WHERE id = :bid AND laborer_id = :uid",
        {"bid": booking_id, "uid": x_user_uid},
    )

    booking = await get_one("SELECT * FROM bookings WHERE id = :bid", {"bid": booking_id})
    if booking:
        laborer = await get_one("SELECT name FROM users WHERE uid = :uid", {"uid": x_user_uid})
        laborer_name = (laborer.get("name") if laborer else None) or "Laborer"

        await create_notification(
            user_id=booking["owner_id"],
            notif_type="booking_rejected",
            title="Booking Declined",
            message=f"{laborer_name} declined your direct booking request.",
            related_booking_id=booking["id"],
        )

        await sio.emit(
            "booking-rejected",
            {"bookingId": booking["id"], "laborerName": laborer_name},
            room=f"user_{booking['owner_id']}",
        )

    return {"success": True, "status": "REJECTED"}
