"""Run test_receipts/cord_*.jpg through the configured Gemma backend and compare totals to ground truth."""
import json
import re
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
import gemma  # noqa: E402


def truth_total(path: Path) -> str:
    gt = json.loads(path.read_text())
    t = gt.get("total", {})
    return str(t.get("total_price") or t.get("total_etc") or "")


def digits(s: str) -> str:
    return re.sub(r"\D", "", s)


rows = []
for img in sorted(Path("test_receipts").glob("cord_*.jpg")):
    t0 = time.time()
    r = gemma.extract_receipt(img.read_bytes(), img.name)
    secs = round(time.time() - t0)
    truth = truth_total(img.with_suffix(".truth.json"))
    got = r["total"]
    got_digits = digits(f"{got:.2f}").rstrip("0")
    exact = digits(truth).rstrip("0") == got_digits and got_digits != ""
    rows.append({"file": img.name, "status": r["status"], "merchant": r["merchant"], "truth_total": truth,
                 "model_total": got, "currency": r["currency"], "items": len(r["line_items"]),
                 "total_match": exact, "seconds": secs, "error": (r.get("error_message") or "")[:120]})
    print(json.dumps(rows[-1]), flush=True)
Path("eval_results.json").write_text(json.dumps(rows, indent=1))
print("matched", sum(x["total_match"] for x in rows), "of", len(rows))
