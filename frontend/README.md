# LboroConnect demo frontend

This dependency-free interface selects one of the synthetic students, requests activity details and recommendations from the backend, and displays the event time, location, reason and model/fallback notice. All listed events are marked as demo examples. No Loughborough service or calendar is connected.

## Run locally

Use Node.js 20 or newer. Start the backend in PowerShell terminal 1:

```powershell
cd backend
$env:PORT = '3001'
$env:FRONTEND_ORIGIN = 'http://localhost:5173'
npm start
```

Start the frontend in PowerShell terminal 2:

```powershell
cd frontend
npm start
```

Open <http://localhost:5173>. Set `FRONTEND_PORT` to change the static frontend port; if you do, set the backend's `FRONTEND_ORIGIN` to that exact origin and restart the backend.

## Demo walkthrough

1. Confirm the page reports that the demo API is connected.
2. Choose a fictional student and click **Find activities**.
3. Check that each card shows its demo title, UK-local time, location, recommendation reason and `Demo event` marker.
4. Note that the current backend uses deterministic interest/attendance fallback unless a compatible Gemma endpoint is configured and verified.
5. Choose a different student and repeat. A no-match result, backend error and loading state have clear messages.

There is no build step or third-party frontend dependency.

## Verification status

`node --check app.js` and `node --check server.js` pass. Interactive browser verification remains outstanding because permission to open the local demo page was declined in this session.
