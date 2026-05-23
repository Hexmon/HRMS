# Frontend Backend Gap Audit

This audit maps the current Hawkaii HRMS frontend to the custom backend contract work still needed. It is the feature-wise source for what to keep, remove, change, and add before replacing mock/localStorage access with `/api/v1` calls.

## Current Frontend State

- The app is a mock-first HRMS frontend. Most business state is in `src/lib/*-store.tsx` and `src/lib/mock/`.
- The visible product surface includes auth/onboarding, dashboard, employees, EMS, attendance, leave/WFH, timesheets, projects, utilization, expenses, assets, helpdesk, reports, admin settings, and developer handoff.
- Existing backend handoff coverage is strongest for auth/session, core user hierarchy, expenses, finance, documents, assets, timesheets, attendance basics, primary leave/WFH/holiday workflows, primary EMS self-service workflows, project portfolio/utilization, helpdesk, admin settings, expense and non-expense reports, health, and OpenAPI tooling.
- Full frontend coverage requires additional API groups for EMS admin/document wrappers, attendance daily/queue/export gaps, leave/WFH export jobs, admin security settings, and production hardening.

## API Count Summary

Current documented backend contract: **213 operations** in `openapi.json` after Phase 5 EMS document wrapper completion.

- **211** operations are under `/api/v1/**`.
- **2** operations are unversioned platform health checks: `/health/live` and `/health/ready`.
- **0** documented backend operations currently need deletion from the OpenAPI pack because Reviewer/Director APIs are not present there.

Disjoint implementation counts for backend planning:

| Category                               | Count | Meaning                                                                                                                                                                |
| -------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing APIs ready to integrate as-is |   213 | Present in `openapi.json` and usable through the generated frontend client without path or workflow changes.                                                           |
| Existing APIs to update in place       |     0 | Phase 1A-1C existing API expansions have landed; new gaps should be added as explicit new endpoints.                                                                   |
| Existing APIs to delete                |     0 | No active OpenAPI endpoint should be removed. If another legacy backend still exposes Reviewer/Director endpoints, deprecate them outside this frontend contract pack. |
| New APIs remaining to add              |     4 | Remaining first-pass count needed after Phase 5 EMS document wrapper completion.                                                                                       |
| Target contract size after additions   |   217 | `213 current + 4 remaining`; EMS document wrapper APIs are now implemented.                                                                                            |

Existing APIs updated in place during earlier phases:

