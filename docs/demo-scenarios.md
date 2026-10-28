# Verified backend demo — 2026-10-28

This section supersedes the provisional source-only scenarios below. Backend baseline: c313412. The integrated service consumes 3 students, 32 activities and 4 attendance links from backend/data/*.json. Use S001 Emma Thompson, S002 James Chen and S003 Sarah Williams. Activity IDs are activity-eNNN; do not use the old E-prefixed IDs or S004/S007/S018 in the shipped demo.

## Executed verification

Run from backend: node --test (21 tests passed). Run from repository root: node scripts/verify-demo.cjs (nine fixed-clock HTTP student scenarios passed, with repeatability, ID resolution, exclusion and offline fallback assertions). No credentials or external model requests were used. npm is unavailable on the validation machine; the equivalent Node commands work without installation.

At 2026-10-28T12:00:00Z, observed top five:
- S001: activity-e004, activity-e015, activity-e013, activity-e001, activity-e002.
- S002: activity-e003, activity-e012, activity-e013, activity-e016, activity-e035.
- S003: activity-e005, activity-e010, activity-e021, activity-e003, activity-e012.

At 2026-11-06T16:00:00Z:
- S001: activity-e015, activity-e013, activity-e017, activity-e020, activity-e022.
- S002: activity-e013, activity-e016, activity-e035, activity-e019, activity-e021.
- S003: activity-e021, activity-e015, activity-e016, activity-e035, activity-e019.

At 2026-11-20T00:00:00Z all three returned HTTP 200 with empty recommendations. The server factory's injected clock is used; no unsupported HTTP clock parameter is required. S003 football activity-e001 is an attendance-only recommendation at the primary clock, verified with limit=20 and an explanation citing past attendance rather than personal interest. Already-attended future-instance exclusion is covered by the backend unit test; the shipped attendance records are past instances.

## Data decisions and remaining limitations

The backend ships a subset of the source students and events, plus two explicitly synthetic past activities. End times use the documented 90-minute duration. Ten malformed source event rows are absent from the JSON; source CSV quoting remains unresolved but does not prevent JSON service startup. Do not expand the dataset during deadline integration. Student interests are curated, not a lossless conversion of all rating columns. Preserve the shipped contract for frontend work.

Frontend integration is implemented in `frontend/` and `node scripts/start-demo.cjs` serves its assets and the API from one origin. The alternate two-terminal setup uses `FRONTEND_ORIGIN=http://localhost:5173`. JavaScript syntax checks pass, and the backend fixed-clock scenarios above pass. Interactive browser verification of this refreshed UI remains pending: permission to open the local demo page was declined in this session, so no browser-level result is claimed. The earlier single-file baseline check does not verify this refreshed UI. Live Gemma and calendar/Loughborough integrations remain unverified.

## Archived source audit and provisional scenarios

The material below records the earlier source audit, not the current service acceptance status.

# Existing-data validation and repeatable demo

## Scope and evidence

Audited on 2026-10-28 with Node v24.22.1 and Git 2.47.1.windows.1.
Planning baseline: main `1b5fdf0b93ec856f8e3d0b95c4c1f2e50318a3e2`.
Data baseline: `origin/sample-data-bases` at `9a4265918c7a7ba1e0dc1ce444615ea7590e4ae7`.
Read AGENTS.md, PROJECT.md, TEAM_HANDOFF.md and the backend assignment.
No service, frontend, converted JSON, or attendance file exists on either available remote branch at audit time. API and UI behavior is **untested**, not passing. No data or implementation files were changed.

Reproduce from the repository root:

```powershell
git fetch origin
node scripts/validate-demo-data.mjs 9a4265918c7a7ba1e0dc1ce444615ea7590e4ae7
```

Observed: 20 unique nonempty student IDs, 40 unique nonempty event IDs, and 39 calendar rows. Student ratings are High/Medium/Low. Event dates and clock times, required text, nonempty tag tokens, and integer attendance counts within capacity pass inspection. Calendar rows were counted and parsed only; calendar semantics are outside the core demo.

The command intentionally exits **1** because source CSV validation fails. For inspection only, it reconstructs descriptions from the known first five and last three event columns; it never writes this recovery to the source. Recommendations printed by this script are conditional calculations, not service test results.

## Concrete findings and owner handoff

| Finding | Evidence | Required coordination |
| --- | --- | --- |
| Malformed event CSV | Unquoted description commas produce 10 fields against 9 headers at rows 8/E007, 9/E008, 15/E014, 28/E027, 30/E029, 34/E033, 35/E034, 38/E037, 39/E038, 41/E040; row numbers include header | Backend/data owner should quote each entire description using a CSV writer, or explicitly handle and test conversion. No parallel data edits made here. |
| Interests are not contract arrays | Five category rating columns, not `interests: string[]` | Agree whether only High or also Medium becomes a tag. Preserve S001–S020 IDs. Expectations below assume High only, pending agreement. |
| Activity fields need conversion | `event_id`, `event_name`, split date/time, semicolon tags; no end, timezone or source | Preserve E001–E040 IDs; split tags; map names and descriptions; confirm Europe/London and a duration policy. Do not infer event duration from unrelated calendar entries. |
| No attendance links | `attendees` is an aggregate count; no student IDs in events/calendar | Cannot validate attendance references or demonstrate attendance-based recommendations/exclusions using current data. Counts and calendar entries must not be turned into student attendance. |
| Synthetic provenance unconfirmed | Project calls for synthetic data, but CSV files carry no provenance statement | Data owner must confirm all names, records and aggregate counts were fabricated before demo use. Plausible names alone do not establish this. |
| Unmatched category | Student `societies_interest` has no `societies` event tag | This interest contributes no matches under exact tag matching; do not silently map it to social. |
| Dates expire | Events run 2026-11-01 through 2026-11-19 | Use the fixed clocks below for replay; after Nov 19 a wall-clock demo naturally returns empty. Coordinate any date refresh with data owner. |
| Calendar unsuitable as attendance | No student/event foreign keys, no timezone; some similarly named items have different times | Calendar integration stays outside the core demo. |

This document is the coordination handoff; direct confirmation from backend/data owners has not occurred. Service conversion ownership remains with the backend assignment. No replacement dataset or additional fixtures were introduced.

## Three existing student scenarios

Provisional assumptions: preserve IDs; map only High ratings to category interests; interpret November local times as Europe/London (UTC+00:00); no attendance links. Use limit=5 and fallback scoring from the backend assignment: twice unique interest overlap, then ascending start, then ID. All rankings below depend on those decisions; revise them when the owner confirms conversion.

Primary demo clock: **2026-10-28T12:00:00Z** (12:00 London).

| Student | Assumed interests | Expected top five activity IDs and scores | Explanation checks |
| --- | --- | --- | --- |
| S004 Marcus Johnson | sport, social | E004(4), E015(4), E001(2), E002(2), E005(2) | E004 volleyball social and E015 cycling planning match both categories; football E001 and badminton E002 match sport; guitar E005 matches social. Do not claim music is a personal interest. |
| S018 Leo Santos | creative, wellbeing | E003(2), E005(2), E006(2), E010(2), E012(2) | Pottery E003/E012, guitar E005 and film E010 match creative; meditation E006 matches wellbeing. Sport-only football E001 must be absent. |
| S007 Amelia Green | societies, creative, social, wellbeing | E005(4), E010(4), E021(4), E003(2), E004(2) | Guitar, film and baking E021 match creative plus social; no reason should claim a societies match because that tag is absent. |

Past/boundary replay clock: **2026-11-06T16:00:00Z** (16:00 London).

| Student | Expected top five |
| --- | --- |
| S004 | E015, E013, E014, E017, E020 |
| S018 | E013, E016, E018, E019, E021 |
| S007 | E021, E013, E014, E015, E016 |

At this clock, E001–E010 and E012 are past; E011 starts exactly now and must also be excluded (`start <= now`). E013 at 17:30 remains eligible. Compare all returned starts to the clock, not just the first card.

Empty replay: **2026-11-20T00:00:00Z** (00:00 London), all three students should yield `recommendations: []`, HTTP 200. This tests expiration using existing records; it does not establish a no-interest-match case. No existing student has zero High categories.

## Missing coverage: agree before adding fixtures

Attendance-only matches and already-attended exclusion cannot be demonstrated from this source. Proposed minimal additions, requiring owner agreement rather than being asserted as existing facts:

- Add synthetic attendance S018 -> E001. At 2026-11-06T16:00:00Z, E001 is past and sport-tagged; future E020 should gain an attendance-only score of 1, despite S018 having no High sport interest. Request limit=20 to inspect it. Its explanation should cite past attendance, not a sport interest.
- Separately test exclusion with S004 -> E004 and clock 2026-10-28T12:00:00Z. This deliberately future-dated attendance relationship is a test fixture, not a realistic attendance history. E004 must disappear; past-attendance scoring must not use its future tags. Prefer an isolated backend test over adding this inconsistency to demo data.
- A no-relevant-match case needs an isolated student with no matching interests and no attendance; the all-past replay already covers an empty result without adding data.

## API and frontend acceptance checklist (pending implementation)

Before running: record backend commit, actual consumed JSON paths, confirmed interest/time/duration policy, and whether attendance fixtures were added. Recompute expected rankings for the actual agreed conversion. Keep Gemma variables unset in the server process for the offline run.

Use the backend owner's documented start command, expected `cd backend; npm start`. No backend directory exists at this audit, so that command has **not** been run. Normal HTTP requests use wall time; the contract has no clock query parameter. For fixed-time replays, ask the backend owner to use its documented injected-clock test interface; do not send an invented `now` parameter or claim a fixed-time HTTP pass.

When the server is available, in a second PowerShell terminal:

```powershell
$base = 'http://localhost:3001'
Invoke-RestMethod "$base/api/health"
$students = (Invoke-RestMethod "$base/api/students").students
$activities = (Invoke-RestMethod "$base/api/activities").activities
foreach ($id in @('S004', 'S018', 'S007')) {
  $result = Invoke-RestMethod "$base/api/students/$id/recommendations?limit=5"
  $result | ConvertTo-Json -Depth 6
  foreach ($rec in $result.recommendations) {
    if (@($activities | Where-Object id -EQ $rec.activityId).Count -ne 1) {
      throw "Unresolved or duplicate activity ID: $($rec.activityId)"
    }
  }
}
```

- [ ] Health returns 200/status ok; students include the three actual IDs; activity IDs resolve uniquely.
- [ ] Offline responses have mode fallback, a safe notice, and truthful nonempty reasons; repeat identical fixed-clock calls and compare order/reasons.
- [ ] Verify primary and past-clock rankings above against confirmed conversion, with no past/exact-start or already-attended IDs; separately exercise missing coverage after owner agreement.
- [ ] Fixed-clock Nov 20 returns HTTP 200 and an empty array; UI shows a useful empty state.
- [ ] Unknown student returns 404/STUDENT_NOT_FOUND; invalid limit 0 returns 400/INVALID_LIMIT; limit 20 is accepted.
- [ ] Frontend resolves names/times/locations, displays reasons and fallback notice, and handles loading, empty and API error states. Record displayed timezone.
- [ ] Record commands, backend commit, clock, status/body, screenshots or display observations, and reproducible bugs here. Live Gemma is unverified and not needed for offline acceptance.

## Observed status

Source audit executed; ten malformed CSV rows found. Conditional rankings calculated by the read-only checker. No backend, API, frontend, Gemma, or Loughborough/calendar integration was tested. Next owner actions: confirm synthetic provenance and conversion decisions, repair/handle CSV quoting, agree minimal attendance coverage, then execute the pending acceptance checklist. This PR is documentation and validation tooling only; do not merge without coordination.
