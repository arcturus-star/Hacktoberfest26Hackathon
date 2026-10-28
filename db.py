from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

ALLOWED_CATEGORIES = (
    "Groceries",
    "Dining",
    "Subscriptions",
    "Utilities",
    "Transport",
    "Shopping",
    "Entertainment",
    "Health",
    "Other",
)

_MERCHANT_NOISE_RE = re.compile(
    r"(?:\s+#\d+|\s+store\s*\d+|\s*\*\w+|\s+(?:inc|llc|ltd|corp|co)\.?|\s+pos\b|\s+purchase\b)+$",
    re.IGNORECASE,
)


def get_db_path(db_path: str | None = None) -> str:
    return db_path or os.environ.get("LAZYLEDGER_DB", "lazyledger.db")


def normalize_merchant(merchant: str) -> str:
    cleaned = (merchant or "").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = _MERCHANT_NOISE_RE.sub("", cleaned).strip()
    cleaned = re.sub(r"[^a-zA-Z0-9&\s\-'.]", "", cleaned).strip().lower()
    return cleaned or "unknown"


def normalize_category(category: str | None) -> str:
    if not category:
        return "Other"
    raw = category.strip().lower()
    mapping = {
        "grocery": "Groceries",
        "groceries": "Groceries",
        "supermarket": "Groceries",
        "food": "Dining",
        "dining": "Dining",
        "restaurant": "Dining",
        "cafe": "Dining",
        "coffee": "Dining",
        "subscription": "Subscriptions",
        "subscriptions": "Subscriptions",
        "software": "Subscriptions",
        "saas": "Subscriptions",
        "membership": "Subscriptions",
        "utility": "Utilities",
        "utilities": "Utilities",
        "bills": "Utilities",
        "internet": "Utilities",
        "electric": "Utilities",
        "transport": "Transport",
        "transportation": "Transport",
        "transit": "Transport",
        "gas": "Transport",
        "fuel": "Transport",
        "travel": "Transport",
        "shopping": "Shopping",
        "retail": "Shopping",
        "electronics": "Shopping",
        "entertainment": "Entertainment",
        "movies": "Entertainment",
        "gaming": "Entertainment",
        "health": "Health",
        "medical": "Health",
        "pharmacy": "Health",
        "fitness": "Health",
        "other": "Other",
    }
    if raw in mapping:
        return mapping[raw]
    for allowed in ALLOWED_CATEGORIES:
        if allowed.lower() in raw:
            return allowed
    return "Other"


@contextmanager
def get_conn(db_path: str | None = None) -> Iterator[sqlite3.Connection]:
    path = get_db_path(db_path)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(db_path: str | None = None) -> None:
    with get_conn(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL DEFAULT 'receipt',
                source_file TEXT,
                merchant TEXT NOT NULL,
                normalized_merchant TEXT NOT NULL,
                tx_date TEXT NOT NULL,
                total REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'USD',
                category TEXT NOT NULL DEFAULT 'Other',
                line_items_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'ok',
                needs_review INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                raw_model_output TEXT,
                row_hash TEXT UNIQUE,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(tx_date)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_norm_merchant ON transactions(normalized_merchant)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS processed_inbox (
                file_hash TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                status TEXT NOT NULL,
                processed_at TEXT NOT NULL
            )
            """
        )


def compute_row_hash(
    source: str,
    merchant: str,
    tx_date: str,
    total: float,
    source_file: str | None = None,
    unique_salt: str | None = None,
) -> str:
    payload = f"{source}|{normalize_merchant(merchant)}|{tx_date}|{total:.2f}|{source_file or ''}|{unique_salt or ''}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    try:
        d["line_items"] = json.loads(d.get("line_items_json") or "[]")
    except (TypeError, ValueError):
        d["line_items"] = []
    d["needs_review"] = bool(d.get("needs_review"))
    return d


def insert_transaction(
    record: dict[str, Any],
    db_path: str | None = None,
    allow_duplicate: bool = False,
) -> dict[str, Any]:
    init_db(db_path)
    merchant = str(record.get("merchant") or "Unknown Merchant").strip()
    norm_merchant = normalize_merchant(merchant)
    tx_date = str(record.get("date") or record.get("tx_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    total = round(float(record.get("total", 0.0) or 0.0), 2)
    currency = str(record.get("currency") or "USD").upper()[:3]
    category = normalize_category(record.get("category"))
    line_items = record.get("line_items")
    if not isinstance(line_items, list):
        line_items = []
    status = str(record.get("status") or "ok")
    needs_review = 1 if (record.get("needs_review") or status == "needs_review") else 0
    if needs_review:
        status = "needs_review"

    source = str(record.get("source") or "receipt")
    source_file = record.get("source_file")
    error_message = record.get("error_message")
    raw_model_output = record.get("raw_model_output")
    now_iso = datetime.now(timezone.utc).isoformat()

    salt = now_iso if allow_duplicate else record.get("row_salt")
    row_hash = record.get("row_hash") or compute_row_hash(
        source=source,
        merchant=merchant,
        tx_date=tx_date,
        total=total,
        source_file=source_file,
        unique_salt=salt,
    )

    with get_conn(db_path) as conn:
        cur = conn.execute(
            """
            INSERT OR IGNORE INTO transactions (
                source, source_file, merchant, normalized_merchant, tx_date,
                total, currency, category, line_items_json, status,
                needs_review, error_message, raw_model_output, row_hash, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source,
                source_file,
                merchant,
                norm_merchant,
                tx_date,
                total,
                currency,
                category,
                json.dumps(line_items),
                status,
                needs_review,
                error_message,
                raw_model_output,
                row_hash,
                now_iso,
            ),
        )
        if cur.lastrowid and cur.rowcount > 0:
            row = conn.execute(
                "SELECT * FROM transactions WHERE id = ?", (cur.lastrowid,)
            ).fetchone()
            return _row_to_dict(row)
        existing = conn.execute(
            "SELECT * FROM transactions WHERE row_hash = ?", (row_hash,)
        ).fetchone()
        if existing:
            res = _row_to_dict(existing)
            res["duplicate"] = True
            return res
    return record


