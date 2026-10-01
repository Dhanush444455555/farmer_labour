"""
agent-service/config.py

Central configuration loaded from .env (or environment variables).
All other modules import `settings` from here — never read os.environ directly.
"""

from __future__ import annotations

import os
from enum import Enum
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# ── Enums ──────────────────────────────────────────────────────────────────────

class LLMProvider(str, Enum):
    """Supported LLM back-ends.  Set LLM_PROVIDER in .env to choose."""
    GEMINI   = "gemini"       # Google Gemini via langchain-google-genai
    OPENAI   = "openai"       # OpenAI / any OpenAI-compatible endpoint
    OLLAMA   = "ollama"       # Local Ollama (no API key needed)


class DBDriver(str, Enum):
    """Database driver.  SQLite mirrors the Node.js backend default."""
    SQLITE   = "sqlite"
    POSTGRES = "postgres"


# ── Settings ───────────────────────────────────────────────────────────────────

class Settings(BaseSettings):
    """
    All values are read from the .env file at the project root
    (agent-service/.env) or from actual environment variables.

    Priority (highest → lowest):
        1. Environment variables set in the shell
        2. agent-service/.env
        3. Default values below
    """

    model_config = SettingsConfigDict(
        # Look for .env in the same directory as this file
        env_file=Path(__file__).parent / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",          # silently ignore unknown env keys
    )

    # ── Service ──────────────────────────────────────────────────────────────
    APP_NAME: str = "Farm Connect Agent Service"
    APP_VERSION: str = "1.0.0"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False
    LOG_LEVEL: str = "info"

    # ── CORS ─────────────────────────────────────────────────────────────────
    # Comma-separated list of allowed origins, e.g.
    # CORS_ORIGINS=http://localhost:5173,https://myapp.render.com
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # ── Database ─────────────────────────────────────────────────────────────
    DB_DRIVER: DBDriver = DBDriver.SQLITE

    # SQLite path — resolves relative to the Node backend so both services
    # share the SAME database file.
    SQLITE_PATH: str = str(
        Path(__file__).parent.parent / "backend" / "farm_connect.sqlite"
    )

    # PostgreSQL DSN (ignored when DB_DRIVER=sqlite)
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/farm_connect"

    @property
    def effective_db_url(self) -> str:
        """Return the connection string that matches DB_DRIVER."""
        if self.DB_DRIVER == DBDriver.SQLITE:
            return f"sqlite+aiosqlite:///{self.SQLITE_PATH}"
        return self.DATABASE_URL

    # ── LLM ──────────────────────────────────────────────────────────────────
    LLM_PROVIDER: LLMProvider = LLMProvider.GEMINI

    # Gemini (default — matches the Node backend's @google/genai)
    GOOGLE_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # OpenAI / compatible (set OPENAI_BASE_URL to point at a local proxy)
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_BASE_URL: str = ""            # leave blank for official OpenAI

    # Ollama (local, no key needed)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.1"

    # Shared LLM settings
    LLM_TEMPERATURE: float = Field(default=0.1, ge=0.0, le=2.0)
    LLM_MAX_TOKENS: int = Field(default=2048, ge=64, le=8192)

    # ── ChromaDB ─────────────────────────────────────────────────────────────
    CHROMA_MODE: Literal["local", "http"] = "local"

    # Local persistence directory
    CHROMA_PATH: str = str(Path(__file__).parent / "rag" / "chroma_db")

    # Remote ChromaDB server (used when CHROMA_MODE=http)
    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8100

    # Collection names
    CHROMA_LABOUR_RIGHTS_COLLECTION: str = "labour_rights"
    CHROMA_JOBS_COLLECTION: str = "jobs_semantic"

    # Embedding model for ChromaDB
    CHROMA_EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # ── Session / Redis ───────────────────────────────────────────────────────
    SESSION_BACKEND: Literal["memory", "redis"] = "memory"
    REDIS_URL: str = "redis://localhost:6379/0"
    SESSION_TTL_SECONDS: int = 3600        # 1 hour

    # ── Rate limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_REQUESTS: int = 60
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # ── Validators ────────────────────────────────────────────────────────────
    @field_validator("GOOGLE_API_KEY", "OPENAI_API_KEY", mode="before")
    @classmethod
    def _strip_key(cls, v: str) -> str:
        return (v or "").strip()


# Singleton — import this everywhere
settings = Settings()
