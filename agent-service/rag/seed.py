"""
agent-service/rag/seed.py

One-time seed script for ChromaDB.

Run this ONCE to populate the "labour_knowledge" collection with:
  1. Built-in minimum-wage / labour-rights baseline data (no docs needed).
  2. Any .txt/.md/.pdf files you place in rag/docs/.

Usage:
    python rag/seed.py                        # seeds built-ins + rag/docs/
    python rag/seed.py --docs ./my_docs       # custom docs folder
    python rag/seed.py --built-in-only        # skip docs folder
    python rag/seed.py --clear                # wipe collection first, then seed
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

# Allow running from project root or agent-service/
sys.path.insert(0, str(Path(__file__).parent.parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("seed")

COLLECTION_NAME = "labour_knowledge"

# ─────────────────────────────────────────────────────────────────────────────
# Built-in seed documents
# ─────────────────────────────────────────────────────────────────────────────

BUILTIN_DOCS = [
    {
        "id": "tn_min_wage_2024",
        "text": (
            "Tamil Nadu minimum wage for agricultural labourers (2024): "
            "Unskilled farm workers: ₹423/day. Semi-skilled: ₹470/day. Skilled: ₹517/day. "
            "The Tamil Nadu government revises these rates every six months. "
            "Source: Tamil Nadu Labour Department Notification, April 2024."
        ),
        "metadata": {"state": "Tamil Nadu", "category": "minimum_wage", "year": "2024", "source": "builtin"},
    },
    {
        "id": "ka_min_wage_2024",
        "text": (
            "Karnataka minimum wage for agricultural labourers (2024): "
            "Unskilled: ₹419/day. Semi-skilled: ₹457/day. Skilled: ₹495/day. "
            "Karnataka Labour Department revised rates effective April 2024."
        ),
        "metadata": {"state": "Karnataka", "category": "minimum_wage", "year": "2024", "source": "builtin"},
    },
    {
        "id": "ap_min_wage_2024",
        "text": (
            "Andhra Pradesh agricultural minimum wage (2024): ₹382/day for unskilled field labourers. "
            "Wages below this are punishable under the Minimum Wages Act, 1948. "
            "MGNREGA floor wage in AP: ₹300/day."
        ),
        "metadata": {"state": "Andhra Pradesh", "category": "minimum_wage", "year": "2024", "source": "builtin"},
    },
    {
        "id": "te_min_wage_2024",
        "text": (
            "Telangana agricultural minimum wage (2024): ₹398/day for unskilled farm workers. "
            "MGNREGA wage rate in Telangana: ₹300/day. "
            "Employers must pay at least this amount by law."
        ),
        "metadata": {"state": "Telangana", "category": "minimum_wage", "year": "2024", "source": "builtin"},
    },
    {
        "id": "kerala_min_wage_2024",
        "text": (
            "Kerala agricultural minimum wage (2024): ₹700-900/day depending on crop and skill. "
            "Kerala has one of the highest farm wage rates in India due to labour scarcity. "
            "Rates are set by the Agricultural Workers Act 1974."
        ),
        "metadata": {"state": "Kerala", "category": "minimum_wage", "year": "2024", "source": "builtin"},
    },
    {
        "id": "mgnrega_rates_2024",
        "text": (
            "MGNREGA (Mahatma Gandhi National Rural Employment Guarantee Act) wage rates 2024-25: "
            "Tamil Nadu: ₹294/day. Karnataka: ₹349/day. Andhra Pradesh: ₹300/day. "
            "Telangana: ₹300/day. Kerala: ₹371/day. Rajasthan: ₹255/day. "
            "MGNREGA guarantees 100 days of unskilled manual work per household per year. "
            "These are the government floor rates for unskilled rural labour."
        ),
        "metadata": {"category": "mgnrega", "year": "2024", "source": "builtin"},
    },
    {
        "id": "labour_rights_basics",
        "text": (
            "Key rights of agricultural labourers in India: "
            "(1) Right to minimum wage under the Minimum Wages Act, 1948. "
            "(2) Right to equal pay for equal work regardless of gender (Equal Remuneration Act 1976). "
            "(3) Right to safe working conditions. "
            "(4) Right to weekly rest — at least one day off per week. "
            "(5) Child labour in agriculture is prohibited for children under 14 years of age (Child Labour Act 1986). "
            "(6) Bonded labour is illegal under the Bonded Labour System (Abolition) Act 1976. "
            "(7) Right to gratuity after 5 years of continuous service (Payment of Gratuity Act 1972)."
        ),
        "metadata": {"category": "rights", "scope": "national", "source": "builtin"},
    },
    {
        "id": "gender_pay_equality",
        "text": (
            "The Equal Remuneration Act 1976 mandates equal wages for men and women doing the same or similar work. "
            "Female farm labourers (for tasks like weeding, transplanting, harvesting) must receive "
            "the same daily wage as male labourers. Paying women less than men for equivalent farm work is illegal "
            "and subject to a fine up to ₹20,000 or imprisonment up to 1 month. "
            "In Tamil Nadu, women form over 60% of the agricultural workforce."
        ),
        "metadata": {"category": "gender_equality", "scope": "national", "source": "builtin"},
    },
    {
        "id": "wage_deduction_rules",
        "text": (
            "Under the Payment of Wages Act 1936, employers cannot make unauthorised deductions from wages. "
            "Allowed deductions: PF contributions (12% of basic), income tax, fines (max 3% of wages with notice). "
            "Wages must be paid within 2 working days for daily-wage workers. "
            "Delayed payment of more than 7 days entitles workers to compensation."
        ),
        "metadata": {"category": "wage_payment", "scope": "national", "source": "builtin"},
    },
    {
        "id": "seasonal_labour_rights",
        "text": (
            "Seasonal farm labourers and migrant workers are protected under the "
            "Inter-State Migrant Workmen Act 1979. Key provisions: "
            "employers must provide journey allowance, displacement allowance (equal to 50% of daily wage), "
            "suitable accommodation, and medical facilities. "
            "Contractors must register and obtain a license before deploying migrant workers."
        ),
        "metadata": {"category": "migrant_labour", "scope": "national", "source": "builtin"},
    },
    {
        "id": "harvesting_wages_tn",
        "text": (
            "Typical market wages for common farm tasks in Tamil Nadu (2024): "
            "Harvesting (paddy/wheat): ₹450-600/day. "
            "Transplanting seedlings: ₹400-500/day. "
            "Weeding: ₹380-450/day. "
            "Ploughing (with own tool): ₹500-700/day. "
            "Spraying pesticides: ₹500-600/day (hazard premium). "
            "Wages vary by district — Salem, Erode, and Coimbatore tend to be higher."
        ),
        "metadata": {"state": "Tamil Nadu", "category": "market_wages", "year": "2024", "source": "builtin"},
    },
    {
        "id": "fair_wage_definition",
        "text": (
            "A 'fair wage' in Indian agricultural context is generally considered to be: "
            "(1) At or above the state minimum wage for that skill category. "
            "(2) Comparable to the MGNREGA rate in the district. "
            "(3) Sufficient to meet basic food, shelter, and transport needs. "
            "The Fair Wages Committee (1948) defined fair wage as above subsistence level, "
            "below the living wage, taking into account regional cost of living. "
            "A wage below ₹350/day in Tamil Nadu (2024) is generally considered unfair."
        ),
        "metadata": {"category": "fair_wage", "scope": "national", "source": "builtin"},
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# Seed functions
# ─────────────────────────────────────────────────────────────────────────────

def seed_builtins(collection_name: str = COLLECTION_NAME) -> int:
    """Upsert all built-in documents. Returns count seeded."""
    from rag.chroma_client import get_collection

    col = get_collection(collection_name)
    col.upsert(
        ids=[d["id"] for d in BUILTIN_DOCS],
        documents=[d["text"] for d in BUILTIN_DOCS],
        metadatas=[d["metadata"] for d in BUILTIN_DOCS],
    )
    logger.info("✅ Seeded %d built-in documents into '%s'", len(BUILTIN_DOCS), collection_name)
    return len(BUILTIN_DOCS)


def seed_from_docs(
    docs_dir: str | Path = "rag/docs",
    collection_name: str = COLLECTION_NAME,
) -> dict[str, int]:
    """Ingest all files from docs_dir. Returns {filename: chunk_count}."""
    from rag.ingest import ingest_docs_folder

    results = ingest_docs_folder(docs_dir=docs_dir, collection_name=collection_name)
    if not results:
        logger.info("No external docs found in '%s' — skipping.", docs_dir)
    return results


def clear_collection(collection_name: str = COLLECTION_NAME) -> None:
    """Delete and recreate the collection (full wipe)."""
    from rag.chroma_client import get_chroma_client, get_collection

    client = get_chroma_client()
    try:
        client.delete_collection(collection_name)
        logger.info("🗑️  Deleted existing collection '%s'", collection_name)
    except Exception:
        logger.info("Collection '%s' didn't exist yet", collection_name)
    get_collection(collection_name)   # recreate empty


def print_stats(collection_name: str = COLLECTION_NAME) -> None:
    """Print collection stats and a few sample documents."""
    from rag.chroma_client import get_collection

    col = get_collection(collection_name, create_if_missing=False)
    count = col.count()
    print(f"\n📊 Collection '{collection_name}': {count} documents")

    if count > 0:
        sample = col.peek(min(5, count))
        print("\nSample documents:")
        for i, (doc_id, text) in enumerate(
            zip(sample["ids"], sample["documents"]), 1
        ):
            print(f"  {i}. [{doc_id}] {text[:120]}...")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Seed ChromaDB with labour rights / minimum wage data"
    )
    parser.add_argument(
        "--docs",
        default="rag/docs",
        help="Path to extra docs folder (default: rag/docs)",
    )
    parser.add_argument(
        "--collection",
        default=COLLECTION_NAME,
        help=f"ChromaDB collection name (default: {COLLECTION_NAME})",
    )
    parser.add_argument(
        "--built-in-only",
        action="store_true",
        help="Only seed built-in data, skip docs folder",
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Wipe the collection before seeding (fresh start)",
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Just print collection stats and exit",
    )
    args = parser.parse_args()

    if args.stats:
        print_stats(args.collection)
        sys.exit(0)

    if args.clear:
        clear_collection(args.collection)

    builtin_count = seed_builtins(args.collection)

    file_results: dict[str, int] = {}
    if not args.built_in_only:
        file_results = seed_from_docs(
            docs_dir=args.docs,
            collection_name=args.collection,
        )

    total_files  = len(file_results)
    total_chunks = sum(file_results.values())

    print(f"\n✅ Seed complete!")
    print(f"   Built-in documents : {builtin_count}")
    print(f"   External files     : {total_files}")
    print(f"   External chunks    : {total_chunks}")
    print(f"   Collection         : '{args.collection}'")

    print_stats(args.collection)
