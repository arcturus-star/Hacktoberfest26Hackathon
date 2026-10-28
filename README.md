# Student activity recommendations

Hacktoberfest 2026 Hackathon, Loughborough.

Team members: Rishi, Eddie, Rakin, Mahdi and Lucas.

A hackathon project to help Loughborough students discover activities based on their interests and past attendance, using Gemma and synthetic data.

See [PROJECT.md](PROJECT.md) for the proposed architecture and [TEAM_HANDOFF.md](TEAM_HANDOFF.md) for team roles and agent assignments.

Backend Codex agent: start with the [backend implementation assignment](docs/superpowers/plans/2026-10-28-backend.md). Agy owns the frontend; use the HTTP contract in that assignment for parallel work.

## Frontend: Student Interface

Agy owns the student-facing interface in `frontend/`.

- **Install:** `cd frontend && npm install`
- **Start Development Server:** `cd frontend && npm run dev` (runs at `http://localhost:5173`)
- **Build & Preview:** `cd frontend && npm run build && npm run preview` (runs at `http://localhost:4173`)
- **Run Unit Tests:** `cd frontend && npm test`
- **Run Browser Verification:** `cd frontend && npm run verify`
- **API Configuration:** Configure `VITE_API_BASE_URL` (default: `http://localhost:3001`) or use the in-app **Settings** modal with health check. Includes offline mock mode while backend is unavailable. See [`frontend/README.md`](frontend/README.md) for full documentation.

## Sol: existing data validation and demo scenarios

Synthetic data already exists. Reuse it; do not create a replacement dataset. Sol owns checking the data and preparing repeatable demo scenarios, while the backend agent owns service code and Agy with the coordinating Codex agent owns frontend and integration.

1. Read `AGENTS.md`, `PROJECT.md`, `TEAM_HANDOFF.md` and the backend assignment linked above. Pull latest main and work on `feature/demo-validation`.
2. Inspect the existing data, including `origin/sample-data-bases` (`eventsdatabase.csv`, `studentdatabase.csv` and `googlecaldatabase`). Coordinate with the backend agent on which files the service consumes and who owns any conversion to the agreed JSON schema. Avoid parallel edits to those files.
3. Check student and activity IDs, attendance references, interests/tags, date formats, timezones and start/end ordering against the agreed contract. Confirm the records are synthetic. Report concrete problems; coordinate any necessary data fixes with the backend agent. Calendar integration remains outside the core demo.
4. Write `docs/demo-scenarios.md` using three existing fictional students with different interests or attendance histories. Record their actual IDs, relevant activity IDs, the demo date/time and expected recommendation behavior. Cover interest matches, attendance-based matches, exclusion of past or already-attended activities, and an empty result if the existing data supports it. If coverage is missing, document the gap before proposing minimal fixture additions.
5. Once the backend is available, run those scenarios through its documented API. Check that returned IDs resolve to activities, explanations match the data, and the demo works without Gemma credentials. Check frontend display when available. Record commands, observed results and reproducible bugs; do not claim untested behavior passes.
6. Push your branch and open a PR with the scenario document, validation findings and any coordinated data fixes. Leave backend implementation and frontend files to their owners; do not merge without coordination.

Deliverable: a repeatable demo checklist grounded in the existing data, with clear expected results and any remaining gaps reported to the coordinator. This assignment supersedes older suggestions that Sol should create new synthetic data.
