# Hawkaii HRMS Production Task Sheet

Last updated: 2026-05-22

## Executive Summary

This versioned report captures the completed Phase 3 EMS slice after Dashboard, Employee CRUD/Admin, Attendance, and Leave/WFH/Holidays. The root task sheet remains at `docs/implementation/HRMS_PRODUCTION_TASK_SHEET.md`, but the repository root is not a Git repo, so this backend copy records implementation state inside a versioned repo.

## Current Verified Status

| Area | Status |
| --- | --- |
| Backend OpenAPI | 121 implemented operations across 111 paths |
| Planned operations remaining | 94 |
| Dashboard backend/frontend | Completed for backend summary API and frontend summary integration |
| Employee admin backend/frontend | Completed for employee create/update, lifecycle, login, roles, and org selectors |
| Attendance backend/frontend | Completed for punches, my/team summary, monthly calendar, exceptions, and regularization request/decision |
| Leave/WFH/Holidays backend/frontend | Completed for balances, leave requests, WFH requests, manager decisions, HR monitor, holidays, and visible frontend routes |
| EMS backend | Implemented for profile, profile change requests, HR profile decisions, generic service requests, HR service queue, letters, and policy acknowledgements |
| EMS frontend | Integrated in `hrms-client` for dashboard profile signals, profile, requests, letters, policies, and HR admin profile/letter queues |
| Root task sheet | Updated but uncommitted by design because root has no `.git` |

## EMS API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/ems/profile/me` | `/ems`, `/ems/profile` | Self-service employee profile with manager, org, personal/contact/work metadata, and summaries |
| `PATCH` | `/api/v1/ems/profile/me` | Domain adapter available | Direct versioned edit for allowed self-service fields |
| `POST` | `/api/v1/ems/profile-change-requests` | `/ems/profile` | Submit a single profile field change for HR approval |
| `GET` | `/api/v1/ems/profile-change-requests/my` | `/ems/profile` | Own profile change request timeline |
| `GET` | `/api/v1/ems/profile-change-requests/queue/hr` | `/ems/admin` | HR/Admin queue for pending profile changes |
| `POST` | `/api/v1/ems/profile-change-requests/{id}/decision` | `/ems/admin` | HR/Admin approve/reject/return with `expected_version` |
| `POST` | `/api/v1/ems/requests` | `/ems/requests`, `/ems/letters` | Create generic employee service requests |
| `GET` | `/api/v1/ems/requests/my` | `/ems/requests` | Own generic service request list |
| `GET` | `/api/v1/ems/requests/queue/hr` | `/ems/admin` | HR/Admin queue for generic service requests; frontend currently filters letter requests in the Letters tab |
| `GET` | `/api/v1/ems/letters` | `/ems`, `/ems/letters` | List employee HR letters |
| `POST` | `/api/v1/ems/letters/{id}/acknowledge` | `/ems/letters` | Acknowledge assigned letter with `expected_version` |
| `GET` | `/api/v1/ems/policies` | `/ems`, `/ems/policies` | List active policies with per-user acknowledgement status |
| `POST` | `/api/v1/ems/policies/{id}/acknowledge` | `/ems/policies` | Acknowledge assigned policy with `expected_version` |

Deferred from the original EMS plan: EMS-specific document wrapper APIs remain planned because the visible document screens already use the backend Documents APIs.

## Task Table

