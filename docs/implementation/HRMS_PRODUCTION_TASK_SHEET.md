# Hawkaii HRMS Production Task Sheet

Last updated: 2026-05-23

## Executive Summary

This versioned report captures the completed Phase 4 Expense enhancement slice after Dashboard, Employee CRUD/Admin, Attendance, Leave/WFH/Holidays, EMS, Projects/utilization, Helpdesk, Notifications, Asset workflow, and Timesheet enhancement additions. The root task sheet remains at `docs/implementation/HRMS_PRODUCTION_TASK_SHEET.md`, but the repository root is not a Git repo, so this backend copy records implementation state inside a versioned repo.

## Current Verified Status

| Area | Status |
| --- | --- |
| Backend OpenAPI | 174 implemented operations across 156 paths |
| Planned operations remaining | 41 |
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
| Notifications backend | Implemented for authenticated feed, unread count, mark-read, and mark-all-read |
| Notifications frontend | Integrated in `hrms-client` topbar notification panel in API mode |
| Asset workflow backend | Implemented for asset requests, approvals, cancellations, acknowledgements, maintenance records, vendors, and recovery queue |
| Asset workflow frontend | Integrated in `hrms-client` asset store/API mode for visible asset request, acknowledgement, maintenance, vendor, and recovery queue flows |
| Timesheet enhancements backend | Implemented for project summaries, missing submissions, productivity summary, submission detail, and selectors |
| Timesheet enhancements frontend | Integrated in `hrms-client` for project timesheet view, missing submission queue/report inputs, productivity/project report rollups, and form selectors in API mode |
| Expense enhancements backend | Implemented for metadata, dashboard summary, requester withdraw, and clarification thread |
| Expense enhancements frontend | Integrated in `hrms-client` for create-form metadata, expense dashboard summary cards, withdraw actions, and clarification comments in API mode |
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

## Notifications Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend surface | `hrms-client/src/components/ui-kit/notification-panel.tsx` renders the topbar notification popover on every app route | Replace static `NOTIFICATIONS` reads with backend-backed queries in API mode |
| Current data source | `hrms-client/src/lib/mock/notifications.ts` supplied static read/unread rows | Keep static rows only as explicit non-production fallback |
| Visible actions | Topbar shows unread badge, lists feed rows, marks one notification read by clicking it, and marks all visible rows read | Implement feed, unread count, mark-read, and mark-all-read endpoints |
| Planned backend contract | Gap report listed 4 notification operations under `/api/v1/notifications*` | Implement those 4 operations with OpenAPI docs/tests |
| Existing backend data | Workflow code already writes notification records into the in-memory store; no durable table existed before this slice | Add `platform.notifications` migration, persistence loading/flushing, and owner-scoped service/repository |
| Deferred scope | Admin notification channel/event preferences are part of Admin settings, not the topbar feed slice | Leave `/api/v1/admin/notification-channels` planned for Phase 5 |

## Notifications API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/notifications` | Topbar notification popover | Lists owned notifications with pagination, unread-only, and type/category filters |
| `GET` | `/api/v1/notifications/unread-count` | Topbar unread badge | Returns unread count and latest unread timestamp |
| `POST` | `/api/v1/notifications/{id}/read` | Clicking an unread notification | Owner-scoped read-state mutation with optional `expected_version` OCC |
| `POST` | `/api/v1/notifications/read-all` | Mark all read action | Marks all visible unread notifications read, optionally filtered by type or timestamp |

## Asset Workflow Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend routes | `hrms-client/src/routes/_app/assets*.tsx` exposes inventory, my assets, requests, returns/recovery, warranty/vendors, and detail/maintenance views | Replace production-critical mock/local request, acknowledgement, maintenance, vendor, and recovery behavior with backend APIs in API mode |
| Current data source before slice | `hrms-client/src/lib/assets-store.tsx` hydrated assets from existing backend APIs but kept requests, acknowledgements, maintenance additions, vendors, and recovery rows in local/mock state | Add backend endpoints and map visible UI actions through `src/domains/assets/api.ts` |
| Visible actions | Request asset, approve/reject/fulfill/cancel requests, acknowledge assignment, add maintenance, list vendors, and review recovery queue | Implement a minimal workflow slice with OCC on request decisions/cancellations |
| Existing backend support | Base asset inventory, assignment, return, and license APIs already existed | Extend, do not replace, the existing assets module and persistence model |
| Deferred scope | Full vendor CRUD, warranty renewal automation, recovery settlement workflow, and asset reports are broader admin/report features | Keep these planned for Phase 5/report hardening unless current UI requires them |

