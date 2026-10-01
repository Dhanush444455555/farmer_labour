"""
agent-service/rag/ingest.py

Document ingestion pipeline for the ChromaDB "labour_knowledge" collection.

Supports:
  - Plain text files (.txt)
  - PDF files (.pdf)  — requires: pip install pypdf
  - Markdown files (.md)

Chunks each document, embeds it, and upserts into ChromaDB.
Existing documents are updated (not duplicated) via their stable doc_id.

Usage (from code):
    from rag.ingest import ingest_docs_folder, retrieve

Usage (as script):
    python -m rag.ingest --docs ./rag/docs --collection labour_knowledge
"""

from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path
from typing import Generator

logger = logging.getLogger(__name__)

# ── Collection name ────────────────────────────────────────────────────────────
COLLECTION_NAME = "labour_knowledge"

# ── Chunking config ────────────────────────────────────────────────────────────
CHUNK_SIZE    = 500   # characters per chunk
CHUNK_OVERLAP = 80    # overlap between adjacent chunks


# ─────────────────────────────────────────────────────────────────────────────
# Text extraction helpers
# ─────────────────────────────────────────────────────────────────────────────

def _extract_txt(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def _extract_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        return "\n".join(
            page.extract_text() or "" for page in reader.pages
        )
    except ImportError:
        logger.warning("pypdf not installed — skipping %s. Run: pip install pypdf", path.name)
        return ""
    except Exception as exc:
        logger.warning("PDF extraction failed for %s: %s", path.name, exc)
        return ""


def _extract_md(path: Path) -> str:
    """Strip markdown formatting, keep plain text."""
    text = path.read_text(encoding="utf-8", errors="ignore")
    # Remove headers, bold, italic, links, code fences
    text = re.sub(r"#{1,6}\s+", "", text)
    text = re.sub(r"\*{1,3}(.+?)\*{1,3}", r"\1", text)
    text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text, flags=re.DOTALL)
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    return text


EXTRACTORS = {
    ".txt": _extract_txt,
    ".md":  _extract_md,
    ".pdf": _extract_pdf,
}


def extract_text(path: Path) -> str:
    extractor = EXTRACTORS.get(path.suffix.lower())
    if extractor is None:
        logger.debug("Skipping unsupported file type: %s", path.name)
        return ""
    return extractor(path)


# ─────────────────────────────────────────────────────────────────────────────
# Chunking
# ─────────────────────────────────────────────────────────────────────────────

def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> Generator[str, None, None]:
    """Sliding-window character chunker."""
    text = text.strip()
    if not text:
        return
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        yield text[start:end]
        start += chunk_size - overlap


def _stable_doc_id(file_path: Path, chunk_index: int) -> str:
    """Deterministic ID so re-ingestion updates rather than duplicates."""
    raw = f"{file_path.name}::{chunk_index}"
    return hashlib.md5(raw.encode()).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# Ingestion
# ─────────────────────────────────────────────────────────────────────────────

def ingest_file(path: Path, collection_name: str = COLLECTION_NAME) -> int:
    """
    Ingest a single file into ChromaDB.
    Returns the number of chunks upserted.
    """
    from rag.chroma_client import get_collection

    text = extract_text(path)
    if not text.strip():
        logger.warning("No text extracted from %s", path.name)
        return 0

    collection = get_collection(collection_name)

    chunks  = list(chunk_text(text))
    ids     = [_stable_doc_id(path, i) for i in range(len(chunks))]
    metas   = [
        {
            "source":     path.name,
            "chunk":      i,
            "total":      len(chunks),
            "file_type":  path.suffix.lstrip("."),
        }
        for i in range(len(chunks))
    ]

    # Upsert in batches of 50 (ChromaDB limit)
    batch_size = 50
    for b in range(0, len(chunks), batch_size):
        collection.upsert(
            ids=ids[b : b + batch_size],
            documents=chunks[b : b + batch_size],
            metadatas=metas[b : b + batch_size],
        )

    logger.info("Ingested %s → %d chunks into '%s'", path.name, len(chunks), collection_name)
    return len(chunks)


def ingest_docs_folder(
    docs_dir: str | Path = "rag/docs",
    collection_name: str = COLLECTION_NAME,
    recursive: bool = True,
) -> dict[str, int]:
    """
    Ingest all supported files (*.txt, *.md, *.pdf) from docs_dir.

    Returns:
        dict mapping filename → chunk count
    """
    docs_path = Path(docs_dir)
    if not docs_path.exists():
        logger.warning("Docs folder not found: %s", docs_path.resolve())
        return {}

    pattern = "**/*" if recursive else "*"
    results: dict[str, int] = {}

    for path in sorted(docs_path.glob(pattern)):
        if path.is_file() and path.suffix.lower() in EXTRACTORS:
            count = ingest_file(path, collection_name)
            results[path.name] = count

    total = sum(results.values())
    logger.info(
        "Ingestion complete: %d files, %d total chunks into '%s'",
        len(results), total, collection_name,
    )
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Retrieve
# ─────────────────────────────────────────────────────────────────────────────

def retrieve(
    query: str,
    k: int = 3,
    collection_name: str = COLLECTION_NAME,
    where: dict | None = None,
) -> list[dict]:
    """
    Semantic search over the ChromaDB collection.

    Args:
        query:           Natural language question.
        k:               Number of results to return.
        collection_name: ChromaDB collection to search.
        where:           Optional metadata filter dict (ChromaDB syntax).

    Returns:
        List of result dicts with keys: text, source, score, metadata.
    """
    from rag.chroma_client import get_collection

    collection = get_collection(collection_name, create_if_missing=False)

    kwargs: dict = {
        "query_texts": [query],
        "n_results":   min(k, max(collection.count(), 1)),
        "include":     ["documents", "metadatas", "distances"],
    }
    if where:
        kwargs["where"] = where

    results = collection.query(**kwargs)

    docs      = results.get("documents",  [[]])[0]
    metas     = results.get("metadatas",  [[]])[0]
    distances = results.get("distances",  [[]])[0]

    return [
        {
            "text":     doc,
            "source":   meta.get("source", "unknown"),
            "score":    round(1 - dist, 4),   # cosine similarity (0-1, higher=better)
            "metadata": meta,
        }
        for doc, meta, dist in zip(docs, metas, distances)
    ]


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point  (python -m rag.ingest)
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse, sys

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-7s  %(message)s",
        datefmt="%H:%M:%S",
    )

    parser = argparse.ArgumentParser(description="Ingest documents into ChromaDB")
    parser.add_argument(
        "--docs",
        default="rag/docs",
        help="Path to the docs folder (default: rag/docs)",
    )
    parser.add_argument(
        "--collection",
        default=COLLECTION_NAME,
        help=f"ChromaDB collection name (default: {COLLECTION_NAME})",
    )
    parser.add_argument("--no-recursive", action="store_true")
    args = parser.parse_args()

    results = ingest_docs_folder(
        docs_dir=args.docs,
        collection_name=args.collection,
        recursive=not args.no_recursive,
    )

    if not results:
        print(f"\n⚠️  No files found in '{args.docs}'. Add .txt/.md/.pdf files and retry.")
        sys.exit(1)

    print(f"\n✅ Ingestion complete:")
    for fname, count in results.items():
        print(f"   {fname}: {count} chunks")
    print(f"\n   Total: {sum(results.values())} chunks in collection '{args.collection}'")
