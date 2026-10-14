# GEO-S15-010 QA Summary

## Task

- ID: GEO-S15-010
- Domain: Stabilization
- Purpose: Admin/employee UI bugfix reserve for confirmed critical UI defects in attendance, admin, manager, and employee views.

## Scope

Only the confirmed GEO-S15-010 sub-defects were addressed:

- GEO-S15-010-D01: stale frontend API contract mirror for the attendance privacy route.
- GEO-S15-010-D02: misleading no-op generic Filters/Export controls inherited from the shared table toolbar.

No new feature scope was added.

## Sub-defects

### GEO-S15-010-D01

Observed failure:

- `node scripts\api-implemented-route-guard.mjs` failed because `hrms-client/docs/api/frontend-contract/openapi.json` did not contain `/api/v1/attendance/privacy`.

Root cause:

- The backend route, service, OpenAPI schema, and frontend adapter were already present and compatible.
- The frontend API documentation mirror was stale.

Files changed:

- `hrms-client/docs/api/openapi.json`
- `hrms-client/docs/api/frontend-contract/openapi.json`
- `hrms-client/docs/api/frontend-contract/ENDPOINT_INDEX.md`

Resolution:

- Synchronized the frontend API documentation mirrors from the already-current backend-generated artifacts under `hrms_backend/docs/api/...`.
- The synchronized frontend OpenAPI files now include `/api/v1/attendance/privacy`.
- Full mirror sync also brought `hrms-client/docs/api/openapi.json` up to the backend canonical path set, including `/api/v1/platform/admin/devices`, which was also stale in that broader mirror.

Validation result:

- Implemented-route guard passed.
- Frontend contract route coverage passed with the expected `89 routes mapped across 15 groups`.

### GEO-S15-010-D02

Affected UI surfaces:

- Attendance Reports
- Attendance Exceptions

Observed no-op behavior:

- Shared `SearchFilterBar` rendered a generic `Filters` button even when no filter behavior was supplied.
- Shared `SearchFilterBar` rendered a generic `Export` button when no export handler was supplied.
- `DataTable` mounted the toolbar by default, so affected attendance surfaces exposed misleading no-op controls.

Root cause:

- The shared toolbar API defaulted to visible actions without requiring real behavior for those actions.

Files changed:

- `hrms-client/src/components/ui-kit/search-filter-bar.tsx`

Resolution:

- Removed the no-op fallback Filters button.
- Kept custom `filtersSlot` rendering for consumers that provide meaningful filter controls.
- Rendered the generic Export button only when `showExport` is true and a real `onExport` handler is supplied.
- Preserved table search behavior and `rightSlot` behavior.

Regression coverage:

- `hrms-client/e2e/attendance-accessibility.spec.ts` now asserts Attendance Reports keeps the real `Export CSV` action while the generic table `Export` and `Filters` buttons are absent.
- `hrms-client/e2e/attendance-mobile-responsive.spec.ts` now asserts Attendance Exceptions keeps its existing row action while the generic table `Export` and `Filters` buttons are absent.

## Rejected / Unconfirmed Findings

The following were investigated during GEO-S15-010 inspection and were not changed:

- Privacy endpoint availability.
- Privacy page geolocation behavior.
- Manager exact-location gating.
- Employee punch/manual-fallback idempotency.
- General attendance report backend/export behavior.

## Validation

| Command | Result | Notes |
| --- | --- | --- |
| `node scripts\api-implemented-route-guard.mjs` | PASS | `Domain API guard OK: scanned 81 files against 240 OpenAPI paths.` |
| `node scripts\frontend-contract-route-coverage.mjs` | PASS | `Frontend contract route coverage OK: 89 routes mapped across 15 groups.` |
| `node -e "... privacy route check ..."` | PASS | Confirmed `/api/v1/attendance/privacy` exists in both frontend mirrored OpenAPI files. |
| `.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.json` | PASS | Frontend typecheck completed with no output. |
| `.\node_modules\.bin\eslint.cmd src\components\ui-kit\search-filter-bar.tsx e2e\attendance-accessibility.spec.ts e2e\attendance-mobile-responsive.spec.ts` | FAIL then PASS | First run found two Prettier line-wrap issues in the touched mobile spec; after local wrap fix, focused lint passed. |
| `.\node_modules\.bin\playwright.cmd test attendance-accessibility.spec.ts attendance-mobile-responsive.spec.ts --workers=1` | BLOCKED | Configured `pnpm exec vite dev` webServer exited before tests started. |
| `.\node_modules\.bin\vite.cmd dev --host localhost --port 5173` plus `E2E_SKIP_WEB_SERVER=1 .\node_modules\.bin\playwright.cmd test attendance-accessibility.spec.ts attendance-mobile-responsive.spec.ts --workers=1` | PASS | 12/12 mocked Chromium attendance tests passed. |
| `git diff --check` | PASS | Git reported line-ending conversion warnings for touched files, but no whitespace errors. |

## Environment/Baseline Notes

- Repo-wide CRLF/Prettier lint noise is pre-existing and was not normalized.
- `hrms-client/package.json` declares `packageManager: pnpm@10.25.0`.
- Local `pnpm --version` is `11.19.0`.
- The Playwright config webServer uses `pnpm exec vite dev`; that startup path failed in this environment and created temporary pnpm artifacts, which were removed.
- Direct local Vite binary plus `E2E_SKIP_WEB_SERVER=1` successfully ran the focused Playwright coverage.

## Privacy/Security

- No location collection behavior changed.
- No exact-location permissions changed.
- No exact coordinates were added to routine UI or API behavior.
- No backend privacy behavior changed.
- GEO-S15-010 does not expand location access, location collection, or location disclosure.

## Backend/API/Migration Impact

- D01 synchronizes frontend contract documentation to an already-existing backend endpoint.
- No new backend API was created.
- No backend production code changed.
- No schema or migration changes were required.

## Business Behavior Preservation

- The real Attendance Reports `Export CSV` action remains visible and functional.
- Attendance exception approve/reject behavior remains unchanged.
- Manager review behavior remains unchanged.
- Employee punch/manual fallback behavior remains unchanged.
