"""
backend/config.py

Centralized configuration for the Farm Connect Python Backend.
Loads settings from backend/.env or environment variables.
"""

from __future__ import annotations

import os
from enum import Enum
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent


class DBDriver(str, Enum):
    SQLITE = "sqlite"
    POSTGRES = "postgres"


class LLMProvider(str, Enum):
    GEMINI = "gemini"
    OPENAI = "openai"
    OLLAMA = "ollama"


class ChromaMode(str, Enum):
    LOCAL = "local"
    HTTP = "http"


class SessionBackend(str, Enum):
    MEMORY = "memory"
    REDIS = "redis"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Service Configuration
    APP_NAME: str = "Farm Connect API"
    APP_VERSION: str = "2.0.0"
    PORT: int = 5000
    HOST: str = "0.0.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "info"
    CORS_ORIGINS: str = "*"
    ADMIN_SECRET_KEY: str = "farm_admin_secret_key_2025"

    # Database
    DB_DRIVER: DBDriver = DBDriver.SQLITE
    SQLITE_PATH: str = str(BACKEND_DIR / "farm_connect.sqlite")
    DATABASE_URL: str = ""

    # LLM Settings
    LLM_PROVIDER: LLMProvider = LLMProvider.GEMINI
    GOOGLE_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_BASE_URL: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.1"
    LLM_TEMPERATURE: float = 0.1
    LLM_MAX_TOKENS: int = 2048

    # ChromaDB (Vector store for Labour Rights & Schemes RAG)
    CHROMA_MODE: ChromaMode = ChromaMode.LOCAL
    CHROMA_PATH: str = str(BACKEND_DIR / "rag" / "chroma_db")
    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8100

    # Session Management
    SESSION_BACKEND: SessionBackend = SessionBackend.MEMORY
    REDIS_URL: str = "redis://localhost:6379/0"
    SESSION_TTL_SECONDS: int = 3600

    # Email / SMTP Settings
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    SMTP_FROM: str = "FarmConnect Support <support@farmconnect.com>"

    @property
    def cors_origins_list(self) -> list[str]:
        if self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def effective_db_url(self) -> str:
        if self.DB_DRIVER == DBDriver.SQLITE:
            sqlite_path = Path(self.SQLITE_PATH).resolve()
            sqlite_path.parent.mkdir(parents=True, exist_ok=True)
            # aiosqlite connection URI
            return f"sqlite+aiosqlite:///{sqlite_path.as_posix()}"
        if not self.DATABASE_URL:
            raise ValueError("DATABASE_URL is required when DB_DRIVER=postgres")
        return self.DATABASE_URL


settings = Settings()