## Asset Workflow API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/assets/requests` | `/assets/requests` request form | Creates a requester-scoped asset request |
| `GET` | `/api/v1/assets/requests/my` | `/assets/requests` employee view | Lists the signed-in user's asset requests |
| `GET` | `/api/v1/assets/requests/queue` | `/assets/requests` asset admin queue | Lists approval/fulfillment queue rows |
| `POST` | `/api/v1/assets/requests/{id}/decision` | Asset manager approval/rejection/fulfillment controls | Versioned request decision with optional remarks and assigned asset |
| `POST` | `/api/v1/assets/requests/{id}/cancel` | Requester cancellation | Versioned cancellation for pending requests |
| `POST` | `/api/v1/assets/{id}/acknowledgements` | `/assets/my` acknowledgement action | Records asset assignment acknowledgement |
| `GET` | `/api/v1/assets/{id}/maintenance` | `/assets/$id` maintenance tab | Lists asset maintenance records |
| `POST` | `/api/v1/assets/{id}/maintenance` | `/assets/$id` maintenance entry form | Adds a maintenance record and updates asset status when applicable |
| `GET` | `/api/v1/assets/vendors` | `/assets/warranty` vendor selector/cards | Lists software/hardware vendor metadata |
| `GET` | `/api/v1/assets/recovery-queue` | `/assets/returns` recovery queue | Lists assets assigned to inactive or terminated users |

## Timesheet Enhancements Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Existing backend | `src/modules/timesheets` already implements work segments, my submissions, approver queue, approve/return/reject decisions, and workflow definitions | Extend the module with the 5 planned read endpoints instead of replacing existing workflow behavior |
| Planned contract gap | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists project summaries, missing submissions, productivity summary, submission detail, and selectors as planned Timesheet APIs | Implement those endpoints under `/api/v1/timesheets/*` with OpenAPI/docs/tests |
| Frontend routes | `hrms-client/src/routes/_app/timesheet.index.tsx`, `timesheet.approvals.tsx`, `timesheet.projects.tsx`, and `reports.timesheet.tsx` use `src/lib/timesheets-store.tsx` plus client aggregation | Add API adapter/store support so project view, missing submissions, productivity, and selectors use backend data in API mode |
| Current frontend data source | Segments, my submissions, and approval queue are API-backed in API mode; project summaries, missing submissions, productivity, and selectors are still derived from local store/project data | Keep explicit local fallback only through existing non-production config |
| Visible actions | My timesheet save/submit and manager approve/return/reject are already wired to backend APIs; project view and reports need backend rollups | Implement read-oriented APIs first; no new mutation surface is needed for this slice |
| Deferred scope | Export jobs and full timesheet report endpoints remain part of Phase 5 reports | Keep CSV/export behavior client-side for now unless report APIs are implemented later |

## Timesheet Enhancements API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/timesheets/projects/summary` | `/timesheet/projects`, `/reports/timesheet` project-wise rollup | Returns project/member submitted hours, billable split, missing submissions, and totals |
| `GET` | `/api/v1/timesheets/missing-submissions` | `/timesheet/approvals` missing tab | Returns visible missing or under-submitted cycles with manager/reminder context |
| `GET` | `/api/v1/timesheets/productivity-summary` | `/reports/timesheet` productivity tab | Returns backend-derived cards, series, and grouped breakdown rows |
| `GET` | `/api/v1/timesheets/submissions/{id}` | Domain adapter/detail-ready workflow | Returns visible submission detail, segments, workflow history, and latest decision |
| `GET` | `/api/v1/timesheets/selectors` | `/timesheet` forms | Returns visible projects, task selectors, cycles, approvers, workflow definitions, and rules |

## Expense Enhancements Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Existing backend | `src/modules/expenses` already implements create, my list, detail, submit, manager queue/decision, finance queue/detail/decision/payment/bills/settlement, document verification, timeline, audit, and expense reports | Extend the existing module with the 4 planned read/mutation endpoints rather than replacing workflow behavior |
| Planned contract gap | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists 4 Expenses/Finance additions: metadata, dashboard summary, withdraw, and clarification thread | Implement those endpoints under `/api/v1/expenses/*` with OpenAPI docs/tests |
| Frontend routes | `hrms-client/src/routes/_app/expenses*.tsx` exposes dashboard cards, create form selectors, my expenses withdraw action, detail comments tab, manager review, finance queue, register, and reports | Wire metadata, dashboard summary, withdraw, and comments/clarifications through the expense domain adapter in API mode |
| Current frontend data source | Expense create/list/manager/finance workflow has API calls in API mode, but dashboard cards are client-aggregated, withdraw is local-only, comments are local-only, and form metadata is static/free text | Replace production-critical local behavior with backend APIs while keeping existing non-production fallback path |
| Persistence | Expense audit logs are already durable in memory/Postgres and include event payload JSON | Store clarification thread entries as expense audit events to avoid a new table for this small slice |
| Risks | Existing frontend maps backend `Cancelled` to closed, while the UI has a separate `withdrawn` status | Update frontend mapping when withdraw API is integrated |

