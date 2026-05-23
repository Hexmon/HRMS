# Hawkaii HRMS Production Task Sheet

Last updated: 2026-05-23

## Executive Summary

This versioned report captures the completed Phase 5 Attendance backlog slice after Dashboard, Employee CRUD/Admin, Attendance, Leave/WFH/Holidays, EMS, Projects/utilization, Helpdesk, Notifications, Asset workflow, Timesheet enhancement, Expense enhancement, Admin company profile, Admin master data, Admin RBAC, Admin workflow, Admin policy, Admin email template, Admin notification channel, Admin audit-log, non-expense Reports, employee/core backlog additions, and EMS document wrappers. The root task sheet remains at `docs/implementation/HRMS_PRODUCTION_TASK_SHEET.md`, but the repository root is not a Git repo, so this backend copy records implementation state inside a versioned repo.

## Current Verified Status

| Area | Status |
| --- | --- |
| Backend OpenAPI | 216 implemented operations across 191 paths |
| Planned operations remaining | 1 |
| Dashboard backend/frontend | Completed for backend summary API and frontend summary integration |
| Employee admin backend/frontend | Completed for employee create/update, lifecycle, login, roles, and org selectors |
| Attendance backend/frontend | Completed for punches, my/team summary, daily/monthly calendar, exceptions, regularization request/manager queue/decision, and export job metadata |
| Leave/WFH/Holidays backend/frontend | Completed for balances, leave requests, WFH requests, manager decisions, HR monitor, holidays, and visible frontend routes |
| EMS backend | Implemented for profile, profile change requests, HR profile decisions, employee document wrappers, generic service requests, HR service queue, letters, and policy acknowledgements |
| EMS frontend | Integrated in `hrms-client` for dashboard profile signals, profile, employee document listing/downloads, requests, letters, policies, and HR admin profile/letter queues |
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
| Admin company profile/settings | Completed for Admin-only company profile read/update API and `/admin-settings/company` frontend API-mode integration |
| Admin master data | Completed for department/designation list/create/update APIs and `/admin-settings/master-data` frontend API-mode integration for those two master groups |
| Admin RBAC | Completed for persistent RBAC role/permission configuration APIs and `/admin-settings/roles` frontend API-mode integration |
| Admin workflow configurations | Completed for Admin-only workflow config list/update APIs and `/admin-settings/workflows` frontend API-mode integration |
| Admin policies | Completed for Admin-only policy config list/update APIs and `/admin-settings/policies` frontend API-mode integration |
| Admin email templates | Completed for Admin-only email template list/update APIs and `/admin-settings/email-templates` frontend API-mode integration |
| Admin notification channels | Completed for Admin-only notification channel list/update APIs and `/admin-settings/notifications` frontend API-mode integration |
| Admin audit log | Completed for Admin/Auditor audit-log read API and `/admin-settings/audit` frontend API-mode integration |
| Non-expense Reports backend | Completed for HR, attendance, leave/WFH, projects, timesheets, assets, helpdesk, audit, export list, and export detail report APIs |
| Non-expense Reports frontend | Integrated in `hrms-client` for HR, attendance, leave, projects, timesheet, assets, helpdesk, and audit report routes in API mode |
| Employee/core backlog backend | Completed for role assignment history, profile audit trail, employee import job metadata/status, and employee export job metadata APIs |
| Employee/core backlog frontend | Integrated in `hrms-client` for employee profile role history/audit tabs and API-backed employee export job queueing |
| Root task sheet | Updated but uncommitted by design because root has no `.git` |

