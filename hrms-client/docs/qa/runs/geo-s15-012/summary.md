# GEO-S15-012 QA Summary

Date: 2026-10-07
Branch: sprint-15/geo-s15-012

## Task

- ID: GEO-S15-012
- Domain: Exports
- Deliverable: Finalize attendance exports with channel, site, evidence state, approval state, and date filters.
- Scope: Attendance report UI, attendance report API filters/facets, attendance export filter validation/filtering, typed OpenAPI/frontend contract artifacts, permission-aligned export UI, privacy and regression coverage.

## Confirmed Defects

### GEO-S15-012-D01

Site filtering is now end to end. The canonical reporting projection carries `work_site_id` alongside safe site name/type, reports return scoped `site_options`, the UI submits the stable site ID, and attendance exports honor `work_site_id` before mode shaping and monthly aggregation. Site options are derived from the caller's authorized report population and do not expose coordinates.

### GEO-S15-012-D02

Approval filtering is now end to end. Reports and exports accept canonical `approval_state` values from the existing attendance domain: `not_required`, `pending`, `approved`, `returned`, `rejected`, `mixed`, and `unknown`. Approval state remains independent from evidence state.

### GEO-S15-012-D03

The attendance export request contract now documents a typed `filters` object instead of a loose object. The schema includes date, employee/user, department, manager, status, evidence, source/channel, site, approval, geo, review, reason, and `report_mode` fields. Backend OpenAPI and frontend contract mirrors were regenerated/synchronized.

### GEO-S15-012-D04

Backend export permissions remain unchanged. Admin, HR Admin, and Auditor users keep the real attendance export action; Manager report viewers keep scoped report access but no longer see an actionable `Export CSV` control for attendance exports.

## Finalized Filter Matrix

| Filter | UI | Report API | Export payload | Export backend | Test coverage |
| --- | --- | --- | --- | --- | --- |
| Date | Yes | `date_from` / `date_to` | Yes | Yes | Backend export + Playwright |
| Source/channel | Yes, via `source_category` | Yes | Yes | Yes | Backend export/report + Playwright |
| Site | Yes, stable `work_site_id` | Yes, plus scoped `site_options` | Yes | Yes | Backend export/report + Playwright |
| Evidence state | Yes | Yes | Yes | Yes | Backend export/report + Playwright |
| Approval state | Yes | Yes | Yes | Yes | Backend export/report + Playwright |

## Per-Mode Export Matrix

| Mode | Finalized filters |
| --- | --- |
| daily | Applied before row projection |
| late | Applied before late-mode selection |
| early | Applied before early-mode selection |
| absent | Applied before absent-mode selection |
| exceptions | Applied before exception-mode selection |
| monthly_summary | Applied before employee aggregation |

## Privacy

- Exact coordinates are not default columns.
- No latitude/longitude, raw GPS payloads, geofence geometry, accuracy, or exact-location fields were added.
- Site filtering uses stable site ID plus safe label/type only.
- Existing exact-location reveal remains separate and audited.
- Restricted export fields such as `exact_location` remain rejected.

## Permissions

- Authorized attendance export roles/capabilities remain Admin, HRManager/HR Admin, and Auditor.
- Manager scoped attendance report viewing remains available.
- Manager attendance export UI is omitted.
- Backend direct-call authorization remains enforced; Manager and Employee export attempts remain forbidden.

## Validation

| Command | Result |
| --- | --- |
| `hrms_backend`: `.\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit` | PASS |
| `hrms_backend`: `.\node_modules\.bin\vitest.cmd run --project unit src/modules/attendance/__tests__/attendance-service.unit.test.ts src/modules/reports/__tests__/attendance-reporting-evidence.unit.test.ts src/modules/dashboard/__tests__/dashboard.unit.test.ts src/__tests__/contracts.contract.test.ts` | PASS, 100 tests; contract file not selected by unit project |
| `hrms_backend`: `.\node_modules\.bin\tsx.cmd scripts/api-docs-generate.ts` | PASS outside sandbox after local Node `uv_os_get_passwd` ENOMEM |
| `hrms_backend`: `.\node_modules\.bin\tsx.cmd scripts/api-frontend-contract-generate.ts` | PASS outside sandbox after local Node `uv_os_get_passwd` ENOMEM |
| `hrms_backend`: `.\node_modules\.bin\tsx.cmd scripts/api-docs-verify.ts` | PASS outside sandbox after local Node `uv_os_get_passwd` ENOMEM |
| `hrms_backend`: `.\node_modules\.bin\vitest.cmd run --project contracts src/__tests__/contracts.contract.test.ts` | BLOCKED: PostgreSQL unavailable at `127.0.0.1:55432`; 12 tests passed before environment failure |
| `hrms-client`: `.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.json` | PASS |
| `hrms-client`: focused `eslint.cmd` on touched source/test files | PASS |
| `hrms-client`: `node scripts\api-implemented-route-guard.mjs` | PASS |
| `hrms-client`: `node scripts\frontend-contract-route-coverage.mjs` | PASS |
| `hrms-client`: default Playwright webServer path | BLOCKED: configured webServer failed to start |
| `hrms-client`: direct Vite + `E2E_SKIP_WEB_SERVER=1 .\node_modules\.bin\playwright.cmd test e2e/attendance-accessibility.spec.ts --workers=1` | PASS, 6 tests |

## Environment Notes

- Local `tsx` commands fail inside the sandbox with `uv_os_get_passwd returned ENOMEM`; the same commands passed outside the sandbox.
- Contract tests requiring real PostgreSQL remain blocked by `ECONNREFUSED 127.0.0.1:55432`.
- The default Playwright webServer launcher failed before tests started; direct project-local Vite produced a valid focused browser run.

## Backend/API/Migration Impact

- Backend report/export schema changes: yes.
- OpenAPI changes: yes.
- Migration: no.
- Dependency change: no.

## Business Behavior Preservation

- GEO-S15-011 export modes remain intact.
- Manager reporting scope is unchanged.
- Source/evidence semantics are unchanged.
- Employee punch/geolocation behavior is unchanged.
- Manager exact-location workflow is unchanged.
