"""
backend/routes/admin.py

Comprehensive Admin & Owner panel management endpoints.
Includes stats, user moderation, job & booking management, CMS CRUD,
audit logging, notification broadcasting, and natural language AI query agent.
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from config import settings
from database import get_one, log_audit_action, query, run
from socket_manager import get_active_user_uids, sio

logger = logging.getLogger("admin")
router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── Admin Auth Dependency ──────────────────────────────────────────────────────

async def require_admin(x_user_uid: Optional[str] = Header(None, alias="x-user-uid")) -> dict[str, Any]:
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    user = await get_one("SELECT * FROM users WHERE uid = :uid", {"uid": x_user_uid})
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized: User not found")

    user_status = (user.get("status") or "ACTIVE").upper()
    if user_status in ("BLOCKED", "SUSPENDED"):
        raise HTTPException(status_code=403, detail=f"Account is {user_status.lower()}")

    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Forbidden: Admin access required")

    return user


# ── Schemas ────────────────────────────────────────────────────────────────────

class SetupOwnerRequest(BaseModel):
    secret: str


class UpdateUserStatusRequest(BaseModel):
    status: str


class UpdateJobRequest(BaseModel):
    title: str
    location: str
    wage: str
    laborers_required: int
    description: Optional[str] = ""


class CMSCreateRequest(BaseModel):
    type: str
    title: str
    content: str
    is_active: Optional[int] = 1


class CMSUpdateRequest(BaseModel):
    type: str
    title: str
    content: str
    is_active: Optional[int] = 1


class SendBroadcastNotificationRequest(BaseModel):
    target_users: str  # 'ALL' | 'LABORERS' | 'HIRERS' | 'SPECIFIC'
    type: str
    title: str
    message: str
    target_uid: Optional[str] = None


class AdminAgentQueryRequest(BaseModel):
    queryText: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/setup-owner")
async def setup_owner(
    payload: SetupOwnerRequest,
    x_user_uid: Optional[str] = Header(None, alias="x-user-uid"),
):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    if not settings.ADMIN_SECRET_KEY or payload.secret != settings.ADMIN_SECRET_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing admin secret")

    await run("UPDATE users SET role = 'owner' WHERE uid = :uid", {"uid": x_user_uid})
    await log_audit_action(x_user_uid, "Setup Owner", x_user_uid, {"message": "First owner account initialized"})
    return {"success": True, "message": "You are now an Owner!"}


@router.get("/dashboard")
async def get_dashboard(admin: dict = Depends(require_admin)):
    total_users = (await get_one("SELECT COUNT(*) as c FROM users"))["c"]
    total_laborers = (await get_one("SELECT COUNT(*) as c FROM users WHERE role = 'laborer'"))["c"]
    total_hirers = (await get_one("SELECT COUNT(*) as c FROM users WHERE role = 'farmowner'"))["c"]
    total_jobs = (await get_one("SELECT COUNT(*) as c FROM jobs"))["c"]
    active_jobs = (await get_one("SELECT COUNT(*) as c FROM jobs WHERE status = 'OPEN'"))["c"]

    total_bookings = (await get_one("SELECT COUNT(*) as c FROM bookings"))["c"]
    pending_bookings = (await get_one("SELECT COUNT(*) as c FROM bookings WHERE status = 'PENDING'"))["c"]
    accepted_bookings = (await get_one("SELECT COUNT(*) as c FROM bookings WHERE status = 'ACCEPTED'"))["c"]
    completed_bookings = (await get_one("SELECT COUNT(*) as c FROM bookings WHERE status = 'COMPLETED'"))["c"]

    pending_reports_row = await get_one("SELECT COUNT(*) as c FROM reports WHERE status = 'OPEN'")
    pending_reports = pending_reports_row["c"] if pending_reports_row else 0

    recent_users = await query("SELECT uid, name, role, created_at FROM users ORDER BY created_at DESC LIMIT 5")
    recent_jobs = await query("SELECT id, title, hirer_name, status, created_at FROM jobs ORDER BY created_at DESC LIMIT 5")

    return {
        "stats": {
            "totalUsers": total_users,
            "totalLaborers": total_laborers,
            "totalHirers": total_hirers,
            "totalJobs": total_jobs,
            "activeJobs": active_jobs,
            "totalBookings": total_bookings,
            "pendingBookings": pending_bookings,
            "acceptedBookings": accepted_bookings,
            "completedBookings": completed_bookings,
            "pendingReports": pending_reports,
        },
        "recentUsers": recent_users,
        "recentJobs": recent_jobs,
    }


@router.get("/users")
async def list_users(role: Optional[str] = None, admin: dict = Depends(require_admin)):
    sql = "SELECT id, uid, name, phone_number, role, location, status, created_at FROM users"
    params = {}
    if role:
        sql += " WHERE role = :role"
        params["role"] = role
    sql += " ORDER BY id DESC"
    return await query(sql, params)


@router.patch("/users/{uid}/status")
async def update_user_status(
    uid: str,
    payload: UpdateUserStatusRequest,
    admin: dict = Depends(require_admin),
):
    status_val = payload.status.upper()
    if status_val not in ("ACTIVE", "SUSPENDED", "BLOCKED"):
        raise HTTPException(status_code=400, detail="Invalid status")

    await run("UPDATE users SET status = :status WHERE uid = :uid", {"status": status_val, "uid": uid})
    await log_audit_action(admin["uid"], "Change User Status", uid, {"newStatus": status_val})
    return {"success": True, "status": status_val}


@router.delete("/users/{uid}")
async def delete_user(uid: str, admin: dict = Depends(require_admin)):
    if uid == admin["uid"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    await run("DELETE FROM notifications WHERE user_id = :uid", {"uid": uid})
    await run("DELETE FROM bookings WHERE owner_id = :uid OR laborer_id = :uid", {"uid": uid})
    await run("DELETE FROM job_acceptances WHERE laborer_id = :uid", {"uid": uid})
    await run("DELETE FROM jobs WHERE hirer_id = :uid", {"uid": uid})
    await run("DELETE FROM login_activity WHERE user_id = :uid", {"uid": uid})
    await run("DELETE FROM users WHERE uid = :uid", {"uid": uid})
    await log_audit_action(admin["uid"], "Delete User", uid)
    return {"success": True}


@router.get("/jobs")
async def list_all_jobs(admin: dict = Depends(require_admin)):
    return await query("SELECT * FROM jobs ORDER BY created_at DESC")


@router.patch("/jobs/{job_id}")
async def update_job(
    job_id: int,
    payload: UpdateJobRequest,
    admin: dict = Depends(require_admin),
):
    await run(
        """
        UPDATE jobs 
        SET title = :title, location = :loc, wage = :wage, 
            laborers_required = :req, description = :desc 
        WHERE id = :jid
        """,
        {
            "title": payload.title,
            "loc": payload.location,
            "wage": payload.wage,
            "req": payload.laborers_required,
            "desc": payload.description or "",
            "jid": job_id,
        },
    )
    await log_audit_action(admin["uid"], "Update Job", str(job_id))
    return {"success": True}


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: int, admin: dict = Depends(require_admin)):
    await run("DELETE FROM job_acceptances WHERE job_id = :jid", {"jid": job_id})
    await run("DELETE FROM job_rejections WHERE job_id = :jid", {"jid": job_id})
    await run("DELETE FROM jobs WHERE id = :jid", {"jid": job_id})
    await log_audit_action(admin["uid"], "Delete Job", str(job_id))
    return {"success": True}


@router.get("/bookings")
async def list_all_bookings(admin: dict = Depends(require_admin)):
    return await query("SELECT * FROM bookings ORDER BY created_at DESC")


@router.delete("/bookings/{booking_id}")
async def delete_booking(booking_id: int, admin: dict = Depends(require_admin)):
    await run("DELETE FROM bookings WHERE id = :bid", {"bid": booking_id})
    await log_audit_action(admin["uid"], "Delete Booking", str(booking_id))
    return {"success": True}


@router.get("/reports")
async def list_reports(admin: dict = Depends(require_admin)):
    return await query("SELECT * FROM reports ORDER BY created_at DESC")


@router.patch("/reports/{report_id}/resolve")
async def resolve_report(report_id: int, admin: dict = Depends(require_admin)):
    await run(
        "UPDATE reports SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP WHERE id = :rid",
        {"rid": report_id},
    )
    await log_audit_action(admin["uid"], "Resolve Report", str(report_id))
    return {"success": True}


@router.get("/audit-logs")
async def get_audit_logs(admin: dict = Depends(require_admin)):
    return await query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100")


@router.get("/active-users")
async def get_active_users(admin: dict = Depends(require_admin)):
    uids = await get_active_user_uids()
    if not uids:
        return []

    placeholders = ", ".join([f":u{i}" for i in range(len(uids))])
    params = {f"u{i}": u for i, u in enumerate(uids)}
    return await query(
        f"SELECT uid, name, phone_number, role, status FROM users WHERE uid IN ({placeholders})",
        params,
    )


@router.get("/login-activity")
async def get_login_activity(admin: dict = Depends(require_admin)):
    return await query(
        """
        SELECT l.*, u.name, u.phone_number 
        FROM login_activity l 
        LEFT JOIN users u ON l.user_id = u.uid 
        ORDER BY l.created_at DESC 
        LIMIT 100
        """
    )


@router.get("/settings")
async def get_settings(admin: dict = Depends(require_admin)):
    rows = await query("SELECT * FROM settings")
    return {row["key"]: row["value"] for row in rows}


@router.patch("/settings")
async def update_settings(payload: dict[str, Any], admin: dict = Depends(require_admin)):
    for key, val in payload.items():
        await run("UPDATE settings SET value = :val WHERE key = :key", {"val": str(val), "key": key})
    await log_audit_action(admin["uid"], "Update Settings", "global")
    return {"success": True}


@router.get("/cms")
async def get_all_cms(admin: dict = Depends(require_admin)):
    return await query("SELECT * FROM cms_content ORDER BY created_at DESC")


@router.post("/cms")
async def create_cms(payload: CMSCreateRequest, admin: dict = Depends(require_admin)):
    await run(
        "INSERT INTO cms_content (type, title, content, is_active) VALUES (:type, :title, :content, :active)",
        {"type": payload.type, "title": payload.title, "content": payload.content, "active": payload.is_active or 1},
    )
    await log_audit_action(admin["uid"], "Create CMS Content", payload.title)
    return {"success": True}


@router.patch("/cms/{id}")
async def update_cms(id: int, payload: CMSUpdateRequest, admin: dict = Depends(require_admin)):
    await run(
        """
        UPDATE cms_content 
        SET type = :type, title = :title, content = :content, is_active = :active, updated_at = CURRENT_TIMESTAMP 
        WHERE id = :id
        """,
        {"type": payload.type, "title": payload.title, "content": payload.content, "active": payload.is_active, "id": id},
    )
    await log_audit_action(admin["uid"], "Update CMS Content", str(id))
    return {"success": True}


@router.delete("/cms/{id}")
async def delete_cms(id: int, admin: dict = Depends(require_admin)):
    await run("DELETE FROM cms_content WHERE id = :id", {"id": id})
    await log_audit_action(admin["uid"], "Delete CMS Content", str(id))
    return {"success": True}


@router.get("/users/search")
async def search_users(q: str = Query(..., min_length=2), admin: dict = Depends(require_admin)):
    return await query(
        "SELECT uid, name, phone_number, role FROM users WHERE name LIKE :q OR phone_number LIKE :q LIMIT 10",
        {"q": f"%{q}%"},
    )


@router.post("/notifications")
async def send_broadcast_notifications(
    payload: SendBroadcastNotificationRequest,
    admin: dict = Depends(require_admin),
):
    target = payload.target_users.upper()
    users_to_notify = []

    if target == "SPECIFIC" and payload.target_uid:
        u = await get_one("SELECT uid FROM users WHERE uid = :uid", {"uid": payload.target_uid})
        if not u:
            raise HTTPException(status_code=404, detail="Target user not found")
        users_to_notify = [u]
    else:
        role_filter = None
        if target == "LABORERS":
            role_filter = "laborer"
        elif target in ("HIRERS", "FARMERS"):
            role_filter = "farmowner"

        if role_filter:
            users_to_notify = await query("SELECT uid FROM users WHERE role = :role", {"role": role_filter})
        else:
            users_to_notify = await query("SELECT uid FROM users")

    for u in users_to_notify:
        await run(
            "INSERT INTO notifications (user_id, type, title, message) VALUES (:uid, :type, :title, :msg)",
            {"uid": u["uid"], "type": payload.type, "title": payload.title, "msg": payload.message},
        )

    # Emit via Socket.IO
    notif_data = {"title": payload.title, "message": payload.message, "type": payload.type}
    if target == "SPECIFIC" and payload.target_uid:
        await sio.emit("notification-created", notif_data, room=f"user_{payload.target_uid}")
    else:
        await sio.emit("notification-created", notif_data)

    await log_audit_action(
        admin["uid"],
        "Send Push Notification",
        f"user:{payload.target_uid}" if target == "SPECIFIC" else target,
        {"title": payload.title, "count": len(users_to_notify)},
    )

    return {"success": True, "count": len(users_to_notify)}


@router.post("/agent/query")
async def admin_agent_query(
    payload: AdminAgentQueryRequest,
    admin: dict = Depends(require_admin),
):
    query_text = payload.queryText.strip()
    if len(query_text) < 3:
        raise HTTPException(status_code=400, detail="Please provide a valid query (at least 3 characters).")

    try:
        from agents.admin_agent import get_admin_agent
        agent = get_admin_agent()
        result = await agent.run(
            query=query_text,
            admin_uid=admin["uid"],
        )

        await log_audit_action(
            admin["uid"],
            "Admin Agent Query",
            f"[{result.get('category')}] {query_text[:80]}",
            {"category": result.get("category"), "entities": result.get("extractedEntities")},
        )

        return {
            "success": True,
            "category": result.get("category"),
            "entities": result.get("extractedEntities"),
            "answer": result.get("answer"),
        }
    except Exception as exc:
        logger.error("Admin Agent Query Error: %s", exc)
        raise HTTPException(status_code=500, detail="Agent query failed. Please try again.")
