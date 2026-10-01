"""agent-service/rag/__init__.py"""
from .chroma_client import get_chroma_client, get_collection, init_rag
from .embeddings import get_embedding_function
from .ingest import ingest_docs_folder, retrieve

__all__ = [
    "get_chroma_client",
    "get_collection",
    "init_rag",
    "get_embedding_function",
    "retrieve",
    "ingest_docs_folder",
]
