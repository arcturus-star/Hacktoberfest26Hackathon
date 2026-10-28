# Student activity frontend

React/Vite interface integrated with the Node backend. Production defaults to the same-origin real API, with deterministic backend fallback when Gemma is unavailable. Mock mode is optional and explicitly labeled; it is not proof of backend connectivity.

## Build and run

From `frontend`, run `npm ci` and `npm run build` (or `pnpm install` and `pnpm build`). Then from the repository root run `node scripts/start-demo.cjs` and open http://localhost:3001. The root launcher serves the built frontend and real API together.

For development, start the backend on port 3001 and run `npm run dev` here. Vite proxies `/api` to port 3001. An explicit API URL can be configured through Settings or VITE_API_BASE_URL; cross-origin setups require matching FRONTEND_ORIGIN on the backend.

Run `node --test test/*.test.js` for unit checks. The imported verification screenshots describe the earlier standalone frontend; current integration/browser verification is recorded by the coordinator in docs/demo-scenarios.md.

## Behavior

Select a synthetic student, change the result limit, and refresh recommendations. Cards display activity name, description, tags, London time, location and explanation. Loading, empty, error/retry and missing-activity states are explicit. Old async responses cannot overwrite newer student/configuration requests. Settings can check API health and explicitly switch to isolated mock fixtures. Live API mode does not mean live Gemma or university integrations; fallback is displayed independently.