## Admin Audit Log Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend route | `hrms-client/src/routes/_app/admin-settings.audit.tsx` rendered audit rows from the Admin Settings local store | Replace production-critical local audit rows with backend-backed read behavior in API mode |
| Current data source | `hrms-client/src/lib/admin-settings-store.tsx` persisted audit entries to `hawkaii_admin_audit_v1` | Keep local audit data only when API mode is disabled |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` listed `GET /api/v1/admin/audit-log` as planned | Implement the read endpoint with Admin/Auditor access, pagination, filters, OpenAPI docs, and integration tests |
| Existing backend support | Admin settings mutations already append durable `admin.*` outbox events | Derive the audit-log read model from admin outbox events instead of adding a second audit table |
| Deferred scope | Broader cross-module audit reports, export jobs, and runtime security-setting enforcement remain outside this slice | Keep this endpoint scoped to Admin Settings audit visibility |

## Non-Expense Reports Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Current roadmap position | Admin security settings is blocked by the missing contract/runtime enforcement decision; the next unblocked task sheet scope is non-expense Reports | Implement the documented Reports Beyond Expenses contract before returning to blocked Admin security settings |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists 10 planned report operations: HR employees, attendance summary, leave/WFH summary, projects summary, timesheets summary, assets summary, helpdesk summary, cross-module audit, export list, and export detail | Add those operations under `/api/v1/reports/*` with OpenAPI docs and integration coverage |
| Existing backend support | `src/modules/reports` already provides expense reports and `POST /api/v1/reports/exports`; source data exists in Core, Attendance, Leave/WFH, Projects, Timesheets, Assets, Helpdesk, expense audit logs, and Outbox | Extend the existing reports module with read-only non-expense summaries; use existing outbox events as durable export job records instead of introducing a separate export table |
| Frontend report routes | `hrms-client/src/routes/_app/reports*.tsx` covers HR, attendance, leave, projects, timesheet, expenses, assets, helpdesk, and audit reports | Replace production-critical mock/local aggregation on non-expense report routes with backend report adapters in API mode |
| Current frontend data source | HR/attendance/audit reports still derive from mock/local stores or deterministic local synthesis; projects/assets/helpdesk/timesheet reports partially derive from stores that are already API-backed in API mode | Add report domain hooks and wire visible non-expense report routes to backend summaries while keeping local behavior only when API mode is disabled |
| Deferred scope | Real file generation/download, scheduled reports, security settings, report-builder UX, and e2e coverage are not represented in the current contract | Keep export jobs as queued metadata backed by outbox; full document-backed export generation remains production hardening |

## Non-Expense Reports Completion

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backend APIs | Added `GET /api/v1/reports/hr/employees`, `/attendance/summary`, `/leave-wfh/summary`, `/projects/summary`, `/timesheets/summary`, `/assets/summary`, `/helpdesk/summary`, `/audit`, `/exports`, and `/exports/{id}` | Export create/list/detail is queued metadata backed by existing outbox events; real document generation/download remains production hardening |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, reports integration test, and `pnpm test:contracts` passed | One first contract run failed because it was run in parallel with another DB-resetting integration test; rerun alone passed |
| Frontend integration | Added report domain API/hooks and connected HR, attendance, leave, projects, timesheet, assets, helpdesk, and audit report routes to `/api/v1/reports/*` in API mode | API-disabled development keeps the existing local/mock report derivations |
| Frontend validation | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, and `pnpm build` passed | Lint reports 39 existing Fast Refresh warnings; build exits 0 with existing chunk-size/Wrangler log warnings |
| Contract docs | Backend and frontend contract docs now show 206 implemented operations and 11 planned operations remaining | `Reports & Analytics` now counts 15 implemented operations |

## Employee/Core Backlog Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Current roadmap position | After non-expense Reports, the task sheet and gap audit listed 11 planned operations remaining; the largest unblocked group was the five employee/core operations | Complete employee/core before EMS document wrappers, attendance export/aliases, and leave/WFH export |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` listed role history, employee audit, import job create/status, and export job create under `/api/v1/core/users/*` | Implement those five endpoints with OpenAPI docs, contract tests, and core integration coverage |
| Existing backend support | Core user mutations already emit durable `core.user.*` outbox events | Derive role history/audit from existing outbox events; use outbox job metadata for import/export requests until real import parsing/export file generation is implemented |
| Frontend employee routes | `/employees` has an Export action; `/employees/$id` renders role history and audit trail from local employee arrays | Queue backend export jobs in API mode and replace detail role/audit timelines with backend reads when the actor has access |
| Deferred scope | There is no visible employee import screen yet; document-backed export generation and actual CSV/XLSX import parsing are not implemented | Expose backend job metadata APIs now; leave real processing worker and upload/import UI for production hardening or a future visible route |

## Employee/Core Backlog Completion

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backend APIs | Added `GET /api/v1/core/users/{id}/roles/history`, `GET /api/v1/core/users/{id}/audit`, `POST /api/v1/core/users/imports`, `GET /api/v1/core/users/imports/{job_id}`, and `POST /api/v1/core/users/exports` | History/audit are backed by core outbox events; import/export jobs are queued metadata with `outbox-queued-placeholder` adapter until processors exist |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, core integration test, and `pnpm test:contracts` passed | Non-escalated `tsx`/DB test runs hit sandbox IPC/network restrictions and passed when rerun with local QA infra access |
| Frontend integration | Added Core API hooks for role history, audit, and export job creation; `/employees/$id` now reads role/audit data from backend in API mode; `/employees` queues backend export jobs when API-backed | API-disabled development keeps local role/audit arrays and local CSV export |
| Frontend validation | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, and `pnpm build` passed | Lint reports 39 existing Fast Refresh warnings; build exits 0 with existing chunk-size/Wrangler log warnings |
| Contract docs | Backend generated OpenAPI/frontend contract now contains 211 operations; frontend contract snapshots were synced from backend | Planned operations remaining drop from 11 to 6 |

## EMS Document Wrapper Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Current roadmap position | The remaining planned operation list is down to 6; the next unblocked group is the two EMS employee document wrapper operations | Implement the wrappers before Attendance aliases/export and Leave/WFH export |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists `GET /api/v1/ems/employees/{user_id}/documents` and `POST /api/v1/ems/employees/{user_id}/documents` as planned | Add EMS routes, service methods, OpenAPI docs, contract coverage, and EMS integration tests |
| Existing backend support | `DocumentService` already owns object storage, metadata, classification policy, download URLs, verification, and document access logs | Reuse Documents as the source of truth; do not add a parallel EMS document table |
| Object identity | Existing document tests and QA scripts use `business_object_type = "employee"` with `business_object_id` set to the employee user id | EMS wrapper should scope employee documents through that existing object identity |
| Frontend route | `hrms-client/src/routes/_app/ems.documents.tsx` currently lists all visible documents through `documentsApi.list({ page_size: 100 })` and downloads through Documents APIs | Replace the list with the EMS employee wrapper in API mode; keep download through Documents APIs |
| Upload UI | The visible EMS document route has placeholder Upload/Replace buttons only; there is no file/input flow wired to backend upload | Add frontend adapter/hook for the POST wrapper, but do not invent a new upload UI in this slice |
| Access policy | EMS policy allows self, HR/Admin, Auditor, and scoped reporting hierarchy to see EMS users; Documents policy still controls classification read/download rules | Wrapper must require EMS employee visibility and then rely on Documents classification policy for returned documents |

## EMS Document Wrapper Completion

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backend APIs | Added `GET /api/v1/ems/employees/{user_id}/documents` and `POST /api/v1/ems/employees/{user_id}/documents` | Wrappers reuse the existing Documents module/object storage with `business_object_type = "employee"` and path `user_id` as the business object id |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, EMS integration test, and `pnpm test:contracts` passed | Non-escalated `tsx`/DB/Docker runs were sandbox-blocked and passed when rerun with local QA infra access |
| Frontend integration | Added EMS document API adapter/hooks and connected `/ems/documents` to the employee-scoped wrapper in API mode | Download URLs continue to use existing Documents APIs; Upload/Replace no longer show fake success in API mode because no file selection UI exists yet |
| Frontend validation | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, and `pnpm build` passed | Lint reports 39 existing Fast Refresh warnings; build exits 0 with existing chunk-size/Wrangler log warnings |
| Contract docs | Backend generated OpenAPI/frontend contract now contains 213 operations across 188 paths; frontend contract snapshots were synced from backend | Planned operations remaining drop from 6 to 4 |

## Attendance Backlog Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Current roadmap position | The remaining planned operation list is down to 4; the next group is the three Attendance completion endpoints | Implement Attendance before the final Leave/WFH export endpoint |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists `GET /api/v1/attendance/calendar/daily`, `GET /api/v1/attendance/regularizations/queue/manager`, and `POST /api/v1/attendance/exports` as planned | Add routes, service methods, OpenAPI docs, contract coverage, and attendance integration tests |
| Existing backend support | Attendance already has punches, my/team summaries, monthly calendar, my regularizations, regularization decisions, exceptions, permissions, and outbox events | Reuse existing day synthesis, visible-user scoping, regularization repository, and outbox job metadata patterns |
| Frontend routes | `/attendance/calendar` uses monthly calendar; `/attendance/exceptions` uses exceptions for HR queues; `/reports/attendance` uses the Reports summary API plus local CSV export | Add Attendance domain adapters/hooks for the new endpoints; avoid broad UI rewrites unless a visible screen directly needs the new route |
| Export behavior | Existing report exports are queued metadata backed by outbox rather than generated files | Attendance export should follow the same queued metadata pattern and defer document-backed file generation/download to production hardening |

## Attendance Backlog Completion

| Area | Completed fact | Notes |
| --- | --- | --- |
| Backend APIs | Added `GET /api/v1/attendance/calendar/daily`, `GET /api/v1/attendance/regularizations/queue/manager`, and `POST /api/v1/attendance/exports` | Daily calendar reuses existing day synthesis and visibility policy; manager queue scopes pending regularizations to assigned managers or HR/Admin/Auditor; exports queue outbox metadata only |
| Backend validation | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, attendance integration test, and `pnpm test:contracts` passed | Non-escalated DB/tsx runs were sandbox-blocked and passed when rerun with local QA infra access |
| Frontend integration | Added Attendance domain API methods/hooks for the daily calendar, manager queue, and export job endpoints | Existing visible routes already use monthly calendar, exceptions, and Reports APIs; no extra screen rewrite was required for these completion aliases |
| Frontend validation | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, and `pnpm build` passed | Lint reports 39 existing Fast Refresh warnings; build exits 0 with existing chunk-size/Wrangler log warnings |
| Contract docs | Backend generated OpenAPI/frontend contract now contains 216 operations across 191 paths | Planned operations remaining drop from 4 to 1; the remaining planned endpoint is `POST /api/v1/leave-wfh/exports` |

## Admin Notification Channels Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend route | `hrms-client/src/routes/_app/admin-settings.notifications.tsx` renders notification event rows with In-app, Email, and Push toggles | Replace production-critical localStorage toggles with backend-backed read/update in API mode |
| Current data source | `hrms-client/src/lib/admin-settings-store.tsx` persists notifications to `hawkaii_admin_notifications_v1` | Keep localStorage behavior only when API mode is disabled |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists `PUT /api/v1/admin/notification-channels` as planned | Implement `PUT` plus a UI-required `GET /api/v1/admin/notification-channels` so the screen can load current backend settings |
| Existing backend support | User notification feed APIs and `platform.notifications` already exist for topbar read-state | Add separate Admin settings persistence for channel/event preferences; do not change feed delivery behavior in this slice |
| Deferred scope | Provider secrets, SMTP/push delivery setup, runtime notification dispatch filtering, and per-user preferences are not represented in the current UI | Persist Admin Settings channel preferences only and document runtime enforcement as later delivery-provider hardening |

## Admin Company Profile Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend route | `hrms-client/src/routes/_app/admin-settings.company.tsx` renders the Company settings form for name, website, industry, address, timezone, currency, fiscal-year start, working week, work hours, and logo label | Replace production-critical local save with backend-backed read/update in API mode |
| Current data source | `hrms-client/src/lib/admin-settings-store.tsx` initializes company settings from `localStorage` key `hawkaii_admin_company_v1` and `DEFAULT_COMPANY` | Keep local storage behavior only when the backend API is disabled or explicit non-production fallback is active |
| Existing frontend API domain | `hrms-client/src/domains/admin/api.ts` only covers finance governance, manager backups, and timesheet workflow definition calls | Add company profile read/update adapter and React Query hooks |
| Existing backend data | `platform.company_profiles` exists from onboarding with core fields: company name, slug, timezone, locale, fiscal-year month, status, bootstrap timestamps, and version | Extend the table/model with settings needed by the active Company UI while preserving existing auth/onboarding behavior |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists `GET /api/v1/admin/company-profile` and `PUT /api/v1/admin/company-profile` as planned | Implement these two endpoints with Admin-only access, OCC on update, OpenAPI docs, and integration tests |
| Risks | Existing seeded local stores can have no persisted company profile because auth falls back to a default context | Admin profile service should create/return a safe default read model when no profile exists, then persist on update |

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

Deferred from this Helpdesk slice: category mutation endpoints remain planned for later admin/settings category management. Broader `/api/v1/reports/helpdesk/summary` was completed later in the non-expense Reports slice. In API mode, category edit/toggle UI reports that backend category management is not available yet instead of silently mutating local state.

## Notifications Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend surface | `hrms-client/src/components/ui-kit/notification-panel.tsx` renders the topbar notification popover on every app route | Replace static `NOTIFICATIONS` reads with backend-backed queries in API mode |
| Current data source | `hrms-client/src/lib/mock/notifications.ts` supplied static read/unread rows | Keep static rows only as explicit non-production fallback |
| Visible actions | Topbar shows unread badge, lists feed rows, marks one notification read by clicking it, and marks all visible rows read | Implement feed, unread count, mark-read, and mark-all-read endpoints |
| Planned backend contract | Gap report listed 4 notification operations under `/api/v1/notifications*` | Implement those 4 operations with OpenAPI docs/tests |
| Existing backend data | Workflow code already writes notification records into the in-memory store; no durable table existed before this slice | Add `platform.notifications` migration, persistence loading/flushing, and owner-scoped service/repository |
| Deferred scope | Topbar notification read-state is separate from Admin notification channel preferences | Runtime delivery-provider filtering remains production hardening; Admin channel preferences are completed in Phase 5 |

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

## Admin Company Profile API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/company-profile` | `/admin-settings/company` initial form load | Returns active company profile, locale/fiscal settings, working week, work hours, logo label, and version |
| `PUT` | `/api/v1/admin/company-profile` | `/admin-settings/company` save action | Admin-only optimistic-concurrency update for company profile/settings while keeping company slug stable |

## Admin Master Data Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists six planned Admin Settings endpoints for departments/designations only: list, create, and patch for each resource | Implement the six planned endpoints under `/api/v1/admin/master-data/*`; do not invent APIs for other master-data tabs in this slice |
| Existing backend model | `core.departments` and `core.designations` already exist and are exposed read-only through `/api/v1/core/master-data/org-selectors`; they do not yet expose admin mutation APIs | Reuse the existing core data model, add version columns for optimistic concurrency, and emit admin master-data outbox events |
| Frontend route | `hrms-client/src/routes/_app/admin-settings.master-data.tsx` shows ten tabs, but only `departments` and `designations` have planned backend endpoints | Connect departments/designations to backend APIs in API mode; keep unsupported tabs local/deferred and avoid silently claiming production persistence |
| Current frontend data source | `hrms-client/src/lib/admin-settings-store.tsx` persists master rows in `localStorage` key `hawkaii_admin_masters_v1` | Replace production-critical department/designation local mutations with backend-backed list/create/update/toggle behavior |
| Visible actions | The UI supports list/search, add, edit, activate/deactivate, and delete | Map delete/deactivate behavior to versioned `PATCH status=inactive`; no hard-delete endpoint is planned |
| Deferred scope | Employment types, work locations, shifts, leave types, expense categories, asset categories, helpdesk categories, and project roles do not have planned APIs in the current contract | Leave these tabs deferred until later Admin/policy modules define persistent backend behavior |

## Admin Master Data API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/master-data/departments` | `/admin-settings/master-data` departments tab | Lists departments with pagination, search, and active-only filtering |
| `POST` | `/api/v1/admin/master-data/departments` | `/admin-settings/master-data` add department action | Creates a department with duplicate-code protection |
| `PATCH` | `/api/v1/admin/master-data/departments/{id}` | `/admin-settings/master-data` edit/activate/deactivate department actions | Versioned update; deactivation is blocked while active employees reference the department |
| `GET` | `/api/v1/admin/master-data/designations` | `/admin-settings/master-data` designations tab | Lists designations with pagination, search, and active-only filtering |
| `POST` | `/api/v1/admin/master-data/designations` | `/admin-settings/master-data` add designation action | Creates a designation with duplicate-code protection |
| `PATCH` | `/api/v1/admin/master-data/designations/{id}` | `/admin-settings/master-data` edit/activate/deactivate designation actions | Versioned update; deactivation is blocked while active employees reference the designation |

## Admin RBAC Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists five RBAC endpoints under `/api/v1/admin/rbac/*`: list/create/update roles, list permissions, and replace role permissions | Implement the five planned endpoints with Admin-only access, OCC, OpenAPI docs, and integration tests |
| Existing backend auth | Runtime auth currently uses fixed `Roles` and `Permissions` constants for login/session/navigation and role checks | Implement persistent RBAC configuration without changing existing authorization enforcement semantics in this slice; document dynamic enforcement as a later hardening item |
| Existing backend data | `core.roles` and `core.user_roles` exist; `core.roles` currently lacks description/status/builtin/version and there is no role-permission table | Extend `core.roles`, add a role-permission mapping table, seed defaults from existing role constants, and preserve no-cross-schema-FK policy |
| Frontend route | `hrms-client/src/routes/_app/admin-settings.roles.tsx` renders role cards, role metadata editing, and a permission matrix | Replace localStorage-backed role matrix with RBAC API reads/saves in API mode while keeping local fallback only when API mode is disabled |
| Current frontend data source | `hrms-client/src/lib/admin-settings-store.tsx` persists role config in `localStorage` key `hawkaii_admin_roles_v1` | Wire role list, permission catalog, metadata update, and permission replacement through `src/domains/admin/*` |
| Deferred scope | Assigning custom RBAC roles to users and using edited permission matrices for runtime route/API enforcement requires a broader authorization-policy migration | Keep employee role assignment backed by existing Core user roles until that migration is explicitly designed |

## Admin RBAC API Inventory

| Method | Path | Frontend usage | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/rbac/roles` | `/admin-settings/roles` role cards and active role editor | Lists persistent role configuration with assigned user counts, permission IDs, protected-role flags, and pagination |
| `POST` | `/api/v1/admin/rbac/roles` | `/admin-settings/roles` add-role modal | Creates custom RBAC role configuration with initial permission IDs and duplicate key protection |
| `PATCH` | `/api/v1/admin/rbac/roles/{id}` | `/admin-settings/roles` role metadata editor | Versioned role name/description/status update; built-in Admin cannot be deactivated |
| `GET` | `/api/v1/admin/rbac/permissions` | `/admin-settings/roles` permission matrix catalog | Lists supported permission groups/actions used by the matrix UI |
| `PUT` | `/api/v1/admin/rbac/roles/{id}/permissions` | `/admin-settings/roles` save permissions | Replaces custom-role permission IDs with OCC; built-in Admin permissions are protected |

Deferred from this RBAC slice: edited permission matrices are persisted for Admin Settings configuration but runtime authorization still uses the existing fixed backend role and permission policy. Migrating route/API enforcement and employee custom-role assignment to dynamic RBAC is a later security architecture slice.

## Admin Workflow Config Discovery

| Area | Verified fact | Required work |
| --- | --- | --- |
| Frontend route | `hrms-client/src/routes/_app/admin-settings.workflows.tsx` renders Approval Workflows for leave, WFH, timesheet, expense, asset request, and helpdesk escalation | Replace localStorage-only workflow configuration with backend-backed reads/saves in API mode |
| Current data source | `hrms-client/src/lib/admin-settings-store.tsx` persists workflows to `hawkaii_admin_workflows_v1` with active flags and linear stage lists | Keep local behavior only when API mode is disabled |
| Visible actions | Toggle workflow active/disabled, add/remove stages, change approver type/value, edit escalation days, and toggle mandatory rejection remarks | Implement list/update APIs that persist full workflow configuration with OCC |
| Planned backend contract | `docs/api/frontend-contract/BACKEND_API_COMPLETION_REPORT.md` lists `GET /api/v1/admin/workflows` and `PUT /api/v1/admin/workflows/{workflow_key}` | Implement these two endpoints with Admin-only access, OpenAPI docs, persistence, and integration tests |
| Existing backend behavior | Runtime workflow decisions are still implemented inside each feature module; the Admin settings screen currently has no backend persistence | Persist configuration for Admin Settings without changing feature runtime approval routing in this slice |
| Risks | Current UI stage IDs are client-generated and not tied to live approval engines | Normalize stage shape on the backend and document runtime enforcement as deferred |

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
| 5 | Admin company profile/settings | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin company integration test, `pnpm test:contracts` | Passed. OpenAPI generated 176 operations across 157 paths. Non-escalated tsx/DB runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/admin/*`, `src/db/migrations/0010_admin_company_profile.sql`, company profile persistence/model, OpenAPI/docs/contracts | `feat(admin): implement company profile settings APIs` |
| 5 | Admin company profile/settings | Integrate frontend company settings screen | Completed in `hrms-client` | Completed for `/admin-settings/company` read/update in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.company.tsx`, frontend API docs | `feat(admin): connect company settings to backend API` |
| 5 | Admin master data | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin master-data integration test, `pnpm test:contracts` | Passed. OpenAPI generated 182 operations across 161 paths. Non-escalated tsx/DB runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/admin/*`, `src/db/migrations/0011_admin_master_data.sql`, `src/shared/types.ts`, `src/db/schema.ts`, core persistence, OpenAPI/docs/contracts | `feat(admin): implement master data settings APIs` |
| 5 | Admin master data | Integrate frontend master-data screen | Completed in `hrms-client` | Completed for `/admin-settings/master-data` departments/designations in API mode; unsupported master groups are explicitly deferred in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.master-data.tsx`, frontend API docs | `feat(admin): connect master data settings to backend API` |
| 5 | Admin RBAC | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin RBAC integration test, `pnpm test:contracts` | Passed. OpenAPI generated 187 operations across 165 paths. Non-escalated tsx/DB runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/admin/*`, `src/db/migrations/0012_admin_rbac.sql`, `src/shared/constants.ts`, `src/shared/types.ts`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(admin): implement RBAC settings APIs` |
| 5 | Admin RBAC | Integrate frontend roles screen | Completed in `hrms-client` | Completed for `/admin-settings/roles` list/create/update/permission replacement in API mode; local store remains only for API-disabled development | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.roles.tsx`, frontend API docs | `feat(admin): connect RBAC settings to backend API` |
| 5 | Admin workflow configurations | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin workflow integration test, `pnpm test:contracts` | Passed. OpenAPI generated 189 operations across 167 paths. Non-escalated tsx/DB runs were sandbox-blocked; reruns with local QA infra access passed. | `src/modules/admin/*`, `src/db/migrations/0013_admin_workflows.sql`, `src/shared/constants.ts`, `src/shared/types.ts`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(admin): implement workflow settings APIs` |
| 5 | Admin workflow configurations | Integrate frontend workflow screen | Completed in `hrms-client` | Completed for `/admin-settings/workflows` list/edit/save in API mode; local workflow store remains only for API-disabled development | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.workflows.tsx`, frontend API docs | `feat(admin): connect workflow settings to backend API` |
| 5 | Admin policies | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin policy integration test, `pnpm test:contracts` | Passed. OpenAPI generated 191 operations across 169 paths. One contract rerun was needed after removing the non-paginated policy list from the pagination-only assertion. | `src/modules/admin/*`, `src/db/migrations/0014_admin_policies.sql`, `src/shared/constants.ts`, `src/shared/types.ts`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(admin): implement policy settings APIs` |
| 5 | Admin policies | Integrate frontend policies screen | Completed in `hrms-client` | Completed for `/admin-settings/policies` list/edit/save in API mode; local policy store remains only for API-disabled development | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.policies.tsx`, frontend API docs | `feat(admin): connect policy settings to backend API` |
| 5 | Admin email templates | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin email-template integration test, `pnpm test:contracts` | Passed. OpenAPI generated 193 operations across 171 paths. The update endpoint was added because the visible email-template UI has save/toggle behavior. | `src/modules/admin/*`, `src/db/migrations/0015_admin_email_templates.sql`, `src/shared/constants.ts`, `src/shared/types.ts`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(admin): implement email template settings APIs` |
| 5 | Admin email templates | Integrate frontend email-template screen | Completed in `hrms-client` | Completed for `/admin-settings/email-templates` list/edit/save/toggle in API mode; local template store remains only for API-disabled development | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.email-templates.tsx`, frontend API docs | `feat(admin): connect email templates to backend API` |
| 5 | Admin notification channels | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin notification-channel integration test, `pnpm test:contracts` | Passed. OpenAPI generated 195 operations across 172 paths. A read endpoint was added because the visible UI must load current backend settings before toggles save. | `src/modules/admin/*`, `src/db/migrations/0016_admin_notification_channels.sql`, `src/shared/constants.ts`, `src/shared/types.ts`, `src/db/schema.ts`, store persistence, OpenAPI/docs/contracts | `feat(admin): implement notification channel settings APIs` |
| 5 | Admin notification channels | Integrate frontend notifications screen | Completed in `hrms-client` | Completed for `/admin-settings/notifications` list/toggle/save in API mode; local notification store remains only for API-disabled development | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.notifications.tsx`, frontend API docs | `feat(admin): connect notification settings to backend API` |
| 5 | Admin audit log | Implement backend API | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, admin audit-log integration test, `pnpm test:contracts` | Passed. OpenAPI generated 196 operations across 173 paths. The audit read model is derived from existing durable admin outbox events. | `src/modules/admin/*`, OpenAPI/docs/contracts, admin audit-log integration test | `feat(admin): implement audit log API` |
| 5 | Admin audit log | Integrate frontend audit screen | Completed in `hrms-client` | Completed for `/admin-settings/audit` read/filter display in API mode; local audit store remains only for API-disabled development | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/admin/*`, `src/routes/_app/admin-settings.audit.tsx`, frontend API docs | `feat(admin): connect audit log to backend API` |
| 5 | Non-expense Reports | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm db:verify:no-cross-schema-fks`, reports integration test, `pnpm test:contracts` | Passed. OpenAPI generated 206 operations across 182 paths. First contract run failed due a parallel DB reset with the reports integration test; rerun alone passed. | `src/modules/reports/*`, `src/platform/openapi.ts`, contract tests, OpenAPI/frontend contract docs | `feat(reports): implement non-expense report APIs` |
| 5 | Non-expense Reports | Integrate frontend report screens | Completed in `hrms-client` | Completed for HR, attendance, leave, projects, timesheet, assets, helpdesk, and audit report routes in API mode | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/reports/*`, `src/routes/_app/reports*.tsx`, frontend API docs | `feat(reports): connect non-expense report screens to backend APIs` |
| 5 | Employee/core backlog | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, core integration test, `pnpm test:contracts` | Passed. OpenAPI generated 211 operations across 187 paths. Non-escalated `tsx`/DB runs were sandbox-blocked and passed when rerun with local QA infra access. | `src/modules/core/*`, `src/platform/openapi.ts`, contract tests, OpenAPI/frontend contract docs | `feat(core): implement employee history import and export APIs` |
| 5 | Employee/core backlog | Integrate frontend employee screens | Completed in `hrms-client` | Completed for employee profile role history/audit reads and API-backed employee export job queueing | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/core/*`, `src/routes/_app/employees.tsx`, `src/routes/_app/employees.$id.tsx`, frontend API docs | `feat(employees): connect employee history and export APIs` |
| 5 | EMS document wrappers | Implement backend APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, EMS integration test, `pnpm test:contracts` | Passed. OpenAPI generated 213 operations across 188 paths. Non-escalated `tsx`/DB/Docker runs were sandbox-blocked and passed when rerun with local QA infra access. | `src/modules/ems/*`, `src/platform/openapi.ts`, contract tests, OpenAPI/frontend contract docs | `feat(ems): add employee document wrapper APIs` |
| 5 | EMS document wrappers | Integrate frontend EMS documents screen | Completed in `hrms-client` | Completed for `/ems/documents` list/download behavior in API mode; upload/replace stays blocked in API mode until a file picker/form flow exists | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/ems/*`, `src/routes/_app/ems.documents.tsx`, frontend API docs | `feat(ems): connect document screen to backend wrappers` |
| 5 | Attendance backlog | Implement completion APIs | Completed | N/A | `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm api:docs:generate`, `pnpm api:docs:verify`, `pnpm api:consumer:verify`, `pnpm db:verify:no-cross-schema-fks`, attendance integration test, `pnpm test:contracts` | Passed. OpenAPI generated 216 operations across 191 paths. Non-escalated DB/tsx runs were sandbox-blocked and passed when rerun with local QA infra access. | `src/modules/attendance/*`, `src/platform/openapi.ts`, contract tests, OpenAPI/frontend contract docs | `feat(attendance): complete daily queue and export APIs` |
| 5 | Attendance backlog | Add frontend adapters/hooks | Completed in `hrms-client` | Completed for domain-level access to daily calendar, manager regularization queue, and export job APIs | `pnpm format`, `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm lint`, route guard, route coverage, `pnpm build` | Passed. Frontend lint has 39 existing Fast Refresh warnings; build keeps chunk-size/Wrangler log warnings but exits 0. | `hrms-client/src/domains/attendance/*`, frontend API docs after sync | `feat(attendance): add completion endpoint adapters` |

## Remaining Blockers

| Priority | Blocker |
| --- | --- |
| P1 | No frontend e2e/user-flow baseline for EMS, Leave/WFH/Holidays, or Attendance |
| P1 | EMS document Upload/Replace still needs a real file selection/form flow; API mode now blocks fake success instead of pretending to upload |
| P1 | EMS onboarding, probation, exits, policy management, and letter generation admin actions remain static until broader HR/admin modules exist |
| P1 | No frontend e2e/user-flow baseline for EMS, Leave/WFH/Holidays, Attendance, Projects, or Helpdesk |
| P1 | No frontend e2e/user-flow baseline for Notifications/topbar read-state behavior |
| P1 | Helpdesk category create/update/toggle endpoints remain planned for admin/settings phase; API mode surfaces this as an error instead of mutating local state |
| P1 | Full asset vendor CRUD, warranty automation, and recovery settlement workflow remain planned for admin/operational hardening |
| P1 | Project-specific reports and project document upload/attach UX remain planned |
| P1 | Full document-backed report export file generation/download remains production hardening; report export jobs currently persist queued metadata |
| P1 | Leave/WFH export endpoint remains planned |
| P1 | Admin master-data tabs beyond departments/designations remain deferred until backend APIs are defined |
| P1 | Dynamic RBAC runtime enforcement and custom-role assignment to employees remain deferred; this slice persists Admin Settings RBAC configuration only |
| P1 | Admin security settings remain planned and need a concrete backend contract/runtime enforcement decision |
| P2 | Frontend lint keeps 39 existing Fast Refresh warnings |
| P2 | Frontend build keeps chunk-size/Wrangler log warnings but exits successfully |

## Validation Results

Backend:

- `pnpm typecheck`: passed
- `pnpm build`: passed
- `pnpm lint`: passed with escalation due `tsx` IPC sandboxing
- `pnpm api:docs:generate`: passed with escalation due `tsx` IPC sandboxing; generated 216 operation frontend contract after Attendance backlog completion
- `pnpm api:docs:verify`: passed
- `pnpm api:consumer:verify`: passed with escalation due `tsx` IPC sandboxing
- `pnpm db:verify:no-cross-schema-fks`: passed after verifier fix; no cross-schema SQL foreign keys found in migrations or PostgreSQL metadata
- `pnpm exec vitest run --project integration src/modules/attendance/__tests__/attendance.integration.test.ts`: passed, 3 tests; non-escalated run failed on sandboxed DB networking and passed with local QA infra access
- `pnpm exec vitest run --project integration src/modules/ems/__tests__/ems.integration.test.ts`: passed, 3 tests; non-escalated run failed on sandboxed DB networking and passed with local QA infra access
- `pnpm exec vitest run --project integration src/modules/core/__tests__/core.integration.test.ts`: passed, 3 tests; non-escalated run failed on sandboxed DB networking and passed with local QA infra access
- `pnpm test:contracts`: passed, 13 tests; non-escalated run failed on sandboxed DB networking and passed with local QA infra access

Frontend:

- `pnpm format`: passed
- `pnpm exec tsc -p tsconfig.json --noEmit`: passed
- `pnpm lint`: passed with 39 existing warnings
- `pnpm api:implemented-route-guard`: passed, 59 files against 191 paths
- `pnpm api:frontend-contract:route-coverage`: passed, 85 routes across 15 groups
- `pnpm build`: passed with existing chunk-size/Wrangler log warnings

## Assumptions

- EMS profile change requests intentionally model one field per request because the current UI submits one selected field at a time.
- EMS decisions use status values (`approved`, `returned`, `rejected`) rather than leave/WFH action verbs.
- EMS generic service requests support create/list/HR queue only in this slice; assignment and closure workflows stay planned for later HR operations.
- EMS employee document wrappers reuse the existing Documents module and `business_object_type = "employee"` instead of adding a parallel EMS document table.
- EMS document downloads, verification, access logs, and object-storage behavior remain owned by the existing Documents APIs.
- EMS document Upload/Replace buttons stay blocked in API mode until a real file selection/form flow is added; local/demo mode keeps the legacy placeholder behavior.
- EMS admin onboarding, probation, exits, policy management, and letter generation tabs remain non-production placeholders until their backend modules are defined.
- Projects list responses intentionally include members, allocations, milestones/modules, documents, and summary by default so the existing project store can hydrate visible screens without adding a generated client layer.
- Project document APIs list documents already attached to `business_object_type = "project"`; upload/attach UX remains part of later document hardening.
- Helpdesk category mutation is intentionally not implemented in this slice because the verified planned contract includes `GET /api/v1/helpdesk/categories` only. Category edit/toggle actions stay deferred to admin/settings category management.
- Helpdesk attachment APIs accept document references only; real upload/replace remains part of the existing Documents/upload hardening work.
- Notifications read-state is scoped to the topbar feed; Admin notification channel preferences are now persisted by the Admin Settings API, while runtime delivery-provider filtering remains deferred.
- Asset workflow requests intentionally extend the existing asset module rather than creating a separate module so base inventory, assignment, return, and license behavior remain unchanged.
- Asset vendor support is read-only in this slice because the current visible frontend needs vendor cards/selectors; vendor CRUD remains in admin hardening.
- Asset recovery queue is read-only in this slice and derives from assigned assets owned by inactive/terminated users; settlement workflows remain deferred.
- Timesheet enhancements intentionally add read-oriented analytics/selector endpoints only; existing segment, submission, and approval mutation behavior remains unchanged.
- Timesheet report routes now use the Reports summary API in API mode; document-backed timesheet export files remain production hardening.
- Expense clarification messages are persisted as durable expense audit events for this slice; a dedicated clarification table is deferred unless richer threaded features are required later.
- Expense withdrawal maps backend `Cancelled` to frontend `withdrawn`; withdrawal is limited to requester-owned draft, submitted, pending-manager, or manager-returned tickets.
- Expense dashboard summary returns compact role-aware cards and rows; detailed accounting reports remain under the existing expense report endpoints.
- Admin company profile extends the existing onboarding `platform.company_profiles` table so auth/company bootstrap state remains the source for tenant identity.
- Admin company profile updates emit `admin.company_profile.updated` outbox events as the durable audit hook until the broader Admin audit log API is implemented.
- Company profile updates intentionally keep `company_slug` stable; display/profile fields can change without migrating tenant identifiers.
- `/admin-settings/company` uses the backend in API mode and keeps localStorage only for API-disabled development.
- Admin master data implements departments/designations only because those are the only planned master-data endpoints in the current contract.
- Department/designation delete UI behavior maps to versioned deactivation; hard delete is not exposed.
- Department/designation deactivation is blocked while active employees reference the row to avoid breaking employee/org selectors.
- Unsupported Admin master-data tabs are disabled in API mode instead of silently persisting local-only production data.
- Admin RBAC persists role metadata and permission matrices for the Admin Settings UI without changing the existing fixed-role backend authorization checks in this slice.
- Built-in Admin role permissions are protected from replacement, and the Admin role cannot be deactivated.
- Custom RBAC roles can be created and configured, but assigning those custom roles to users and enforcing them at runtime requires a later RBAC policy migration.
- `/admin-settings/roles` uses backend APIs in API mode for role list/create/update/permission replacement and keeps localStorage role state only when API mode is disabled.
- Admin workflow configurations persist approval-stage settings for the Admin Settings UI without changing existing runtime approval engines in leave, WFH, timesheets, expenses, assets, or helpdesk in this slice.
- Workflow stage IDs remain client/backend configuration identifiers; runtime workflow history continues to use each feature module's existing records.
- `/admin-settings/workflows` uses backend APIs in API mode for list/edit/save behavior and keeps localStorage workflow state only when API mode is disabled.
- Admin policies persist the visible Admin Settings policy values without changing existing runtime enforcement inside attendance, leave/WFH, timesheets, expenses, assets, or helpdesk in this slice.
- Policy config is validated against the current visible UI fields and merged with the existing policy config on update.
- `/admin-settings/policies` uses backend APIs in API mode for list/edit/save behavior and keeps localStorage policy state only when API mode is disabled.
- Admin email templates persist the visible Admin Settings template subject, body, active status, locale, and metadata without adding SMTP/provider delivery configuration in this slice.
- The `PUT /api/v1/admin/email-templates/{template_key}` endpoint was added because the current frontend UI has visible save/toggle behavior, even though the old backlog only listed the read endpoint.
- `/admin-settings/email-templates` uses backend APIs in API mode for list/edit/save behavior and keeps localStorage template state only when API mode is disabled.
- Admin notification channels persist the visible Admin Settings In-app, Email, and Push event toggles without adding provider secrets, SMTP/push setup, or runtime notification delivery filtering in this slice.
- The `GET /api/v1/admin/notification-channels` endpoint was added because the current frontend UI must load current channel settings before saving toggle changes, even though the old backlog only listed the update endpoint.
- `/admin-settings/notifications` uses backend APIs in API mode for list/toggle/save behavior and keeps localStorage notification settings only when API mode is disabled.
- Admin audit log is derived from durable admin outbox events instead of a new audit table so existing Admin Settings mutation audit hooks remain the source of truth.
- `/admin-settings/audit` uses the backend API in API mode and keeps the local audit store only when API mode is disabled.
- Cross-module audit reporting is now available through `/api/v1/reports/audit`; `/admin-settings/audit` remains scoped to Admin Settings audit visibility.
- Non-expense Reports are read-only summaries derived from already implemented module stores; they do not introduce new source-of-truth workflow tables.
- Report export create/list/detail currently persists queued metadata through the existing outbox. Actual file rendering, document attachment, download URLs, scheduling, and retention are deferred to production hardening.
- Frontend report routes use the backend in API mode and keep local/mock aggregation only when API mode is disabled.
- Attendance daily calendar and manager regularization queue are added as backend completion endpoints/adapters; existing visible attendance routes already use monthly calendar, exceptions, and Reports APIs, so no route layout rewrite was required.
- Attendance export create currently persists queued metadata through the existing outbox. Actual file rendering, document attachment, download URLs, scheduling, and retention are deferred to production hardening.

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
| Admin company profile backend | `feat(admin): implement company profile settings APIs` | Committed in `hrms_backend` as `64ee990` |
| Admin company profile frontend | `feat(admin): connect company settings to backend API` | Committed in `hrms-client` as `0808920` |
| Admin master data backend | `feat(admin): implement master data settings APIs` | Committed in `hrms_backend` as `1e1904c` |
| Admin master data frontend | `feat(admin): connect master data settings to backend API` | Committed in `hrms-client` as `8ffaaab` |
| Admin RBAC backend | `feat(admin): implement RBAC settings APIs` | Committed in `hrms_backend` as `bff0a60` |
| Admin RBAC frontend | `feat(admin): connect RBAC settings to backend API` | Committed in `hrms-client` as `998c312` |
| Admin RBAC task sheet | `docs(admin): record RBAC completion` | Committed in `hrms_backend` as `34ddf95` |
| Admin workflow backend | `feat(admin): implement workflow settings APIs` | Committed in `hrms_backend` as `34b1633` |
| Admin workflow frontend | `feat(admin): connect workflow settings to backend API` | Committed in `hrms-client` as `56b749c` |
| Admin workflow task sheet | `docs(admin): record workflow settings completion` | Committed in `hrms_backend` as `21df259` |
| Admin policy backend | `feat(admin): implement policy settings APIs` | Committed in `hrms_backend` as `441648a` |
| Admin policy frontend | `feat(admin): connect policy settings to backend API` | Committed in `hrms-client` as `d0091d0` |
| Admin policy task sheet | `docs(admin): record policy settings completion` | Committed in `hrms_backend` as `28d2402` |
| Admin email templates backend | `feat(admin): implement email template settings APIs` | Committed in `hrms_backend` as `6778966` |
| Admin email templates frontend | `feat(admin): connect email templates to backend API` | Committed in `hrms-client` as `fd991af` |
| Admin email templates task sheet | `docs(admin): record email template settings completion` | Committed in `hrms_backend` as `08b851e` |
| Admin notification channels backend | `feat(admin): implement notification channel settings APIs` | Committed in `hrms_backend` as `0a2a25f` |
| Admin notification channels frontend | `feat(admin): connect notification settings to backend API` | Committed in `hrms-client` as `3b7d24c` |
| Admin notification channels task sheet | `docs(admin): record notification channel settings completion` | Committed in `hrms_backend` as `bbed1e6` |
| Admin audit log backend | `feat(admin): implement audit log API` | Committed in `hrms_backend` as `4029ec4` |
| Admin audit log frontend | `feat(admin): connect audit log to backend API` | Committed in `hrms-client` as `7b05ee4` |
| Admin audit log task sheet | `docs(admin): record audit log completion` | Committed in `hrms_backend` as `8985eac` |
| Non-expense Reports backend | `feat(reports): implement non-expense report APIs` | Committed in `hrms_backend` as `ae8f0d2` |
| Non-expense Reports frontend | `feat(reports): connect non-expense report screens to backend APIs` | Committed in `hrms-client` as `d8c25a7` |
| Non-expense Reports task sheet | `docs(reports): record non-expense reports completion` | Committed in `hrms_backend` as `fb5564c` |
| Employee/core backlog backend | `feat(core): implement employee history import and export APIs` | Committed in `hrms_backend` as `89e8548` |
| Employee/core backlog frontend | `feat(employees): connect employee history and export APIs` | Committed in `hrms-client` as `9972127` |
| Employee/core backlog task sheet | `docs(core): record employee core backlog completion` | Committed in `hrms_backend` as `edd2e72` |
| EMS document wrappers backend | `feat(ems): add employee document wrapper APIs` | Committed in `hrms_backend` as `166f664` |
| EMS document wrappers frontend | `feat(ems): connect document screen to backend wrappers` | Committed in `hrms-client` as `4efbbdf` |
| EMS document wrappers task sheet | `docs(ems): record document wrapper completion` | Pending commit |

## Next Steps

1. Phase 5 Attendance backlog endpoints are implemented, frontend adapters/hooks are available, and validation passed.
2. Backend OpenAPI now has 216 operations across 191 paths; planned operations remaining are 1.
3. Employee import/export jobs and EMS/report/attendance export jobs remain queued metadata only; actual import parsing and document-backed file generation/download remain production hardening.
4. Next roadmap scope: implement the remaining `POST /api/v1/leave-wfh/exports` endpoint. Admin security settings still requires a concrete backend contract/runtime enforcement decision before implementation.
