# Hawkaii HRMS

Hawkaii HRMS is a full-stack workforce operating system for employee administration, attendance, leave and WFH, expenses, documents, projects, assets, helpdesk, reporting, and admin governance.

This repository is the product monorepo. It contains the backend API, frontend application, and product/reference documentation in one Git history.

## Repository Map

| Path | Purpose |
| --- | --- |
| `hrms_backend/` | Fastify backend, PostgreSQL migrations, domain APIs, workers, OpenAPI generation, integration tests, and production operations scripts. |
| `hrms-client/` | TanStack Start/React frontend, role-based app routes, domain API adapters, UI components, route coverage checks, and Playwright tests. |
| `docs/` | Root-level product architecture notes, implementation status, email verification architecture, and deployment runbooks. |

## Product Roles

Role access is controlled by the backend session returned from `/api/v1/auth/me`, including active role, available roles, permissions, and navigation.

Primary roles/personas used by the product:

| Role / Persona | Main Responsibility |
| --- | --- |
| Admin / Main Admin | Workspace setup, company settings, employee administration, RBAC, reports, finance/admin override workflows. |
| HR Manager / HR Admin | Employee lifecycle, EMS workflows, leave/WFH monitoring, onboarding, probation, exit and policy operations. |
| Employee | Self-service dashboard, attendance punch, leave/WFH requests, expense tickets, documents, assets, timesheets, helpdesk tickets. |
| Reviewer / Manager | Manager approvals for expenses, leave/WFH, timesheets, attendance regularization, and team visibility. |
| Director | Senior approval path where configured by workflow rules. |
| Finance Manager | Expense finance verification, payment, settlement, finance reporting, and governance views. |
| Asset Manager | Asset inventory, assignment, return, warranty, vendor, maintenance, and recovery workflows. |
| Auditor | Read-only audit/report visibility where permissions allow. |
| Helpdesk Agent | Ticket queue handling, assignment, status updates, resolution, and SLA follow-up where configured. |

## Product Modules

### Authentication And Workspace Onboarding

- Workspace signup creates a pending company and pending user.
- Email verification uses application-owned auth tokens.
- Resend is the transactional email transport for verification and reset flows.
- Verification is based only on validating the app token, not delivery/open/click webhooks.
- Existing active users are kept verified by migration/backfill behavior.

Reference docs:

- `docs/resend-email-verification-architecture-report.md`
- `docs/architecture/email-verification.md`
- `docs/runbooks/resend-email-verification-deployment.md`

### Dashboard

- Role-scoped dashboard cards and actions.
- Employee dashboard focuses on attendance punch status, today work time, break time, target time, and self-service actions.
- Admin and manager dashboards expose role-appropriate operational summaries and shortcuts.

### Employee Administration

- Employee CRUD and profile details.
- Department, designation, manager hierarchy, employment status, joining details, roles, history, and audit visibility.
- Employee profile photos are uploaded through the backend media pipeline and stored through Cloudinary-compatible object storage.

### Attendance

- Punch in, punch out, and break tracking.
- My attendance summaries, team summaries, daily/monthly calendar, exceptions, regularization, and exports.
- Dashboard attendance values should come from backend attendance records in API mode.

### Leave, WFH, And Holidays

- Leave balances and leave requests.
- Apply, cancel, approve, reject, and monitor flows.
- WFH request and approval flows.
- Holiday list/calendar and report/export support.

### EMS

- Employee profile self-service.
- Change requests, HR approvals, onboarding, probation, exits, policies, letters, and employee documents.
- EMS documents use backend document upload and Cloudinary-backed storage.

### Expense Management

- Employees create draft expense tickets and submit them for approval.
- Manager verification moves eligible tickets to finance.
- Finance verifies, approves, pays, and settles tickets.
- Returned tickets can be corrected and resubmitted where workflow permits.
- Rejected tickets are terminal unless a later policy says otherwise.
- Cost center is optional and reserved for later finance/reporting classification.

Reference docs:

- `hrms-client/docs/api/API_EXPENSE_WORKFLOW_GUIDE.md`
- `hrms-client/docs/api/API_FINANCE_GUIDE.md`

