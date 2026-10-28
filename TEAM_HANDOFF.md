# Hackathon team and agent handoff

## The idea

Build an AI app that recommends Loughborough student activities based on activities a student has attended before. The longer-term intention is to connect to the Loughborough Students' Union app and the Loughborough Sport app. No access or integration has been confirmed. Use synthetic data for the hackathon demo.

Gemma is the intended AI integration: use past attendance and interests to find suitable upcoming activities, then use Gemma to rank supplied candidates and explain why each might be a good match. Validate that its output references only supplied activity IDs. If Gemma is unavailable or returns invalid output, use a clear, deterministic fallback.

Possible extensions are checking a student's calendar for availability, and suggesting activities based on what friends or students with similar interests enjoy. Use synthetic data for these until real integrations and consent are available. These are stretch goals, not prerequisites for the core demo.

## Team: six people

These are suggested ownership areas; the team can change them. Agree boundaries before editing shared files.

1. **Coordinator with Codex:** coordinate the project, connect the pieces, maintain the shared plan, and prepare the final demo.
2. **Codex teammate 2:** build the student-facing interface for choosing a student and viewing recommendations and reasons.
3. **Codex teammate 3:** build the recommendation service, candidate selection, Gemma integration, output validation, and fallback.
4. **Teammate using free AGY Flash:** build JSON loading and validation, and a simple way to inspect the data; coordinate fields with the data creator.
5. **Data creator:** create realistic fake students, activities, and attendance in JSON; coordinate schema and sample values with the loader owner.
6. **Remaining teammate:** own testing and the demo: prepare student scenarios, check recommendations, help with the pitch and screenshots, and investigate whether the two Loughborough apps have usable integrations.

## Prompts for the three Codex agents

### Codex 1: coordination and integration

Read `AGENTS.md`, `PROJECT.md`, and this handoff. Inspect the existing repository first: some previously staged files were accidentally committed and may belong to another project. Coordinate the shared API and data contracts with the other agents, then connect their completed pieces into a working demo. Keep `main` working and document how to run the app. Work on an integration branch.

### Codex 2: student interface

Read the project documents and build the student-facing interface on a feature branch. Let the user select a fictional student and view recommended activities with their name, time, location, and a short explanation. Coordinate the API response format with the recommendation agent. Include loading, empty, and error states. Use mock responses until the backend is ready.

### Codex 3: recommendations and Gemma

Read the project documents and build the recommendation service on a feature branch. Use fictional students, activities, and attendance from JSON. Select relevant upcoming activities based on a student's interests and past attendance. Use Gemma to rank supplied candidates and explain its choices; validate that returned IDs belong to those candidates and provide a deterministic fallback if Gemma fails. Keep credentials out of the repo. Agree the endpoint and response format with the interface agent and the JSON schema and loader interface with the data team.

## Proposed flow and contracts

UI -> recommendation service -> local synthetic data + Gemma -> ranked recommendations -> UI. Keep model credentials on the server and out of Git. Runtime, hosting, and API endpoints are not decided; agree these as a team before implementation.

Use local JSON files for demo data. The data creator and loader owner should agree the exact fields before coding. Suggested logical fields:

- Student: `id`, `name`, `interests` (list of strings).
- Activity: `id`, `name`, `description`, `tags` (list of strings), `start`, `end` (ISO 8601 with timezone), `location`, `source`.
- Attendance: `studentId`, `activityId`.
- Recommendation: `activityId`, `reason`; resolve the activity details using the matching ID.

Represent interests and tags as JSON arrays. Agree how activity instances are identified and the API response shape. Exclude past activities and already attended activity instances from recommendations. Show each recommendation's name, time, location, and reason. PROJECT.md contains the initial proposal; update it when decisions are made.

## Git and current state

The shared repository is https://github.com/arcturus-star/Hacktoberfest26Hackathon. Pull the latest main branch before starting. Work on separate feature branches, communicate changes to shared interfaces, and merge small, tested changes frequently. Never commit API keys or real student data.

Commit `56fecd8` added AGENTS.md and PROJECT.md, but it also unintentionally included 32 files that were already staged, including application code, sample data and tests. Their relevance to this student activity app has not been verified. Inspect existing files before reusing, changing, or removing them; do not assume they implement this app. The coordinator's GitHub CLI was authenticated as `arcturus-star` when the commit was pushed.

This handoff is a planning document: app functionality, Gemma connectivity, app integrations, and calendar access have not been established by this conversation.
