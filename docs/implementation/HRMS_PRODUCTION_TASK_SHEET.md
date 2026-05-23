# Hawkaii HRMS Production Task Sheet

Last updated: 2026-05-23

## Executive Summary

This versioned report captures the completed Phase 4 Helpdesk slice after Dashboard, Employee CRUD/Admin, Attendance, Leave/WFH/Holidays, EMS, and Projects/utilization. The root task sheet remains at `docs/implementation/HRMS_PRODUCTION_TASK_SHEET.md`, but the repository root is not a Git repo, so this backend copy records implementation state inside a versioned repo.

## Current Verified Status

| Area | Status |
| --- | --- |
| Backend OpenAPI | 151 implemented operations across 134 paths |
| Planned operations remaining | 64 |
| Dashboard backend/frontend | Completed for backend summary API and frontend summary integration |
| Employee admin backend/frontend | Completed for employee create/update, lifecycle, login, roles, and org selectors |
| Attendance backend/frontend | Completed for punches, my/team summary, monthly calendar, exceptions, and regularization request/decision |
| Leave/WFH/Holidays backend/frontend | Completed for balances, leave requests, WFH requests, manager decisions, HR monitor, holidays, and visible frontend routes |
| EMS backend | Implemented for profile, profile change requests, HR profile decisions, generic service requests, HR service queue, letters, and policy acknowledgements |
| EMS frontend | Integrated in `hrms-client` for dashboard profile signals, profile, requests, letters, policies, and HR admin profile/letter queues |
| Projects/utilization backend | Implemented for project CRUD, members, allocations, milestones/modules, project documents, project summary, and team utilization |
| Projects/utilization frontend | Integrated in `hrms-client` for `/projects`, `/projects/$id`, and `/team-utilization` in API mode |
| Helpdesk backend | Implemented for ticket CRUD, comments/internal notes, attachments, assignment, priority/status changes, resolve/close/reopen, categories, and SLA report |
| Helpdesk frontend | Integrated in `hrms-client` for Helpdesk dashboard, my tickets, agent queue, ticket detail, categories, SLA, and reports in API mode |
| Root task sheet | Updated but uncommitted by design because root has no `.git` |

## Helpdesk Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend routes | `hrms-client/src/routes/_app/helpdesk*.tsx` provides dashboard, my tickets, agent queue, ticket detail, categories, SLA, and reports views | Replace production-critical localStorage data with backend-backed domain adapter/store |
| Current data source | `hrms-client/src/lib/helpdesk-store.tsx` persists tickets/categories to `hawkaii_tickets_v1` and `hawkaii_helpdesk_categories_v1` | Keep only explicit non-production fallback after API integration |
| Mock model | `hrms-client/src/lib/mock/helpdesk.ts` defines categories, priorities, statuses, comments, attachments, events, SLA matrix, and seeded tickets | Mirror visible model in backend response mapping so layout/styling stays stable |
| Visible actions | Raise ticket, add public comment, add internal note, add attachment reference, change priority, assign/reassign, set status, resolve, close, reopen, escalate, edit/toggle categories, view SLA/report rollups | Implement the smallest complete Helpdesk API slice that supports these actions |
| Planned backend contract | Gap report lists 15 operations: create/list/get/update tickets; comments, internal notes, attachments; assign, priority, status, resolve, close, reopen; categories; SLA report | Implement these 15 operations under `/api/v1/helpdesk/*` with OpenAPI docs/tests |
| Role expectations | UI scopes queue by admin/helpdesk/asset/HR/finance roles and category ownership | Backend policy should allow requesters to manage their own tickets, admins to manage all, and category/assignee roles to manage scoped queues |
| Risks | No existing Helpdesk DB schema/module; UI uses friendly category/priority labels while backend patterns usually use constants and versioned writes | Add new schema/migration without cross-schema FKs; include OCC versions on mutations; document any label mapping |

