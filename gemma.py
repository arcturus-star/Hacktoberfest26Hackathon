from __future__ import annotations

import base64
import hashlib
import io
import json
import math
import os
import re
import time
from datetime import date, datetime
from typing import Any, Callable

import httpx
from PIL import Image, ImageOps

from db import ALLOWED_CATEGORIES, normalize_category


class ReceiptValidationError(ValueError):
    """Raised when model output cannot be parsed or validated as a receipt JSON object."""


RECEIPT_SYSTEM_PROMPT = (
    "You are a precise receipt extraction engine. Inspect the receipt image and return ONLY a "
    "valid JSON object with these exact keys:\n"
    "{\n"
    '  "merchant": "Store or service name (string)",\n'
    '  "date": "YYYY-MM-DD",\n'
    '  "total": 0.00,\n'
    '  "currency": "USD",\n'
    '  "category": "One of: Groceries, Dining, Subscriptions, Utilities, Transport, Shopping, Entertainment, Health, Other",\n'
    '  "line_items": [{"description": "Item name", "amount": 0.00}]\n'
    "}\n"
    "Rules: amounts are plain numbers with no thousands separators and '.' only for decimals "
    "(a printed 60.000 or 60,000 meaning sixty thousand must be written 60000). "
    'Use null for "date" if no date is printed on the receipt; never write "Unknown". '
    "Use the ISO 4217 code for currency if you can tell (e.g. IDR for rupiah, GBP for pounds). "
    "Do not include markdown fences or commentary."
)


def get_gemma_config() -> dict[str, Any]:
    base_url = os.environ.get("GEMMA_BASE_URL", "http://localhost:11434").strip().rstrip("/")
    model = os.environ.get("GEMMA_MODEL", "gemma3:4b").strip()
    api_style = os.environ.get("GEMMA_API_STYLE", "ollama").strip().lower()
    if api_style not in ("ollama", "openai", "google"):
        api_style = "ollama"
    mock = os.environ.get("LAZYLEDGER_MOCK", "0").strip().lower() in ("1", "true", "yes")
    max_retries = int(os.environ.get("GEMMA_MAX_RETRIES", "2"))
    timeout = float(os.environ.get("GEMMA_TIMEOUT", "60.0"))
    return {
        "base_url": base_url,
        "model": model,
        "api_style": api_style,
        "mock": mock,
        "api_key": os.environ.get("GEMMA_API_KEY", "").strip(),
        "max_retries": max(0, max_retries),
        "timeout": timeout,
    }


def downscale_image(image_bytes: bytes, max_dim: int = 1280, quality: int = 85) -> bytes:
    if not image_bytes:
        raise ValueError("Empty image payload")
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                rgba = img.convert("RGBA")
                bg = Image.new("RGB", rgba.size, (255, 255, 255))
                bg.paste(rgba, mask=rgba.split()[3])
                img = bg
            elif img.mode != "RGB":
                img = img.convert("RGB")

            width, height = img.size
            if width > max_dim or height > max_dim:
                img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

            out = io.BytesIO()
            img.save(out, format="JPEG", quality=quality, optimize=True)
            return out.getvalue()
    except Exception as exc:
        raise ValueError(f"Could not decode receipt image: {exc}") from exc


