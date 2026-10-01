"""
agent-service/agents/llm.py

Returns the LangChain chat model configured by LLM_PROVIDER in .env.

Supported providers
-------------------
  gemini  →  ChatGoogleGenerativeAI   (langchain-google-genai)
  openai  →  ChatOpenAI               (langchain-openai)
  ollama  →  ChatOllama               (langchain-community)

Call get_llm() anywhere and you get back a BaseChatModel — the rest of
your agent code is provider-agnostic.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from langchain_core.language_models.chat_models import BaseChatModel

from config import settings, LLMProvider

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_llm(temperature: float | None = None) -> BaseChatModel:
    """
    Return a cached LangChain ChatModel based on LLM_PROVIDER.

    Parameters
    ----------
    temperature:  Override LLM_TEMPERATURE from config (optional).
    """
    temp = temperature if temperature is not None else settings.LLM_TEMPERATURE

    if settings.LLM_PROVIDER == LLMProvider.GEMINI:
        from langchain_google_genai import ChatGoogleGenerativeAI

        if not settings.GOOGLE_API_KEY:
            raise ValueError(
                "GOOGLE_API_KEY is not set. Add it to agent-service/.env"
            )
        logger.info("LLM: Gemini (%s)", settings.GEMINI_MODEL)
        return ChatGoogleGenerativeAI(
            model=settings.GEMINI_MODEL,
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=temp,
            max_output_tokens=settings.LLM_MAX_TOKENS,
        )

    if settings.LLM_PROVIDER == LLMProvider.OPENAI:
        from langchain_openai import ChatOpenAI

        if not settings.OPENAI_API_KEY:
            raise ValueError(
                "OPENAI_API_KEY is not set. Add it to agent-service/.env"
            )
        kwargs: dict = dict(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            temperature=temp,
            max_tokens=settings.LLM_MAX_TOKENS,
        )
        if settings.OPENAI_BASE_URL:
            kwargs["base_url"] = settings.OPENAI_BASE_URL
        logger.info("LLM: OpenAI (%s)", settings.OPENAI_MODEL)
        return ChatOpenAI(**kwargs)

    if settings.LLM_PROVIDER == LLMProvider.OLLAMA:
        from langchain_community.chat_models import ChatOllama

        logger.info(
            "LLM: Ollama (%s @ %s)", settings.OLLAMA_MODEL, settings.OLLAMA_BASE_URL
        )
        return ChatOllama(
            model=settings.OLLAMA_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=temp,
        )

    raise ValueError(f"Unknown LLM_PROVIDER: {settings.LLM_PROVIDER}")