### Documents And Media

- Document upload, replace, download-url, verification, access log, and deletion flows are backend-backed.
- Cloudinary is the active object storage direction.
- Media upload limits, compression behavior, and allowed MIME types are backend-configured.
- Mock Cloudinary mode is for local/demo behavior only and should not be used as production storage.

### Projects And Utilization

- Project CRUD, archive/status handling, members, allocations, milestones/modules, documents, summaries, and team utilization.
- Utilization views expose bench/overload/allocated views from backend APIs.

### Assets

- Asset inventory, assignment, return, warranty alerts, licenses, requests, acknowledgements, maintenance, vendors, and recovery settlement.
- Asset actions are role/permission gated and should not be called from unauthorized role dashboards.

### Helpdesk

- Ticket create/list/detail, comments, internal notes, attachments, assignment, priority/status changes, resolve, close, reopen, categories, and SLA reports.

### Notifications

- Authenticated notification feed.
- Unread count, mark-read, and mark-all-read operations.
- Push notification provider delivery is intentionally separate from the current in-app/email channel configuration.

### Reports

- Reports span expenses, HR, attendance, leave/WFH, projects, timesheets, assets, helpdesk, and audit.
- API page sizes are capped by backend validation; frontend calls should respect documented limits.
- Generated exports can return backend document IDs for download.

### Admin Settings

- Company profile and logo.
- Master data: departments, designations, employment types, work locations, shifts, leave types, expense categories, asset categories, helpdesk categories, and project roles.
- Roles and permissions.
- Approval workflows.
- Policies.
- Email templates.
- Notification channels.
- Security settings.
- Audit logs.

## API Contract

The backend OpenAPI contract is the source of truth for frontend API behavior.

Key references:

- `hrms_backend/docs/api/openapi.json`
- `hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md`
- `hrms-client/docs/api/openapi.json`
- `hrms-client/docs/api/frontend-contract/ENDPOINT_INDEX.md`

Current generated contract documents 245 operations.

## Product Status And Roadmap

The main implementation status is tracked in:

- `docs/implementation/HRMS_PRODUCTION_TASK_SHEET.md`
- `hrms_backend/docs/implementation/HRMS_PRODUCTION_TASK_SHEET.md`

Use the backend versioned task sheet as the source of truth for implementation status, validation notes, assumptions, blockers, and next production hardening work.

## User Manual Index

For product behavior and user journeys, start here:

| Topic | Reference |
| --- | --- |
| Implementation status | `hrms_backend/docs/implementation/HRMS_PRODUCTION_TASK_SHEET.md` |
| Frontend/backend contract | `hrms-client/docs/api/frontend-contract/README.md` |
| API endpoint index | `hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md` |
| Auth/session API | `hrms-client/docs/api/API_AUTH_SESSION_GUIDE.md` |
| Expense workflow | `hrms-client/docs/api/API_EXPENSE_WORKFLOW_GUIDE.md` |
| Finance workflow | `hrms-client/docs/api/API_FINANCE_GUIDE.md` |
| API errors | `hrms-client/docs/api/API_ERROR_RESPONSE_GUIDE.md` |
| Resend email verification | `docs/resend-email-verification-architecture-report.md` |
| Resend deployment runbook | `docs/runbooks/resend-email-verification-deployment.md` |

## Production Readiness Principles

- Production must use real backend APIs, not mock fallback.
- Production must not run seed/demo data.
- Production media uploads must use configured Cloudinary credentials with mock uploads disabled.
- Production email delivery must use verified Resend sender/domain configuration.
- Backend validation, OpenAPI docs, contract checks, route coverage, frontend build, and targeted E2E coverage should pass before release.
- User-facing actions should show success only after a confirmed backend success response.
- Sensitive values must live in environment files or secret stores, not in source code.

## Git Layout

This monorepo preserves the previous backend and frontend histories through subtree imports:

- `hrms_backend/` came from the former backend repo.
- `hrms-client/` came from the former frontend repo.
- `docs/` contains the root product documentation that was previously outside Git.

Going forward, new product changes should be made and reviewed from this root repository.
