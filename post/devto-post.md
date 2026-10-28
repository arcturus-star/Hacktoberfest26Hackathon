---
title: "LazyLedger: A Sloth-Paced Receipt and Subscription Auditor Running on Local Gemma"
published: false
tags: devchallenge, hf26challenge, opensource, ai
ai_disclosure_level: some_ai
---

A sloth does not do real-time. Its entire survival strategy is built around moving slowly, conserving energy, and refusing to be rushed by anyone else's schedule.

That is also the only way to feel good about running a vision language model on a CPU-only Windows laptop with 7.6 GB of RAM. When a single receipt photo takes roughly 3 to 3.7 minutes to parse on a first run, you do not build a snappy real-time scanner. You build an unattended inbox where you can drop a pile of receipts, walk away, and let the machine chew on them at its own pace.

For Week 3 of the Hacktoberfest Open-Source AI Challenge ("Slow and Steady"), I built **LazyLedger**: a local-first receipt reader and bank CSV auditor that uses an open-weight Gemma model to do the tedious reading, and plain old statistics to find the money leaking out of your bank account.

<!-- TODO: add repo link -->

## What It Does

LazyLedger has a simple job: take the financial paperwork you keep putting off and turn it into a short list of things worth paying attention to.

You drop receipt images or a bank CSV into a single web page (or leave files in an inbox folder for background ingestion). From there:

1. **Receipt extraction**: A local open-weight Gemma vision model (`gemma3:4b` via Ollama) reads each receipt image and extracts the merchant, date, total, currency, category, and line items as JSON into SQLite.
2. **Subscription & anomaly auditing**: Plain `pandas` and basic statistics scan the ledger to flag:
   - **Recurring charges and likely zombie subscriptions**
   - **Price hikes** from the same merchant over time
   - **Outlier transactions** using z-score and IQR
   - **A monthly summary** and a **next-month per-category forecast** (combining linear trend and seasonal-naive methods)
3. **Cancellation drafts**: A button on flagged subscriptions asks the same model to draft a cancellation email so you don't have to stare at a blank compose window.

<!-- TODO: add dashboard screenshot -->

To test the analytics pipeline end to end, I generated a synthetic dataset of 99 transactions across 7 months (March to September 2026) with three planted problems:
- A hidden zombie subscription (**CloudVault Backup Pro** at **$12.99/mo**)
- A sneaky price hike (**StreamFlix HD** jumping from **$14.99 to $19.99**, **+33.4%**)
- One clear outlier (**MegaTech Electronics** at **$1,249.00**, **z = 9.7**, **25.5x** the Shopping median)

LazyLedger caught all three, calculated **$395.76/yr** in combined "zombie drain" across 2 flagged zombies, and forecast **$660.94** for next month. It was also instructively noisy: it labelled StreamFlix a zombie even though it's an active subscription that just got a price hike, and its list of 11 recurring charges included weekly groceries. Also, full honesty: the cancellation-email button was only tested against a canned mock model, never with live Gemma.

<!-- TODO: add demo clip -->

## Why Open Weights Mattered (Including Where They Hurt)

Personal finance is one of the easiest arguments for open weights, for three very practical reasons:

- **Privacy by default**: Receipts and bank statements are uncomfortably personal. Running `gemma3:4b` locally meant zero receipt images left my machine during testing.
- **No per-token meter**: If you want an always-on folder watcher that quietly processes whatever you drop into it, paying per vision call gets old fast. Local inference costs electricity and patience.
- **Escape from shared rate limits**: I actually didn't start locally. My first plan was to use free hosted Gemma 4 (`google/gemma-4-31b-it:free` and the 26B variant) through OpenRouter. Every single request came back `429`—OpenRouter's error explained that those models were rate-limited upstream in a shared pool. I added retry backoff; still `429`. Because the Gemma family is open-weight, I wasn't stuck waiting for a shared queue to clear. I pointed the app at local Ollama instead and kept moving.

Where were open weights worse? **Speed, hardware ceiling, and small-model accuracy.**

Running a 4B vision model on CPU took **184 to 219 seconds (roughly 3 to 3.7 minutes) per receipt** on my first working run. Later, when re-running receipts after fixing my parser, my 7.6 GB laptop ran out of memory after just two images. And a 4B model makes real mistakes on messy real-world receipts (more on that below). Open weights gave me privacy and independence, not magic—which is why the sloth workflow (drop files in a folder and go make coffee) isn't just a theme joke; it's the only UX that makes CPU vision bearable.