## Helpdesk API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/helpdesk/tickets` | Raise ticket drawer | Creates requester ticket with category SLA and optional document IDs |
| `GET` | `/api/v1/helpdesk/tickets` | Helpdesk dashboard, my tickets, queue, reports | Supports requester, assignee, admin/support scope filters and returns queue counts |
| `GET` | `/api/v1/helpdesk/tickets/{id}` | `/helpdesk/$id` detail | Returns ticket, visible comments, attachments, events, category, SLA, and version |
| `PATCH` | `/api/v1/helpdesk/tickets/{id}` | Domain adapter available | Versioned subject/description/category/priority update within policy |
| `POST` | `/api/v1/helpdesk/tickets/{id}/comments` | Ticket detail public comments | Adds requester/support visible comment |
| `POST` | `/api/v1/helpdesk/tickets/{id}/internal-notes` | Ticket detail support note | Adds support-only note; hidden from requester detail |
| `POST` | `/api/v1/helpdesk/tickets/{id}/attachments` | Ticket detail attachment reference | Adds document reference metadata to the ticket |
| `POST` | `/api/v1/helpdesk/tickets/{id}/assign` | Agent queue/detail assignment | Assigns or reassigns ticket with OCC version checks |
| `POST` | `/api/v1/helpdesk/tickets/{id}/priority` | Agent queue/detail priority controls | Updates priority and SLA; urgent priority escalates when appropriate |
| `POST` | `/api/v1/helpdesk/tickets/{id}/status` | Queue/detail status controls and escalate action | Changes operational status with transition and remarks validation |
| `POST` | `/api/v1/helpdesk/tickets/{id}/resolve` | Queue/detail resolve action | Resolves ticket with resolution text |
| `POST` | `/api/v1/helpdesk/tickets/{id}/close` | Ticket detail close action | Closes resolved tickets from requester/admin scope |
| `POST` | `/api/v1/helpdesk/tickets/{id}/reopen` | Ticket detail reopen action | Reopens closed/resolved tickets within the configured policy window |
| `GET` | `/api/v1/helpdesk/categories` | Helpdesk category screens and ticket form | Lists active/inactive category metadata and SLA hints |
| `GET` | `/api/v1/helpdesk/sla-report` | Helpdesk SLA/report screens | Returns SLA rollups and per-category/assignee report rows |

Deferred from this Helpdesk slice: category mutation endpoints and broader `/api/v1/reports/helpdesk/summary` remain planned for later admin/report phases. In API mode, category edit/toggle UI reports that backend category management is not available yet instead of silently mutating local state.

## Projects / Utilization API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/projects` | `/projects` add project drawer | Create project metadata with assigned manager |
| `GET` | `/api/v1/projects` | `/projects`, project store consumers | List visible projects with members, allocations, milestones, documents, and summary in API mode |
| `GET` | `/api/v1/projects/{id}` | `/projects/$id` | Project detail with include support |
| `PATCH` | `/api/v1/projects/{id}` | `/projects`, `/projects/$id` | Versioned project metadata/status update |
| `POST` | `/api/v1/projects/{id}/archive` | Domain adapter available | Archive project after active members are cleared or project is closed/paused |
| `GET` | `/api/v1/projects/{id}/members` | Domain adapter available | List project members |
| `POST` | `/api/v1/projects/{id}/members` | Project drawer team step | Add member and create initial allocation |
| `PATCH` | `/api/v1/projects/{id}/members/{member_id}` | Project drawer/team removal | Versioned member update/remove |
| `GET` | `/api/v1/projects/{id}/allocations` | Domain adapter available | Allocation history/list |
| `POST` | `/api/v1/projects/{id}/allocations` | Domain adapter available | Add allocation history row and update member allocation |
| `GET` | `/api/v1/projects/{id}/milestones` | Domain adapter available | List milestones/modules |
| `POST` | `/api/v1/projects/{id}/milestones` | Domain adapter available | Add milestone/module |
| `GET` | `/api/v1/projects/{id}/documents` | `/projects/$id` documents tab | Lists existing document records attached to business object type `project` |
| `GET` | `/api/v1/projects/{id}/summary` | `/projects/$id` | Project timesheet, expense, and allocation summary |
| `GET` | `/api/v1/team-utilization/summary` | `/team-utilization` | Capacity, allocation, submitted hours, bench, and overload analytics |

Deferred from the original Projects/utilization plan: richer project reports, project-specific timesheet submission detail, and upload/attach document UX remain planned for later report/document hardening phases.

