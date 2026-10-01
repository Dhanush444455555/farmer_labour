"""
agent-service/db/connection.py

Creates a SQLAlchemy async engine that works with both SQLite (default)
and PostgreSQL.  The active driver is controlled by DB_DRIVER in .env.

Usage
-----
    from db import get_db

    @router.get("/example")
    async def example(db: AsyncSession = Depends(get_db)):
        result = await db.execute(text("SELECT 1"))
        ...
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from config import settings, DBDriver

logger = logging.getLogger(__name__)


def _build_engine():
    """Build the async engine based on the configured DB_DRIVER."""
    url = settings.effective_db_url
    logger.info("Database engine: %s", url.split("@")[-1])  # hide credentials

    if settings.DB_DRIVER == DBDriver.SQLITE:
        # StaticPool keeps a single in-memory connection – required for SQLite
        # when sharing across threads/coroutines in a FastAPI app.
        return create_async_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=settings.DEBUG,
        )

    # PostgreSQL / asyncpg
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


# ── FastAPI dependency ─────────────────────────────────────────────────────────

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yield a database session and close it afterwards.

    Example::

        from fastapi import Depends
        from sqlalchemy.ext.asyncio import AsyncSession
        from db import get_db

        async def my_route(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Context-manager variant (for use outside FastAPI routes) ───────────────────

@asynccontextmanager
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Use as `async with db_session() as db:` in scripts / agents."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Startup / shutdown hooks ───────────────────────────────────────────────────

async def connect_db() -> None:
    """Call on application startup to verify connectivity."""
    from sqlalchemy import text
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("✅ Database connected (%s)", settings.DB_DRIVER.value)
    except Exception as exc:
        logger.error("❌ Database connection failed: %s", exc)
        raise


async def disconnect_db() -> None:
    """Call on application shutdown."""
    await engine.dispose()
    logger.info("Database engine disposed.")
