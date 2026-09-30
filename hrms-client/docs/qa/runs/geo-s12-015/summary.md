# GEO-S12-015 QA Summary

## Task

GEO-S12-015

## Domain

Manager Geo UX

## Scope

Implemented manager review queue support for policy-authorized geo review records involving:

- outside fence
- boundary uncertain
- stale location
- manual fallback

The existing GEO-S12-014 manager review architecture was extended rather than duplicated.

## Actions

- Approve remains unchanged and keeps provisional/manual fallback attendance effective.
- Reject remains unchanged and applies the GEO-S12-014 correction/reprojection path.
- Return is now a first-class geo review decision. It requires manager remarks, moves the review to `returned`, emits an outbox event, and does not void attendance.

## Privacy Verification

- Ordinary manager queue responses expose only sanitized geo evidence.
- Exact latitude and longitude are not returned by the manager queue presenter.
- Raw coordinate payloads, geometry, geofence canonical hashes, and evaluator internals are not returned.
- Safe derived evidence can include factual outcome, reason code, attendance action, event/captured time, reported accuracy, evidence age, max age/accuracy, safe boundary/distance metrics, grace distance, and safe work-site label when already available.
- Existing privileged exact-coordinate access remains separate in the audited location-access mechanism.
- Frontend review components consume the sanitized queue DTO and do not render raw coordinate fields.

## Migration

- Added `hrms_backend/src/db/migrations/0061_attendance_geo_fallback_returned_status.sql`.
- Migration updates `attendance.geo_fallback_reviews.status` to allow `returned`.
- Local Docker dev DB validation:
  - `db:migrate`: passed, applied `0061`.
  - `db:migrate:status`: passed, `61 applied`, `0 pending`.

## Tests

- `hrms_backend`: `.\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit`
  - Result: passed.
- `hrms-client`: `.\node_modules\.bin\tsc.cmd --noEmit`
  - Result: passed.
- `hrms_backend`: targeted integration subset:
  - `vitest run --project integration src/modules/attendance/__tests__/attendance-geo-policy.integration.test.ts -t 'returns a provisional fallback|requires remarks|presents and filters|rejects a provisional fallback|keeps an approved provisional fallback'`
  - Result: passed, 6 passed / 22 skipped.
- `hrms-client`: `E2E_SKIP_WEB_SERVER=1 playwright test e2e/attendance-manager-review-model.spec.ts`
  - Result: passed, 4 passed.
- `hrms-client`: changed-file ESLint with Prettier disabled:
  - Result: passed.
- `git diff --check`
  - Result: pending final run.

## Screenshots / Evidence

No screenshots were captured in this implementation pass. Privacy evidence is covered by backend serialized-response assertions and frontend model assertions that raw coordinates are discarded.

## Residual Risks

- Running the full `attendance-geo-policy.integration.test.ts` file without a test name filter hung locally without progress output and was interrupted. The targeted GEO-S12-015 and GEO-S12-014 regression subset passed.
- Backend lint reports existing unrelated repository issues in docs/scripts/older files.
- Frontend ESLint with Prettier enabled reports the known CRLF/Prettier baseline on changed frontend files; real lint rules passed with Prettier disabled.
