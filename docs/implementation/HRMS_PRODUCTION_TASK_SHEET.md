# Hawkaii HRMS Production Task Sheet

Last updated: 2026-05-22

## Executive Summary

This versioned report captures the completed Phase 3 Leave/WFH/Holidays slice. The root task sheet remains at `docs/implementation/HRMS_PRODUCTION_TASK_SHEET.md`, but the repository root is not a Git repo, so this backend copy records the implementation state inside a versioned repo.

## Current Verified Status

| Area | Status |
| --- | --- |
| Backend OpenAPI | 108 implemented operations across 99 paths |
| Planned operations remaining | 106 |
| Dashboard backend/frontend | Completed for backend summary API and frontend summary integration |
| Employee admin backend/frontend | Completed for employee create/update, lifecycle, login, roles, and org selectors |
| Attendance backend/frontend | Completed for punches, my/team summary, monthly calendar, exceptions, and regularization request/decision |
| Leave/WFH/Holidays backend | Implemented for balances, leave requests, WFH requests, manager decisions, HR monitor, holiday list, and holiday upsert |
| Leave/WFH/Holidays frontend | Integrated in `hrms-client` for overview, apply leave, apply WFH, approvals, HR monitor, and holidays |
| Root task sheet | Updated but uncommitted by design because root has no `.git` |

## Leave/WFH/Holidays API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/leave/balances/my` | `/leave-wfh` overview | Fixed annual balance model for the first production slice |
| `GET` | `/api/v1/leave/balances/{user_id}` | Domain adapter available | HR/Admin/manager scoped balance lookup |
| `POST` | `/api/v1/leave/requests` | `/leave-wfh/apply-leave` | Validates date ranges, half-day rules, balance, and active overlap |
| `GET` | `/api/v1/leave/requests/my` | `/leave-wfh` overview | Own leave request list with filters/pagination |
| `GET` | `/api/v1/leave/requests/queue/manager` | `/leave-wfh/approvals` | Manager/admin pending queue |
| `POST` | `/api/v1/leave/requests/{id}/decision` | `/leave-wfh/approvals` | Approve, reject, or return with `expected_version` |
| `POST` | `/api/v1/leave/requests/{id}/cancel` | `/leave-wfh` overview | Requester cancellation for pending/returned requests |
| `POST` | `/api/v1/wfh/requests` | `/leave-wfh/apply-wfh` | Validates date ranges and active overlap |
| `GET` | `/api/v1/wfh/requests/my` | `/leave-wfh` overview | Own WFH request list with filters/pagination |
| `GET` | `/api/v1/wfh/requests/queue/manager` | `/leave-wfh/approvals` | Manager/admin pending WFH queue |
| `POST` | `/api/v1/wfh/requests/{id}/decision` | `/leave-wfh/approvals` | Approve, reject, or return with `expected_version` |
| `GET` | `/api/v1/leave-wfh/hr-monitor` | `/leave-wfh/monitor` | HR/Admin/Auditor combined leave/WFH monitor |
| `GET` | `/api/v1/holidays` | `/leave-wfh/holidays` | Holiday calendar by year |
| `PUT` | `/api/v1/holidays/{id}` | `/leave-wfh/holidays` | HR/Admin holiday create/update by provided UUID |

## Task Table

