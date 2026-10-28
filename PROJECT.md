# Student activity recommendations

## Goal

Help Loughborough students discover activities they may enjoy based on their past attendance. The intended future sources are the Loughborough Students' Union and Loughborough Sport apps; access and integration are not yet verified.

## Hackathon MVP

1. Store synthetic students, activities and attendance in local JSON files.
2. Select a demo student and show recommendations for upcoming activities they have not already attended.
3. Find candidates from interests and past attendance. Send their details and the student's interests to Gemma to rank and explain the matches. Return only IDs from the supplied candidates; validate model output and handle unavailable or invalid responses with a clear fallback.
4. Show each activity's name, time, location and a short reason for the recommendation.

Flow: UI -> recommendation service -> local synthetic JSON + optional Gemma-compatible ranking -> ranked results -> UI. The Node.js backend in `backend/` implements the health, student, activity and recommendation endpoints and deterministic offline ranking. It keeps Gemma credentials on the server and out of Git. A live provider endpoint and Gemma request have not been configured or verified.

## Shared data contract (proposal)

- Student: `id`, `name`, `interests` (string array).
- Activity: `id`, `name`, `description`, `tags` (string array), `start` and `end` (ISO 8601 with timezone), `location`, `source`.
- Attendance: `studentId`, `activityId`.
- Recommendation: `activityId`, `reason`; the UI looks up the activity details by ID. IDs are strings and must match the mock data.

## Stretch goals

- Calendar: use synthetic busy intervals first; filter activities that overlap. Real calendar access is optional and needs explicit user consent.
- Friends: use synthetic friendships and attendance to suggest activities enjoyed by similar students. Explain the signal without exposing private information.
- Replace mock sources with real integrations only if access and permissions are available.

## Suggested team split

1. UI: student selection and recommendation cards, using the shared contract.
2. Data: realistic synthetic activities, students and attendance.
3. Recommendation service: candidate selection, Gemma integration, validation and fallback.
4. Integration/demo: connect the pieces, run through the demo, and explore optional calendar or friend features.

Agree on API endpoints and runtime before parallel implementation. Keep this document current as the team makes decisions.
