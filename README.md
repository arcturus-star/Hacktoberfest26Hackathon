# Student Activity Discovery — LboroConnect

A Loughborough University hackathon MVP that helps students discover campus activities based on their interests and past attendance.

Instead of browsing a long event list, choose a fictional student profile and see upcoming activities with a short explanation of why each matches. The demo includes sports, creative workshops, social events and wellbeing activities.

Built for Hacktoberfest 2026 by Rishi, Eddie, Rakin, Mahdi and Lucas.

## What it does

- Lets you select a synthetic student and view their personalised recommendations.
- Displays activity names, descriptions, dates, locations, tags and recommendation reasons.
- Matches interests and patterns in past attendance, excluding activities that have started or were already attended.
- Runs without AI credentials using deterministic ranking and explanations.
- Optionally sends eligible candidates to a configured Gemma-compatible provider for ranking. Invalid responses or provider failures fall back to local recommendations.
- Includes loading, empty and error states, retry controls, API settings and an explicit offline mock mode.

All profiles, attendance examples and runtime event fixtures are demo data. Real Loughborough app and calendar integrations are not connected. Live Gemma inference has not been verified.

## Run the complete demo

Prerequisites: Node.js 22.12+ (Node 24 recommended), npm and Git.

```sh
git clone https://github.com/arcturus-star/Hacktoberfest26Hackathon.git
cd Hacktoberfest26Hackathon
cd frontend
npm ci
npm run build
cd ..
node scripts/start-demo.cjs
```

Open **http://localhost:3001**. The launcher serves the built React frontend and the real HTTP API together. Backend dependencies and model credentials are not required.

After pulling frontend updates, run `npm run build` again inside `frontend`, then restart the launcher. Stop it with Ctrl+C.

## Use the demo

1. Select Emma Thompson, James Chen or Sarah Williams from the student selector.
2. Read the recommended activity cards and their interest or attendance explanations.
3. Change the student or recommendation count to compare results.
4. Use **Live** mode for the real local backend. This still works without Gemma and reports fallback ranking.
5. Use **Offline Mock** mode to demonstrate the interface with separate browser fixtures. This does not exercise the backend. The mode preference is saved in your browser, so switch back to Live when testing integration.
6. Open Settings to change or check the API URL if running the backend separately.

Times are shown in Europe/London. Runtime events are dated November 2026; as those dates pass, fewer activities remain eligible and eventually results become empty. Refresh fixture start/end dates together for future demonstrations. Fixed-clock replay instructions and observed results are in [docs/demo-scenarios.md](docs/demo-scenarios.md).

## How it works

```text
React interface -> HTTP API -> validated local JSON
                           -> interests + attendance candidate scoring
                           -> optional Gemma ranking / deterministic fallback
                           -> activity IDs + reasons -> activity cards
```

The fallback scores each unique interest/tag match twice and each unique past-attendance tag match once. Only positive matches are retained, ordered by score, start time and ID. Gemma can rank at most 20 supplied candidates; output must use unique allowed activity IDs and valid reasons.

## Project layout

| Path | Purpose |
| --- | --- |
| `frontend/` | React/Vite interface, browser fixtures and frontend tests |
| `backend/src/` | Node HTTP API, validation, recommendation scoring and Gemma adapter |
| `backend/data/` | JSON students, activities and attendance consumed by the service |
| `backend/test/` | Backend unit and HTTP tests |
| `scripts/start-demo.cjs` | Serves the built frontend and API together |
| `scripts/verify-demo.cjs` | Replays fixed-clock HTTP demo scenarios |
| `docs/demo-scenarios.md` | Data findings, demo expectations and verification evidence |

The original CSV data is on `sample-data-bases`; the service consumes its adapted JSON subset, not those CSV files directly. Known source quoting issues and conversion choices are documented in the demo scenarios.

## Development and tests

For frontend development, run the backend with `node backend/src/server.js`, then run `npm run dev` inside `frontend`. Vite proxies API requests to the local backend.

```sh
# From the repository root
node --test backend/test/*.test.js
node scripts/verify-demo.cjs

# From frontend/
npm test
npm run build
```

See [frontend/README.md](frontend/README.md) and [backend/README.md](backend/README.md) for detailed configuration and verification instructions.

## API and configuration

- `GET /api/health`: service status.
- `GET /api/students`: fictional student profiles and interests.
- `GET /api/activities`: activity catalogue.
- `GET /api/students/:id/recommendations?limit=5`: recommendations, ranking mode and notice. Limits are 1–20.

The combined launcher accepts `PORT` (default 3001) and `HOST` (default 127.0.0.1). For separate frontend/backend origins, set `FRONTEND_ORIGIN` to the exact frontend origin. API response contracts are in [backend/README.md](backend/README.md).

Optional server environment variables: `GEMMA_BASE_URL`, `GEMMA_MODEL` and `GEMMA_API_KEY`. The provider must support the documented chat-completions request. Environment files are not loaded automatically. Keep credentials on the server and out of Git.

## Hosting

Deploy the frontend and backend together on a Node-capable service. Build with `cd frontend && npm ci && npm run build`; start from the repository root with `node scripts/start-demo.cjs`. Set `HOST=0.0.0.0` and use the host-provided `PORT`. Leave Gemma variables unset for the offline fallback demo.

A static-only host such as GitHub Pages cannot run this Node backend. It would need a separately hosted API and frontend API configuration. No public deployment URL has been established by this repository's local demo setup.

## Further project context

[PROJECT.md](PROJECT.md) describes the MVP and stretch goals. [TEAM_HANDOFF.md](TEAM_HANDOFF.md) records the original team plan. Calendar, friendships and real university data access remain future work.