| API                                                | Required update                                                                                                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/auth/me`                              | Include active role, permission/navigation hints, company/session preference, and role-switch context.                                                   |
| `GET /api/v1/core/users`                           | Match employee table needs: employee profile columns, department/designation/role filters, manager fields, status, login state, pagination, and sorting. |
| `GET /api/v1/core/users/{id}`                      | Return full employee detail tabs: profile, reporting line, roles, documents summary, assets summary, attendance/leave/timesheet/expense summaries.       |
| `GET /api/v1/reports/expenses/my`                  | Match employee expense cards, filters, and list/register columns.                                                                                        |
| `GET /api/v1/reports/expenses/manager-queue`       | Match Manager Verification dashboard cards and queue filters.                                                                                            |
| `GET /api/v1/reports/expenses/manager-history`     | Include manager verified, returned, and rejected history with remarks and audit metadata.                                                                |
| `GET /api/v1/reports/expenses/finance-dashboard`   | Match finance dashboard cards, aging buckets, payable totals, and exception counts.                                                                      |
| `GET /api/v1/reports/expenses/finance-history`     | Include finance approval, hold, payment, settlement, and document verification fields.                                                                   |
| `GET /api/v1/reports/expenses/register`            | Match expense register filters, columns, totals, export fields, and role-scoped visibility.                                                              |
| `GET /api/v1/timesheets/queue/approver`            | Include project/member metadata, missing submission context, and return/reject remark history.                                                           |
| `POST /api/v1/timesheets/submissions/{id}/approve` | Model approve, return, and reject decisions with remarks and `expected_version`.                                                                         |

Minimum new API operation count by frontend area:

| Frontend area                                     | New APIs needed | Coverage notes                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | --------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth, onboarding, password reset, role activation |               0 | Signup, verify email, resend verification, set password, reset request, reset confirm, company bootstrap, and active role/session preference are implemented.                                                                                                                                                                |
| Dashboard                                         |               0 | Role-scoped dashboard summary is implemented.                                                                                                                                                                                                                                                                                |
| Employees/Core                                    |               0 | Employee CRUD/status/login, role assignment/history, profile audit, import/export job metadata, department/designation selectors, and org hierarchy are implemented. Full import parsing and document-backed export files remain production hardening.                                                                       |
| EMS                                               |               0 | Primary profile, profile requests, employee document wrappers, letters, policies, generic requests, and HR queues are implemented.                                                                                                                                                                                           |
| Attendance                                        |               3 | Daily calendar endpoint, manager queue alias if needed by UI, reports/exports. Punches, monthly calendar, summaries, regularization submit/list/decision, and exceptions are implemented.                                                                                                                                    |
| Leave/WFH                                         |               1 | Primary balances, leave apply/cancel/decision, WFH apply/decision, HR monitor, and holiday list/upsert are implemented; export/report job endpoint remains.                                                                                                                                                                  |
| Timesheets                                        |               0 | Work segments, submissions, approver queue, decisions, workflow definitions, project aggregations, missing submissions, productivity summaries, submission detail, and selector metadata are implemented.                                                                                                                    |
| Projects/utilization                              |               0 | Project CRUD, members, allocations, modules/milestones, project documents, project summaries, and utilization/bench/overload analytics are implemented.                                                                                                                                                                      |
| Expenses/finance                                  |               0 | Expense metadata/policy requirements, dashboard summary, withdraw, and clarification thread are implemented.                                                                                                                                                                                                                 |
| Assets                                            |               0 | Requests, decisions, cancellation, acknowledgements, maintenance, vendor views, recovery queues, and asset reports are implemented.                                                                                                                                                                                          |
| Helpdesk                                          |               0 | Ticket CRUD, comments/internal notes, attachments, assignment, priority/status changes, resolve/close/reopen, categories, SLA report, and helpdesk report summary are implemented.                                                                                                                                           |
| Reports                                           |               0 | HR, attendance, leave/WFH, projects, timesheets, assets, helpdesk, audit, and export list/detail are implemented. Full document-backed export generation remains production hardening.                                                                                                                                       |
| Admin settings                                    |               0 | Company profile, department/designation master data, RBAC role/permission configuration, workflow configuration, policy configuration, email template list/update, notification channel list/update, and audit log are implemented; security settings still need a concrete backend contract before counting/implementation. |
| Notifications                                     |               0 | Feed, unread count, mark read, and mark all read are implemented; Admin notification channel preferences are implemented under Admin settings.                                                                                                                                                                               |
| **Total remaining**                               |           **6** | Remaining operation count for full visible frontend coverage after Phase 5 employee/core backlog.                                                                                                                                                                                                                            |

## Expense Flow Alignment

Authoritative flow: Employee raises request -> Manager verifies -> Finance approves -> Payment release -> Bills/documents -> Manager document verification -> Settlement/closure.

Keep:

- `POST /api/v1/expenses`, `GET /api/v1/expenses/my`, `GET /api/v1/expenses/{id}`, `PATCH /api/v1/expenses/{id}`, `POST /api/v1/expenses/{id}/submit`.
- `GET /api/v1/expenses/queue/manager` and `POST /api/v1/expenses/{id}/manager/verify`.
- Finance queue/detail/approve/payment/bills/settlement/audit APIs.
- `expected_version` on workflow mutations and `409` refetch behavior.

Changed in frontend:

- `/expenses/review` is the Manager Verification queue.
- Active statuses are `pending_manager`, `manager_returned`, `manager_rejected`, `finance_verification`, `finance_hold`, `finance_verified`, `payment_released`, `bills_submitted`, `settlement_review`, `pending_adjustment`, `closed`, and `withdrawn`.
- Manager approval now sends the ticket directly to finance verification.

Remove:

- Active `/expenses/director` route and tab.
- Active `/expenses/mapping` reviewer mapping route and tab.
- Old Reviewer/Director labels, statuses, queues, and actions from active frontend screens.
- Backend contract additions for Reviewer/Director are not needed unless a future migration requires read-only legacy history.

## Feature Gap Matrix

| Frontend area              | Current routes                                                                                              | Existing backend coverage                                                                                                                                                                                                        | Required backend contract additions                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth, onboarding, password | `/login`, `/signup`, `/verify-email`, `/set-password`, `/forgot-password`, `/reset-password`, `/onboarding` | Login/logout/me only.                                                                                                                                                                                                            | Workspace signup, email verification, resend verification, set password, reset request, reset confirm, first-admin onboarding, company bootstrap, active-role/session preference. |
| Dashboard                  | `/dashboard`                                                                                                | No dedicated dashboard contract.                                                                                                                                                                                                 | Role-scoped dashboard summary endpoint returning cards, queues, announcements, birthdays, audit snippets, and module shortcuts.                                                   |
| Employees/Core             | `/employees`, `/employees/:id`                                                                              | User list/detail/subtree, employee CRUD/status/login, role replacement/history, profile audit, org selectors, import job metadata, import polling, and export job metadata.                                                      | Full import row parsing/user creation and document-backed export file generation remain production hardening.                                                                     |
| EMS                        | `/ems/*`                                                                                                    | Profile, profile update requests, HR profile queue/decisions, generic employee requests, HR request queue, HR letters, policy acknowledgements, and Documents APIs for document list/download/verify.                            | EMS-specific employee document wrapper endpoints, onboarding/probation/exits/policy management/letter generation admin workflows.                                                 |
| Attendance                 | `/attendance/*`                                                                                             | Punches, my punch list, my/team summaries, monthly calendar, regularization submit/list/decision, and exceptions.                                                                                                                | Daily calendar alias if required, manager queue alias if required, attendance reports/exports.                                                                                    |
| Leave/WFH                  | `/leave-wfh/*`                                                                                              | Balances, apply leave, apply WFH, cancel leave, manager decisions, HR monitor, holiday list, and holiday upsert.                                                                                                                 | Leave/WFH export/report job and later reporting parity.                                                                                                                           |
| Timesheets                 | `/timesheet/*`                                                                                              | Work segments, submissions, approver queue, workflow definitions, project summaries, missing submissions, productivity summary, submission detail, and selectors.                                                                | Timesheet report export jobs and broader report parity remain in the Reports phase.                                                                                               |
| Projects/utilization       | `/projects`, `/projects/:id`, `/team-utilization`                                                           | Project CRUD, members, allocations, modules/milestones, project documents, project summary, and team utilization.                                                                                                                | Project report parity, timesheet submission detail, document upload/attach UX, and e2e/user-flow coverage.                                                                        |
| Expenses/finance           | `/expenses/*`                                                                                               | Good baseline coverage.                                                                                                                                                                                                          | Keep current Manager -> Finance contract; add frontend report shapes that match current expense dashboard cards and registers.                                                    |
| Assets                     | `/assets/*`                                                                                                 | Inventory, detail, assign, return, QR scan, license APIs, termination event, requests, acknowledgements, maintenance records, vendor views, recovery queues, and asset report summary.                                           | Asset-specific report endpoint parity is implemented; recovery settlement hardening remains later operational work.                                                               |
| Helpdesk                   | `/helpdesk/*`                                                                                               | Ticket CRUD, comments/internal notes, attachments, assignment, priority/status changes, resolve/close/reopen, categories, SLA report, and helpdesk report summary.                                                               | Category mutation hardening and deeper helpdesk analytics remain later work if required.                                                                                          |
| Reports                    | `/reports/*`                                                                                                | Expense reports, non-expense summaries, audit report, and export job metadata.                                                                                                                                                   | Full document-backed export generation/download and scheduled reports remain production hardening.                                                                                |
| Admin settings             | `/admin-settings/*`                                                                                         | Company profile, department/designation master data, RBAC roles/permissions, workflow configs, policies, email templates, notification channels, audit log, finance governance, manager backups, timesheet workflow definitions. | Security settings contract/runtime enforcement decision.                                                                                                                          |
| Notifications              | Topbar notification panel                                                                                   | Notification feed, unread count, mark read, mark all read, and Admin notification channel preferences.                                                                                                                           | Runtime notification delivery-provider enforcement remains production hardening.                                                                                                  |

## Integration Changes For Frontend

- Add a generated `/api/v1` client from `docs/api/frontend-contract/openapi.json`.
- Wrap generated calls in feature adapters so current Context providers can migrate without rewriting screens at once.
- Replace `src/lib/mock/*` reads module-by-module with React Query queries/mutations.
- Remove direct legacy data-client imports from active UI paths after replacement; browser screens should use feature adapters backed by `/api/v1`.
- Persist filters, pagination, sort, and selected tabs in URL/state for backend-backed list views.
- Standardize API errors in UI: field errors from `details.fieldErrors`, support-visible `request_id`, `403` access denied, `409` refresh-and-retry, `429` retry after `Retry-After`.

## Contract Validation

- Run `npm run api:frontend-contract:route-coverage` after route or contract-pack changes.
- Run `npm run build` to regenerate TanStack route metadata and catch deleted route references.
- Existing generated OpenAPI docs remain the backend source for implemented operations; this audit is the source for missing operations the custom backend must add.