def _extract_json_block(raw_text: str) -> str:
    if not raw_text or not isinstance(raw_text, str):
        raise ReceiptValidationError("Model returned empty output")
    text = raw_text.strip()
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.DOTALL | re.IGNORECASE)
    if fence_match:
        return fence_match.group(1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ReceiptValidationError("No JSON object found in model output")
    return text[start : end + 1]


def _parse_amount(value: Any, field_name: str = "total") -> float:
    if isinstance(value, bool) or value is None:
        raise ReceiptValidationError(f"Missing or invalid numeric value for '{field_name}'")
    if isinstance(value, (int, float)):
        num = float(value)
    elif isinstance(value, str):
        compact = re.sub(r"[^0-9.,\-]", "", value)
        if re.fullmatch(r"-?\d{1,3}(\.\d{3})+(,\d{1,2})?", compact):
            compact = compact.replace(".", "").replace(",", ".")  # 28.000,50 style
        cleaned = re.sub(r"[^0-9.\-]", "", compact.replace(",", ""))
        if not cleaned or cleaned in ("-", ".", "-."):
            raise ReceiptValidationError(f"Cannot parse numeric amount from '{value}' in '{field_name}'")
        try:
            num = float(cleaned)
        except ValueError as exc:
            raise ReceiptValidationError(f"Invalid number '{value}' in '{field_name}'") from exc
    else:
        raise ReceiptValidationError(f"Unsupported type for '{field_name}'")

    if not math.isfinite(num):
        raise ReceiptValidationError(f"Non-finite amount in '{field_name}'")
    return round(num, 2)


def _normalize_date(raw_date: Any) -> str:
    if not raw_date or not isinstance(raw_date, str):
        raise ReceiptValidationError("Missing or non-string 'date'")
    s = raw_date.strip()
    if len(s) >= 10 and re.match(r"^\d{4}-\d{2}-\d{2}", s):
        s = s[:10]
    formats = (
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%m-%d-%Y",
        "%b %d, %Y",
        "%B %d, %Y",
        "%d %b %Y",
    )
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    raise ReceiptValidationError(f"Unrecognized date format: '{raw_date}'")


def parse_and_validate_receipt_json(raw_text: str) -> dict[str, Any]:
    json_str = _extract_json_block(raw_text)
    try:
        payload = json.loads(json_str)
    except json.JSONDecodeError as exc:
        raise ReceiptValidationError(f"Invalid JSON syntax: {exc.msg}") from exc

    if not isinstance(payload, dict):
        raise ReceiptValidationError("Extracted JSON root must be an object")

    merchant = str(payload.get("merchant") or "").strip()
    if merchant.lower() in ("null", "none", "unknown", "n/a"):
        merchant = ""
    if not merchant:
        raise ReceiptValidationError("Missing non-empty 'merchant' field")

    date_missing = False
    try:
        tx_date = _normalize_date(payload.get("date"))
    except ReceiptValidationError:
        tx_date = date.today().isoformat()
        date_missing = True
    total = _parse_amount(payload.get("total"), "total")
    if total <= 0:
        raise ReceiptValidationError(f"Receipt 'total' must be greater than 0 (got {total})")

    raw_currency = str(payload.get("currency") or "USD").strip().upper()
    currency_map = {"$": "USD", "US$": "USD", "€": "EUR", "£": "GBP"}
    currency = currency_map.get(raw_currency, raw_currency)
    if not re.match(r"^[A-Z]{3}$", currency):
        currency = "USD"

    category = normalize_category(payload.get("category"))
    if category not in ALLOWED_CATEGORIES:
        category = "Other"

    raw_items = payload.get("line_items")
    if raw_items is None:
        raw_items = []
    if not isinstance(raw_items, list):
        raise ReceiptValidationError("'line_items' must be a JSON array")

    normalized_items: list[dict[str, Any]] = []
    for item in raw_items:
        if isinstance(item, dict):
            desc = str(
                item.get("description") or item.get("name") or item.get("item") or "Item"
            ).strip()
            raw_amt = item.get("amount", item.get("price", item.get("total", 0.0)))
            try:
                amt = _parse_amount(raw_amt, "line_items.amount")
            except ReceiptValidationError:
                amt = 0.0
            normalized_items.append({"description": desc or "Item", "amount": amt})
        elif isinstance(item, str) and item.strip():
            normalized_items.append({"description": item.strip(), "amount": 0.0})

    items_sum = sum(i["amount"] for i in normalized_items)
    total_mismatch = bool(
        items_sum > 0 and abs(items_sum - total) / max(items_sum, total) > 0.25
    )

    return {
        "total_mismatch": total_mismatch,
        "date_missing": date_missing,
        "merchant": merchant,
        "date": tx_date,
        "total": total,
        "currency": currency,
        "category": category,
        "line_items": normalized_items,
    }


def build_chat_request(
    prompt: str,
    image_b64: str | None = None,
    expect_json: bool = True,
    config: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any]]:
    cfg = config or get_gemma_config()
    base_url = cfg["base_url"]
    model = cfg["model"]
    api_style = cfg["api_style"]

    if api_style == "google":
        url = f"{base_url}/v1beta/models/{model}:generateContent"
        parts: list[dict[str, Any]] = [{"text": prompt}]
        if image_b64:
            parts.append({"inline_data": {"mime_type": "image/jpeg", "data": image_b64}})
        return url, {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"temperature": 0.1},
        }

    if api_style == "openai":
        if base_url.endswith("/v1"):
            url = f"{base_url}/chat/completions"
        else:
            url = f"{base_url}/v1/chat/completions"

        if image_b64:
            content: Any = [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                },
            ]
        else:
            content = prompt

        body: dict[str, Any] = {
            "model": model,
            "temperature": 0.1,
            "messages": [{"role": "user", "content": content}],
        }
        if expect_json:
            body["response_format"] = {"type": "json_object"}
        return url, body

    url = f"{base_url}/api/chat"
    msg: dict[str, Any] = {"role": "user", "content": prompt}
    if image_b64:
        msg["images"] = [image_b64]
    body = {
        "model": model,
        "stream": False,
        "options": {"temperature": 0.1},
        "messages": [msg],
    }
    if expect_json:
        body["format"] = "json"
    return url, body


