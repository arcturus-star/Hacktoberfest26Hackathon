# Instructions for contributors and AI agents

Read PROJECT.md and TEAM_HANDOFF.md before starting work. They describe the shared hackathon goal, proposed architecture, interfaces, current state, and work split. Treat proposed decisions as changeable with the team.

- Pull the latest changes before starting; use a feature branch for implementation and communicate interface changes to the team.
- Keep changes focused and make the app easy to run and demo. Update PROJECT.md when shared contracts or decisions change.
- Use synthetic data only for the demo. Never commit credentials, API keys, or real student data.
- Do not claim the Loughborough apps or calendar are integrated until working access has been verified.

## Submission deadline: 16:00 Europe/London

The user has confirmed submission is at 16:00 (4 pm), local Europe/London time. This deadline takes priority over optional scope. Applies to Agy, Codex 1, Codex 2, Sol and the coordinating agent.

- Read this deadline now and check the current local time. Pull or fetch shared updates and reread AGENTS.md at task boundaries.
- Prioritise a runnable end-to-end demo: select a synthetic student, retrieve recommendations, display activity details and reasons. A working deterministic fallback is sufficient if live Gemma access is unavailable.
- Push useful work and open a PR early, even with clearly documented remaining gaps. Report branch/PR, run commands, verification results and blockers so integration can proceed before submission.
- Aim to hand off feature work by 15:30; reserve the final 30 minutes for integration, smoke checks and submission preparation. After 15:30 prioritise demo-blocking fixes and handoff over new features. If already past that time, hand off immediately.
- Avoid new stretch features or changes to shared contracts near the deadline. Coordinate required interface changes with the backend/frontend owners immediately.
- Do not claim the app, live Gemma or integrations work without verification. Clearly identify mock/fallback behavior and remaining limitations.
- The coordinator owns integration and submission readiness. Do not assume someone else has submitted; report the final demo status and any submission blocker explicitly.