## Task Table

| Phase | Feature/module | Task | Backend status | Frontend status | Tests run | Result | Files changed | Suggested/actual commit message |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | Attendance | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, attendance integration test, dashboard integration regression, `pnpm test:contracts` | Passed. One parallel contract run raced with DB reset; rerun alone passed. | `src/modules/attendance/*`, `src/db/migrations/0003_attendance.sql`, shared schemas/types/constants, store persistence, dashboard summary, OpenAPI/docs/contracts | `feat(attendance): implement attendance APIs` |
| 3 | Attendance | Integrate frontend routes | Completed in `hrms-client` | Completed | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build`, offline frozen lockfile check, legacy-client search | Passed. Frontend lint still has 40 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/attendance/*`, attendance routes, frontend API docs, dependency/env cleanup, deleted legacy external data-client files | `feat(attendance): connect attendance screens to backend APIs` |
| 3 | Leave/WFH/Holidays | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, leave/WFH integration test, dashboard integration regression, attendance/core integration regressions, `pnpm test:contracts` | Passed. First non-escalated DB test failed due sandbox network restriction, rerun with test infra access passed. | `src/modules/leave-wfh/*`, `src/db/migrations/0004_leave_wfh.sql`, shared schemas/types/constants, store persistence, dashboard/core summaries, OpenAPI/docs/contracts | `feat(leave): implement leave WFH and holiday APIs` |
| 3 | Leave/WFH/Holidays | Integrate frontend routes | Completed in `hrms-client` | Completed | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint still has 40 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/leave-wfh/*`, leave/WFH routes, status badge, leave store typing, frontend API docs | `feat(leave): connect leave WFH and holiday screens to backend APIs` |
| 3 | EMS | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, EMS integration test, `pnpm test:contracts` | Passed. First non-escalated EMS test failed due sandbox DB networking; rerun with test infra access passed. | `src/modules/ems/*`, `src/db/migrations/0005_ems.sql`, shared schemas/types/constants, store persistence, OpenAPI/docs/contracts | `feat(ems): implement employee self-service APIs` |
| 3 | EMS | Integrate frontend routes | Completed in `hrms-client` | Completed for visible EMS profile/request/letter/policy/admin queues | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint still has 40 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/ems/*`, EMS route files, frontend API docs | `feat(ems): connect employee self-service screens to backend APIs` |
| 4 | Projects/utilization | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, projects integration test, `pnpm test:contracts` | Passed. Non-escalated Docker/DB/tsx commands were blocked by sandbox and passed when rerun with allowed infra access. | `src/modules/projects/*`, `src/db/migrations/0006_projects.sql`, shared schemas/types/constants, store persistence, OpenAPI/docs/contracts | `feat(projects): implement project and utilization APIs` |
| 4 | Projects/utilization | Integrate frontend routes | Completed in `hrms-client` | Completed for `/projects`, `/projects/$id`, and `/team-utilization` | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint now has 39 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/projects/*`, `src/lib/projects-store.tsx`, project routes, project form drawer, frontend API docs | `feat(projects): connect project and utilization screens to backend APIs` |
| 4 | Helpdesk | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, Helpdesk integration test, `pnpm test:contracts` | Passed. The FK verifier was fixed to load test env defaults and use `TEST_DATABASE_URL`; non-escalated DB/test runs are sandbox-blocked but reruns with local DB access passed against the QA stack. | `src/modules/helpdesk/*`, `src/db/migrations/0007_helpdesk.sql`, shared schemas/types/constants, store persistence, OpenAPI/docs/contracts, `scripts/verify-no-cross-schema-fks.ts` | `feat(helpdesk): implement helpdesk APIs` |
| 4 | Helpdesk | Integrate frontend routes | Completed in `hrms-client` | Completed for `/helpdesk`, `/helpdesk/my`, `/helpdesk/queue`, `/helpdesk/$id`, `/helpdesk/categories`, `/helpdesk/sla`, and `/helpdesk/reports` | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/helpdesk/*`, `src/lib/helpdesk-store.tsx`, Helpdesk routes/components, frontend API docs | `feat(helpdesk): connect helpdesk screens to backend APIs` |

## Remaining Blockers

| Priority | Blocker |
| --- | --- |
| P1 | No frontend e2e/user-flow baseline for EMS, Leave/WFH/Holidays, or Attendance |
| P1 | EMS-specific document wrapper APIs remain planned; visible EMS document screens continue using the existing Documents APIs |
| P1 | EMS onboarding, probation, exits, policy management, and letter generation admin actions remain static until broader HR/admin modules exist |
| P1 | No frontend e2e/user-flow baseline for EMS, Leave/WFH/Holidays, Attendance, Projects, or Helpdesk |
| P1 | Helpdesk category create/update/toggle endpoints remain planned for admin/settings phase; API mode surfaces this as an error instead of mutating local state |
| P1 | Project-specific reports, timesheet submission detail, and project document upload/attach UX remain planned |
| P1 | Attendance daily detail, manager queue alias, export/report endpoints, and richer attendance reports remain planned |
| P1 | Leave/WFH export/report endpoint remains planned for reports/admin phase |
| P2 | Frontend lint keeps 39 existing Fast Refresh warnings |
| P2 | Frontend build keeps chunk-size/Wrangler log warnings but exits successfully |

## Validation Results

Backend:

- `pnpm typecheck`: passed
- `pnpm build`: passed
- `pnpm lint`: passed with escalation due `tsx` IPC sandboxing
- `pnpm api:docs:generate`: passed; generated 151 operation frontend contract
- `pnpm api:docs:verify`: passed
- `pnpm db:verify:no-cross-schema-fks`: passed after verifier fix; no cross-schema SQL foreign keys found in migrations or PostgreSQL metadata
- `pnpm exec vitest run --project integration src/modules/helpdesk/__tests__/helpdesk.integration.test.ts`: passed, 1 test
- `pnpm test:contracts`: passed, 13 tests

Frontend:

- `pnpm format`: passed
- `pnpm exec tsc -p tsconfig.json --noEmit`: passed
- `pnpm lint`: passed with 39 existing warnings
- `pnpm api:implemented-route-guard`: passed, 55 files against 134 paths
- `pnpm api:frontend-contract:route-coverage`: passed, 85 routes across 15 groups
- `pnpm build`: passed with existing chunk-size/Wrangler log warnings

## Assumptions

- EMS profile change requests intentionally model one field per request because the current UI submits one selected field at a time.
- EMS decisions use status values (`approved`, `returned`, `rejected`) rather than leave/WFH action verbs.
- EMS generic service requests support create/list/HR queue only in this slice; assignment and closure workflows stay planned for later HR operations.
- EMS-specific employee document wrapper endpoints are deferred because the current EMS document UI already uses the backend Documents APIs for list/download/verify.
- EMS admin onboarding, probation, exits, policy management, and letter generation tabs remain non-production placeholders until their backend modules are defined.
- Projects list responses intentionally include members, allocations, milestones/modules, documents, and summary by default so the existing project store can hydrate visible screens without adding a generated client layer.
- Project document APIs list documents already attached to `business_object_type = "project"`; upload/attach UX remains part of later document hardening.
- Helpdesk category mutation is intentionally not implemented in this slice because the verified planned contract includes `GET /api/v1/helpdesk/categories` only. Category edit/toggle actions stay deferred to admin/settings category management.
- Helpdesk attachment APIs accept document references only; real upload/replace remains part of the existing Documents/upload hardening work.

## Commit Messages

| Feature | Message | Status |
| --- | --- | --- |
| Helpdesk backend | `feat(helpdesk): implement helpdesk APIs` | Pending commit |
| Helpdesk frontend | `feat(helpdesk): connect helpdesk screens to backend APIs` | Pending commit |

## Next Steps

1. Phase 4 Helpdesk is implemented, frontend-integrated, and validated for the first production-ready vertical slice.
2. Backend OpenAPI now has 151 operations across 134 paths; planned operations remaining are 64.
3. Visible Helpdesk ticket, queue, detail, category read, SLA, and report screens use backend APIs in API mode; explicit non-production fallback remains available only through the existing config path.
4. Next Phase 4 scope: Notifications backend APIs and frontend integration.