def extract_response_text(response_json: dict[str, Any], api_style: str) -> str:
    if api_style == "google":
        candidates = response_json.get("candidates") or []
        parts = ((candidates[0].get("content") or {}).get("parts") or []) if candidates else []
        text = "".join(str(p.get("text") or "") for p in parts if not p.get("thought"))
        if text:
            return text
        raise ValueError("Unexpected Google-style response structure")

    if api_style == "openai":
        choices = response_json.get("choices") or []
        if choices and isinstance(choices[0], dict):
            msg = choices[0].get("message") or {}
            return str(msg.get("content") or "")
        raise ValueError("Unexpected OpenAI-style response structure")

    msg = response_json.get("message") or {}
    if isinstance(msg, dict) and "content" in msg:
        return str(msg.get("content") or "")
    if "response" in response_json:
        return str(response_json.get("response") or "")
    raise ValueError("Unexpected Ollama response structure")


def _mock_receipt_response(filename: str, image_bytes: bytes) -> str:
    fname = (filename or "receipt.jpg").lower()
    digest = hashlib.sha256(image_bytes or b"mock").hexdigest()
    presets = [
        {
            "merchant": "FreshMart Groceries",
            "date": "2026-09-21",
            "total": 54.80,
            "currency": "USD",
            "category": "Groceries",
            "line_items": [
                {"description": "Organic Oats & Berries", "amount": 14.50},
                {"description": "Sourdough Loaf", "amount": 6.80},
                {"description": "Olive Oil & Pantry Staples", "amount": 33.50},
            ],
        },
        {
            "merchant": "Bean & Leaf Cafe",
            "date": "2026-09-24",
            "total": 11.75,
            "currency": "USD",
            "category": "Dining",
            "line_items": [
                {"description": "Cortado", "amount": 5.25},
                {"description": "Almond Croissant", "amount": 6.50},
            ],
        },
        {
            "merchant": "CloudVault Backup Pro",
            "date": "2026-09-14",
            "total": 12.99,
            "currency": "USD",
            "category": "Subscriptions",
            "line_items": [
                {"description": "CloudVault Monthly Auto-Renewal", "amount": 12.99},
            ],
        },
    ]
    if "sub" in fname or "cloud" in fname or "vault" in fname:
        chosen = presets[2]
    elif "cafe" in fname or "coffee" in fname or "dining" in fname:
        chosen = presets[1]
    elif "groc" in fname or "mart" in fname:
        chosen = presets[0]
    else:
        chosen = presets[int(digest[:4], 16) % len(presets)]
    return json.dumps(chosen)


def _call_gemma(
    prompt: str,
    image_b64: str | None = None,
    expect_json: bool = True,
    config: dict[str, Any] | None = None,
) -> str:
    cfg = config or get_gemma_config()
    url, payload = build_chat_request(
        prompt=prompt, image_b64=image_b64, expect_json=expect_json, config=cfg
    )
    headers: dict[str, str] = {}
    if cfg.get("api_key"):
        if cfg["api_style"] == "google":
            headers["x-goog-api-key"] = cfg["api_key"]
        else:
            headers["Authorization"] = f"Bearer {cfg['api_key']}"
    rate_limit_waits = int(os.environ.get("GEMMA_RATE_LIMIT_RETRIES", "4"))
    with httpx.Client(timeout=cfg["timeout"]) as client:
        for wait_round in range(rate_limit_waits + 1):
            resp = client.post(url, json=payload, headers=headers)
            if resp.status_code not in (429, 502, 503) or wait_round == rate_limit_waits:
                break
            retry_after = resp.headers.get("retry-after", "")
            delay = float(retry_after) if retry_after.replace(".", "", 1).isdigit() else 5.0 * 2**wait_round
            time.sleep(min(delay, 60.0))
        resp.raise_for_status()
        data = resp.json()
    return extract_response_text(data, cfg["api_style"])


