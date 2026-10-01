"""
backend/routes/auth.py

Authentication and verification endpoints.
"""

from __future__ import annotations

import logging
import random
import re
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel
from config import settings
from database import get_one, run, verify_password

logger = logging.getLogger("auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    phone: str


class AdminLoginRequest(BaseModel):
    phone: str
    password: str


class VerifyEmailRequest(BaseModel):
    otp: str


@router.post("/login")
async def login(payload: LoginRequest):
    phone = payload.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")

    clean_phone = re.sub(r"\D", "", phone)[-10:]
    if len(clean_phone) != 10:
        raise HTTPException(status_code=400, detail="Please enter a valid 10-digit Indian phone number")

    user = await get_one(
        "SELECT * FROM users WHERE uid = :p OR phone_number = :p",
        {"p": clean_phone},
    )

    if not user:
        await run(
            "INSERT INTO users (uid, phone_number) VALUES (:p, :p)",
            {"p": clean_phone},
        )
        user = await get_one("SELECT * FROM users WHERE uid = :p", {"p": clean_phone})

    if not user:
        raise HTTPException(status_code=500, detail="Failed to create or retrieve user")

    user_status = (user.get("status") or "ACTIVE").upper()
    if user_status in ("BLOCKED", "SUSPENDED"):
        raise HTTPException(
            status_code=403,
            detail=f"Account is {user_status.lower()}",
        )

    await run(
        "INSERT INTO login_activity (user_id, success) VALUES (:uid, 1)",
        {"uid": user["uid"]},
    )

    user_dict = dict(user)
    user_dict.pop("password_hash", None)
    user_dict.pop("password_salt", None)
    return user_dict


@router.post("/admin-login")
async def admin_login(payload: AdminLoginRequest):
    phone = payload.phone.strip()
    password = payload.password.strip()

    if not phone or not password:
        raise HTTPException(status_code=400, detail="Phone number and password are required")

    clean_phone = re.sub(r"\D", "", phone)[-10:]
    if len(clean_phone) != 10:
        raise HTTPException(status_code=400, detail="Please enter a valid 10-digit phone number")

    user = await get_one("SELECT * FROM users WHERE phone_number = :p", {"p": clean_phone})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Unauthorized: Admin access only")

    user_status = (user.get("status") or "ACTIVE").upper()
    if user_status in ("BLOCKED", "SUSPENDED"):
        raise HTTPException(status_code=403, detail=f"Account is {user_status.lower()}")

    pwd_hash = user.get("password_hash")
    pwd_salt = user.get("password_salt")

    if not pwd_hash or not pwd_salt:
        raise HTTPException(status_code=401, detail="Account not set up for admin login")

    if not verify_password(password, pwd_hash, pwd_salt):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    await run(
        "INSERT INTO login_activity (user_id, success) VALUES (:uid, 1)",
        {"uid": user["uid"]},
    )

    user_dict = dict(user)
    user_dict.pop("password_hash", None)
    user_dict.pop("password_salt", None)
    return user_dict


@router.post("/send-verification")
async def send_verification(x_user_uid: Optional[str] = Header(None, alias="x-user-uid")):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    user = await get_one("SELECT * FROM users WHERE uid = :uid", {"uid": x_user_uid})
    if not user or not user.get("email"):
        raise HTTPException(status_code=400, detail="User not found or no email associated")

    otp = str(random.randint(100000, 999999))
    await run(
        "UPDATE users SET email_verification_token = :otp WHERE uid = :uid",
        {"otp": otp, "uid": x_user_uid},
    )

    logger.info("\n--- EMAIL VERIFICATION ---\nTo verify %s, your OTP is: %s\n--------------------------\n", user["email"], otp)

    if settings.SMTP_HOST and settings.SMTP_USER:
        try:
            msg = MIMEMultipart()
            msg["From"] = settings.SMTP_FROM
            msg["To"] = user["email"]
            msg["Subject"] = "Verify your FarmConnect Email"
            msg.attach(MIMEText(f"Please verify your email using this OTP: {otp}", "plain"))

            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
            server.starttls()
            if settings.SMTP_PASS:
                server.login(settings.SMTP_USER, settings.SMTP_PASS)
            server.send_message(msg)
            server.quit()
        except Exception as exc:
            logger.error("SMTP error: %s", exc)

    return {"message": "Verification email sent"}


@router.post("/verify-email")
async def verify_email(payload: VerifyEmailRequest, x_user_uid: Optional[str] = Header(None, alias="x-user-uid")):
    if not x_user_uid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing UID header")

    user = await get_one("SELECT * FROM users WHERE uid = :uid", {"uid": x_user_uid})
    if not user or user.get("email_verification_token") != payload.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    await run(
        "UPDATE users SET email_verified = 1, email_verification_token = NULL WHERE uid = :uid",
        {"uid": x_user_uid},
    )
    return {"message": "Email verified successfully"}
