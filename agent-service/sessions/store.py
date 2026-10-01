"""
agent-service/sessions/store.py

Conversation session management across turns.

Two backends controlled by SESSION_BACKEND in .env:

  "memory"  —  In-process dict (default).
                Fast, zero dependencies.
                Data is lost on restart / does NOT work with multiple workers.

  "redis"   —  Persists to Redis.
                Survives restarts. Works with multi-worker deployments.
                Requires a running Redis instance (REDIS_URL in .env).

Each session stores the LangGraph agent state as a JSON-serialisable dict
keyed by session_id (typically `{uid}_{agent_name}`).

Usage
-----
    store = get_session_store()
    await store.get("farmer_abc123_job_posting")
    await store.set("farmer_abc123_job_posting", {...state...})
    await store.delete("farmer_abc123_job_posting")
"""

from __future__ import annotations

import json
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

from config import settings

logger = logging.getLogger(__name__)


# ── Data model ─────────────────────────────────────────────────────────────────

@dataclass
class ConversationSession:
    """Wrapper around raw LangGraph agent state."""
    session_id: str
    agent_name: str          # e.g. "job_posting", "job_search", "admin_query"
    user_uid: str
    language: str = "en"
    state: dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def touch(self) -> None:
        self.updated_at = time.time()

    def to_dict(self) -> dict:
        return {
            "session_id":  self.session_id,
            "agent_name":  self.agent_name,
            "user_uid":    self.user_uid,
            "language":    self.language,
            "state":       self.state,
            "created_at":  self.created_at,
            "updated_at":  self.updated_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ConversationSession":
        return cls(**d)


# ── Abstract base ──────────────────────────────────────────────────────────────

class SessionStore(ABC):
    @abstractmethod
    async def get(self, session_id: str) -> Optional[ConversationSession]: ...

    @abstractmethod
    async def set(self, session: ConversationSession) -> None: ...

    @abstractmethod
    async def delete(self, session_id: str) -> None: ...

    @abstractmethod
    async def exists(self, session_id: str) -> bool: ...

    # ── Convenience helpers ────────────────────────────────────────────────────

    async def get_state(self, session_id: str) -> dict[str, Any]:
        session = await self.get(session_id)
        return session.state if session else {}

    async def update_state(
        self,
        session_id: str,
        new_state: dict[str, Any],
    ) -> Optional[ConversationSession]:
        session = await self.get(session_id)
        if session is None:
            return None
        session.state.update(new_state)
        session.touch()
        await self.set(session)
        return session

    async def create_session(
        self,
        session_id: str,
        agent_name: str,
        user_uid: str,
        language: str = "en",
        initial_state: dict | None = None,
    ) -> ConversationSession:
        session = ConversationSession(
            session_id=session_id,
            agent_name=agent_name,
            user_uid=user_uid,
            language=language,
            state=initial_state or {},
        )
        await self.set(session)
        logger.debug("Created session %s (%s)", session_id, agent_name)
        return session


# ── In-memory backend ──────────────────────────────────────────────────────────

class MemorySessionStore(SessionStore):
    """
    Simple in-process dict store with TTL eviction.
    Not suitable for multi-worker deployments.
    """

    def __init__(self, ttl_seconds: int = settings.SESSION_TTL_SECONDS):
        self._store: dict[str, ConversationSession] = {}
        self._ttl = ttl_seconds

    def _is_expired(self, session: ConversationSession) -> bool:
        return (time.time() - session.updated_at) > self._ttl

    async def get(self, session_id: str) -> Optional[ConversationSession]:
        session = self._store.get(session_id)
        if session and self._is_expired(session):
            del self._store[session_id]
            return None
        return session

    async def set(self, session: ConversationSession) -> None:
        self._store[session.session_id] = session

    async def delete(self, session_id: str) -> None:
        self._store.pop(session_id, None)

    async def exists(self, session_id: str) -> bool:
        return (await self.get(session_id)) is not None

    def stats(self) -> dict:
        return {"active_sessions": len(self._store), "backend": "memory"}


# ── Redis backend ──────────────────────────────────────────────────────────────

class RedisSessionStore(SessionStore):
    """
    Redis-backed session store.
    Requires `redis` package (included in requirements.txt).
    """

    def __init__(self, redis_url: str = settings.REDIS_URL, ttl: int = settings.SESSION_TTL_SECONDS):
        import redis.asyncio as aioredis
        self._redis = aioredis.from_url(redis_url, decode_responses=True)
        self._ttl = ttl
        self._prefix = "farm:session:"

    def _key(self, session_id: str) -> str:
        return f"{self._prefix}{session_id}"

    async def get(self, session_id: str) -> Optional[ConversationSession]:
        raw = await self._redis.get(self._key(session_id))
        if raw is None:
            return None
        return ConversationSession.from_dict(json.loads(raw))

    async def set(self, session: ConversationSession) -> None:
        await self._redis.setex(
            self._key(session.session_id),
            self._ttl,
            json.dumps(session.to_dict()),
        )

    async def delete(self, session_id: str) -> None:
        await self._redis.delete(self._key(session_id))

    async def exists(self, session_id: str) -> bool:
        return bool(await self._redis.exists(self._key(session_id)))


# ── Factory ────────────────────────────────────────────────────────────────────

_store_singleton: Optional[SessionStore] = None


def get_session_store() -> SessionStore:
    """
    Return (and cache) the session store singleton.
    Backend is determined by SESSION_BACKEND in .env.
    """
    global _store_singleton
    if _store_singleton is not None:
        return _store_singleton

    if settings.SESSION_BACKEND == "redis":
        try:
            _store_singleton = RedisSessionStore()
            logger.info("✅ Session store: Redis (%s)", settings.REDIS_URL)
        except Exception as exc:
            logger.warning("Redis unavailable (%s), falling back to memory store", exc)
            _store_singleton = MemorySessionStore()
    else:
        _store_singleton = MemorySessionStore()
        logger.info("✅ Session store: in-memory")

    return _store_singleton
