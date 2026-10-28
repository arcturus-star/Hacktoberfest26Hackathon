from __future__ import annotations

import os
from pathlib import Path

from analytics import (
    compute_monthly_summary,
    detect_outliers,
    detect_price_hikes,
    detect_recurring_charges,
    forecast_next_month,
    run_all_analytics,
)
from csv_ingest import parse_bank_csv
from tabpfn_analytics import is_tabpfn_enabled

SAMPLE_CSV_PATH = Path(__file__).resolve().parent.parent / "sample_data" / "transactions.csv"


def _load_sample_records() -> list[dict]:
    csv_text = SAMPLE_CSV_PATH.read_text(encoding="utf-8")
    return parse_bank_csv(csv_text, source_file="sample_data/transactions.csv")


def test_sample_data_recurring_and_zombie_detection() -> None:
    records = _load_sample_records()
    recurring = detect_recurring_charges(records)
    by_merch = {r["merchant"]: r for r in recurring}

    assert "CloudVault Backup Pro" in by_merch
    cloud = by_merch["CloudVault Backup Pro"]
    assert cloud["is_zombie"] is True
    assert cloud["occurrences"] == 7
    assert cloud["latest_amount"] == 12.99
    assert 28.0 <= cloud["interval_days"] <= 32.0

    assert "StreamFlix HD" in by_merch
    assert by_merch["StreamFlix HD"]["is_zombie"] is True


def test_sample_data_price_hike_detection() -> None:
    records = _load_sample_records()
    hikes = detect_price_hikes(records)
    assert len(hikes) == 1
    hike = hikes[0]
    assert hike["merchant"] == "StreamFlix HD"
    assert hike["previous_amount"] == 14.99
    assert hike["new_amount"] == 19.99
    assert hike["increase_amount"] == 5.00
    assert hike["hike_date"] == "2026-07-05"


def test_sample_data_outlier_detection() -> None:
    records = _load_sample_records()
    outliers = detect_outliers(records)
    assert len(outliers) >= 1
    top = outliers[0]
    assert top["merchant"] == "MegaTech Electronics"
    assert top["total"] == 1249.00
    assert top["z_score"] > 2.5
    assert top["total"] > top["iqr_threshold"]


def test_monthly_summary_and_forecast() -> None:
    records = _load_sample_records()
    monthly = compute_monthly_summary(records)
    assert len(monthly) == 7
    assert monthly[0]["month"] == "2026-03"
    assert monthly[-1]["month"] == "2026-09"
    assert monthly[0]["mom_change_pct"] is None
    assert monthly[1]["mom_change_pct"] is not None

    forecast = forecast_next_month(records)
    assert forecast["next_month"] == "2026-10"
    assert forecast["total_forecast"] > 0
    cats = {c["category"]: c for c in forecast["by_category"]}
    assert "Groceries" in cats
    assert "Subscriptions" in cats
    assert cats["Subscriptions"]["forecast"] > 25.0


def test_needs_review_excluded_from_analytics() -> None:
    records = _load_sample_records()
    records.append(
        {
            "id": 9999,
            "merchant": "Corrupt Receipt",
            "date": "2026-09-28",
            "total": 99999.00,
            "currency": "USD",
            "category": "Shopping",
            "status": "needs_review",
            "needs_review": True,
        }
    )
    res = run_all_analytics(records)
    assert res["stats_meta"]["needs_review_count"] == 1
    outlier_merchants = [o["merchant"] for o in res["outliers"]]
    assert "Corrupt Receipt" not in outlier_merchants


def test_tabpfn_optional_fallback() -> None:
    prev = os.environ.get("USE_TABPFN")
    try:
        os.environ["USE_TABPFN"] = "1"
        records = _load_sample_records()
        fc = forecast_next_month(records)
        assert fc["total_forecast"] > 0
        if not is_tabpfn_enabled():
            assert fc["method"] == "linear+seasonal-naive"
    finally:
        if prev is None:
            os.environ.pop("USE_TABPFN", None)
        else:
            os.environ["USE_TABPFN"] = prev