| Phase | Feature/module | Task | Backend status | Frontend status | Tests run | Result | Files changed | Suggested/actual commit message |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | Attendance | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, attendance integration test, dashboard integration regression, `pnpm test:contracts` | Passed. One parallel contract run raced with DB reset; rerun alone passed. | `src/modules/attendance/*`, `src/db/migrations/0003_attendance.sql`, shared schemas/types/constants, store persistence, dashboard summary, OpenAPI/docs/contracts | `feat(attendance): implement attendance APIs` |
| 3 | Attendance | Integrate frontend routes | Completed in `hrms-client` | Completed | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build`, offline frozen lockfile check, legacy-client search | Passed. Frontend lint still has 40 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/attendance/*`, attendance routes, frontend API docs, dependency/env cleanup, deleted legacy external data-client files | `feat(attendance): connect attendance screens to backend APIs` |
| 3 | Leave/WFH/Holidays | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, leave/WFH integration test, dashboard integration regression, attendance/core integration regressions, `pnpm test:contracts` | Passed. First non-escalated DB test failed due sandbox network restriction, rerun with test infra access passed. | `src/modules/leave-wfh/*`, `src/db/migrations/0004_leave_wfh.sql`, shared schemas/types/constants, store persistence, dashboard/core summaries, OpenAPI/docs/contracts | `feat(leave): implement leave WFH and holiday APIs` |
| 3 | Leave/WFH/Holidays | Integrate frontend routes | Completed in `hrms-client` | Completed | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint still has 40 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/leave-wfh/*`, leave/WFH routes, status badge, leave store typing, frontend API docs | `feat(leave): connect leave WFH and holiday screens to backend APIs` |

## Remaining Blockers

| Priority | Blocker |
| --- | --- |
| P1 | No frontend e2e/user-flow test baseline for Leave/WFH/Holidays |
| P1 | Leave/WFH export/report endpoint remains planned for reports/admin phase |
| P1 | EMS remains the next Phase 3 missing module |
| P1 | Attendance daily detail, manager queue alias, export/report endpoints, and richer attendance reports remain planned |
| P2 | Frontend lint keeps 40 existing Fast Refresh/hook-dependency warnings |
| P2 | Frontend build keeps chunk-size/Wrangler log warnings but exits successfully |

## Validation Results

Backend:

- `pnpm typecheck`: passed
- `pnpm build`: passed
- `pnpm lint`: passed with escalation due `tsx` IPC sandboxing
- `pnpm api:docs:generate`: passed; generated 108 operation frontend contract
- `pnpm api:docs:verify`: passed
- `pnpm db:verify:no-cross-schema-fks`: passed
- `pnpm exec vitest run --project integration src/modules/leave-wfh/__tests__/leave-wfh.integration.test.ts`: passed, 2 tests
- `pnpm exec vitest run --project integration src/modules/dashboard/__tests__/dashboard.integration.test.ts`: passed, 2 tests
- `pnpm exec vitest run --project integration src/modules/attendance/__tests__/attendance.integration.test.ts src/modules/core/__tests__/core.integration.test.ts`: passed, 5 tests
- `pnpm test:contracts`: passed, 13 tests
- `pnpm test:infra:down`: passed

Frontend:

- `pnpm format`: passed
- `pnpm exec tsc -p tsconfig.json --noEmit`: passed
- `pnpm lint`: passed with 40 existing warnings
- `pnpm api:implemented-route-guard`: passed, 43 files against 99 paths
- `pnpm api:frontend-contract:route-coverage`: passed, 85 routes across 15 groups
- `pnpm build`: passed with existing chunk-size/Wrangler log warnings

## Assumptions

- Leave balances use fixed annual entitlements for the first production slice: casual 12, sick 8, earned 18, comp off 5, unpaid 0.
- Leave duration counts calendar days; half-day leave is allowed only for a single date.
- Active approved/pending Leave or WFH overlap blocks new Leave/WFH requests for the same user.
- Leave/WFH manager decisions are scoped to the requester manager, with Admin/HR fallback where the current role model allows it.
- Approved Leave/WFH decisions update attendance day records to `leave` or `wfh`.
- Leave/WFH export/reporting stays planned for the reports/admin phase.

## Next Steps

1. Commit backend Leave/WFH/Holidays changes as `feat(leave): implement leave WFH and holiday APIs`.
2. Commit frontend Leave/WFH/Holidays changes as `feat(leave): connect leave WFH and holiday screens to backend APIs`.
3. Continue Phase 3 with EMS using the same backend schema/API/service/tests -> frontend adapter/UI -> validation -> task sheet -> commit workflow.
