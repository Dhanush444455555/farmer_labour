"""
agent-service/rag/chroma_client.py

Manages the ChromaDB client and named collections.

Supports two modes (set CHROMA_MODE in .env):
  - "local"  →  PersistentClient writing to CHROMA_PATH on disk
  - "http"   →  HttpClient pointing at a running ChromaDB server
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import chromadb
from chromadb import Collection
from chromadb.config import Settings as ChromaSettings

from config import settings
from .embeddings import get_embedding_function

logger = logging.getLogger(__name__)

# Module-level singleton so we don't reconnect on every request
_client: Optional[chromadb.ClientAPI] = None


def get_chroma_client() -> chromadb.ClientAPI:
    """Return (and cache) the ChromaDB client."""
    global _client
    if _client is not None:
        return _client

    if settings.CHROMA_MODE == "http":
        logger.info(
            "Connecting to ChromaDB HTTP server at %s:%s",
            settings.CHROMA_HOST,
            settings.CHROMA_PORT,
        )
        _client = chromadb.HttpClient(
            host=settings.CHROMA_HOST,
            port=settings.CHROMA_PORT,
        )
    else:
        persist_dir = Path(settings.CHROMA_PATH)
        persist_dir.mkdir(parents=True, exist_ok=True)
        logger.info("ChromaDB local persistence at %s", persist_dir)
        _client = chromadb.PersistentClient(
            path=str(persist_dir),
            settings=ChromaSettings(anonymized_telemetry=False),
        )

    return _client


def get_collection(name: str, create_if_missing: bool = True) -> Collection:
    """
    Return a ChromaDB collection by name.

    Parameters
    ----------
    name:               Collection name (use constants from config.settings).
    create_if_missing:  If True, create the collection when it doesn't exist.
    """
    client = get_chroma_client()
    ef = get_embedding_function()

    if create_if_missing:
        return client.get_or_create_collection(
            name=name,
            embedding_function=ef,
            metadata={"hnsw:space": "cosine"},
        )
    return client.get_collection(name=name, embedding_function=ef)


async def init_rag() -> None:
    """
    Called at application startup.
    Pre-warms the ChromaDB client and ensures the collections exist.
    Also seeds the labour-rights collection if it is empty.
    """
    try:
        client = get_chroma_client()

        # Ensure collections exist
        labour_col = get_collection(settings.CHROMA_LABOUR_RIGHTS_COLLECTION)
        _           = get_collection(settings.CHROMA_JOBS_COLLECTION)

        labour_count = labour_col.count()
        logger.info(
            "✅ ChromaDB ready | labour_rights: %d docs | mode: %s",
            labour_count,
            settings.CHROMA_MODE,
        )

        # Auto-seed labour rights data if collection is empty
        if labour_count == 0:
            await _seed_labour_rights(labour_col)

    except Exception as exc:
        # RAG is non-critical; log and continue
        logger.warning("⚠️  ChromaDB init failed (RAG disabled): %s", exc)


async def _seed_labour_rights(collection: Collection) -> None:
    """
    Seeds the labour_rights collection with baseline minimum-wage and
    labour-law data for South Indian agricultural states.
    Mirrors the content seeded by the Node backend's chromaLabourRights.js.
    """
    docs = [
        {
            "id": "tn_min_wage_2024",
            "text": (
                "Tamil Nadu minimum wage for agricultural labourers (2024): "
                "₹423/day for unskilled workers, ₹470/day for semi-skilled, "
                "₹517/day for skilled.  State government revises rates every 6 months."
            ),
            "metadata": {"state": "Tamil Nadu", "category": "minimum_wage", "year": "2024"},
        },
        {
            "id": "ka_min_wage_2024",
            "text": (
                "Karnataka minimum wage for farm labour (2024): ₹419/day unskilled, "
                "₹457/day semi-skilled.  Karnataka Labour Department Notification dated April 2024."
            ),
            "metadata": {"state": "Karnataka", "category": "minimum_wage", "year": "2024"},
        },
        {
            "id": "ap_min_wage_2024",
            "text": (
                "Andhra Pradesh agricultural minimum wage (2024): ₹382/day for field labourers. "
                "Wages below this are punishable under the Minimum Wages Act, 1948."
            ),
            "metadata": {"state": "Andhra Pradesh", "category": "minimum_wage", "year": "2024"},
        },
        {
            "id": "te_min_wage_2024",
            "text": (
                "Telangana agricultural minimum wage (2024): ₹398/day.  "
                "MGNREGA acts as a wage floor in rural areas."
            ),
            "metadata": {"state": "Telangana", "category": "minimum_wage", "year": "2024"},
        },
        {
            "id": "mgnrega_2024",
            "text": (
                "MGNREGA (Mahatma Gandhi National Rural Employment Guarantee Act) wage rates 2024-25: "
                "Tamil Nadu ₹294/day, Karnataka ₹349/day, Andhra Pradesh ₹300/day, "
                "Telangana ₹300/day.  These are the government floor rates for unskilled rural labour."
            ),
            "metadata": {"category": "mgnrega", "year": "2024"},
        },
        {
            "id": "labour_rights_basics",
            "text": (
                "Key rights of agricultural labourers in India: "
                "(1) Right to minimum wage under Minimum Wages Act 1948. "
                "(2) Right to equal pay for equal work regardless of gender. "
                "(3) Right to safe working conditions. "
                "(4) Right to weekly rest (at least one day off per week). "
                "(5) Child labour in agriculture is prohibited for children under 14 years. "
                "(6) Bonded labour is illegal and punishable under Bonded Labour System (Abolition) Act 1976."
            ),
            "metadata": {"category": "rights", "scope": "national"},
        },
        {
            "id": "gender_pay_equality",
            "text": (
                "The Equal Remuneration Act 1976 mandates equal wages for men and women "
                "doing the same or similar work.  Female farm labourers must receive the "
                "same daily wage as male labourers for equivalent tasks like weeding, harvesting, "
                "or transplanting.  Paying less on the basis of gender is illegal."
            ),
            "metadata": {"category": "gender_equality", "scope": "national"},
        },
        {
            "id": "wage_deduction_rules",
            "text": (
                "Under the Payment of Wages Act 1936, employers cannot make unauthorised "
                "deductions from wages.  Allowed deductions: PF contributions, income tax, "
                "fines (max 3% of wages) with prior notice.  Wages must be paid within "
                "2 working days for daily-wage workers."
            ),
            "metadata": {"category": "wage_payment", "scope": "national"},
        },
    ]

    collection.add(
        ids=[d["id"] for d in docs],
        documents=[d["text"] for d in docs],
        metadatas=[d["metadata"] for d in docs],
    )
    logger.info("✅ Seeded %d labour rights documents into ChromaDB", len(docs))
