# LboroConnect backend

This is a small, dependency-free Node.js HTTP API for the synthetic activity recommendation demo. It serves fictional students and activities from local JSON, filters already attended and past activity instances, ranks relevant candidates deterministically, and can optionally ask a configured Gemma-compatible service to rank those candidates.

All event records are demo examples labeled `synthetic`; dates and end times are not verified university listings. The event names, dates, descriptions and tags were adapted from the repository's `sample-data-bases` branch. Its calendar file is not imported. The source CSV has no end times, so the fixtures use a documented 90-minute demo duration. The included attendance and past activity records are synthetic examples.

## Requirements and run

Use Node.js 20 or newer. There are no required third-party packages.

```sh
cd backend
npm start
```

The service listens on `http://localhost:3001` by default. Set `PORT` to a different integer from 1 to 65535. Configure `FRONTEND_ORIGIN` to the frontend's exact browser origin to enable CORS for that origin; for example `http://localhost:5173`. No cross-origin browser access is enabled when this value is unset. `OPTIONS` preflight requests are supported.

To run the test suite:

```sh
cd backend
npm test
```

## Data

The service loads and validates these files at startup:

- `data/students.json`: unique IDs, names and interest tags.
- `data/activities.json`: unique IDs, description, tags, timezone-bearing ISO 8601 start/end, location and source label.
- `data/attendance.json`: student/activity ID references.

Malformed JSON, duplicate IDs, missing required fields, invalid datetimes, non-positive durations and broken attendance references fail startup with a specific message. Keep the demo data fictional. To refresh example activity dates, update the `start` and `end` values together and preserve their explicit timezone.

## API

Every response is JSON with UTF-8 encoding. IDs are strings.

### `GET /api/health`

```json
{"status":"ok"}
```

This only reports that the HTTP service is running; it does not check Gemma connectivity.

### `GET /api/students`

```json
{"students":[{"id":"S001","name":"Emma Thompson","interests":["sport","social","wellbeing"]}]}
```

### `GET /api/activities`

```json
{"activities":[{"id":"activity-e002","name":"Badminton Club Training Session","description":"Open training session for all skill levels.","tags":["sport","badminton","training","recreational"],"start":"2026-11-01T18:30:00.000Z","end":"2026-11-01T20:00:00.000Z","location":"Rutland Sports Complex","source":"synthetic"}]}
```

### `GET /api/students/:studentId/recommendations?limit=5`

`limit` defaults to 5 and must be an integer from 1 to 20.

```json
{
  "studentId":"S001",
  "recommendations":[
    {"activityId":"activity-e002","reason":"Matches your interest in sport. Related to your past attendance in sport."}
  ],
  "mode":"fallback",
  "notice":"Using interest and attendance-based recommendations."
}
```

The frontend resolves `activityId` against `/api/activities`. Empty eligible results return HTTP 200 with an empty list and `mode: "fallback"`. `mode` is `gemma` only after a valid configured provider response; otherwise it is `fallback`. `notice` is a safe user-facing string or `null`.

Errors use this shape:

```json
{"error":{"code":"INVALID_LIMIT","message":"Limit must be an integer from 1 to 20."}}
```

The service uses HTTP 400 and `INVALID_LIMIT` for invalid limits; HTTP 404 and `STUDENT_NOT_FOUND` for unknown students; and HTTP 404 and `NOT_FOUND` for unknown routes. Unexpected errors return HTTP 500 and `INTERNAL_ERROR` without stack traces or provider details.

## Recommendation behavior

The service excludes activities that have started and any activity ID recorded in that student's attendance. It scores each remaining activity as twice the number of unique interest/tag matches plus the number of unique tag matches from the student's attended activity history. Only positive-scoring candidates are returned. Ties sort by start time and then activity ID. Reasons cite matching interest tags or tags from past attendance. These rules run locally and provide a stable fallback.

## Optional Gemma-compatible ranking

By default, the service uses deterministic fallback mode and makes no external model request. To enable model ranking, configure `GEMMA_BASE_URL` as an OpenAI-compatible chat-completions URL (for example `https://your-provider.example/v1/chat/completions`), `GEMMA_MODEL`, and optionally `GEMMA_API_KEY`. An empty `.env.example` is provided; Node does not load it automatically, so set values in the process environment. For example, in PowerShell:

```powershell
$env:GEMMA_BASE_URL = 'https://your-provider.example/v1/chat/completions'
$env:GEMMA_MODEL = 'your-configured-model-name'
$env:GEMMA_API_KEY = 'your-local-secret'
npm start
```

The adapter sends a deterministic chat-completions request with synthetic interests, past-attendance tags and at most 20 eligible candidates. It asks for JSON `activityId`/`reason` pairs and has a five-second timeout. Only a nonempty list of unique candidate IDs with nonempty reasons up to 500 characters is accepted; malformed output, provider failure and timeouts fall back to the local ranking. The provider's request compatibility and live Gemma inference have **not** been verified in this project, so leave `mode` as `fallback` until a real request is tested. Never commit `.env` files or credentials.