## Expense Enhancements API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/expenses/metadata` | `/expenses/create` selectors/forms | Returns expense types, subtype groups, payment types, currencies, document requirements, policy hints, and project/client selector metadata |
| `GET` | `/api/v1/expenses/dashboard-summary` | `/expenses` dashboard | Returns role-aware cards, queue counts, aging buckets, totals, and compact rows derived from visible expense tickets |
| `POST` | `/api/v1/expenses/{id}/withdraw` | `/expenses/my`, `/expenses/$id` requester action | Requester-only withdrawal for draft, submitted, pending-manager, or manager-returned tickets with OCC and remarks policy |
| `POST` | `/api/v1/expenses/{id}/clarifications` | `/expenses/$id` comments/clarification tab | Appends a durable clarification message and returns the current object-scoped thread |

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
| 4 | Notifications | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, Notifications integration test, `pnpm test:contracts` | Passed. Non-escalated DB/tsx runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/notifications/*`, `src/db/migrations/0008_notifications.sql`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(notifications): implement notification feed APIs` |
| 4 | Notifications | Integrate topbar panel | Completed in `hrms-client` | Completed for the topbar notification panel in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/notifications/*`, `src/components/ui-kit/notification-panel.tsx`, `src/lib/mock/notifications.ts`, frontend API docs | `feat(notifications): connect topbar notifications to backend APIs` |
| 4 | Asset workflows | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, assets integration test, `pnpm test:contracts` | Passed. OpenAPI generated 165 operations across 147 paths. | `src/db/migrations/0009_asset_workflows.sql`, `src/modules/assets/*`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(assets): implement asset workflow APIs` |
| 4 | Asset workflows | Integrate frontend asset screens | Completed in `hrms-client` | Completed for requests, acknowledgements, maintenance, vendors, and recovery queue in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/assets/*`, `src/lib/assets-store.tsx`, `src/lib/mock/assets.ts`, frontend API docs | `feat(assets): connect asset workflow screens to backend APIs` |
| 4 | Timesheet enhancements | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, timesheets integration test, `pnpm test:contracts` | Passed. OpenAPI generated 170 operations across 152 paths. Non-escalated DB/tsx runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/timesheets/*`, OpenAPI/docs/contracts | `feat(timesheets): implement timesheet analytics APIs` |
| 4 | Timesheet enhancements | Integrate frontend timesheet screens | Completed in `hrms-client` | Completed for project view, missing submission queue, productivity/project report rollups, and form selectors in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/timesheets/*`, `src/routes/_app/timesheet*.tsx`, `src/routes/_app/reports.timesheet.tsx`, frontend API docs | `feat(timesheets): connect timesheet analytics screens to backend APIs` |
| 4 | Expense enhancements | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, expense integration test, `pnpm test:contracts` | Passed. OpenAPI generated 174 operations across 156 paths. Non-escalated DB/tsx runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/expenses/*`, OpenAPI/docs/contracts | `feat(expenses): implement metadata summary withdraw and clarifications` |
| 4 | Expense enhancements | Integrate frontend expense screens | Completed in `hrms-client` | Completed for create metadata, dashboard summary, withdraw action, and clarification comments in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/expenses/*`, `src/lib/expenses-store.tsx`, expense routes, frontend API docs | `feat(expenses): connect metadata summary and clarification flows` |

## Remaining Blockers

| Priority | Blocker |
| --- | --- |
| P1 | No frontend e2e/user-flow baseline for EMS, Leave/WFH/Holidays, or Attendance |
| P1 | EMS-specific document wrapper APIs remain planned; visible EMS document screens continue using the existing Documents APIs |
| P1 | EMS onboarding, probation, exits, policy management, and letter generation admin actions remain static until broader HR/admin modules exist |
| P1 | No frontend e2e/user-flow baseline for EMS, Leave/WFH/Holidays, Attendance, Projects, or Helpdesk |
| P1 | No frontend e2e/user-flow baseline for Notifications/topbar read-state behavior |
| P1 | Helpdesk category create/update/toggle endpoints remain planned for admin/settings phase; API mode surfaces this as an error instead of mutating local state |
| P1 | Admin notification channel/event preferences remain planned for Admin settings |
| P1 | Full asset vendor CRUD, warranty automation, recovery settlement workflow, and asset reports remain planned for admin/report hardening |
| P1 | Project-specific reports and project document upload/attach UX remain planned |
| P1 | Timesheet export jobs and full report parity remain planned for the Reports phase |
| P1 | Attendance daily detail, manager queue alias, export/report endpoints, and richer attendance reports remain planned |
| P1 | Leave/WFH export/report endpoint remains planned for reports/admin phase |
| P2 | Frontend lint keeps 39 existing Fast Refresh warnings |
| P2 | Frontend build keeps chunk-size/Wrangler log warnings but exits successfully |

## Validation Results

Backend:

- `pnpm typecheck`: passed
- `pnpm build`: passed
- `pnpm lint`: passed with escalation due `tsx` IPC sandboxing
- `pnpm api:docs:generate`: passed; generated 174 operation frontend contract
- `pnpm api:docs:verify`: passed
- `pnpm db:verify:no-cross-schema-fks`: passed after verifier fix; no cross-schema SQL foreign keys found in migrations or PostgreSQL metadata
- `pnpm exec vitest run --project integration src/modules/expenses/__tests__/expense.integration.test.ts`: passed, 5 tests
- `pnpm test:contracts`: passed, 13 tests

Frontend:

- `pnpm format`: passed
- `pnpm exec tsc -p tsconfig.json --noEmit`: passed
- `pnpm lint`: passed with 39 existing warnings
- `pnpm api:implemented-route-guard`: passed, 59 files against 156 paths
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
- Notifications read-state is scoped to the topbar feed; admin notification channel preferences remain deferred to the Admin settings phase.
- Asset workflow requests intentionally extend the existing asset module rather than creating a separate module so base inventory, assignment, return, and license behavior remain unchanged.
- Asset vendor support is read-only in this slice because the current visible frontend needs vendor cards/selectors; vendor CRUD remains in admin hardening.
- Asset recovery queue is read-only in this slice and derives from assigned assets owned by inactive/terminated users; settlement workflows remain deferred.
- Timesheet enhancements intentionally add read-oriented analytics/selector endpoints only; existing segment, submission, and approval mutation behavior remains unchanged.
- Timesheet report exports remain client-side until the broader Reports phase adds export job/list/detail APIs.
- Expense clarification messages are persisted as durable expense audit events for this slice; a dedicated clarification table is deferred unless richer threaded features are required later.
- Expense withdrawal maps backend `Cancelled` to frontend `withdrawn`; withdrawal is limited to requester-owned draft, submitted, pending-manager, or manager-returned tickets.
- Expense dashboard summary returns compact role-aware cards and rows; detailed accounting reports remain under the existing expense report endpoints and broader Reports phase.

## Commit Messages

| Feature | Message | Status |
| --- | --- | --- |
| Helpdesk backend | `feat(helpdesk): implement helpdesk APIs` | Committed in `hrms_backend` as `504da18` |
| Helpdesk frontend | `feat(helpdesk): connect helpdesk screens to backend APIs` | Committed in `hrms-client` as `50412ce` |
| Notifications backend | `feat(notifications): implement notification feed APIs` | Committed in `hrms_backend` as `75525cc` |
| Notifications frontend | `feat(notifications): connect topbar notifications to backend APIs` | Committed in `hrms-client` as `4ae6531` |
| Asset workflows backend | `feat(assets): implement asset workflow APIs` | Committed in `hrms_backend` as `bfc719f` |
| Asset workflows frontend | `feat(assets): connect asset workflow screens to backend APIs` | Committed in `hrms-client` as `6989a2f` |
| Timesheet enhancements backend | `feat(timesheets): implement timesheet analytics APIs` | Committed in `hrms_backend` as `b67fa38` |
| Timesheet enhancements frontend | `feat(timesheets): connect timesheet analytics screens to backend APIs` | Committed in `hrms-client` as `c256ff0` |
| DB verifier fix | `fix(db): make cross-schema verifier use test env` | Committed in `hrms_backend` as `0bfa017` |
| Expense enhancements backend | `feat(expenses): implement metadata summary withdraw and clarifications` | Committed in `hrms_backend` as `1fea48a` |
| Expense enhancements frontend | `feat(expenses): connect metadata summary and clarification flows` | Committed in `hrms-client` as `61ac090` |

## Next Steps

1. Phase 4 Expense enhancements are implemented, frontend-integrated, and validated for metadata, dashboard summary, withdrawal, and clarification thread behavior.
2. Backend OpenAPI now has 174 operations across 156 paths; planned operations remaining are 41.
3. Expense create metadata, dashboard cards, withdrawal, and detail comments use backend APIs in API mode; explicit non-production fallback remains available only through the existing config path.
4. Next roadmap scope: Phase 5 Admin settings, RBAC, reports beyond expenses, and audit hardening.
