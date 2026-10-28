from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path

from PIL import Image

from csv_ingest import parse_bank_csv
from db import (
    bulk_insert_transactions,
    init_db,
    insert_transaction,
    list_transactions,
    update_transaction,
)
from gemma import (
    ReceiptValidationError,
    build_chat_request,
    downscale_image,
    draft_cancellation_email,
    extract_receipt,
    parse_and_validate_receipt_json,
)


def _make_test_image_bytes(width: int = 2000, height: int = 1500, mode: str = "RGBA") -> bytes:
    img = Image.new(mode, (width, height), (240, 240, 240, 255) if mode == "RGBA" else (240, 240, 240))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_parse_and_validate_receipt_json_success() -> None:
    raw = """```json
    {
      "merchant": "Corner Hardware #104",
      "date": "09/15/2026",
      "total": "$34.50",
      "currency": "$",
      "category": "retail",
      "line_items": [{"name": "LED Bulbs", "price": "14.50"}, {"description": "Extension Cord", "amount": 20.0}]
    }
    ```"""
    parsed = parse_and_validate_receipt_json(raw)
    assert parsed["merchant"] == "Corner Hardware #104"
    assert parsed["date"] == "2026-09-15"
    assert parsed["total"] == 34.50
    assert parsed["currency"] == "USD"
    assert parsed["category"] == "Shopping"
    assert len(parsed["line_items"]) == 2
    assert parsed["line_items"][0] == {"description": "LED Bulbs", "amount": 14.50}


def test_parse_and_validate_receipt_json_errors() -> None:
    for bad_input in (
        "",
        "not json at all",
        '{"merchant": "", "date": "2026-09-01", "total": 10}',
        '{"merchant": "Shop", "date": "2026-09-01", "total": -5}',
        '{"merchant": "Shop", "date": "2026-09-01", "total": 0}',
    ):
        raised = False
        try:
            parse_and_validate_receipt_json(bad_input)
        except ReceiptValidationError:
            raised = True
        assert raised, f"Expected ReceiptValidationError for input: {bad_input}"


def test_missing_or_bad_date_keeps_receipt_and_flags_it() -> None:
    for raw in ('{"merchant": "Shop", "date": null, "total": 10}', '{"merchant": "Shop", "date": "Unknown", "total": 10}'):
        parsed = parse_and_validate_receipt_json(raw)
        assert parsed["date_missing"] is True
        assert parsed["merchant"] == "Shop" and parsed["total"] == 10.0


def test_total_not_matching_line_items_is_flagged() -> None:
    bad = '{"merchant": "Cafe", "date": "2026-09-01", "total": 100000, "line_items": [{"description": "a", "amount": 24000}, {"description": "b", "amount": 4000}]}'
    good = '{"merchant": "Cafe", "date": "2026-09-01", "total": 28000, "line_items": [{"description": "a", "amount": 24000}, {"description": "b", "amount": 4000}]}'
    assert parse_and_validate_receipt_json(bad)["total_mismatch"] is True
    assert parse_and_validate_receipt_json(good)["total_mismatch"] is False


def test_null_string_merchant_is_rejected() -> None:
    import pytest

    with pytest.raises(ReceiptValidationError):
        parse_and_validate_receipt_json('{"merchant": "null", "date": "2026-09-01", "total": 10}')


def test_thousands_separators_in_amounts() -> None:
    from gemma import _parse_amount

    assert _parse_amount("60.000") == 60000.0
    assert _parse_amount("174,600") == 174600.0
    assert _parse_amount("28.000,50") == 28000.5
    assert _parse_amount("1,249.00") == 1249.0
    assert _parse_amount("12.50") == 12.5


def test_downscale_image_shrinks_large_rgba_png() -> None:
    raw_png = _make_test_image_bytes(width=2400, height=1800, mode="RGBA")
    scaled = downscale_image(raw_png, max_dim=1280)
    with Image.open(io.BytesIO(scaled)) as out_img:
        assert out_img.format == "JPEG"
        assert out_img.mode == "RGB"
        assert max(out_img.size) <= 1280


def test_extract_receipt_retries_and_recovers() -> None:
    img_bytes = _make_test_image_bytes(400, 300)
    attempts = {"count": 0}

    def flaky_caller(_prompt: str, _b64: str | None) -> str:
        attempts["count"] += 1
        if attempts["count"] == 1:
            return '{"merchant": "Broken JSON", "date": "bad-date", "total": 0}'
        return '{"merchant": "Bean & Leaf Cafe", "date": "2026-09-12", "total": 9.75, "currency": "USD", "category": "Dining", "line_items": []}'

    result = extract_receipt(img_bytes, filename="cafe.png", caller=flaky_caller)
    assert attempts["count"] == 2
    assert result["status"] == "ok"
    assert result["needs_review"] is False
    assert result["merchant"] == "Bean & Leaf Cafe"
    assert result["total"] == 9.75


