"""
backend/database.py

Async SQLite database layer with schema migrations, helper functions,
scrypt password hashing/verification, and audit logging.
"""

from __future__ import annotations

import json
import logging
import hashlib
import os
from typing import Any, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool
from config import settings, DBDriver

logger = logging.getLogger("database")


def _build_engine():
    url = settings.effective_db_url
    logger.info("Connecting to database at: %s", url)

    if settings.DB_DRIVER == DBDriver.SQLITE:
        return create_async_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=settings.DEBUG,
        )

    return create_async_engine(
        url,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        echo=settings.DEBUG,
    )


engine = _build_engine()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db():
    """FastAPI Dependency for database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Password Hashing using Scrypt (Matches Node.js crypto.scrypt) ─────────────

def hash_password(password: str) -> tuple[str, str]:
    """Generate a random 16-byte hex salt and 64-byte scrypt hex hash."""
    salt_bytes = os.urandom(16)
    salt_hex = salt_bytes.hex()
    key = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt_bytes,
        n=16384,
        r=8,
        p=1,
        maxmem=0,
        dklen=64,
    )
    return salt_hex, key.hex()


def verify_password(password: str, expected_hash: str, salt_hex: str) -> bool:
    """Verify password against stored scrypt hash and hex salt."""
    try:
        salt_bytes = bytes.fromhex(salt_hex)
        key = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt_bytes,
            n=16384,
            r=8,
            p=1,
            maxmem=0,
            dklen=64,
        )
        return key.hex() == expected_hash
    except Exception as e:
        logger.error("Password verification error: %s", e)
        return False


# ── Direct Execution Helpers ──────────────────────────────────────────────────

async def query(sql: str, params: dict | list | None = None) -> list[dict[str, Any]]:
    """Execute SELECT query and return list of dicts."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(text(sql), params or {})
        return [dict(row) for row in result.mappings().all()]


async def get_one(sql: str, params: dict | list | None = None) -> dict[str, Any] | None:
    """Execute SELECT query and return a single dict or None."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(text(sql), params or {})
        row = result.mappings().first()
        return dict(row) if row else None


async def run(sql: str, params: dict | list | None = None) -> Any:
    """Execute INSERT/UPDATE/DELETE query and return execution cursor/result."""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(text(sql), params or {})
            await session.commit()
            return result
        except Exception:
            await session.rollback()
            raise


async def log_audit_action(admin_id: str, action: str, target: str, metadata: dict | None = None):
    """Log admin actions for accountability."""
    try:
        meta_str = json.dumps(metadata) if metadata else None
        await run(
            "INSERT INTO audit_logs (admin_id, action, target, metadata) VALUES (:admin_id, :action, :target, :meta)",
            {"admin_id": str(admin_id), "action": action, "target": str(target), "meta": meta_str},
        )
    except Exception as err:
        logger.error("Audit log recording error: %s", err)


# ── Database Schema Initializer ───────────────────────────────────────────────

async def init_db() -> None:
    """Initialize all SQLite / PostgreSQL tables and columns if not present."""
    logger.info("Initializing database schema...")
    
    schema_statements = [
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE NOT NULL,
            phone_number TEXT UNIQUE NOT NULL,
            name TEXT,
            role TEXT DEFAULT NULL,
            location TEXT,
            experience TEXT,
            expected_wage TEXT,
            skills TEXT,
            availability TEXT DEFAULT 'AVAILABLE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hirer_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            location TEXT NOT NULL,
            work_date TEXT NOT NULL,
            work_time TEXT NOT NULL,
            wage TEXT NOT NULL,
            laborers_required INTEGER NOT NULL,
            hirer_name TEXT,
            hirer_phone TEXT,
            status TEXT DEFAULT 'OPEN',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS job_acceptances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL REFERENCES jobs(id),
            laborer_id TEXT NOT NULL,
            laborer_name TEXT NOT NULL,
            laborer_phone TEXT NOT NULL,
            status TEXT DEFAULT 'ACCEPTED',
            accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(job_id, laborer_id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS job_rejections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL REFERENCES jobs(id),
            laborer_id TEXT NOT NULL,
            rejected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(job_id, laborer_id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id TEXT NOT NULL,
            laborer_id TEXT NOT NULL,
            work_title TEXT NOT NULL,
            wage TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            related_job_id INTEGER,
            related_booking_id INTEGER,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS laborer_availability (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            laborer_id TEXT NOT NULL,
            available_date TEXT NOT NULL,
            status TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(laborer_id, available_date)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reporter_id TEXT NOT NULL,
            reported_id TEXT,
            related_job_id INTEGER,
            reason TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'OPEN',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id TEXT NOT NULL,
            action TEXT NOT NULL,
            target TEXT NOT NULL,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS direct_bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id TEXT NOT NULL,
            laborer_id TEXT NOT NULL,
            work_title TEXT NOT NULL,
            wage TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS login_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            success INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            description TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS cms_content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """
    ]

    async with AsyncSessionLocal() as session:
        for stmt in schema_statements:
            await session.execute(text(stmt))
        await session.commit()

        # Perform schema migrations / alter columns safely
        alter_queries = [
            "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'",
            "ALTER TABLE users ADD COLUMN password_hash TEXT",
            "ALTER TABLE users ADD COLUMN password_salt TEXT",
            "ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'Unspecified'",
            "ALTER TABLE users ADD COLUMN email TEXT UNIQUE",
            "ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN email_verification_token TEXT",
        ]
        for alter in alter_queries:
            try:
                await session.execute(text(alter))
                await session.commit()
            except Exception:
                await session.rollback()

        # Seed default settings
        res = await session.execute(text("SELECT COUNT(*) FROM settings"))
        count = res.scalar() or 0
        if count == 0:
            default_settings = [
                ("site_name", "FarmConnect", "Name of the application"),
                ("maintenance_mode", "false", "Enable maintenance mode"),
                ("allow_new_registrations", "true", "Allow new users to register"),
                ("default_currency", "INR", "Default currency code"),
                ("support_email", "support@farmconnect.com", "Contact email for users"),
            ]
            for key, val, desc in default_settings:
                await session.execute(
                    text("INSERT INTO settings (key, value, description) VALUES (:k, :v, :d)"),
                    {"k": key, "v": val, "d": desc},
                )
            await session.commit()
            logger.info("Initialized default system settings.")

    logger.info("✅ Database schema initialized successfully.")
