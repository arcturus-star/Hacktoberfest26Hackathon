# Student Recommendation Frontend

Student-facing web interface for the Loughborough Student Activity Recommendations MVP.

## Features

- **Fictional Student Selection:** Browse and switch between synthetic student profiles (e.g. Alex Rivera, Emma Thompson, James Chen, Priya Patel, Zoe Walker).
- **Activity Recommendations:** Displays recommended activities complete with activity name, scheduled start/end times (en-GB format), location, detailed reason, activity description, tags, and data source.
- **Contract Adherence:** Implements the agreed HTTP contract (`GET /api/health`, `GET /api/students`, `GET /api/activities`, `GET /api/students/:id/recommendations?limit=:limit`) and resolves recommendation `activityId` references to full activity details.
- **Honest Fallback & Status Notices:** Clearly displays when recommendations use deterministic fallback or offline mock data. Never misrepresents fallback as Gemma AI ranking.
- **Configurable API Base URL:** Defaults to `http://localhost:3001`; configurable at build time via `VITE_API_BASE_URL` or at runtime via the in-app **Settings** modal with live health checking (`GET /api/health`).
- **Offline Mock Mode:** Offline mode using identical response shapes while the backend service is offline or in development. If live requests fail in live mode, the UI shows a clear error state and retry button—it never silently masks failures.
- **Security:** No Gemma credentials, secrets, or server calls are exposed to or handled by the browser.
- **Responsive & Accessible:** Fully responsive across mobile (375px) and desktop (1280px+) viewports, meeting WCAG AA standards with keyboard navigation and visible focus rings.

## Installation & Running

### Prerequisites
- Node.js >= 18 (Tested on Node.js v24.19.0)
- npm >= 9

### Install Dependencies
```bash
cd frontend
npm install
```

### Development Server
```bash
npm run dev
```
Runs Vite dev server at `http://localhost:5173`.

### Production Build & Preview
```bash
npm run build
npm run preview
```
Runs production build preview at `http://localhost:4173`.

### Automated Unit Tests
```bash
npm test
```
Runs 12 unit tests covering the API client, mock recommendation algorithms, and date/time formatters using Node's built-in test runner (`node --test`).

### Browser Verification Suite
```bash
npm run verify
```
Launches headless Chrome to verify:
1. Desktop rendering & student selection (1280x800)
2. Empty state handling (Zoe Walker profile)
3. Live mode honest error state when backend is unreachable
4. Mobile layout & card responsiveness (375x667)
Screenshots are saved to `frontend/verification-screenshots/`.

## API Configuration

- **Environment Variable:** Set `VITE_API_BASE_URL=http://localhost:3001` in `.env` or during build.
- **In-App Settings:** Click the **⚙️ Settings** button in the top navigation bar to change the base URL and test connection via `GET /api/health`.
