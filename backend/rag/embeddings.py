"""
agent-service/rag/embeddings.py

Returns a ChromaDB-compatible EmbeddingFunction.
Uses the sentence-transformers model (all-MiniLM-L6-v2) by default —
fully local, no API key needed.

If you want to use OpenAI embeddings, set:
    CHROMA_EMBEDDING_MODEL=text-embedding-3-small
and the function will switch automatically.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from chromadb import EmbeddingFunction

from config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_embedding_function() -> EmbeddingFunction:
    """
    Returns a cached ChromaDB EmbeddingFunction.

    - Default (all-MiniLM-L6-v2): local sentence-transformers, no API key.
    - text-embedding-*: OpenAI embeddings (requires OPENAI_API_KEY).
    """
    model = settings.CHROMA_EMBEDDING_MODEL

    if model.startswith("text-embedding-"):
        # OpenAI embeddings
        from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

        logger.info("Using OpenAI embeddings: %s", model)
        return OpenAIEmbeddingFunction(
            api_key=settings.OPENAI_API_KEY,
            model_name=model,
        )

    # Sentence-transformers (local, default)
    try:
        from chromadb.utils.embedding_functions import (
            SentenceTransformerEmbeddingFunction,
        )

        logger.info("Using SentenceTransformer embeddings: %s", model)
        return SentenceTransformerEmbeddingFunction(model_name=model)
    except (ImportError, ValueError, Exception) as exc:
        logger.warning(
            "sentence-transformers not available (%s); falling back to ChromaDB default embeddings", exc
        )
        from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

        return DefaultEmbeddingFunction()
