from __future__ import annotations

import csv
import random
from datetime import date
from pathlib import Path


def generate_rows(seed: int = 2026) -> list[dict[str, str]]:
    rng = random.Random(seed)
    rows: list[dict[str, str]] = []

    months = [
        (2026, 3),
        (2026, 4),
        (2026, 5),
        (2026, 6),
        (2026, 7),
        (2026, 8),
        (2026, 9),
    ]

    for idx, (year, month) in enumerate(months):
        # 1. Hidden zombie subscription: CloudVault Backup Pro ($12.99/mo on the 14th)
        rows.append(
            {
                "date": date(year, month, 14).isoformat(),
                "merchant": "CloudVault Backup Pro",
                "amount": "12.99",
                "currency": "USD",
                "category": "Subscriptions",
                "description": "CloudVault Backup Pro Monthly Auto-Renewal",
            }
        )

        # 2. Price hike subscription: StreamFlix HD ($14.99 for 4 months, then $19.99 for 3 months)
        stream_price = "14.99" if idx < 4 else "19.99"
        rows.append(
            {
                "date": date(year, month, 5).isoformat(),
                "merchant": "StreamFlix HD",
                "amount": stream_price,
                "currency": "USD",
                "category": "Subscriptions",
                "description": "StreamFlix Monthly Plan",
            }
        )

        # Monthly electric utility bill (variable amount, not a fixed-price hike)
        util_amt = round(72.0 + rng.uniform(-8.0, 18.0), 2)
        rows.append(
            {
                "date": date(year, month, 18).isoformat(),
                "merchant": "GridPower Electric",
                "amount": f"{util_amt:.2f}",
                "currency": "USD",
                "category": "Utilities",
                "description": "Monthly Electric Utility Bill",
            }
        )

        # Weekly-ish groceries (4 trips per month)
        for day in (3, 10, 17, 25):
            groc_amt = round(rng.uniform(48.50, 88.40), 2)
            rows.append(
                {
                    "date": date(year, month, day).isoformat(),
                    "merchant": "FreshMart Groceries",
                    "amount": f"{groc_amt:.2f}",
                    "currency": "USD",
                    "category": "Groceries",
                    "description": "Weekly Grocery Run",
                }
            )

        # Dining & coffee (3 visits per month)
        for day, place, low, high in (
            (7, "Bean & Leaf Cafe", 6.50, 14.25),
            (15, "Harbor Noodle House", 24.00, 42.50),
            (22, "Neighborhood Bistro", 31.00, 56.00),
        ):
            dine_amt = round(rng.uniform(low, high), 2)
            rows.append(
                {
                    "date": date(year, month, day).isoformat(),
                    "merchant": place,
                    "amount": f"{dine_amt:.2f}",
                    "currency": "USD",
                    "category": "Dining",
                    "description": f"Dining at {place}",
                }
            )

        # Transport (2 reloads/rides per month)
        for day, place, low, high in (
            (4, "Metro Transit Pass", 25.00, 32.00),
            (20, "CityFuel Station", 34.00, 48.00),
        ):
            tr_amt = round(rng.uniform(low, high), 2)
            rows.append(
                {
                    "date": date(year, month, day).isoformat(),
                    "merchant": place,
                    "amount": f"{tr_amt:.2f}",
                    "currency": "USD",
                    "category": "Transport",
                    "description": place,
                }
            )

        # Normal small shopping (2 purchases per month)
        for day, place, low, high in (
            (11, "Corner Hardware & Home", 22.00, 54.00),
            (27, "Everyday Goods Co", 28.00, 63.00),
        ):
            shop_amt = round(rng.uniform(low, high), 2)
            rows.append(
                {
                    "date": date(year, month, day).isoformat(),
                    "merchant": place,
                    "amount": f"{shop_amt:.2f}",
                    "currency": "USD",
                    "category": "Shopping",
                    "description": f"Purchase at {place}",
                }
            )

    # 3. Single clear outlier transaction in August 2026
    rows.append(
        {
            "date": "2026-08-19",
            "merchant": "MegaTech Electronics",
            "amount": "1249.00",
            "currency": "USD",
            "category": "Shopping",
            "description": "Workstation Monitor & Dock Bundle",
        }
    )

    rows.sort(key=lambda r: (r["date"], r["merchant"]))
    return rows


def main() -> None:
    out_path = Path(__file__).resolve().parent / "transactions.csv"
    rows = generate_rows()
    fieldnames = ["date", "merchant", "amount", "currency", "category", "description"]
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} synthetic transactions to {out_path}")


if __name__ == "__main__":
    main()
