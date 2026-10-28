from __future__ import annotations

import os
import statistics
from typing import Any


def _env_wants_tabpfn() -> bool:
    return os.environ.get("USE_TABPFN", "0").strip().lower() in ("1", "true", "yes")


def is_tabpfn_enabled() -> bool:
    if not _env_wants_tabpfn():
        return False
    try:
        import tabpfn  # noqa: F401

        return True
    except Exception:
        return False


def forecast_categories_tabpfn(
    monthly_series_by_category: dict[str, list[float]],
) -> dict[str, float] | None:
    if not _env_wants_tabpfn():
        return None
    try:
        import numpy as np
        from tabpfn import TabPFNRegressor
    except Exception:
        return None

    try:
        X_train: list[list[float]] = []
        y_train: list[float] = []
        cat_keys = sorted(monthly_series_by_category.keys())
        cat_to_id = {c: float(i) for i, c in enumerate(cat_keys)}

        for cat, series in monthly_series_by_category.items():
            if len(series) < 3:
                continue
            cid = cat_to_id[cat]
            for t in range(2, len(series)):
                prev1 = float(series[t - 1])
                prev2 = float(series[t - 2])
                roll_mean = float(statistics.mean(series[:t]))
                X_train.append([cid, float(t), prev1, prev2, roll_mean])
                y_train.append(float(series[t]))

        if len(X_train) < 4:
            return None

        reg = TabPFNRegressor()
        reg.fit(np.asarray(X_train, dtype=float), np.asarray(y_train, dtype=float))

        forecasts: dict[str, float] = {}
        for cat, series in monthly_series_by_category.items():
            if len(series) < 2:
                forecasts[cat] = round(max(0.0, float(series[-1]) if series else 0.0), 2)
                continue
            cid = cat_to_id[cat]
            t_next = float(len(series))
            prev1 = float(series[-1])
            prev2 = float(series[-2])
            roll_mean = float(statistics.mean(series))
            x_pred = np.asarray([[cid, t_next, prev1, prev2, roll_mean]], dtype=float)
            pred = float(reg.predict(x_pred)[0])
            forecasts[cat] = round(max(0.0, pred), 2)

        return forecasts
    except Exception:
        return None


def score_outliers_tabpfn(records: list[dict[str, Any]]) -> dict[int, float] | None:
    if not _env_wants_tabpfn() or len(records) < 8:
        return None
    try:
        import numpy as np
        from tabpfn import TabPFNRegressor
    except Exception:
        return None

    try:
        categories = sorted({str(r.get("category") or "Other") for r in records})
        cat_map = {c: float(i) for i, c in enumerate(categories)}
        merch_counts: dict[str, int] = {}
        for r in records:
            m = str(r.get("normalized_merchant") or r.get("merchant") or "")
            merch_counts[m] = merch_counts.get(m, 0) + 1

        X: list[list[float]] = []
        y: list[float] = []
        ids: list[int] = []

        for idx, r in enumerate(records):
            tx_id = int(r.get("id", idx))
            cat = str(r.get("category") or "Other")
            m = str(r.get("normalized_merchant") or r.get("merchant") or "")
            d_str = str(r.get("tx_date") or r.get("date") or "2026-01-01")
            parts = d_str[:10].split("-")
            month_num = float(parts[1]) if len(parts) >= 2 and parts[1].isdigit() else 1.0
            day_num = float(parts[2]) if len(parts) >= 3 and parts[2].isdigit() else 15.0
            X.append([cat_map[cat], float(merch_counts[m]), month_num, day_num])
            y.append(float(r.get("total", 0.0)))
            ids.append(tx_id)

        X_arr = np.asarray(X, dtype=float)
        y_arr = np.asarray(y, dtype=float)

        reg = TabPFNRegressor()
        reg.fit(X_arr, y_arr)
        preds = reg.predict(X_arr)
        residuals = y_arr - preds
        res_list = [float(v) for v in residuals]
        spread = statistics.pstdev(res_list) if len(res_list) > 1 else 1.0
        if spread <= 1e-6:
            spread = 1.0

        return {
            tx_id: round(float(res_val / spread), 2)
            for tx_id, res_val in zip(ids, res_list)
        }
    except Exception:
        return None