def extract_receipt(
    image_bytes: bytes,
    filename: str = "receipt.jpg",
    caller: Callable[[str, str | None], str] | None = None,
) -> dict[str, Any]:
    cfg = get_gemma_config()
    today_str = date.today().isoformat()

    try:
        scaled_bytes = downscale_image(image_bytes)
    except ValueError as exc:
        return {
            "merchant": f"Unreadable Receipt ({filename})",
            "date": today_str,
            "total": 0.0,
            "currency": "USD",
            "category": "Other",
            "line_items": [],
            "status": "needs_review",
            "needs_review": True,
            "error_message": str(exc),
            "raw_model_output": None,
        }

    image_b64 = base64.b64encode(scaled_bytes).decode("ascii")
    max_attempts = cfg["max_retries"] + 1
    last_error = "Unknown extraction failure"
    last_raw: str | None = None
    prompt = RECEIPT_SYSTEM_PROMPT

    for attempt in range(1, max_attempts + 1):
        try:
            if caller is not None:
                raw_output = caller(prompt, image_b64)
            elif cfg["mock"]:
                raw_output = _mock_receipt_response(filename, scaled_bytes)
            else:
                raw_output = _call_gemma(
                    prompt=prompt, image_b64=image_b64, expect_json=True, config=cfg
                )
            last_raw = raw_output
            parsed = parse_and_validate_receipt_json(raw_output)
            reasons = []
            if parsed.pop("date_missing", False):
                reasons.append("No date found on receipt; today's date used")
            if parsed.pop("total_mismatch", False):
                reasons.append("Total does not match the sum of line items; check the amount")
            parsed["status"] = "needs_review" if reasons else "ok"
            parsed["needs_review"] = bool(reasons)
            parsed["error_message"] = "; ".join(reasons) or None
            parsed["raw_model_output"] = raw_output
            return parsed
        except ReceiptValidationError as val_err:
            last_error = f"Validation error (attempt {attempt}/{max_attempts}): {val_err}"
            prompt = (
                f"{RECEIPT_SYSTEM_PROMPT}\n\n"
                f"IMPORTANT: Your previous response was invalid ({val_err}). "
                "Output ONLY a valid JSON object with merchant, date (YYYY-MM-DD), total (> 0), currency, category, and line_items."
            )
        except Exception as exc:
            last_error = f"Model request failed (attempt {attempt}/{max_attempts}): {exc}"
            break

    return {
        "merchant": f"Needs Review ({filename})",
        "date": today_str,
        "total": 0.0,
        "currency": "USD",
        "category": "Other",
        "line_items": [],
        "status": "needs_review",
        "needs_review": True,
        "error_message": last_error,
        "raw_model_output": last_raw,
    }


def draft_cancellation_email(
    subscription: dict[str, Any],
    caller: Callable[[str], str] | None = None,
) -> dict[str, str]:
    cfg = get_gemma_config()
    merchant = str(subscription.get("merchant") or "Subscription Service").strip()
    amount = float(subscription.get("latest_amount") or subscription.get("amount") or 0.0)
    currency = str(subscription.get("currency") or "USD")
    last_date = str(subscription.get("last_date") or date.today().isoformat())
    account_hint = str(subscription.get("account_hint") or "[My Account Email / ID]").strip()

    fallback_subject = f"Cancellation Request - {merchant} Subscription"
    fallback_body = (
        f"Hello {merchant} Support Team,\n\n"
        f"Please cancel my recurring subscription associated with {account_hint} effective immediately, "
        f"and stop all future billing (most recent charge: {currency} {amount:.2f} on {last_date}).\n\n"
        "Please reply with written confirmation that my subscription has been canceled and that no "
        "further charges will be made.\n\n"
        "Thank you."
    )

    if cfg["mock"] and caller is None:
        return {
            "subject": fallback_subject,
            "body": fallback_body,
            "model_used": f"mock ({cfg['model']})",
        }

    prompt = (
        f"Write a concise, polite, and firm subscription cancellation email to '{merchant}'.\n"
        f"Details: latest charge was {currency} {amount:.2f} on {last_date}. Account reference: {account_hint}.\n"
        "Return ONLY a JSON object with keys 'subject' and 'body'."
    )
    try:
        if caller is not None:
            raw = caller(prompt)
        else:
            raw = _call_gemma(prompt=prompt, image_b64=None, expect_json=True, config=cfg)
        block = _extract_json_block(raw)
        data = json.loads(block)
        subject = str(data.get("subject") or fallback_subject).strip()
        body = str(data.get("body") or fallback_body).strip()
        return {
            "subject": subject,
            "body": body,
            "model_used": cfg["model"],
        }
    except Exception:
        return {
            "subject": fallback_subject,
            "body": fallback_body,
            "model_used": f"template-fallback ({cfg['model']})",
        }