def bulk_insert_transactions(
    records: list[dict[str, Any]], db_path: str | None = None
) -> dict[str, int]:
    init_db(db_path)
    inserted = 0
    skipped = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_conn(db_path) as conn:
        for idx, record in enumerate(records):
            merchant = str(record.get("merchant") or "Unknown Merchant").strip()
            norm_merchant = normalize_merchant(merchant)
            tx_date = str(record.get("date") or record.get("tx_date") or "")
            total = round(float(record.get("total", 0.0) or 0.0), 2)
            currency = str(record.get("currency") or "USD").upper()[:3]
            category = normalize_category(record.get("category"))
            line_items = record.get("line_items") if isinstance(record.get("line_items"), list) else []
            status = str(record.get("status") or "ok")
            needs_review = 1 if (record.get("needs_review") or status == "needs_review") else 0
            source = str(record.get("source") or "csv")
            source_file = record.get("source_file")
            row_hash = record.get("row_hash") or compute_row_hash(
                source=source,
                merchant=merchant,
                tx_date=tx_date,
                total=total,
                source_file=None if source == "csv" else source_file,
                unique_salt=str(record.get("row_salt", idx)),
            )
            cur = conn.execute(
                """
                INSERT OR IGNORE INTO transactions (
                    source, source_file, merchant, normalized_merchant, tx_date,
                    total, currency, category, line_items_json, status,
                    needs_review, error_message, raw_model_output, row_hash, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    source,
                    source_file,
                    merchant,
                    norm_merchant,
                    tx_date,
                    total,
                    currency,
                    category,
                    json.dumps(line_items),
                    status,
                    needs_review,
                    record.get("error_message"),
                    record.get("raw_model_output"),
                    row_hash,
                    now_iso,
                ),
            )
            if cur.rowcount > 0:
                inserted += 1
            else:
                skipped += 1
    return {"inserted": inserted, "skipped": skipped}


def list_transactions(
    limit: int = 1000,
    status: str | None = None,
    db_path: str | None = None,
) -> list[dict[str, Any]]:
    init_db(db_path)
    with get_conn(db_path) as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM transactions WHERE status = ? ORDER BY tx_date DESC, id DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM transactions ORDER BY tx_date DESC, id DESC LIMIT ?",
                (limit,),
            ).fetchall()
    return [_row_to_dict(r) for r in rows]


def update_transaction(
    tx_id: int, updates: dict[str, Any], db_path: str | None = None
) -> dict[str, Any] | None:
    init_db(db_path)
    with get_conn(db_path) as conn:
        existing = conn.execute(
            "SELECT * FROM transactions WHERE id = ?", (tx_id,)
        ).fetchone()
        if not existing:
            return None
        current = dict(existing)
        merchant = str(updates.get("merchant", current["merchant"])).strip()
        norm_merchant = normalize_merchant(merchant)
        tx_date = str(updates.get("tx_date") or updates.get("date") or current["tx_date"]).strip()
        total = round(float(updates.get("total", current["total"])), 2)
        currency = str(updates.get("currency", current["currency"])).upper()[:3]
        category = normalize_category(updates.get("category", current["category"]))
        status = str(updates.get("status", "ok"))
        needs_review = 0 if status == "ok" else 1
        error_message = None if status == "ok" else updates.get("error_message", current["error_message"])

        conn.execute(
            """
            UPDATE transactions
            SET merchant = ?, normalized_merchant = ?, tx_date = ?, total = ?,
                currency = ?, category = ?, status = ?, needs_review = ?, error_message = ?
            WHERE id = ?
            """,
            (
                merchant,
                norm_merchant,
                tx_date,
                total,
                currency,
                category,
                status,
                needs_review,
                error_message,
                tx_id,
            ),
        )
        updated = conn.execute(
            "SELECT * FROM transactions WHERE id = ?", (tx_id,)
        ).fetchone()
        return _row_to_dict(updated) if updated else None


def delete_transaction(tx_id: int, db_path: str | None = None) -> bool:
    init_db(db_path)
    with get_conn(db_path) as conn:
        cur = conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
        return cur.rowcount > 0


def clear_transactions(db_path: str | None = None) -> None:
    init_db(db_path)
    with get_conn(db_path) as conn:
        conn.execute("DELETE FROM transactions")
        conn.execute("DELETE FROM processed_inbox")


def is_inbox_file_processed(file_hash: str, db_path: str | None = None) -> bool:
    init_db(db_path)
    with get_conn(db_path) as conn:
        row = conn.execute(
            "SELECT 1 FROM processed_inbox WHERE file_hash = ?", (file_hash,)
        ).fetchone()
        return row is not None


def mark_inbox_file_processed(
    file_hash: str, filename: str, status: str = "ok", db_path: str | None = None
) -> None:
    init_db(db_path)
    with get_conn(db_path) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO processed_inbox (file_hash, filename, status, processed_at)
            VALUES (?, ?, ?, ?)
            """,
            (file_hash, filename, status, datetime.now(timezone.utc).isoformat()),
        )
