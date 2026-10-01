"""
backend/routes/jobs.py

Jobs and work alert endpoints with real-time Socket.IO synchronization.
"""

from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel
from database import get_one, query, run
from socket_manager import sio, create_notification

logger = logging.getLogger("jobs")
router = APIRouter(prefix="/api", tags=["jobs"])


class CreateJobRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    location: str
    workDate: str
    workTime: str
    wage: str
    laborersRequired: int
    hirerName: Optional[str] = None
    hirerPhone: Optional[str] = None


@router.post("/jobs", status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: CreateJobRequest,
    x_user_uid: Optional[str] = Header(None, alias="x-user-uid"),
):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    h_name = payload.hirerName
    h_phone = payload.hirerPhone

    owner = await get_one("SELECT name, phone_number FROM users WHERE uid = :uid", {"uid": x_user_uid})
    if owner:
        if not h_name:
            h_name = owner.get("name") or "Farm Owner"
        if not h_phone:
            h_phone = owner.get("phone_number") or x_user_uid

    res = await run(
        """
        INSERT INTO jobs (hirer_id, title, description, location, work_date, work_time, wage, laborers_required, hirer_name, hirer_phone, status)
        VALUES (:hid, :title, :desc, :loc, :wdate, :wtime, :wage, :req, :hname, :hphone, 'OPEN')
        """,
        {
            "hid": x_user_uid,
            "title": payload.title,
            "desc": payload.description or "",
            "loc": payload.location,
            "wdate": payload.workDate,
            "wtime": payload.workTime,
            "wage": payload.wage,
            "req": int(payload.laborersRequired),
            "hname": h_name or "Farm Owner",
            "hphone": h_phone or x_user_uid,
        },
    )

    created_job = await get_one(
        "SELECT * FROM jobs WHERE hirer_id = :hid ORDER BY id DESC LIMIT 1",
        {"hid": x_user_uid},
    )
    if not created_job:
        raise HTTPException(status_code=500, detail="Failed to create job")

    job_payload = {
        "id": created_job["id"],
        "hirerId": created_job["hirer_id"],
        "ownerName": created_job["hirer_name"],
        "workTitle": created_job["title"],
        "workerWage": created_job["wage"],
        "workDate": created_job["work_date"],
        "workTime": created_job["work_time"],
        "location": created_job["location"],
        "laborersRequired": created_job["laborers_required"],
        "status": created_job["status"],
        "acceptedCount": 0,
    }

    # Emit Socket.IO event for real-time update to all connected clients
    await sio.emit("new-work-alert", job_payload)

    # Notify laborers
    available_laborers = await query("SELECT uid FROM users WHERE role = 'laborer'")
    for l in available_laborers:
        await create_notification(
            user_id=l["uid"],
            notif_type="new_job",
            title="New Work Alert",
            message=f"{job_payload['ownerName']} posted: {job_payload['workTitle']}",
            related_job_id=created_job["id"],
        )

    return job_payload


@router.get("/jobs/tomorrow")
async def get_tomorrow_jobs(x_user_uid: Optional[str] = Header(None, alias="x-user-uid")):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    jobs = await query(
        """
        SELECT * FROM jobs 
        WHERE status = 'OPEN' 
          AND id NOT IN (SELECT job_id FROM job_rejections WHERE laborer_id = :uid)
        ORDER BY id DESC
        """,
        {"uid": x_user_uid},
    )

    formatted_jobs = []
    for job in jobs:
        cnt_row = await get_one(
            "SELECT COUNT(*) as cnt FROM job_acceptances WHERE job_id = :jid",
            {"jid": job["id"]},
        )
        accepted_count = cnt_row["cnt"] if cnt_row else 0

        acc_row = await get_one(
            "SELECT id FROM job_acceptances WHERE job_id = :jid AND laborer_id = :uid",
            {"jid": job["id"], "uid": x_user_uid},
        )
        is_accepted = acc_row is not None

        status_val = "FULL" if accepted_count >= job["laborers_required"] else job["status"]

        formatted_jobs.append({
            "id": job["id"],
            "ownerName": job.get("hirer_name") or "Farm Owner",
            "ownerPhone": job.get("hirer_phone"),
            "workTitle": job["title"],
            "workerWage": job["wage"],
            "workDate": job["work_date"],
            "status": status_val,
            "acceptedCount": accepted_count,
            "laborersRequired": job["laborers_required"],
            "isAcceptedByMe": is_accepted,
        })

    return formatted_jobs


