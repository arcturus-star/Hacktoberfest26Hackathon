# 🦥 LazyLedger

**Hacktoberfest 2026 Hackathon (Lboro)**  
*DEV Challenge: "Slow and Steady" (Open-weight AI at the core, rewarding laziness)*

### Team Members
- **arcturus-star**
- **Rishi**

---

**LazyLedger** is a small, local-first receipt & bank statement auditor.

Instead of manually categorizing expenses or hunting through statements for forgotten trials, drop receipt photos (`.jpg`/`.png`) or a bank `.csv` into the web page—or into the watched `./inbox` folder—and let an open-weight **Gemma** vision model extract structured data into a local SQLite database.

LazyLedger automatically flags:
1. **Recurring charges & zombie subscriptions** (detected by normalized merchant + billing interval cadence + amount stability).
2. **Merchant price hikes** (detects when a previously stable recurring charge jumps to a higher rate).
3. **Outlier transactions** (flagged via per-category and global **z-score** and **IQR** fences, with an optional **TabPFN** anomaly/forecasting path).
4. **Monthly spend summary & next-month category forecast** (linear trend + seasonal-naive blend, or optional TabPFN regression).
5. **One-click cancellation email drafter** powered by the same local Gemma model.

---

## Quick Start

```bash
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# macOS / Linux:
# source .venv/bin/activate

pip install -r requirements.txt
```

### Run Without Any Model (Mock Mode)
To try the full UI, sample data, receipt dropzone, inbox scanner, and cancellation email drafter without running Ollama or downloading model weights:

```bash
# Windows PowerShell
$env:LAZYLEDGER_MOCK="1"
uvicorn app:app --reload --port 8000

# macOS / Linux
LAZYLEDGER_MOCK=1 uvicorn app:app --reload --port 8000
```

Open `http://localhost:8000` and click **"Load 7-Month Sample CSV"** or drop any `.jpg`/`.png` image onto the dropzone.

### Run With Local Gemma via Ollama
1. Install [Ollama](https://ollama.com/) and pull a vision-capable Gemma 3 model:
   ```bash
   ollama pull gemma3:4b
   ```
2. Start LazyLedger (defaults to `http://localhost:11434` and `gemma3:4b`):
   ```bash
   uvicorn app:app --reload --port 8000
   ```

---

## Configuration (Environment Variables)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `GEMMA_BASE_URL` | `http://localhost:11434` | Base URL for Ollama or an OpenAI-compatible server. |
| `GEMMA_MODEL` | `gemma3:4b` | Model identifier sent in chat/vision requests. |
| `GEMMA_API_STYLE` | `ollama` | `ollama` (uses `/api/chat` with `images`) or `openai` (uses `/v1/chat/completions` with base64 `image_url`). |
| `LAZYLEDGER_MOCK` | `0` | Set to `1` to return canned receipt JSON & cancellation emails with zero network calls. |
| `GEMMA_MAX_RETRIES` | `2` | Number of validation retry attempts when model output is not valid receipt JSON. |
| `USE_TABPFN` | `0` | Set to `1` (with `tabpfn` installed) to enable lazy-loaded TabPFN forecasting & outlier scoring; falls back silently to `pandas`/`statistics` otherwise. |
| `LAZYLEDGER_DB` | `lazyledger.db` | Path to the local SQLite database file. |
| `LAZYLEDGER_INBOX_DIR` | `./inbox` | Watched folder for dropping `.jpg`, `.png`, `.webp`, or `.csv` files. |

---

## Honest Notes: Running Gemma Locally vs. Remote Host

- **Local CPU / Integrated GPU (`gemma3:4b` via Ollama):**
  - Vision inference on receipt images is genuinely **"slow and steady"** on modest hardware—each receipt can take several seconds to tens of seconds depending on CPU/VRAM and image resolution.
  - LazyLedger automatically downscales large camera photos (default max dimension `1280px` JPEG via Pillow) before encoding to base64. This significantly reduces vision token overhead while keeping receipt text legible.
  - Because small open-weight models occasionally wrap JSON in markdown fences or misformat fields on crumpled receipts, `gemma.py` validates every field (`merchant`, `date`, `total`, `currency`, `category`, `line_items`), retries with corrective feedback on validation failure, and **never crashes**: any receipt that still fails is saved with `status="needs_review"` so you can edit and approve it in the UI.
- **Remote Ollama or OpenAI-Compatible Host (vLLM / llama.cpp / LM Studio / Remote GPU):**
  - If your laptop lacks GPU memory or you are batch-processing a folder of receipts in `./inbox`, point `GEMMA_BASE_URL` at a LAN desktop or private GPU box:
    ```bash
    # Remote Ollama instance
    GEMMA_BASE_URL=http://192.168.1.50:11434 GEMMA_MODEL=gemma3:12b uvicorn app:app

    # OpenAI-compatible server (vLLM, llama-server, LM Studio)
    GEMMA_BASE_URL=http://192.168.1.50:8080 GEMMA_API_STYLE=openai GEMMA_MODEL=google/gemma-3-4b-it uvicorn app:app
    ```
  - Only send financial receipts to a remote host you control or trust.

---

## Privacy

- **Zero third-party telemetry or CDN requests:** The frontend (`static/index.html`) uses pure vanilla HTML/CSS/JS with no external fonts, scripts, or analytics trackers.
- **Strictly local storage:** All transactions and inbox file hashes are stored in a local SQLite database (`lazyledger.db`).
- **Single network boundary:** The application makes no outbound network requests anywhere except to your configured `GEMMA_BASE_URL` (and none at all when `LAZYLEDGER_MOCK=1`).

---

## Sample Data & Tests

To regenerate the deterministic 7-month synthetic bank CSV (`sample_data/transactions.csv`, containing a hidden `CloudVault Backup Pro` zombie subscription, a `StreamFlix HD` price hike from `$14.99` to `$19.99`, and a `$1,249.00` `MegaTech Electronics` outlier):

```bash
python sample_data/generate_sample_data.py
```

Run the test suite with `pytest`:

```bash
pytest
```

---

## Hosted Gemma via OpenRouter (free tier)

No GPU needed. Receipts leave your machine in this mode, so use local Ollama if privacy matters.

```bash
GEMMA_API_STYLE=openai
GEMMA_BASE_URL=https://openrouter.ai/api
GEMMA_MODEL=google/gemma-4-31b-it:free
GEMMA_API_KEY=<your OpenRouter key>
```

---

## Hosted Gemma via Google AI Studio (free key, no OpenRouter)

```bash
GEMMA_API_STYLE=google
GEMMA_BASE_URL=https://generativelanguage.googleapis.com
GEMMA_MODEL=gemma-4-31b-it
GEMMA_API_KEY=<your AI Studio key>
```