| Phase | Feature/module | Task | Backend status | Frontend status | Tests run | Result | Files changed | Suggested/actual commit message |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | Attendance | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, attendance integration test, dashboard integration regression, `pnpm test:contracts` | Passed. One parallel contract run raced with DB reset; rerun alone passed. | `src/modules/attendance/*`, `src/db/migrations/0003_attendance.sql`, shared schemas/types/constants, store persistence, dashboard summary, OpenAPI/docs/contracts | `feat(attendance): implement attendance APIs` |
| 3 | Attendance | Integrate frontend routes | Completed in `hrms-client` | Completed | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build`, offline frozen lockfile check, legacy-client search | Passed. Frontend lint still has 40 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/attendance/*`, attendance routes, frontend API docs, dependency/env cleanup, deleted legacy external data-client files | `feat(attendance): connect attendance screens to backend APIs` |
| 3 | Leave/WFH/Holidays | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, leave/WFH integration test, dashboard integration regression, attendance/core integration regressions, `pnpm test:contracts` | Passed. First non-escalated DB test failed due sandbox network restriction, rerun with test infra access passed. | `src/modules/leave-wfh/*`, `src/db/migrations/0004_leave_wfh.sql`, shared schemas/types/constants, store persistence, dashboard/core summaries, OpenAPI/docs/contracts | `feat(leave): implement leave WFH and holiday APIs` |
| 3 | Leave/WFH/Holidays | Integrate frontend routes | Completed in `hrms-client` | Completed | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint still has 40 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/leave-wfh/*`, leave/WFH routes, status badge, leave store typing, frontend API docs | `feat(leave): connect leave WFH and holiday screens to backend APIs` |
| 3 | EMS | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, EMS integration test, `pnpm test:contracts` | Passed. First non-escalated EMS test failed due sandbox DB networking; rerun with test infra access passed. | `src/modules/ems/*`, `src/db/migrations/0005_ems.sql`, shared schemas/types/constants, store persistence, OpenAPI/docs/contracts | `feat(ems): implement employee self-service APIs` |
| 3 | EMS | Integrate frontend routes | Completed in `hrms-client` | Completed for visible EMS profile/request/letter/policy/admin queues | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint still has 40 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/ems/*`, EMS route files, frontend API docs | `feat(ems): connect employee self-service screens to backend APIs` |

## Remaining Blockers

| Priority | Blocker |
| --- | --- |
| P1 | No frontend e2e/user-flow baseline for EMS, Leave/WFH/Holidays, or Attendance |
| P1 | EMS-specific document wrapper APIs remain planned; visible EMS document screens continue using the existing Documents APIs |
| P1 | EMS onboarding, probation, exits, policy management, and letter generation admin actions remain static until broader HR/admin modules exist |
| P1 | Projects/utilization is the next Phase 4 missing module |
| P1 | Attendance daily detail, manager queue alias, export/report endpoints, and richer attendance reports remain planned |
| P1 | Leave/WFH export/report endpoint remains planned for reports/admin phase |
| P2 | Frontend lint keeps 40 existing Fast Refresh/hook-dependency warnings |
| P2 | Frontend build keeps chunk-size/Wrangler log warnings but exits successfully |

## Validation Results

Backend:

- `pnpm typecheck`: passed
- `pnpm build`: passed
- `pnpm lint`: passed with escalation due `tsx` IPC sandboxing
- `pnpm api:docs:generate`: passed; generated 121 operation frontend contract
- `pnpm api:docs:verify`: passed
- `pnpm db:verify:no-cross-schema-fks`: passed
- `pnpm exec vitest run --project integration src/modules/ems/__tests__/ems.integration.test.ts`: passed, 2 tests
- `pnpm test:contracts`: passed, 13 tests
- `pnpm test:infra:down`: passed

Frontend:

- `pnpm format`: passed
- `pnpm exec tsc -p tsconfig.json --noEmit`: passed
- `pnpm lint`: passed with 40 existing warnings
- `pnpm api:implemented-route-guard`: passed, 47 files against 111 paths
- `pnpm api:frontend-contract:route-coverage`: passed, 85 routes across 15 groups
- `pnpm build`: passed with existing chunk-size/Wrangler log warnings

## Assumptions

- EMS profile change requests intentionally model one field per request because the current UI submits one selected field at a time.
- EMS decisions use status values (`approved`, `returned`, `rejected`) rather than leave/WFH action verbs.
- EMS generic service requests support create/list/HR queue only in this slice; assignment and closure workflows stay planned for later HR operations.
- EMS-specific employee document wrapper endpoints are deferred because the current EMS document UI already uses the backend Documents APIs for list/download/verify.
- EMS admin onboarding, probation, exits, policy management, and letter generation tabs remain non-production placeholders until their backend modules are defined.

## Next Steps

1. Backend EMS changes were committed with message `feat(ems): implement employee self-service APIs`.
2. Frontend EMS changes were committed in `hrms-client` as `81c0682` with message `feat(ems): connect employee self-service screens to backend APIs`.
3. Continue with the next pending feature from the roadmap: Phase 4 Projects/utilization, unless the owner chooses to deepen EMS admin operations first.
