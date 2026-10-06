# GEO-S12-016 Policy Simulation UI QA Summary

## Scope

Implemented an admin-facing geo policy simulator for synthetic attendance geo evidence. The simulator uses the backend attendance geo policy evaluator and PostGIS geofence evaluation path in read-only mode, without recording attendance, geo evidence, reviews, events, outbox messages, idempotency keys, policy versions, or geofence versions.

## Coverage

- Backend endpoint: `POST /api/v1/attendance/geo/simulate`.
- Backend simulation service supports effective employee policy, persisted policy, draft policy, policy effective geofences, selected persisted geofences, and draft circle/polygon geofences.
- Synthetic scenarios covered by API and tests: coordinates, permission denied, location unavailable, missing evidence, stale evidence, low accuracy, inside, outside, boundary, manual fallback.
- Frontend panel added to Admin Geo and Admin Policies settings. It supports employee, event time, policy source, persisted attendance policy selection, geofence source, synthetic coordinates, map-click point selection, accuracy, evidence age, and result metrics.
- Map overlay displays the synthetic simulation point and accuracy radius only; it does not fetch employee location history.

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| Backend typecheck: `.\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit` | Passed | Run from `hrms_backend`. |
| Frontend typecheck: `.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.json` | Passed | Run from `hrms-client`. |
| Changed-file frontend lint: `.\node_modules\.bin\eslint.cmd ...changed files...` | Passed | Run on simulator, map, route, API, and query files touched for this task. |
| Full frontend lint: `.\node_modules\.bin\eslint.cmd .` | Blocked by baseline | Fails with repository-wide CRLF/Prettier errors in many unrelated files. |
| Backend lint: `.\node_modules\.bin\tsx.cmd scripts/lint.ts` | Blocked by environment | Fails before lint execution with `uv_os_get_passwd returned ENOMEM`. |
| Targeted backend integration: `.\node_modules\.bin\vitest.cmd run --project integration src/modules/attendance/__tests__/attendance-geo-simulation.integration.test.ts` | Blocked by DB availability | Test process starts, then fails app setup with `connect ECONNREFUSED 127.0.0.1:55432`. Docker is not available in this shell to start Postgres. |

## Targeted Test Intent

The new integration suite asserts:

- Simulation produces inside, outside, boundary, low-accuracy, stale, permission-denied, unavailable, missing, and manual-fallback outcomes.
- Simulation is side-effect free across attendance events, punches, sessions, daily records, evidence, fallback reviews, regularization/correction records, idempotency keys, outbox, policy versions, and geofence versions.
- Persisted policy and draft policy modes use the same backend evaluator path.
- Draft circle, draft polygon, and multiple-candidate geofence semantics are evaluated via PostGIS.
- Unauthorized and cross-tenant requests are rejected.

## Residual Risk

The targeted integration assertions have not executed to completion in this shell because the configured test Postgres endpoint is unavailable. Once Postgres is listening on `127.0.0.1:55432`, rerun the targeted integration command above.
