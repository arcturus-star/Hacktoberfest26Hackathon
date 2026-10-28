from __future__ import annotations

import csv
import io
import re
from datetime import datetime
from typing import Any

from db import normalize_category


_DATE_FORMATS = (
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%m/%d/%Y",
    "%d/%m/%Y",
    "%m-%d-%Y",
    "%b %d, %Y",
    "%B %d, %Y",
)


def _parse_csv_date(raw: str) -> str | None:
    s = (raw or "").strip()
    if not s:
        return None
    if len(s) >= 10 and re.match(r"^\d{4}-\d{2}-\d{2}", s):
        s = s[:10]
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _parse_csv_amount(raw: str) -> float | None:
    s = (raw or "").strip()
    if not s:
        return None
    cleaned = re.sub(r"[^0-9.\-]", "", s.replace(",", ""))
    if not cleaned or cleaned in ("-", ".", "-."):
        return None
    try:
        return round(float(cleaned), 2)
    except ValueError:
        return None


def _infer_category_from_merchant(merchant: str, raw_cat: str | None) -> str:
    if raw_cat and raw_cat.strip():
        return normalize_category(raw_cat)
    m = merchant.lower()
    if any(k in m for k in ("groc", "mart", "market", "trader", "whole foods", "aldi", "kroger")):
        return "Groceries"
    if any(k in m for k in ("cafe", "coffee", "bistro", "pizza", "burger", "taco", "grill", "diner", "bakery")):
        return "Dining"
    if any(k in m for k in ("stream", "flix", "cloud", "vault", "spotify", "plus", "pro", "sub", "gym", "membership")):
        return "Subscriptions"
    if any(k in m for k in ("power", "electric", "water", "gas util", "fiber", "internet", "telecom")):
        return "Utilities"
    if any(k in m for k in ("transit", "metro", "uber", "lyft", "shell", "chevron", "parking", "rail")):
        return "Transport"
    if any(k in m for k in ("cinema", "theater", "ticket", "arcade", "game")):
        return "Entertainment"
    if any(k in m for k in ("pharm", "clinic", "dental", "medical", "health")):
        return "Health"
    if any(k in m for k in ("tech", "electro", "hardware", "target", "amazon", "shop", "store")):
        return "Shopping"
    return "Other"


def parse_bank_csv(csv_text: str, source_file: str = "upload.csv") -> list[dict[str, Any]]:
    if not csv_text or not csv_text.strip():
        return []

    reader = csv.DictReader(io.StringIO(csv_text.lstrip("\ufeff")))
    if not reader.fieldnames:
        return []

    raw_rows: list[dict[str, Any]] = []
    for idx, row in enumerate(reader):
        norm_row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}

        raw_date = (
            norm_row.get("date")
            or norm_row.get("tx_date")
            or norm_row.get("transaction date")
            or norm_row.get("posting date")
            or ""
        )
        tx_date = _parse_csv_date(raw_date)
        if not tx_date:
            continue

        merchant = (
            norm_row.get("merchant")
            or norm_row.get("payee")
            or norm_row.get("name")
            or norm_row.get("description")
            or norm_row.get("memo")
            or ""
        ).strip()
        if not merchant:
            continue

        raw_amount = (
            norm_row.get("amount")
            or norm_row.get("total")
            or norm_row.get("debit")
            or norm_row.get("charge")
            or ""
        )
        amount = _parse_csv_amount(raw_amount)
        if amount is None or amount == 0.0:
            continue

        currency = (norm_row.get("currency") or "USD").upper()[:3]
        raw_cat = norm_row.get("category") or norm_row.get("type")
        desc = norm_row.get("description") or norm_row.get("memo") or merchant

        raw_rows.append(
            {
                "idx": idx,
                "date": tx_date,
                "merchant": merchant,
                "amount": amount,
                "currency": currency,
                "raw_cat": raw_cat,
                "desc": desc,
            }
        )

    if not raw_rows:
        return []

    # Handle bank statements where debits are negative and credits/deposits are positive,
    # vs statements where all expenses are positive.
    neg_count = sum(1 for r in raw_rows if r["amount"] < 0)
    pos_count = sum(1 for r in raw_rows if r["amount"] > 0)
    invert_sign = neg_count > pos_count

    records: list[dict[str, Any]] = []
    for r in raw_rows:
        amt = -r["amount"] if invert_sign else r["amount"]
        if amt <= 0:
            continue
        category = _infer_category_from_merchant(r["merchant"], r["raw_cat"])
        records.append(
            {
                "source": "csv",
                "source_file": source_file,
                "merchant": r["merchant"],
                "date": r["date"],
                "total": round(amt, 2),
                "currency": r["currency"],
                "category": category,
                "line_items": [{"description": r["desc"], "amount": round(amt, 2)}],
                "status": "ok",
                "needs_review": False,
                "row_salt": str(r["idx"]),
            }
        )
    return records
