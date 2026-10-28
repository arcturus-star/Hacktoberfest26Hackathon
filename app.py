from __future__ import annotations

import asyncio
import contextlib
import hashlib
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from analytics import run_all_analytics  # noqa: E402
from csv_ingest import parse_bank_csv
from db import (
    bulk_insert_transactions,
    clear_transactions,
    delete_transaction,
    get_db_path,
    init_db,
    insert_transaction,
    is_inbox_file_processed,
    list_transactions,
    mark_inbox_file_processed,
    update_transaction,
)
from gemma import draft_cancellation_email, extract_receipt, get_gemma_config
from tabpfn_analytics import is_tabpfn_enabled

BASE_DIR = Path(__file__).resolve().parent
STATIC_INDEX = BASE_DIR / "static" / "index.html"
SAMPLE_CSV = BASE_DIR / "sample_data" / "transactions.csv"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def get_inbox_dir() -> Path:
    custom = os.environ.get("LAZYLEDGER_INBOX_DIR")
    path = Path(custom) if custom else (BASE_DIR / "inbox")
    path.mkdir(parents=True, exist_ok=True)
    return path


def scan_inbox_once(
    inbox_dir: Path | None = None, db_path: str | None = None
) -> dict[str, Any]:
    folder = inbox_dir or get_inbox_dir()
    init_db(db_path)

    processed_receipts = 0
    processed_csvs = 0
    csv_rows_added = 0
    needs_review = 0
    skipped = 0

    for entry in sorted(folder.iterdir()):
        if not entry.is_file() or entry.name.startswith("."):
            continue
        ext = entry.suffix.lower()
        if ext not in IMAGE_EXTENSIONS and ext != ".csv":
            continue

        try:
            raw_bytes = entry.read_bytes()
        except OSError:
            continue

        file_hash = hashlib.sha256(raw_bytes).hexdigest()
        if is_inbox_file_processed(file_hash, db_path=db_path):
            skipped += 1
            continue

        if ext in IMAGE_EXTENSIONS:
            extracted = extract_receipt(raw_bytes, filename=entry.name)
            extracted["source"] = "inbox_receipt"
            extracted["source_file"] = entry.name
            extracted["row_salt"] = file_hash
            saved = insert_transaction(extracted, db_path=db_path)
            st = str(saved.get("status") or "ok")
            if saved.get("needs_review") or st == "needs_review":
                needs_review += 1
            mark_inbox_file_processed(file_hash, entry.name, status=st, db_path=db_path)
            processed_receipts += 1
        elif ext == ".csv":
            text = raw_bytes.decode("utf-8", errors="replace")
            rows = parse_bank_csv(text, source_file=entry.name)
            for r in rows:
                r["source"] = "inbox_csv"
            res = bulk_insert_transactions(rows, db_path=db_path)
            csv_rows_added += res["inserted"]
            mark_inbox_file_processed(file_hash, entry.name, status="ok", db_path=db_path)
            processed_csvs += 1

    return {
        "processed_receipts": processed_receipts,
        "processed_csvs": processed_csvs,
        "csv_rows_added": csv_rows_added,
        "needs_review": needs_review,
        "skipped": skipped,
    }


async def _inbox_watcher_loop() -> None:
    poll_sec = float(os.environ.get("LAZYLEDGER_INBOX_POLL_SECONDS", "5.0"))
    while True:
        try:
            await asyncio.to_thread(scan_inbox_once)
        except Exception:
            pass
        await asyncio.sleep(max(1.0, poll_sec))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    get_inbox_dir()
    watcher_task: asyncio.Task[None] | None = None
    if os.environ.get("LAZYLEDGER_DISABLE_WATCHER", "0") != "1":
        watcher_task = asyncio.create_task(_inbox_watcher_loop())
    try:
        yield
    finally:
        if watcher_task is not None:
            watcher_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await watcher_task


app = FastAPI(
    title="LazyLedger",
    description="Open-weight receipt & bank CSV analyzer powered by Gemma",
    version="1.0.0",
    lifespan=lifespan,
)


class CancelEmailRequest(BaseModel):
    merchant: str
    latest_amount: float = 0.0
    currency: str = "USD"
    last_date: str | None = None
    account_hint: str | None = None