def test_extract_receipt_marks_needs_review_on_bad_output_or_corrupt_image() -> None:
    # 1. Corrupt non-image bytes never crash
    corrupt_res = extract_receipt(b"not an image file", filename="broken.jpg")
    assert corrupt_res["status"] == "needs_review"
    assert corrupt_res["needs_review"] is True
    assert "decode" in (corrupt_res["error_message"] or "").lower()

    # 2. Persistent bad JSON across all retries marks needs_review
    img_bytes = _make_test_image_bytes(300, 300)
    bad_res = extract_receipt(
        img_bytes,
        filename="unparseable.png",
        caller=lambda _p, _b: "sorry I cannot read this receipt",
    )
    assert bad_res["status"] == "needs_review"
    assert bad_res["needs_review"] is True
    assert bad_res["raw_model_output"] == "sorry I cannot read this receipt"


def test_api_style_ollama_and_openai_builders() -> None:
    url_ollama, body_ollama = build_chat_request(
        "Extract receipt",
        image_b64="YWJj",
        expect_json=True,
        config={"base_url": "http://localhost:11434", "model": "gemma3:4b", "api_style": "ollama"},
    )
    assert url_ollama == "http://localhost:11434/api/chat"
    assert body_ollama["model"] == "gemma3:4b"
    assert body_ollama["messages"][0]["images"] == ["YWJj"]

    url_oai, body_oai = build_chat_request(
        "Extract receipt",
        image_b64="YWJj",
        expect_json=True,
        config={"base_url": "http://localhost:8000", "model": "gemma3:4b", "api_style": "openai"},
    )
    assert url_oai == "http://localhost:8000/v1/chat/completions"
    content = body_oai["messages"][0]["content"]
    assert isinstance(content, list)
    assert content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_mock_mode_and_db_lifecycle() -> None:
    prev_mock = os.environ.get("LAZYLEDGER_MOCK")
    os.environ["LAZYLEDGER_MOCK"] = "1"
    try:
        img_bytes = _make_test_image_bytes(320, 240)
        extracted = extract_receipt(img_bytes, filename="freshmart_receipt.png")
        assert extracted["status"] == "ok"
        assert extracted["total"] > 0

        email = draft_cancellation_email(
            {"merchant": "CloudVault Backup Pro", "latest_amount": 12.99, "last_date": "2026-09-14"}
        )
        assert "CloudVault Backup Pro" in email["subject"]
        assert "12.99" in email["body"]

        with tempfile.TemporaryDirectory() as tmpdir:
            db_file = str(Path(tmpdir) / "test.db")
            init_db(db_file)
            saved = insert_transaction(extracted, db_path=db_file)
            assert saved["id"] >= 1

            bad_rec = insert_transaction(
                {
                    "merchant": "Needs Review (blurry.jpg)",
                    "date": "2026-09-20",
                    "total": 0.0,
                    "status": "needs_review",
                    "needs_review": True,
                },
                db_path=db_file,
            )
            assert bad_rec["needs_review"] is True

            fixed = update_transaction(
                bad_rec["id"],
                {"merchant": "City Pharmacy", "total": 18.40, "category": "Health", "status": "ok"},
                db_path=db_file,
            )
            assert fixed is not None
            assert fixed["needs_review"] is False
            assert fixed["total"] == 18.40

            csv_rows = parse_bank_csv(
                "date,merchant,amount,category\n2026-09-01,Test Cafe,7.50,Dining\n",
                source_file="mini.csv",
            )
            res1 = bulk_insert_transactions(csv_rows, db_path=db_file)
            res2 = bulk_insert_transactions(csv_rows, db_path=db_file)
            assert res1["inserted"] == 1
            assert res2["skipped"] == 1
            assert len(list_transactions(db_path=db_file)) == 3
    finally:
        if prev_mock is None:
            os.environ.pop("LAZYLEDGER_MOCK", None)
        else:
            os.environ["LAZYLEDGER_MOCK"] = prev_mock


def test_same_csv_under_different_filename_is_not_duplicated(tmp_path):
    from csv_ingest import parse_bank_csv
    from db import bulk_insert_transactions, list_transactions

    db = str(tmp_path / "dup.db")
    data = Path(__file__).resolve().parent.parent.joinpath("sample_data", "transactions.csv").read_text(encoding="utf-8")
    first = bulk_insert_transactions(parse_bank_csv(data, source_file="a.csv"), db_path=db)
    second = bulk_insert_transactions(parse_bank_csv(data, source_file="b.csv"), db_path=db)
    assert first["inserted"] > 0
    assert second["inserted"] == 0
    assert len(list_transactions(limit=10000, db_path=db)) == first["inserted"]