## How It Works

The stack is deliberately boring:
- **FastAPI** backend with a **single static HTML page** up front
- **SQLite** for local storage
- **Pillow** and **httpx** for image prep and model calls
- **pandas** for all the number crunching

The Gemma backend is pluggable via an environment variable, supporting **Ollama native**, **OpenAI-compatible** (which I used for the OpenRouter attempts), and a **Google AI Studio** style path (which exists in the code, though I never ran it since I didn't have an API key).

I kept the boundary between AI and code strict: the vision model only turns receipt pixels into structured JSON (or drafts an email), and deterministic Python does all the math.

## What Went Wrong and What I Fixed: 5 Real Receipts

Synthetic CSVs are polite. Real receipts are not.

I tested the vision pipeline on **5 real receipts** from the **CORD v2 dataset** test split ([CC BY 4.0](https://github.com/clovaai/cord))—Indonesian receipts with rupiah totals formatted like `60.000` and `174,600`.

### Failure #0: The Overzealous Bouncer
On my very first attempt, a receipt came back with its date set to `"Unknown"` (the model found no date on 4 of the 5 receipts). My ingestion code responded by throwing away the entire receipt—merchant and total included. I also spotted that my amount parser would read `60.000` as `60`, treating the thousands-separator dot as a decimal point.

### Run 1: The Subtle Disasters
Once it actually saved rows, **3 out of 5 totals were right** (at 3 to 3.7 minutes apiece). The other two failed in ways that taught me not to trust raw LLM JSON:

- **The cash-tendered trap**: On a receipt whose true total was **28,000**, the model returned **100,000**—the cash handed over by the customer—and returned the literal string `"null"` as the merchant name.
- **The silent truncation**: On a Starbucks receipt with a true total of **174,600**, the model returned **194** and the app happily marked it `OK`.
- **Currency blindness**: Every single one of the 5 Indonesian rupiah receipts came back labelled `USD`.

<!-- TODO: add receipt upload / review screenshot -->

### The Fixes
I went back and tightened the deterministic guardrails around the model:
1. **Missing dates don't drop receipts**: If a date is missing or `"Unknown"`, the receipt is kept with today's date and flagged `needs_review`.
2. **Indonesian/European thousands separators**: Amounts formatted like `60.000` or `28.000,50` are now parsed properly as thousands separators rather than decimals.
3. **Line-item sanity check**: If the extracted receipt total differs from the sum of its extracted line items by more than **25%**, the receipt is automatically flagged for review instead of silently passing as `OK`.
4. **No more `"null"` merchants**: The literal string `"null"` is stripped out instead of stored as a store name.

When I re-ran the test after those fixes, **2 receipts finished with the right totals (`60,000` and `91,000`)** in about **65 seconds each** (I honestly don't know why they ran faster than the earlier 3-minute runs). Before the remaining 3 could run—including the `28,000` and Starbucks `174,600` failures—my laptop ran out of memory. So while the new parser rules and the 25% line-item mismatch check are covered by **18 passing unit tests**, I haven't yet proven them live against those specific failed images.

## What I Would Do Next

If I keep poking at LazyLedger, the next steps are right in front of me:
- **Finish the 5-receipt re-run**: Free up enough memory to run the remaining 3 CORD v2 receipts through the updated pipeline and verify that the 25% line-item check catches the `174,600 -> 194` Starbucks error and the `28,000 -> 100,000` cash-tendered mix-up in real life, not just in unit tests.
- **Stop calling everything USD**: Fix the prompt and post-processing so rupiah (and other non-USD currencies) aren't defaulted to `USD`.
- **Smarter zombie heuristics**: Separate "active subscription that raised its price" (like StreamFlix HD) and high-frequency essentials (like weekly groceries) from true forgotten subscriptions.
- **Test cancellation emails on the real model**: Hook the cancellation-email button up to a live local Gemma run instead of only testing it against the mock backend.

## AI Disclosure

The code for LazyLedger was largely written with AI help: Gemini 4 Argon wrote the initial version, and Claude Code reviewed, tested, and fixed it.

This article was created with the help of AI.
