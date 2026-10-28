from __future__ import annotations

import statistics
from datetime import datetime, timedelta
from typing import Any

from db import normalize_category, normalize_merchant
from tabpfn_analytics import (
    forecast_categories_tabpfn,
    is_tabpfn_enabled,
    score_outliers_tabpfn,
)

try:
    import pandas as pd
except ImportError:  # pragma: no cover - fallback when pandas is not installed in bare env
    pd = None  # type: ignore[assignment]


def _prepare_records(transactions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    valid: list[dict[str, Any]] = []
    for idx, tx in enumerate(transactions):
        if tx.get("needs_review") or tx.get("status") == "needs_review":
            continue
        try:
            total = float(tx.get("total", 0.0) or 0.0)
        except (TypeError, ValueError):
            continue
        if total <= 0:
            continue

        raw_date = str(tx.get("tx_date") or tx.get("date") or "").strip()[:10]
        try:
            dt = datetime.strptime(raw_date, "%Y-%m-%d")
        except ValueError:
            continue

        merchant = str(tx.get("merchant") or "Unknown").strip()
        norm_m = str(tx.get("normalized_merchant") or normalize_merchant(merchant))
        category = normalize_category(tx.get("category"))
        valid.append(
            {
                "id": int(tx.get("id", idx + 1)),
                "merchant": merchant,
                "normalized_merchant": norm_m,
                "tx_date": raw_date,
                "dt": dt,
                "month": raw_date[:7],
                "total": round(total, 2),
                "currency": str(tx.get("currency") or "USD"),
                "category": category,
            }
        )

    if pd is not None and valid:
        df = pd.DataFrame(valid)
        df = df.sort_values(by=["tx_date", "id"], ascending=[True, True])
        return df.to_dict(orient="records")

    valid.sort(key=lambda r: (r["tx_date"], r["id"]))
    return valid


def detect_recurring_charges(transactions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = _prepare_records(transactions)
    if not records:
        return []

    by_merchant: dict[str, list[dict[str, Any]]] = {}
    for r in records:
        by_merchant.setdefault(r["normalized_merchant"], []).append(r)

    flagged: list[dict[str, Any]] = []
    for norm_m, group in by_merchant.items():
        if len(group) < 3:
            continue

        # Collapse same-day duplicate charges if any when measuring intervals
        unique_days: list[dict[str, Any]] = []
        for item in group:
            if not unique_days or unique_days[-1]["tx_date"] != item["tx_date"]:
                unique_days.append(item)
        if len(unique_days) < 3:
            continue

        intervals = [
            (unique_days[i]["dt"] - unique_days[i - 1]["dt"]).days
            for i in range(1, len(unique_days))
        ]
        med_interval = float(statistics.median(intervals))
        mad_interval = float(
            statistics.median([abs(x - med_interval) for x in intervals])
        )

        cadence: str | None = None
        annual_multiplier = 12.0
        if 25.0 <= med_interval <= 35.0 and mad_interval <= 5.0:
            cadence = "monthly"
            annual_multiplier = 12.0
        elif 6.0 <= med_interval <= 8.0 and mad_interval <= 2.0:
            cadence = "weekly"
            annual_multiplier = 52.0
        elif 13.0 <= med_interval <= 16.0 and mad_interval <= 3.0:
            cadence = "biweekly"
            annual_multiplier = 26.0

        if cadence is None:
            continue

        amounts = [g["total"] for g in unique_days]
        avg_amt = float(statistics.mean(amounts))
        med_amt = float(statistics.median(amounts))
        mad_amt = float(statistics.median([abs(a - med_amt) for a in amounts]))
        step_diffs = [abs(amounts[i] - amounts[i - 1]) for i in range(1, len(amounts))]
        zero_step_ratio = sum(1 for d in step_diffs if d <= 0.05) / len(step_diffs)

        # Require either stable/fixed pricing or a regular bill with moderate spread
        cv = (statistics.pstdev(amounts) / avg_amt) if avg_amt > 0 else 1.0
        if cv > 0.35 and zero_step_ratio < 0.5:
            continue

        latest = unique_days[-1]
        is_fixed_price = (mad_amt <= 0.05) or (zero_step_ratio >= 0.5)
        cat = latest["category"]
        is_zombie = bool(
            len(unique_days) >= 4
            and is_fixed_price
            and cat in ("Subscriptions", "Entertainment", "Shopping", "Health", "Other")
        )

        next_dt = latest["dt"] + timedelta(days=int(round(med_interval)))
        annual_cost = round(latest["total"] * annual_multiplier, 2)
        label = "Zombie subscription candidate" if is_zombie else f"Recurring {cadence} charge"

        flagged.append(
            {
                "merchant": latest["merchant"],
                "normalized_merchant": norm_m,
                "category": cat,
                "cadence": cadence,
                "occurrences": len(unique_days),
                "interval_days": round(med_interval, 1),
                "latest_amount": round(latest["total"], 2),
                "average_amount": round(avg_amt, 2),
                "annualized_cost": annual_cost,
                "currency": latest["currency"],
                "first_date": unique_days[0]["tx_date"],
                "last_date": latest["tx_date"],
                "next_expected_date": next_dt.strftime("%Y-%m-%d"),
                "is_zombie": is_zombie,
                "reason": (
                    f"{label}: {len(unique_days)} charges every ~{round(med_interval)} days "
                    f"(${latest['total']:.2f}/cycle, ~${annual_cost:.2f}/yr)"
                ),
            }
        )

    flagged.sort(key=lambda x: (not x["is_zombie"], -x["annualized_cost"]))
    return flagged


def detect_price_hikes(transactions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = _prepare_records(transactions)
    if not records:
        return []

    by_merchant: dict[str, list[dict[str, Any]]] = {}
    for r in records:
        by_merchant.setdefault(r["normalized_merchant"], []).append(r)

    hikes: list[dict[str, Any]] = []
    for norm_m, group in by_merchant.items():
        if len(group) < 3:
            continue

        amounts = [g["total"] for g in group]
        best_hike: dict[str, Any] | None = None

        # Search for a split point k where group[:k] was a stable price baseline
        # and group[k:] stepped up to a higher stable price.
        for k in range(2, len(group)):
            before = amounts[:k]
            after = amounts[k:]
            base_med = float(statistics.median(before))
            if base_med <= 0:
                continue

            base_spread = max(before) - min(before)
            if base_spread > max(0.50, 0.03 * base_med):
                continue

            new_med = float(statistics.median(after))
            after_spread = max(after) - min(after)
            if after_spread > max(0.50, 0.05 * new_med):
                continue

            diff = round(new_med - base_med, 2)
            pct = (diff / base_med) * 100.0
            if diff >= 1.00 and pct >= 5.0:
                hike_tx = group[k]
                best_hike = {
                    "merchant": group[-1]["merchant"],
                    "normalized_merchant": norm_m,
                    "category": group[-1]["category"],
                    "previous_amount": round(base_med, 2),
                    "new_amount": round(new_med, 2),
                    "increase_amount": diff,
                    "increase_pct": round(pct, 1),
                    "annualized_impact": round(diff * 12.0, 2),
                    "currency": group[-1]["currency"],
                    "hike_date": hike_tx["tx_date"],
                    "prior_occurrences": len(before),
                    "new_occurrences": len(after),
                    "reason": (
                        f"Price jumped +{pct:.1f}% from ${base_med:.2f} to ${new_med:.2f} "
                        f"on {hike_tx['tx_date']} (+${diff * 12.0:.2f}/yr)"
                    ),
                }
                break

        if best_hike is not None:
            hikes.append(best_hike)

    hikes.sort(key=lambda x: -x["increase_pct"])
    return hikes


def _compute_iqr_bounds(values: list[float]) -> tuple[float, float, float]:
    if len(values) < 4:
        med = float(statistics.median(values)) if values else 0.0
        return med, 0.0, med * 3.0
    q1, q2, q3 = statistics.quantiles(values, n=4, method="inclusive")
    iqr = max(0.0, q3 - q1)
    upper_fence = q3 + 2.0 * iqr
    return float(q2), float(iqr), float(upper_fence)


def detect_outliers(transactions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = _prepare_records(transactions)
    if len(records) < 4:
        return []

    all_amounts = [r["total"] for r in records]
    global_mean = float(statistics.mean(all_amounts))
    global_std = float(statistics.pstdev(all_amounts)) or 1.0
    global_med, _, global_fence = _compute_iqr_bounds(all_amounts)

    by_cat: dict[str, list[float]] = {}
    for r in records:
        by_cat.setdefault(r["category"], []).append(r["total"])

    cat_stats: dict[str, dict[str, float]] = {}
    for cat, vals in by_cat.items():
        if len(vals) >= 4:
            c_mean = float(statistics.mean(vals))
            c_std = float(statistics.pstdev(vals)) or 1.0
            c_med, c_iqr, c_fence = _compute_iqr_bounds(vals)
        else:
            c_mean, c_std, c_med, c_fence = global_mean, global_std, global_med, global_fence
        cat_stats[cat] = {
            "mean": c_mean,
            "std": c_std,
            "median": c_med,
            "fence": c_fence,
        }

    tabpfn_scores = score_outliers_tabpfn(records)
    outliers: list[dict[str, Any]] = []

    for r in records:
        amt = r["total"]
        cs = cat_stats[r["category"]]
        cat_z = (amt - cs["mean"]) / cs["std"] if cs["std"] > 1e-6 else 0.0
        glob_z = (amt - global_mean) / global_std if global_std > 1e-6 else 0.0
        z_val = max(cat_z, glob_z)
        fence = min(cs["fence"], global_fence) if cs["fence"] > 0 else global_fence

        tp_score = tabpfn_scores.get(r["id"]) if tabpfn_scores else None
        is_stat_outlier = (
            amt >= max(75.0, cs["median"] * 2.5)
            and (amt - cs["median"] >= 45.0)
            and (z_val >= 2.2)
            and (amt > cs["fence"] or amt > global_fence)
        )
        is_tp_outlier = bool(
            tp_score is not None and tp_score >= 2.8 and amt >= max(75.0, cs["median"] * 2.5)
        )

        if is_stat_outlier or is_tp_outlier:
            method = "tabpfn+zscore+iqr" if tabpfn_scores is not None else "z-score+iqr"
            outliers.append(
                {
                    "id": r["id"],
                    "merchant": r["merchant"],
                    "tx_date": r["tx_date"],
                    "total": round(amt, 2),
                    "currency": r["currency"],
                    "category": r["category"],
                    "z_score": round(z_val, 2),
                    "iqr_threshold": round(fence, 2),
                    "category_median": round(cs["median"], 2),
                    "tabpfn_score": tp_score,
                    "method": method,
                    "reason": (
                        f"${amt:.2f} at {r['merchant']} is {amt / max(cs['median'], 1.0):.1f}x the "
                        f"{r['category']} median (${cs['median']:.2f}), z={z_val:.2f}"
                    ),
                }
            )

    outliers.sort(key=lambda x: -x["total"])
    return outliers


def compute_monthly_summary(transactions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = _prepare_records(transactions)
    if not records:
        return []

    if pd is not None:
        df = pd.DataFrame(records)
        months = sorted(df["month"].unique().tolist())
        pivot = (
            df.pivot_table(
                index="month",
                columns="category",
                values="total",
                aggfunc="sum",
                fill_value=0.0,
            )
            .round(2)
            .to_dict(orient="index")
        )
        counts = df.groupby("month")["id"].count().to_dict()
        totals = df.groupby("month")["total"].sum().round(2).to_dict()
    else:
        months_set: set[str] = set()
        pivot: dict[str, dict[str, float]] = {}
        counts: dict[str, int] = {}
        totals: dict[str, float] = {}
        for r in records:
            m = r["month"]
            c = r["category"]
            months_set.add(m)
            pivot.setdefault(m, {})
            pivot[m][c] = round(pivot[m].get(c, 0.0) + r["total"], 2)
            counts[m] = counts.get(m, 0) + 1
            totals[m] = round(totals.get(m, 0.0) + r["total"], 2)
        months = sorted(months_set)

    summary: list[dict[str, Any]] = []
    prev_total: float | None = None
    for m in months:
        tot = round(float(totals.get(m, 0.0)), 2)
        cat_map = {
            k: round(float(v), 2)
            for k, v in sorted(pivot.get(m, {}).items())
            if float(v) > 0
        }
        mom_pct: float | None = None
        if prev_total is not None and prev_total > 0:
            mom_pct = round(((tot - prev_total) / prev_total) * 100.0, 1)
        prev_total = tot
        summary.append(
            {
                "month": m,
                "total": tot,
                "tx_count": int(counts.get(m, 0)),
                "mom_change_pct": mom_pct,
                "by_category": cat_map,
            }
        )
    return summary


def _next_month_str(ym: str) -> str:
    parts = ym.split("-")
    year = int(parts[0])
    month = int(parts[1])
    if month == 12:
        return f"{year + 1:04d}-01"
    return f"{year:04d}-{month + 1:02d}"


def _stats_forecast_series(series: list[float]) -> float:
    if not series:
        return 0.0
    if len(series) == 1:
        return round(max(0.0, series[0]), 2)
    if len(series) == 2:
        return round(max(0.0, 0.6 * series[-1] + 0.4 * series[-2]), 2)

    # Trim extreme single-month spike via winsorization against median before linear trend
    med = float(statistics.median(series))
    cleaned = [min(v, med * 2.2) if med > 0 else v for v in series]

    xs = list(range(len(cleaned)))
    try:
        slope, intercept = statistics.linear_regression(xs, cleaned)
        lin_pred = slope * len(cleaned) + intercept
    except statistics.StatisticsError:
        lin_pred = cleaned[-1]

    seasonal_naive = cleaned[-1]
    recent_mean = float(statistics.mean(cleaned[-3:]))
    blended = 0.45 * lin_pred + 0.35 * recent_mean + 0.20 * seasonal_naive
    return round(max(0.0, blended), 2)


def forecast_next_month(transactions: list[dict[str, Any]]) -> dict[str, Any]:
    monthly = compute_monthly_summary(transactions)
    if not monthly:
        now_ym = datetime.now().strftime("%Y-%m")
        return {
            "next_month": _next_month_str(now_ym),
            "method": "linear+seasonal-naive",
            "total_forecast": 0.0,
            "by_category": [],
        }

    months = [m["month"] for m in monthly]
    next_month = _next_month_str(months[-1])
    categories = sorted(
        {cat for m in monthly for cat in m["by_category"].keys()}
    )

    series_by_cat: dict[str, list[float]] = {
        cat: [float(m["by_category"].get(cat, 0.0)) for m in monthly]
        for cat in categories
    }

    tabpfn_preds = forecast_categories_tabpfn(series_by_cat)
    method_used = "tabpfn" if tabpfn_preds is not None else "linear+seasonal-naive"

    by_category_out: list[dict[str, Any]] = []
    total_forecast = 0.0

    for cat in categories:
        series = series_by_cat[cat]
        if tabpfn_preds is not None and cat in tabpfn_preds:
            pred = tabpfn_preds[cat]
        else:
            pred = _stats_forecast_series(series)

        last_actual = round(series[-1], 2)
        hist_avg = round(float(statistics.mean(series)), 2)
        if pred > hist_avg * 1.05:
            trend = "up"
        elif pred < hist_avg * 0.95:
            trend = "down"
        else:
            trend = "flat"

        total_forecast = round(total_forecast + pred, 2)
        by_category_out.append(
            {
                "category": cat,
                "forecast": pred,
                "last_month_actual": last_actual,
                "historical_avg": hist_avg,
                "trend": trend,
                "method": method_used,
            }
        )

    by_category_out.sort(key=lambda x: -x["forecast"])
    return {
        "next_month": next_month,
        "method": method_used,
        "total_forecast": round(total_forecast, 2),
        "by_category": by_category_out,
    }


def run_all_analytics(transactions: list[dict[str, Any]]) -> dict[str, Any]:
    recurring = detect_recurring_charges(transactions)
    price_hikes = detect_price_hikes(transactions)
    outliers = detect_outliers(transactions)
    monthly_summary = compute_monthly_summary(transactions)
    forecast = forecast_next_month(transactions)

    valid_records = _prepare_records(transactions)
    needs_review_count = sum(
        1 for t in transactions if t.get("needs_review") or t.get("status") == "needs_review"
    )
    total_spend = round(sum(r["total"] for r in valid_records), 2)
    zombies = [r for r in recurring if r["is_zombie"]]
    zombie_annual_waste = round(sum(z["annualized_cost"] for z in zombies), 2)

    return {
        "recurring": recurring,
        "price_hikes": price_hikes,
        "outliers": outliers,
        "monthly_summary": monthly_summary,
        "forecast": forecast,
        "stats_meta": {
            "total_transactions": len(transactions),
            "valid_transactions": len(valid_records),
            "needs_review_count": needs_review_count,
            "total_spend": total_spend,
            "recurring_count": len(recurring),
            "zombie_count": len(zombies),
            "zombie_annual_cost": zombie_annual_waste,
            "price_hike_count": len(price_hikes),
            "outlier_count": len(outliers),
            "tabpfn_active": is_tabpfn_enabled(),
            "forecast_method": forecast["method"],
        },
    }