@router.post("/jobs/{job_id}/accept")
async def accept_job(
    job_id: int,
    x_user_uid: Optional[str] = Header(None, alias="x-user-uid"),
):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    job = await get_one("SELECT * FROM jobs WHERE id = :jid", {"jid": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "OPEN":
        raise HTTPException(status_code=400, detail="Job is no longer open")

    existing = await get_one(
        "SELECT id FROM job_acceptances WHERE job_id = :jid AND laborer_id = :uid",
        {"jid": job_id, "uid": x_user_uid},
    )
    if existing:
        raise HTTPException(status_code=400, detail="You have already accepted this job")

    cnt_row = await get_one(
        "SELECT COUNT(*) as cnt FROM job_acceptances WHERE job_id = :jid",
        {"jid": job_id},
    )
    current_count = cnt_row["cnt"] if cnt_row else 0

    if current_count >= job["laborers_required"]:
        await run("UPDATE jobs SET status = 'FULL' WHERE id = :jid", {"jid": job_id})
        raise HTTPException(status_code=400, detail="All laborers have been selected")

    l_user = await get_one("SELECT name, phone_number FROM users WHERE uid = :uid", {"uid": x_user_uid})
    l_name = (l_user.get("name") if l_user else None) or "Laborer"
    l_phone = (l_user.get("phone_number") if l_user else None) or x_user_uid

    await run(
        """
        INSERT INTO job_acceptances (job_id, laborer_id, laborer_name, laborer_phone, status)
        VALUES (:jid, :uid, :name, :phone, 'ACCEPTED')
        """,
        {"jid": job_id, "uid": x_user_uid, "name": l_name, "phone": l_phone},
    )

    new_count = current_count + 1
    is_full = new_count >= job["laborers_required"]

    if is_full:
        await run("UPDATE jobs SET status = 'FULL' WHERE id = :jid", {"jid": job_id})
        await sio.emit("job-full", {"jobId": job_id})

    # Real-Time Notification & Socket Event to Hirer
    notif_msg = f"{l_name} accepted your work alert!"
    await create_notification(
        user_id=job["hirer_id"],
        notif_type="laborer_accepted",
        title="Work Alert Accepted",
        message=notif_msg,
        related_job_id=job_id,
    )

    accept_payload = {
        "jobId": job_id,
        "laborerId": x_user_uid,
        "laborerName": l_name,
        "laborerPhone": l_phone,
        "name": l_name,
        "phone": l_phone,
        "hirerId": job["hirer_id"],
        "acceptedCount": new_count,
        "laborersRequired": job["laborers_required"],
        "isFull": is_full,
    }

    await sio.emit("laborer-accepted", accept_payload, room=f"user_{job['hirer_id']}")
    await sio.emit("laborer-accepted", accept_payload, room=f"hirer_{job['hirer_id']}")

    return {"success": True, "message": "Work accepted successfully", "acceptedCount": new_count, "isFull": is_full}


@router.post("/jobs/{job_id}/reject")
async def reject_job(
    job_id: int,
    x_user_uid: Optional[str] = Header(None, alias="x-user-uid"),
):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    await run(
        """
        INSERT INTO job_rejections (job_id, laborer_id) VALUES (:jid, :uid)
        ON CONFLICT(job_id, laborer_id) DO NOTHING
        """,
        {"jid": job_id, "uid": x_user_uid},
    )
    return {"success": True, "message": "Job rejected"}


@router.get("/hirer/me/jobs")
async def get_hirer_jobs(x_user_uid: Optional[str] = Header(None, alias="x-user-uid")):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    jobs = await query(
        "SELECT * FROM jobs WHERE hirer_id = :uid ORDER BY id DESC",
        {"uid": x_user_uid},
    )

    result = []
    for job in jobs:
        accepted_laborers = await query(
            """
            SELECT id, laborer_id as laborerId, laborer_name as laborerName,
                   laborer_phone as laborerPhone, accepted_at as acceptedAt 
            FROM job_acceptances 
            WHERE job_id = :jid 
            ORDER BY id ASC
            """,
            {"jid": job["id"]},
        )

        accepted_count = len(accepted_laborers)
        remaining = max(0, job["laborers_required"] - accepted_count)
        status_val = "FULL" if accepted_count >= job["laborers_required"] else job["status"]

        result.append({
            "id": job["id"],
            "hirerId": job["hirer_id"],
            "title": job["title"],
            "description": job["description"],
            "location": job["location"],
            "workDate": job["work_date"],
            "workTime": job["work_time"],
            "wage": job["wage"],
            "laborersRequired": job["laborers_required"],
            "hirerName": job["hirer_name"],
            "hirerPhone": job["hirer_phone"],
            "status": status_val,
            "acceptedCount": accepted_count,
            "remainingPositions": remaining,
            "acceptedLaborers": accepted_laborers,
        })

    return result