class TransactionUpdateRequest(BaseModel):
    merchant: str | None = None
    tx_date: str | None = None
    total: float | None = None
    currency: str | None = None
    category: str | None = None
    status: str = "ok"


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    if not STATIC_INDEX.exists():
        raise HTTPException(status_code=404, detail="static/index.html not found")
    return HTMLResponse(STATIC_INDEX.read_text(encoding="utf-8"))


@app.get("/api/status")
def api_status() -> dict[str, Any]:
    cfg = get_gemma_config()
    return {
        "gemma_base_url": cfg["base_url"],
        "gemma_model": cfg["model"],
        "gemma_api_style": cfg["api_style"],
        "mock_mode": cfg["mock"],
        "tabpfn_enabled": is_tabpfn_enabled(),
        "inbox_dir": str(get_inbox_dir()),
        "db_path": get_db_path(),
    }


@app.get("/api/dashboard")
def api_dashboard() -> dict[str, Any]:
    txs = list_transactions(limit=2000)
    analytics_data = run_all_analytics(txs)
    return {
        "status": api_status(),
        "transactions": txs,
        "analytics": analytics_data,
    }


@app.post("/api/upload/receipt")
async def api_upload_receipts(files: list[UploadFile] = File(...)) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    for upload in files:
        raw_bytes = await upload.read()
        fname = upload.filename or "receipt.jpg"
        extracted = await asyncio.to_thread(extract_receipt, raw_bytes, fname)
        extracted["source"] = "receipt"
        extracted["source_file"] = fname
        saved = insert_transaction(extracted, allow_duplicate=True)
        results.append(saved)

    ok_count = sum(1 for r in results if not r.get("needs_review"))
    review_count = sum(1 for r in results if r.get("needs_review"))
    return {
        "processed": len(results),
        "ok": ok_count,
        "needs_review": review_count,
        "records": results,
    }


@app.post("/api/upload/csv")
async def api_upload_csv(file: UploadFile = File(...)) -> dict[str, Any]:
    raw_bytes = await file.read()
    fname = file.filename or "statement.csv"
    csv_text = raw_bytes.decode("utf-8", errors="replace")
    rows = parse_bank_csv(csv_text, source_file=fname)
    if not rows:
        raise HTTPException(
            status_code=400,
            detail="No valid transaction rows found. Expected columns: date, merchant/description, amount.",
        )
    summary = bulk_insert_transactions(rows)
    return {
        "filename": fname,
        "parsed_rows": len(rows),
        "inserted": summary["inserted"],
        "skipped": summary["skipped"],
    }


@app.post("/api/sample-data/load")
def api_load_sample_data() -> dict[str, Any]:
    if not SAMPLE_CSV.exists():
        raise HTTPException(status_code=404, detail="sample_data/transactions.csv not found")
    csv_text = SAMPLE_CSV.read_text(encoding="utf-8")
    rows = parse_bank_csv(csv_text, source_file="sample_data/transactions.csv")
    summary = bulk_insert_transactions(rows)
    return {
        "source": "sample_data/transactions.csv",
        "parsed_rows": len(rows),
        "inserted": summary["inserted"],
        "skipped": summary["skipped"],
    }


@app.post("/api/inbox/scan")
def api_scan_inbox() -> dict[str, Any]:
    return scan_inbox_once()


@app.post("/api/subscriptions/cancel-email")
async def api_cancel_email(req: CancelEmailRequest) -> dict[str, str]:
    sub_dict = req.model_dump()
    return await asyncio.to_thread(draft_cancellation_email, sub_dict)


@app.patch("/api/transactions/{tx_id}")
def api_update_transaction(tx_id: int, req: TransactionUpdateRequest) -> dict[str, Any]:
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updated = update_transaction(tx_id, updates)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Transaction {tx_id} not found")
    return updated


@app.delete("/api/transactions/{tx_id}")
def api_delete_transaction(tx_id: int) -> dict[str, Any]:
    deleted = delete_transaction(tx_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Transaction {tx_id} not found")
    return {"deleted": tx_id}


@app.post("/api/transactions/clear")
def api_clear_transactions() -> dict[str, str]:
    clear_transactions()
    return {"status": "cleared"}
