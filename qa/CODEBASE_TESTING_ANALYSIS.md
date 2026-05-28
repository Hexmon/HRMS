# Codebase Testing Analysis

Scope: Hawkaii HRMS monorepo at `/Users/anuragkumar/Desktop/hawkaii-hrms`.

Constraint note: this is an analysis artifact, not the final testing checklist. It separates rules directly proven from code/docs from inferred product behavior and unresolved business questions.

## 1. Product Summary

### What This App Appears To Do

Hawkaii HRMS is a full-stack workforce operating system covering HR administration, authentication and workspace onboarding, employee self-service, attendance, leave/WFH, EMS, timesheets, expenses, documents/media, projects/utilization, assets, helpdesk, notifications, reports, and admin governance.

Code/doc evidence:

- Root product README says the repository contains backend API, frontend app, and docs, and describes the same modules in `README.md`.
- Backend is Fastify/TypeScript/PostgreSQL/Valkey with modules registered in `hrms_backend/src/app.ts`.
- Frontend is TanStack Start/React with routes under `hrms-client/src/routes/_app`.
- Backend OpenAPI contract exists at `hrms_backend/docs/api/openapi.json` and currently contains 245 operations across 214 paths.
- Product implementation status is tracked in `docs/implementation/HRMS_PRODUCTION_TASK_SHEET.md` and `hrms_backend/docs/implementation/HRMS_PRODUCTION_TASK_SHEET.md`.

### Main User Types / Personas

Proven from backend code:

- `Employee`
- `Reviewer`
- `Director`
- `Finance Manager`
- `Admin`
- `Auditor`
- `Asset Manager`
- `HR Manager`

Evidence: `hrms_backend/src/shared/constants.ts` exports `Roles`.

Proven from frontend code:

- `main_admin`
- `hr_admin`
- `employee`
- `manager`
- `project_manager`
- `finance_manager`
- `asset_admin`
- `helpdesk_agent`

Evidence: `hrms-client/src/lib/mock/roles.ts` exports frontend `Role` and `ROLE_MAP`.

Important mismatch:

- Backend has `Auditor` and `Director`; frontend role map does not expose `auditor` or `director` as direct role keys.
- Frontend maps API roles in `hrms-client/src/lib/auth.tsx`: `Reviewer` and `Director` map to local `manager`; `Admin` maps to local `main_admin`; `HR Manager` maps to local `hr_admin`; `Asset Manager` maps to local `asset_admin`.

### Main Business Goals

Proven from code/docs:

- Single role-aware workspace and one login for all personas.
- Backend API is source of truth; frontend route guards are UX only.
- Production must use real backend APIs, not mock fallback.
- Employee self-service covers attendance, EMS, leave/WFH, expenses, assets, helpdesk, timesheets, and documents.
- Admin settings manage company profile, master data, RBAC, workflows, policies, email templates, notifications, security, and audit logs.
- Finance workflow controls expense verification, payment release, bills, settlement, finance reports, and manager backup/finance governance.

Evidence:

- `README.md`
- `hrms_backend/docs/api/frontend-contract/BUSINESS_RULES.md`
- `hrms_backend/docs/api/API_ROLE_ENDPOINT_MATRIX.md`
- `hrms_backend/docs/api/API_EXPENSE_WORKFLOW_GUIDE.md`
- `hrms-client/src/shared/api/config.ts`

## 2. Feature / Screen Map

### Authentication, Email Verification, Password Reset, Workspace Onboarding

User goal:

- Sign up a workspace, verify email, set password, bootstrap company, log in, log out, recover password, and restore current session.

Main files/components/routes:

- Frontend routes: `hrms-client/src/routes/login.tsx`, `signup.tsx`, `verify-email.tsx`, `set-password.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `onboarding.tsx`.
- Frontend state/API: `hrms-client/src/lib/auth.tsx`, `hrms-client/src/domains/auth/api.ts`.
- Backend routes/service/schemas: `hrms_backend/src/modules/auth/routes.ts`, `service.ts`, `schemas.ts`.
- Backend auth/session utilities: `hrms_backend/src/auth/index.ts`, `hrms_backend/src/plugins/auth.ts`, `hrms_backend/src/plugins/config.ts`.
- Email delivery: `hrms_backend/src/platform/email/email-delivery-service.ts`, `resend-email-provider.ts`, `resend-webhook-service.ts`.

APIs or services used:

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/email-verifications/resend`
- `POST /api/v1/auth/set-password`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `PATCH /api/v1/auth/session/preference`
- `POST /api/v1/onboarding/company-logo`
- `POST /api/v1/onboarding/company-bootstrap`
- `POST /api/v1/webhooks/resend`

Data/state dependencies:

- `core.users`
- `platform.user_credentials`
- `platform.user_sessions`
- `platform.auth_tokens`
- `platform.company_profiles`
- `platform.email_deliveries`
- `platform.email_events`
- Frontend local fallback keys in `hrms-client/src/lib/auth.tsx` when API is disabled or mock fallback is enabled.

Business rules found in code:

- Password hashing uses Node `scryptSync`; evidence: `hrms_backend/src/auth/index.ts`.
- JWT signing is custom HMAC-SHA256; evidence: `createJwt` and `verifyJwt` in `hrms_backend/src/auth/index.ts`.
- Session cookie name comes from config and auth also accepts bearer token; evidence: `hrms_backend/src/plugins/auth.ts`.
- Unverified signup users are inactive until verification/set-password; evidence: `hrms_backend/src/modules/auth/service.ts` and `core.users.email_verification_status` fields in `hrms_backend/src/db/schema.ts`.
- Email verification relies on app-owned token records, not Resend webhook events; evidence: `hrms_backend/src/modules/auth/service.ts` and `hrms_backend/src/platform/email/resend-webhook-service.ts`.
- Production config requires secure email/storage posture; evidence: `hrms_backend/src/plugins/config.ts`.
- Frontend clears auth state on API 401; evidence: `hrms-client/src/lib/auth.tsx` and `hrms-client/src/shared/api/client.ts`.

Edge cases found in code:

- Expired, used, revoked, or invalid auth tokens.
- Resend verification cooldown/hourly/daily limits.
- Production responses must not expose raw tokens; non-production may expose `dev_only` tokens.
- Logout ignores backend logout failure client-side and clears local state.
- API mode can fall back to mock only when explicitly enabled and error is considered unavailable, not a business error.
- Resend webhook signature validation and event deduplication.

Missing or unclear business rules:

- Whether `/docs` Swagger UI should remain public in production.
- Whether link scanners should be allowed to auto-trigger email verification.
- Whether existing active users should always be backfilled verified in every production migration scenario.

### Dashboard

User goal:

- See role-appropriate summary, alerts, approvals, attendance punch status, notifications, and shortcuts.

Main files/components/routes:

- Frontend route: `hrms-client/src/routes/_app/dashboard.tsx`.
- Dashboard components: `hrms-client/src/components/dashboards/*`.
- Backend: `hrms_backend/src/modules/dashboard/routes.ts`, `service.ts`.
- Frontend API: `hrms-client/src/domains/dashboard/api.ts`, `queries.ts`.

APIs or services used:

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/notifications`
- `GET /api/v1/notifications/unread-count`
- Attendance APIs are used by employee attendance widgets.

Data/state dependencies:

- Role/session context from `/api/v1/auth/me`.
- Attendance daily records and punch events.
- Expenses, leave/WFH, timesheets, assets, projects, users, notifications.

Business rules found in code:

- Dashboard service uses actor role and hierarchy to scope cards and pending work.
- Employee dashboard has been modified to focus on punch in/out, break, today time, break time, and target time.
- Active role from backend session drives frontend sidebar and dashboard rendering.

Edge cases found in code:

- Dashboard data can be partially empty for newly bootstrapped workspaces.
- Unauthorized API responses should clear the session.
- Employee attendance widgets rely on live attendance calculations and policy windows.

Missing or unclear business rules:

- Exact KPI set expected per role is partly product/UI-driven and not fully formalized in backend docs.
- Whether admin dashboard should show organization-wide seeded/demo data after empty production workspace setup is unclear.

### Employees / Core User Administration

User goal:

- Search, create, update, activate/deactivate employees, manage login, assign roles, upload profile photos, inspect role history, audit trail, exports/import jobs, and hierarchy.

Main files/components/routes:

- Frontend routes: `hrms-client/src/routes/_app/employees.tsx`, `employees.$id.tsx`.
- Frontend API: `hrms-client/src/domains/core/api.ts`, `mapper.ts`, `queries.ts`.
- Backend: `hrms_backend/src/modules/core/routes.ts`, `service.ts`, `schemas.ts`.
- Data model: `core.users`, `core.departments`, `core.designations`, `core.roles`, `core.user_roles` in `hrms_backend/src/db/schema.ts`.

APIs or services used:

- `/api/v1/core/master-data/org-selectors`
- `/api/v1/core/users`
- `/api/v1/core/users/{id}`
- `/api/v1/core/users/{id}/profile-photo`
- `/api/v1/core/users/profile-photo-policy`
- `/api/v1/core/users/{id}/activate`
- `/api/v1/core/users/{id}/deactivate`
- `/api/v1/core/users/{id}/login/enable`
- `/api/v1/core/users/{id}/login/disable`
- `/api/v1/core/users/{id}/roles`
- `/api/v1/core/users/{id}/roles/history`
- `/api/v1/core/users/{id}/audit`
- `/api/v1/core/users/imports`
- `/api/v1/core/users/imports/{job_id}`
- `/api/v1/core/users/exports`
- `/api/v1/core/users/{id}/subtree`

Data/state dependencies:

- Users, roles, credentials, departments, designations, outbox/audit events, document storage for profile photos.

Business rules found in code:

- Unique employee code and email are enforced in DB schema.
- Employment status values are `active`, `inactive`, `terminated`, `suspended`.
- Profile photo upload uses backend policy and Cloudinary-backed document storage.
- Hierarchy path controls scoped visibility in attendance, leave/WFH, EMS, and project access.

Edge cases found in code:

- Optimistic concurrency via `expected_version` on mutations.
- Duplicate employee code/email can trigger conflict or DB errors if not normalized.
- Profile photo upload/delete must update both document metadata and user profile fields.
- Employee import currently records job metadata; row parsing/commit is not fully proven from code.

Missing or unclear business rules:

- Exact employee import preview/commit rules are unclear.
- Whether terminated/suspended users retain document/read access is unclear.
- Whether employees can update their own profile photo outside EMS route is product-confirmed by current implementation but should be verified with business.

### EMS / Employee Self-Service

User goal:

- View/update personal profile, upload employee documents, raise profile/service requests, view letters, acknowledge policies, and let HR/Admin handle onboarding/probation/exits/policies/letters.

Main files/components/routes:

- Frontend routes: `hrms-client/src/routes/_app/ems*.tsx`.
- Frontend API: `hrms-client/src/domains/ems/api.ts`, `queries.ts`, `mapper.ts`.
- Backend: `hrms_backend/src/modules/ems/routes.ts`, `service.ts`, `policy.ts`, `repository.ts`.
- Data model: EMS tables in `hrms_backend/src/db/schema.ts`.

APIs or services used:

- `/api/v1/ems/profile/me`
- `/api/v1/ems/profile-change-requests`
- `/api/v1/ems/profile-change-requests/my`
- `/api/v1/ems/profile-change-requests/queue/hr`
- `/api/v1/ems/profile-change-requests/{id}/decision`
- `/api/v1/ems/requests`
- `/api/v1/ems/requests/my`
- `/api/v1/ems/requests/queue/hr`
- `/api/v1/ems/requests/{id}/decision`
- `/api/v1/ems/admin/onboarding`
- `/api/v1/ems/admin/probation`
- `/api/v1/ems/admin/exits`
- `/api/v1/ems/letters`
- `/api/v1/ems/letters/{id}/acknowledge`
- `/api/v1/ems/policies`
- `/api/v1/ems/policies/{id}/acknowledge`
- `/api/v1/ems/policies/{id}`
- `/api/v1/ems/employees/{user_id}/documents`

Data/state dependencies:

- EMS profile records, profile change requests, service requests, letters, policies, acknowledgements, checklists, probation reviews, documents.

Business rules found in code:

- EMS access is self, hierarchy, HR/Admin, or Auditor; evidence: `hrms_backend/src/modules/ems/policy.ts`.
- HR/Admin can manage EMS queues.
- Self-approval is blocked for profile change decisions.
- Policy acknowledgement has pending/acknowledged states.
- EMS documents reuse Documents module as source of truth.

Edge cases found in code:

- Duplicate pending profile change request.
- Restricted fields may require change request rather than direct update.
- Document upload/delete/download permissions are classification-aware.
- Letter generation may depend on service request approval.

Missing or unclear business rules:

- Which profile fields are directly editable vs. HR approval required needs a business-approved matrix.
- Whether policy acknowledgement is mandatory before access to other modules is unclear.

### Attendance

User goal:

- Punch in, start/end break, punch out, see today/week/month attendance, submit regularization, and let managers/HR/Admin decide exceptions.

Main files/components/routes:

- Frontend routes: `hrms-client/src/routes/_app/attendance*.tsx`.
- Frontend live helper: `hrms-client/src/domains/attendance/live.ts`.
- Frontend API: `hrms-client/src/domains/attendance/api.ts`, `queries.ts`.
- Backend: `hrms_backend/src/modules/attendance/routes.ts`, `service.ts`, `policy.ts`.
- Shared scheduling logic: `hrms_backend/src/platform/work-schedule.ts`, `hrms-client/src/lib/work-schedule.ts`.

APIs or services used:

- `/api/v1/attendance/punches`
- `/api/v1/attendance/punches/my`
- `/api/v1/attendance/summary/my`
- `/api/v1/attendance/summary/team`
- `/api/v1/attendance/calendar/monthly`
- `/api/v1/attendance/calendar/daily`
- `/api/v1/attendance/regularizations`
- `/api/v1/attendance/regularizations/my`
- `/api/v1/attendance/regularizations/queue/manager`
- `/api/v1/attendance/regularizations/{id}/decision`
- `/api/v1/attendance/exceptions`
- `/api/v1/attendance/exports`

Data/state dependencies:

- `attendance.punch_events`
- `attendance.daily_records`
- `attendance.regularization_requests`
- Admin attendance policies
- Company working days
- Holidays and leave/WFH state for derived attendance status

Business rules found in code:

- Punch event types: `check_in`, `break_start`, `break_end`, `check_out`.
- Day statuses: `present`, `late`, `absent`, `wfh`, `leave`, `weekend`, `holiday`, `future`.
- Regularization statuses: `pending`, `approved`, `returned`, `rejected`.
- Admin-configurable punch windows and off-day punch permission are enforced by backend attendance service.
- Attendance visibility is self, reporting hierarchy, HR/Admin/Auditor.
- Self-approval for regularization is blocked.

Edge cases found in code:

- Timezone-sensitive work date calculation.
- Future records should not appear as actual worked days.
- Late minutes over 60 need human-readable hour/min display.
- Work and break totals update live in frontend and must reconcile with persisted backend records.
- Refresh should preserve correct route and data from backend.

Missing or unclear business rules:

- Expected hours/target per shift vs. global company policy need a final business rule.
- Whether punch-out can occur after midnight and how it maps to work date is unclear.
- Whether off-day punch creates overtime, regular day, or exception needs business decision.

### Leave, WFH, and Holidays

User goal:

- View balances, apply leave/WFH, cancel requests, manager/HR approve/return/reject, monitor HR view, manage holidays, export.

Main files/components/routes:

- Frontend routes: `hrms-client/src/routes/_app/leave-wfh*.tsx`.
- Frontend API: `hrms-client/src/domains/leave-wfh/api.ts`, `queries.ts`.
- Backend: `hrms_backend/src/modules/leave-wfh/routes.ts`, `service.ts`, `policy.ts`.
- Data model: `leave_wfh.leave_requests`, `wfh_requests`, `holidays`.

APIs or services used:

- `/api/v1/leave/balances/my`
- `/api/v1/leave/balances/{user_id}`
- `/api/v1/leave/requests`
- `/api/v1/leave/requests/my`
- `/api/v1/leave/requests/queue/manager`
- `/api/v1/leave/requests/{id}/decision`
- `/api/v1/leave/requests/{id}/cancel`
- `/api/v1/wfh/requests`
- `/api/v1/wfh/requests/my`
- `/api/v1/wfh/requests/queue/manager`
- `/api/v1/wfh/requests/{id}/decision`
- `/api/v1/leave-wfh/hr-monitor`
- `/api/v1/leave-wfh/exports`
- `/api/v1/holidays`
- `/api/v1/holidays/{id}`

Data/state dependencies:

- Leave balances are generated/derived from policy and leave requests.
- Work days/holidays affect attendance views.
- WFH approved dates affect attendance daily status.

Business rules found in code:

- Leave/WFH statuses: `pending_manager`, `approved`, `returned`, `rejected`, `cancelled`.
- Self-approval blocked.
- HR/Admin can monitor and mutate holidays; Auditor can monitor.
- Request visibility is self, reporting hierarchy, HR/Admin/Auditor.

Edge cases found in code:

- Half-day duration.
- Date range duration.
- Returned/rejected decisions require remarks per docs.
- Cancellation rules depend on current status.

Missing or unclear business rules:

- Leave accrual/carry-forward policy is not fully business-specified in inspected files.
- Holiday regional behavior and optional holiday entitlement rules need confirmation.

### Timesheets

User goal:

- Log work segments, submit cycle timesheets, approve/return/reject as configured approver, view project summaries, missing submissions, productivity, selectors.

Main files/components/routes:

- Frontend routes: `hrms-client/src/routes/_app/timesheet*.tsx`.
- Frontend API: `hrms-client/src/domains/timesheets/api.ts`, `queries.ts`.
- Backend: `hrms_backend/src/modules/timesheets/routes.ts`, `service.ts`, `policy.ts`, `state-machine.ts`.
- Data model: `timesheets.work_segments`, `workflow_definitions`, `timesheet_submissions`, `timesheet_approval_actions`.

APIs or services used:

- `/api/v1/timesheets/work-segments`
- `/api/v1/timesheets/submissions`
- `/api/v1/timesheets/submissions/my`
- `/api/v1/timesheets/queue/approver`
- `/api/v1/timesheets/projects/summary`
- `/api/v1/timesheets/missing-submissions`
- `/api/v1/timesheets/productivity-summary`
- `/api/v1/timesheets/selectors`
- `/api/v1/timesheets/submissions/{id}`
- `/api/v1/timesheets/submissions/{id}/approve`
- `/api/v1/timesheets/workflow-definitions`

Data/state dependencies:

- Work segments, project membership, workflow definitions, approval actions, admin timesheet policies.

Business rules found in code:

- Timesheet transitions: Draft -> Submitted/Pending Approval; Submitted -> Pending Approval; Pending Approval -> Approved/Returned/Rejected; Returned -> Submitted/Pending Approval; Approved/Rejected terminal.
- Only owner/Admin can access owner-only timesheets.
- Only current approver/Admin can approve.

Edge cases found in code:

- Duplicate submission cycle uniqueness.
- Expected hours and missing submission calculations.
- Returned submissions can be resubmitted.
- Version conflicts on approval.

Missing or unclear business rules:

- Expected hours source: attendance policy, company working days, project allocation, or timesheet policy needs confirmation.
- Whether rejected timesheets can be cloned/reopened is unclear.

### Expenses and Finance

User goal:

- Employee raises draft expense, submits it, manager verifies/returns/rejects, finance approves/holds/asks clarification, payment is released, bills/documents are submitted and verified, settlement closes the ticket.

Main files/components/routes:

- Frontend routes: `hrms-client/src/routes/_app/expenses*.tsx`.
- Frontend API: `hrms-client/src/domains/expenses/api.ts`, `queries.ts`.
- Backend: `hrms_backend/src/modules/expenses/routes.ts`, `service.ts`, `policy.ts`, `state-machine.ts`.
- Reports: `hrms_backend/src/modules/reports/service.ts`.
- Finance governance: `hrms_backend/src/modules/platform/routes.ts`, `service.ts`.

APIs or services used:

- `/api/v1/expenses`
- `/api/v1/expenses/my`
- `/api/v1/expenses/metadata`
- `/api/v1/expenses/dashboard-summary`
- `/api/v1/expenses/{id}`
- `/api/v1/expenses/{id}/submit`
- `/api/v1/expenses/{id}/withdraw`
- `/api/v1/expenses/{id}/clarifications`
- `/api/v1/expenses/queue/manager`
- `/api/v1/expenses/{id}/manager/verify`
- `/api/v1/expenses/queue/finance`
- `/api/v1/expenses/{id}/finance-detail`
- `/api/v1/expenses/{id}/finance/approve`
- `/api/v1/expenses/{id}/finance/payment`
- `/api/v1/expenses/{id}/bills`
- `/api/v1/expenses/{id}/documents/{documentId}/verify`
- `/api/v1/expenses/{id}/settlement`
- `/api/v1/expenses/{id}/timeline`
- `/api/v1/expenses/{id}/audit`
- `/api/v1/manager-backups`
- `/api/v1/platform/finance-governance`
- Expense reports under `/api/v1/reports/expenses/*`.

Data/state dependencies:

- `expenses.expense_tickets`
- `expense_line_items`
- `expense_approvals`
- `expense_documents`
- `expense_payments`
- `expense_audit_logs`
- `expense_policy_rules`
- `employee_reviewer_mappings`
- Documents module
- Finance governance/admin configuration

Business rules found in code:

- Expense statuses and transitions are explicitly enforced in `hrms_backend/src/modules/expenses/state-machine.ts`.
- Manager action requires assigned manager or Admin; self-processing blocked.
- Finance action requires assigned Finance Manager or Admin; self-processing blocked.
- Read access is requester, assigned manager, assigned finance, Admin, or Auditor.
- Required document types are defined by expense subtype in `hrms_backend/src/shared/constants.ts`.
- Cost center is nullable/optional in project and expense-related frontend payloads after recent changes; it is for later finance/reporting.
- Versioning/expected_version applies to workflow mutations.

Edge cases found in code:

- Admin, manager, and finance user creating their own expense creates self-processing routing risk.
- Manager/finance backup assignment is effective-dated and can determine approver.
- Return/reject/hold/clarification decisions require remarks per docs.
- Finance cannot approve before manager verification.
- Settlement is blocked if required documents are missing/unverified when policy requires them.
- Page size capped at 100 by backend validation.

Missing or unclear business rules:

- Exact routing when only one manager and one finance manager exist and one of them is requester must be finalized.
- Whether Director remains part of live approval flow is unclear: docs say preserve Manager -> Finance vocabulary, but backend still has `Director` role.
- Whether Admin-created expenses should route to a non-admin reviewer or be blocked needs explicit business decision.

### Documents and Media Storage

User goal:

- Upload, replace, list, verify, download, access-log, and delete documents/media for EMS, expenses, projects, helpdesk, employee profile photos, company logos, and reports.

Main files/components/routes:

- Frontend API: `hrms-client/src/domains/documents/api.ts`, shared upload helpers in `hrms-client/src/shared/uploads`.
- Backend: `hrms_backend/src/modules/documents/routes.ts`, `service.ts`, `policy.ts`.
- Object storage: `hrms_backend/src/platform/object-storage.ts`.
- PDF compression: `hrms_backend/src/platform/pdf-compression.ts`.

APIs or services used:

- `/api/v1/documents/upload-policy`
- `/api/v1/documents`
- `/api/v1/expenses/{id}/documents`
- `/api/v1/documents/{id}`
- `/api/v1/documents/{id}/download-url`
- `/api/v1/documents/{id}/content`
- `/api/v1/documents/{id}/verify`
- `/api/v1/documents/{id}/access-log`
- EMS wrapper and profile photo/company logo upload APIs.

Data/state dependencies:

- Document metadata/versions/permissions/access logs.
- Cloudinary object storage or mock Cloudinary in local/demo.
- Media upload policy from backend config.

Business rules found in code:

- Frontend never receives storage credentials.
- Document access is classification-based.
- Medical/compensation are restricted to HR/Admin/Auditor-like access.
- Finance Manager/Director/Asset Manager can read non-restricted linked documents.
- Profile photo and company logo have stricter image policies.
- PDF compression is server-side and fail-open by config.
- Cloudinary mock URLs are not browser-openable, so backend content route is used when required.

Edge cases found in code:

- Mock Cloudinary stores bytes in process only; uploaded documents may disappear after restart.
- Deleted documents are soft-deleted and storage object is removed.
- Download URL should not leak credentials.
- Unsupported MIME/oversize files fail with validation-style errors.

Missing or unclear business rules:

- Document retention period and legal hold behavior are not found.
- Whether deleted documents should be recoverable is unclear.

### Projects and Team Utilization

User goal:

- Create/manage projects, members, allocations, milestones/modules, documents, summaries, project reports, and team utilization/bench/overload.

Main files/components/routes:

- Frontend routes: `hrms-client/src/routes/_app/projects.tsx`, `projects.$id.tsx`, `team-utilization.tsx`, report routes.
- Frontend API: `hrms-client/src/domains/projects/api.ts`.
- Backend: `hrms_backend/src/modules/projects/routes.ts`, `service.ts`, `policy.ts`.
- Data model: `projects.projects`, `project_members`, `project_allocations`, `project_milestones`.

APIs or services used:

- `/api/v1/projects`
- `/api/v1/projects/{id}`
- `/api/v1/projects/{id}/archive`
- `/api/v1/projects/{id}/members`
- `/api/v1/projects/{id}/allocations`
- `/api/v1/projects/{id}/milestones`
- `/api/v1/projects/{id}/documents`
- `/api/v1/projects/{id}/summary`
- `/api/v1/team-utilization/summary`
- `/api/v1/reports/projects/summary`

Data/state dependencies:

- Users, departments, project records, members, allocations, timesheets, documents, reports.

Business rules found in code:

- Portfolio roles Admin, HR Manager, Auditor, and Finance Manager can see project portfolio.
- Project manager/Admin can mutate project.
- Members and reporting hierarchy can see scoped projects.
- Project status values include planned, active, on_hold, completed, cancelled, archived.
- Project member statuses are active/removed.

Edge cases found in code:

- Allocation percentages can create overload.
- Archived project should restrict mutations except allowed status actions.
- Cost center is nullable and reserved for finance/reporting.

Missing or unclear business rules:

- Maximum allocation percent and whether allocation over 100 percent is blocked or merely reported needs confirmation.
- Whether Finance Manager should see all projects or only cost-center/billing views needs confirmation.

### Assets

User goal:

- Manage asset inventory, assignments, returns, scan QR, license lifecycle, requests, acknowledgements, maintenance, vendors, warranty alerts, and recovery settlement.

Main files/components/routes:

- Frontend routes: `hrms-client/src/routes/_app/assets*.tsx`.
- Frontend API: `hrms-client/src/domains/assets/api.ts`, `queries.ts`.
- Backend: `hrms_backend/src/modules/assets/routes.ts`, `service.ts`, `policy.ts`, `state-machine.ts`.
- Data model: asset tables in `hrms_backend/src/db/schema.ts`.

APIs or services used:

- `/api/v1/assets`
- `/api/v1/assets/warranty-alerts`
- `/api/v1/assets/{id}`
- `/api/v1/assets/{id}/assign`
- `/api/v1/assets/{id}/return`
- `/api/v1/assets/scan/{qr_hash}`
- `/api/v1/assets/licenses/*`
- `/api/v1/assets/events/employee-terminated`
- `/api/v1/assets/requests`
- `/api/v1/assets/requests/my`
- `/api/v1/assets/requests/queue`
- `/api/v1/assets/requests/{id}/decision`
- `/api/v1/assets/requests/{id}/cancel`
- `/api/v1/assets/{id}/acknowledgements`
- `/api/v1/assets/{id}/maintenance`
- `/api/v1/assets/vendors`
- `/api/v1/assets/recovery-queue`
- `/api/v1/assets/recovery-queue/{id}/settlement`

Data/state dependencies:

- Assets, assignments, recovery tickets, requests, acknowledgements, maintenance records, vendors, license entitlements/activations, compromised keys.

Business rules found in code:

- Asset mutations require Asset Manager or Admin.
- Asset transitions are enforced in `hrms_backend/src/modules/assets/state-machine.ts`.
- Public QR scan is intentionally limited.
- Termination event can move assigned assets into recovery pending.
- Recovery settlement statuses include `recovered`, `deduction`, `waived`, `lost_damaged`.

Edge cases found in code:

- Lost/stolen and retired are terminal asset states.
- Maintenance can return stock or retire asset.
- Recovery settlement must update ticket, asset, and assignment state consistently.
- License validation/activation/revocation can affect asset feature viability.

Missing or unclear business rules:

- Whether employee can dispute asset recovery/deduction is unclear.
- Warranty automation/renewal notification cadence needs business sign-off.

### Helpdesk

User goal:

- Create support tickets, view own tickets, manage queue, add comments/internal notes/attachments, assign, change priority/status, resolve/close/reopen, manage categories, view SLA/reporting.

Main files/components/routes:

- Frontend routes: `hrms-client/src/routes/_app/helpdesk*.tsx`.
- Frontend API: `hrms-client/src/domains/helpdesk/api.ts`, `queries.ts`.
- Backend: `hrms_backend/src/modules/helpdesk/routes.ts`, `service.ts`, `policy.ts`.
- Data model: helpdesk tables in `hrms_backend/src/db/schema.ts`.

APIs or services used:

- `/api/v1/helpdesk/tickets`
- `/api/v1/helpdesk/tickets/{id}`
- `/api/v1/helpdesk/tickets/{id}/comments`
- `/api/v1/helpdesk/tickets/{id}/internal-notes`
- `/api/v1/helpdesk/tickets/{id}/attachments`
- `/api/v1/helpdesk/tickets/{id}/assign`
- `/api/v1/helpdesk/tickets/{id}/priority`
- `/api/v1/helpdesk/tickets/{id}/status`
- `/api/v1/helpdesk/tickets/{id}/resolve`
- `/api/v1/helpdesk/tickets/{id}/close`
- `/api/v1/helpdesk/tickets/{id}/reopen`
- `/api/v1/helpdesk/categories`
- `/api/v1/helpdesk/sla-report`

Data/state dependencies:

- Categories, tickets, comments, attachments, ticket events, users, documents.

Business rules found in code:

- Category scope for non-admin managers is role-based: Asset Manager sees IT/Admin/Assets, HR Manager sees HR, Finance Manager sees Finance.
- Ticket requester or assignee can see ticket; Admin can see all; scoped category managers can see category tickets.
- Requester or manager can close/reopen.
- Internal notes are separate endpoint from public comments.

Edge cases found in code:

- Reopen count, escalated flag, first response time, resolution/closed timestamps.
- Category default assignee drives routing.
- Attachments may reference documents.

Missing or unclear business rules:

- SLA thresholds and breach escalation rules are configurable but exact operational escalation path is unclear.
- Whether Helpdesk Agent frontend persona maps to backend role is unclear; backend does not define `Helpdesk Agent`.

### Reports and Exports

User goal:

- View role-scoped HR, attendance, leave/WFH, projects, timesheets, expenses, assets, helpdesk, audit reports; create export jobs and download generated documents.

Main files/components/routes:

- Frontend routes: `hrms-client/src/routes/_app/reports*.tsx`, expense report routes.
- Frontend API: `hrms-client/src/domains/reports/api.ts`, `queries.ts`.
- Backend: `hrms_backend/src/modules/reports/routes.ts`, `service.ts`, `policy.ts`.
- Export generator: `hrms_backend/src/platform/generated-exports.ts`.

APIs or services used:

- `/api/v1/reports/hr/employees`
- `/api/v1/reports/attendance/summary`
- `/api/v1/reports/leave-wfh/summary`
- `/api/v1/reports/projects/summary`
- `/api/v1/reports/timesheets/summary`
- `/api/v1/reports/assets/summary`
- `/api/v1/reports/helpdesk/summary`
- `/api/v1/reports/audit`
- `/api/v1/reports/expenses/*`
- `/api/v1/reports/exports`
- `/api/v1/reports/exports/{id}`

Data/state dependencies:

- Cross-module data, role scope, generated export documents.

Business rules found in code:

- Reports are role-scoped.
- Some report endpoints are finance/admin/auditor-only.
- Export creation can generate document-backed CSV/JSON/XLSX files.
- Backend page size validation caps list sizes.

Edge cases found in code:

- Requesting `page_size` over 100 returns validation failure.
- Export jobs can fail if object storage is not configured.
- Audit/report endpoints must not bypass module permissions.

Missing or unclear business rules:

- Export retention cleanup and scheduled exports are mentioned as hardening but final policy is unclear.
- Exact fields required for client UAT report parity need sign-off.

### Admin Settings

User goal:

- Configure company profile/logo, master data, roles/permissions, workflow configurations, policies, email templates, notification channels, security, audit logs, finance governance, manager backups, and timesheet workflow definitions.

Main files/components/routes:

- Frontend routes: `hrms-client/src/routes/_app/admin-settings*.tsx`.
- Frontend store/API: `hrms-client/src/lib/admin-settings-store.tsx`, `hrms-client/src/domains/admin/api.ts`, `queries.ts`.
- Backend: `hrms_backend/src/modules/admin/routes.ts`, `service.ts`, `policy.ts`, `schemas.ts`.
- Admin config tables in `hrms_backend/src/db/schema.ts`.

APIs or services used:

- `/api/v1/admin/company-profile`
- `/api/v1/admin/company-profile/logo`
- `/api/v1/admin/master-data/departments`
- `/api/v1/admin/master-data/designations`
- `/api/v1/admin/master-data/{master_key}`
- `/api/v1/admin/rbac/roles`
- `/api/v1/admin/rbac/permissions`
- `/api/v1/admin/rbac/roles/{id}/permissions`
- `/api/v1/admin/workflows`
- `/api/v1/admin/policies`
- `/api/v1/admin/email-templates`
- `/api/v1/admin/notification-channels`
- `/api/v1/admin/audit-log`
- `/api/v1/admin/security-settings`
- `/api/v1/platform/finance-governance`
- `/api/v1/manager-backups`
- `/api/v1/timesheets/workflow-definitions`

Data/state dependencies:

- Company profile, departments/designations, extended master data, roles/permissions, admin workflows, admin policies, templates, notification channels, security settings, outbox audit events, finance governance, backup mappings.

Business rules found in code:

- Admin-only for company settings, RBAC, workflow, policies, email templates, notification channels, security.
- Admin or HR Manager can manage master data.
- Admin or Auditor can read admin audit logs.
- Push notifications are not active provider-backed delivery.
- Admin attendance policy includes punch windows and off-day punching behavior.

Edge cases found in code:

- Refresh should preserve active tab via query params for some pages.
- Workflow configs persist in Admin settings but docs say runtime approval engines may not yet use every workflow config.
- Company logo uses backend document upload policy and Cloudinary storage.

Missing or unclear business rules:

- Which admin workflow and policy changes must immediately affect runtime engines is unclear.
- Whether custom RBAC permissions fully override hard-coded backend role policies is unclear.

### Notifications

User goal:

- See notifications, unread count, mark individual/all notifications read.

Main files/components/routes:

- Frontend topbar: `hrms-client/src/components/topbar.tsx`.
- Frontend API: `hrms-client/src/domains/notifications/api.ts`, `queries.ts`.
- Backend: `hrms_backend/src/modules/notifications/routes.ts`, `service.ts`, `repository.ts`.
- Admin notification settings: `hrms_backend/src/modules/admin/routes.ts`, notification channel APIs.

APIs or services used:

- `/api/v1/notifications`
- `/api/v1/notifications/unread-count`
- `/api/v1/notifications/{id}/read`
- `/api/v1/notifications/read-all`

Data/state dependencies:

- `platform.notifications`
- Outbox events may generate notification events.
- Admin notification channels configure in-app/email/push flags.

Business rules found in code:

- Notifications are authenticated and target-user scoped.
- Mark-read updates read status.
- Push delivery provider is not implemented as active external integration.

Edge cases found in code:

- Unread count must update after mark-read/read-all.
- Notification list must not leak another user's events.

Missing or unclear business rules:

- Which module events must create notifications is not fully documented as a complete matrix.

### Platform, Health, Infrastructure, Webhooks

User goal:

- Keep API healthy, protect API, integrate webhooks, operate storage/email/database/queue.

Main files/components/routes:

- Backend app/plugins: `hrms_backend/src/app.ts`, `plugins/config.ts`, `plugins/rate-limit.ts`, `plugins/security-headers.ts`, `plugins/errors.ts`.
- Health: `hrms_backend/src/modules/health/routes.ts`.
- Webhooks: `hrms_backend/src/modules/webhooks/resend-routes.ts`.
- Workers: `hrms_backend/src/workers/*`.

APIs or services used:

- `/health/live`
- `/health/ready`
- `/api/v1/health/live`
- `/api/v1/health/ready`
- `/api/v1/openapi.json`
- `/api/v1/webhooks/resend`

Data/state dependencies:

- PostgreSQL, Valkey, Cloudinary, Resend, Ghostscript for PDF compression, Docker/compose config.

Business rules found in code:

- Production forbids Cloudinary mock uploads.
- Production requires real JWT secrets and email delivery mode `send`.
- Rate limits apply by route class and subject.
- Webhook route is public but signature-protected.

Edge cases found in code:

- Sandbox/local environment can block DB/Valkey/tsx IPC, affecting tests.
- Cloudinary mock is process memory only.
- Resend webhook timestamp tolerance and signature failures return 400.

Missing or unclear business rules:

- Production monitoring/alerting thresholds are not fully specified in business docs.

## 3. User Role & Permission Matrix

### Backend Roles

| Role/persona | What they can do | What they cannot do | Code evidence | Unclear permission questions |
| --- | --- | --- | --- | --- |
| Employee | Create expenses, read own documents, punch attendance, manage own EMS/profile, create leave/WFH/timesheet/helpdesk/asset requests | Cannot approve own workflows; cannot admin-manage modules | `Roles.Employee` and `rolePermissions` in `hrms_backend/src/auth/index.ts`; self policies in module policy files | Should Employee see `/reports` at all for personal reports? |
| Reviewer | Expense create, manager verify, report read, document read; acts as manager in frontend | Cannot finance approve unless also Finance Manager; cannot self-approve | `Roles.Reviewer`, `assertManagerActor` | Is Reviewer exactly the same as Manager in business language? |
| Director | Backend role exists and maps to frontend manager; document read/report read/manager verify permissions | No separate frontend route/persona | `Roles.Director`, `API_ROLE_BY_NORMALIZED` maps director to `manager` | Is Director still part of approval chain or legacy only? |
| Finance Manager | Finance queue, finance approval/payment/settlement, reports, document verify/read | Cannot approve own expense; cannot manager-verify unless assigned role says so | `Roles.FinanceManager`, `assertFinanceActor`, finance routes | What is routing when Finance Manager submits own expense and no backup exists? |
| Admin | All backend permissions through `hasPermission`; manage admin settings; override many scopes | Self-processing is still blocked for expense workflow actions by policy | `Roles.Admin`, `hasPermission`, module policies | Should Admin be allowed to create expenses if no independent approver exists? |
| Auditor | Read audit/reports/documents, admin audit log | No mutation permissions | `Roles.Auditor`, admin/reports/documents policies | Frontend has no direct auditor persona key; should it? |
| Asset Manager | Asset CRUD/workflows, asset-related helpdesk scope, document read | Cannot HR/admin settings except scoped helpdesk/assets | `Roles.AssetManager`, `assertAssetManager`, helpdesk policy | Is `asset_admin` frontend equivalent to backend `Asset Manager`? |
| HR Manager | EMS, leave/WFH monitor/decision, master data, documents, HR reports | Cannot RBAC/security/admin workflow settings unless Admin | `Roles.HRManager`, EMS/leave/admin policies | Which admin settings should HR Manager see but not edit? |

### Frontend Personas

| Frontend role | Backend role mapping evidence | Main modules shown | Risk/unclear point |
| --- | --- | --- | --- |
| `main_admin` | maps from API `Admin` in `hrms-client/src/lib/auth.tsx` | all modules | Must ensure backend role is `Admin`, not just frontend label |
| `hr_admin` | maps from `HR Manager` | dashboard, employees, EMS, attendance, leave, timesheet, helpdesk, reports, admin settings | Frontend route visibility may exceed backend permissions for RBAC/security settings |
| `employee` | maps from `Employee` | dashboard, EMS, attendance, leave, timesheet, expenses, assets, helpdesk | Must not call restricted assets/finance/admin APIs from employee dashboard |
| `manager` | maps from `Reviewer`, `Director`, `Manager` strings | dashboard, employees, EMS, attendance, leave, projects, utilization, timesheet, expenses, helpdesk, reports | Backend does not define `Manager`; uses Reviewer/Director/hierarchy |
| `project_manager` | `BACKEND_ROLE_BY_LOCAL_ROLE` maps to `Reviewer` | projects, utilization, timesheets, reports | Backend project mutation is project-manager-by-project, not role key |
| `finance_manager` | maps from `Finance Manager` | expenses, timesheet, reports, helpdesk, EMS | Must not call Admin-only manager-backups from finance UI |
| `asset_admin` | maps from `Asset Manager` | assets, helpdesk, reports, EMS | OK if backend asset role exists |
| `helpdesk_agent` | no backend role mapping found in `BACKEND_ROLE_BY_LOCAL_ROLE` | helpdesk, reports, EMS | Backend helpdesk scope is based on Admin/HR/Asset/Finance, not Helpdesk Agent role |

## 4. Business Entity / Status Map

### User / Employee

Fields that matter for testing:

- `id`, `employee_code`, `email`, `full_name`, `department_id`, `designation_id`, `manager_user_id`, `hierarchy_path`, `employment_status`, `email_verified_at`, `email_verification_status`, `profile_photo_document_id`, `profile_photo_url`, `timezone`, `joined_on`, `terminated_on`, `deleted_at`, `version`.

Status values:

- Employment: `active`, `inactive`, `terminated`, `suspended`.
- Email verification: `unverified`, `pending`, `verified`, `bounced`, `blocked`.

Allowed transitions:

- Signup creates pending/inactive user.
- Email verification/set password can activate user.
- Admin APIs activate/deactivate and enable/disable login.

Blocked transitions:

- Inactive/unverified users cannot log in.
- Deleted users fail auth middleware.

Edge cases:

- Duplicate email/employee code.
- Active users after email migration/backfill.
- Role switch preference and frontend/backend role mapping.

Unclear rules:

- Suspension vs deactivation vs termination behavior across all modules.

### Auth Token / Session / Company Profile

Fields that matter:

- Token type/status/hash/expiry/used/revoked/sent counts; session JTI/expires/revoked; company slug/status/bootstrap completion/logo.

Status values:

- Token statuses are active/used/revoked in service records.
- Company status includes pending/active in onboarding service.

Allowed transitions:

- Signup -> verification token -> verify email -> password setup/bootstrap -> active workspace.
- Password reset token -> confirm -> revoke sessions.

Blocked transitions:

- Used/expired/revoked token reuse.
- Production raw token response.

Edge cases:

- Resend cooldown, duplicate pending signup, company slug conflict, stale bootstrap token.

Unclear rules:

- Whether an existing company can invite employees is present as input concept but full invitation lifecycle is not clear.

### Expense Ticket

Fields that matter:

- Ticket no, requester, department, type/subtype, project/client/task/location/date/amount/payment, manager verifier, finance approver, status, actual/variance/payment reference, route/policy/context snapshots, version, submitted/closed dates.

Status values:

- Draft, Submitted, Pending Manager Verification, Manager Returned, Manager Rejected, Manager Verified, Finance Hold, Clarification Required, Finance Approved, Payment Released, Bills Submitted, Pending Adjustment, Closed, Finance Routing Exception, Cancelled.

Allowed transitions:

- Defined in `hrms_backend/src/modules/expenses/state-machine.ts`.
- Draft -> Submitted/Cancelled.
- Submitted -> Pending Manager Verification/Cancelled.
- Pending Manager Verification -> Manager Verified/Returned/Rejected/Cancelled.
- Manager Verified -> Finance Approved/Finance Hold/Clarification Required.
- Finance Approved -> Payment Released.
- Payment Released -> Bills Submitted/Pending Adjustment/Closed.
- Bills Submitted -> Pending Adjustment/Closed.
- Pending Adjustment -> Closed.

Blocked transitions:

- Manager Rejected, Closed, Cancelled terminal.
- Finance approval before manager verification.
- Self-processing by requester for manager/finance/payment/settlement actions.

Edge cases:

- Only one manager/finance manager in organization.
- Admin or finance user raising own expense.
- Required documents not attached/verified.
- Stale version.

Unclear rules:

- Final fallback approver rules when backup is missing.

### Expense Payment / Settlement / Documents

Fields that matter:

- Payment type, approved amount, paid amount, payment date/mode/reference, settlement status/amount, processed by.
- Expense document type, verification status, uploaded by/at.

Status values:

- Payment/settlement statuses are service-driven; recovery settlement status also has explicit values in asset context.

Allowed transitions:

- Finance approval -> payment release -> bills -> settlement/closure.

Blocked transitions:

- Settlement blocked by missing/required docs when policy demands.
- Duplicate payment reference via unique index.

Edge cases:

- Advance vs reimbursement.
- Variance/actual amount mismatch.

Unclear rules:

- Accounting export/invoice integration does not appear present.

### Document / Media

Fields that matter:

- Business object type/id, owner, classification, document type, version, file/storage metadata, MIME, size, checksum, created/deleted timestamps.

Status values:

- Document active vs soft-deleted.
- Verification metadata exists in document metadata and expense document link.

Allowed transitions:

- Upload -> version record -> download/access-log/verify -> delete.

Blocked transitions:

- Classification access denies read/write/verify/audit.
- MIME/size policy violations.

Edge cases:

- Mock Cloudinary not persistent.
- Download URL fallback to backend content route.
- PDF compression fail-open.

Unclear rules:

- Retention/legal hold.

### Attendance Day / Punch / Regularization

Fields that matter:

- Punch event type/time/work mode/source; daily status, first check-in, last check-out, work/break/late/early-out minutes, exception type, regularization status.

Status values:

- Day: present, late, absent, wfh, leave, weekend, holiday, future.
- Regularization: pending, approved, returned, rejected.

Allowed transitions:

- Punch sequence drives day state.
- Regularization pending -> approved/returned/rejected.
- Approved regularization can clear exception and mark present/wfh.

Blocked transitions:

- Self regularization decision.
- Punch actions outside admin-configured punch windows unless policy allows.
- Off-day punch if policy disallows.

Edge cases:

- Timezone and midnight crossing.
- Live duration display vs persisted minutes.
- Working days configured by admin.

Unclear rules:

- Overtime/off-day attendance policy.

### Leave / WFH / Holiday

Fields that matter:

- Request code, employee, type, date range, half-day, duration, reason, documents, current approver, status, decision remarks.

Status values:

- pending_manager, approved, returned, rejected, cancelled.

Allowed transitions:

- Create -> pending -> approved/returned/rejected; returned may be resubmitted if service allows; request can be cancelled in allowed status.

Blocked transitions:

- Self decision.
- Holiday mutation by non-HR/Admin.

Edge cases:

- Date overlap, half-day, document-required leave types, region/optional holiday.

Unclear rules:

- Accrual and carry-forward.

### Timesheet

Fields that matter:

- Work segment date/project/task/hours/billable; submission cycle/date/status/total hours/workflow/current approver/version.

Status values:

- Draft, Submitted, Pending Approval, Approved, Returned, Rejected.

Allowed transitions:

- Defined in `hrms_backend/src/modules/timesheets/state-machine.ts`.

Blocked transitions:

- Non-owner access for owner-only views.
- Non-current approver approval.

Edge cases:

- Duplicate cycle submission.
- Returned resubmission.
- Missing submission detection.

Unclear rules:

- Expected hours source and billable target rules.

### Project / Allocation / Milestone

Fields that matter:

- Project code/name/client/type/billing/manager/department/dates/status/health/budget/hours/priority/cost center; members, allocations, milestones.

Status values:

- Project: planned, active, on_hold, completed, cancelled, archived.
- Health: green, amber, red.
- Member: active, removed.
- Milestone: planned, in_progress, completed, on_hold.

Allowed transitions:

- Project CRUD/update/archive is service controlled.
- Admin or assigned project manager can mutate.

Blocked transitions:

- Unauthorized non-member/non-portfolio access.

Edge cases:

- Over-allocation, bench users, archived projects with active allocations.

Unclear rules:

- Whether project budget/spend is validated against expenses/timesheets.

### Asset / License / Recovery

Fields that matter:

- Asset code/QR/type/name/serial/status/assigned user/metadata/version; requests, acknowledgements, maintenance, recovery settlement, vendor, license activation.

Status values:

- Asset: Procured, In Stock, Assigned, In Maintenance, Return Pending, Returned, Retired, Lost/Stolen.
- Recovery settlement: recovered, deduction, waived, lost_damaged.
- License: active, revoked, expired.

Allowed transitions:

- Defined in `hrms_backend/src/modules/assets/state-machine.ts`.

Blocked transitions:

- Invalid asset transitions.
- Non Asset Manager/Admin mutations.

Edge cases:

- Termination triggers recovery.
- Lost/stolen asset terminal path.
- Vendor uniqueness.

Unclear rules:

- Deduction approval/accounting flow.

### Helpdesk Ticket

Fields that matter:

- Ticket no, subject, description, category/subcategory, priority, status, requester, assignee, related asset/project, response/resolution/closed times, reopen count, escalated.

Status values:

- new, assigned, in_progress, on_hold, resolved, closed, reopened, escalated.

Allowed transitions:

- Service endpoints change assign, priority, status, resolve, close, reopen.

Blocked transitions:

- Non-scoped users cannot view/manage tickets.

Edge cases:

- Internal notes visibility.
- SLA breach/escalation.
- Category default assignee missing.

Unclear rules:

- SLA escalation ownership.

### EMS Entities

Entities:

- Employee profile, profile change request, service request, letter, policy, acknowledgement, onboarding/exit checklist, probation review.

Status values:

- Profile change: pending, approved, returned, rejected.
- Service request: pending, in_progress, approved, returned, rejected, closed.
- Letter: available, requested, in_progress, acknowledged.
- Policy acknowledgement: pending, acknowledged.

Allowed/blocked transitions:

- HR/Admin manages queues; self profile change decision blocked.

Edge cases:

- Profile change direct update vs approval request.
- Letter generated from approved service request.

Unclear rules:

- Mandatory onboarding/probation/exit steps.

### Admin Config / Notification / Report Export

Fields/statuses:

- Workflows/policies/templates/channels/master data/security settings all have status/version.
- Notifications have status/read_at.
- Report/export jobs include generated document references.

Allowed transitions:

- Admin settings mutations are role-gated and versioned where applicable.

Blocked transitions:

- Non-admin settings mutation.

Edge cases:

- Admin config may persist but not affect runtime for all engines.
- Push notification flag exists but provider not implemented.

Unclear rules:

- Which admin config changes must be runtime authoritative.

## 5. API / Integration Map

| Endpoint or service name | Purpose | Success behavior | Failure behavior | Loading state | Retry behavior | Business impact if it fails |
| --- | --- | --- | --- | --- | --- | --- |
| Auth API | Signup/login/session/password/email verification | Creates/returns session/user or token-flow step | 400/401/403/409/429 with shared error shape | Login/signup pages and auth provider pending state | Frontend does not retry login; rate limit waits when 429 | Users cannot access product |
| Resend email delivery | Send verification/reset emails | Records delivery and provider id/log id | Records failure without raw token leakage | No direct UI except auth flow messages | Idempotency key per token; webhook status later | Signup/reset cannot complete in real production |
| Resend webhook | Track email events | Stores deduped event and updates delivery status | 400 invalid signature | Not visible to user | Provider retries; dedupe by event id | Delivery monitoring/support degraded |
| Dashboard API | Role-scoped summaries | Shows cards/actions/attention items | Page-level error/empty states should show | React Query loading in dashboard route | Query refetch | Wrong UAT data or role confusion |
| Core users API | Employee admin/profile photo/hierarchy/export | Lists/mutates users; uploads profile photo | 400 validation, 403 scope, 409 stale/duplicate, 500 if unhandled DB | Route tables/forms | Mutations generally manual retry after error | Employee data loss/incorrect roles |
| Documents API | Upload/download/verify/delete documents | Metadata and storage object created; URLs returned | 400 MIME/size, 403 classification, 404 missing object, 500 storage | Upload buttons and document lists | Manual retry; Cloudinary/provider-dependent | Missing compliance docs/media |
| Attendance API | Punch, summaries, calendar, regularization | Creates punch/day records and summaries | 400 invalid punch/window, 403 scope, 409 stale decision | Live attendance UI | Frontend live timer updates; backend calls not retried blindly | Payroll/attendance trust risk |
| Leave/WFH API | Leave/WFH request lifecycle | Request/decision/balance/holiday/export | 400 invalid date/status, 403 scope, 409 stale | Forms/queues | Manual retry after refetch | Leave balance and staffing risk |
| EMS API | Profile, requests, docs, policies, HR admin | Profile/request/ack/checklist updates | 400 validation, 403 HR scope, 409 stale | EMS tabs | Manual retry | HR lifecycle/data compliance risk |
| Expenses API | Expense workflow and finance actions | Ticket transitions and audit/payment docs | 400 remarks/docs, 403 self/scope, 409 stale/invalid transition | Expense tabs/queues/detail | Manual retry after refetch | Reimbursement/payment/revenue control risk |
| Projects API | Project CRUD/utilization | Project/member/allocation/milestone summaries | 403 scope, 409 stale, validation | Project list/detail/utilization | Manual retry | Delivery/resource planning risk |
| Assets API | Inventory/request/recovery/license | Asset state transitions and requests | 403 role, 409 invalid transition/stale, validation | Asset pages | Manual retry | Hardware custody/recovery risk |
| Helpdesk API | Ticket workflow/category/SLA | Ticket events, comments, SLA summaries | 403 category scope, validation, stale status | Helpdesk pages | Manual retry | Support SLA/client UAT risk |
| Reports/export API | Cross-module summaries/export docs | Summary or generated document id | 400 page_size/filter, 403 report scope, storage errors | Report shells | Manual export retry | Leadership reporting/accountability risk |
| Admin API | Company, master data, RBAC, workflows, policies, templates, notification channels, security, audit | Persisted configuration and audit events | 403 admin/HR/auditor scope, 409 version, validation | Admin tabs | Manual retry after refetch | Runtime config or security posture risk |
| Cloudinary object storage | Store/read/delete bytes | Provider URL or backend content URL | Upload/download/delete failure | Upload/download UI | Manual retry; mock mode local only | Document/media loss |
| PostgreSQL | Durable relational state | Persisted across services | App startup/migration/test failures | Backend unavailable | No app-level retry in UI beyond query refetch | Total product outage/data risk |
| Valkey | Sessions/outbox | Session validation and stream publishing | Auth/session/outbox degradation | User sees 401/500 | Session store operations fail | Auth and async processing risk |
| Ghostscript/PDF compression | Compress PDF uploads | Metadata records compression attempt/result | Fail-open if configured | Hidden in upload | No user retry needed if fail-open | Storage/network performance risk |

## 6. Risk Areas

### Revenue/payment risk

- Expense payment release/settlement can move money and must be protected from self-approval, duplicate payment references, stale versions, and missing document verification.
- Finance reports and export data must use capped pagination and role-scoped filters.
- Cost center is currently optional; finance/reporting may later depend on it.

### Auth/session risk

- Custom JWT/session implementation relies on secret configuration, Valkey session records, cookie security, role mapping, and 401 handling.
- Frontend role map is not identical to backend role model.
- Public auth routes and `/docs` exposure need production review.

### Data loss risk

- Cloudinary mock upload mode stores bytes only in the running backend process.
- Document delete removes storage object and soft-deletes metadata.
- Frontend local fallback can mask backend issues if enabled outside demo mode.

### Permission/security risk

- Backend policies are authoritative, but frontend must avoid calling forbidden APIs for roles without permissions.
- Admin RBAC configuration may not fully override hard-coded policy functions.
- Document classification access and report scope require strong negative testing.

### Client UAT risk

- Dashboard and EMS/attendance/timesheet live values are highly visible and must match backend records and policies.
- Admin-configured working days, punch windows, leave/timesheet policies must reflect in employee views.
- Role language mismatch: manager vs Reviewer, Director, project manager, helpdesk agent.

### Performance risk

- Reports and dashboards aggregate many in-memory store arrays after DB load.
- Page size caps exist; frontend must not request `page_size=500`.
- Generated exports and document downloads can stress storage.

### Mobile/platform risk

- Frontend uses responsive shell; Playwright has mobile smoke, but dense admin/workflow tables may still overflow.
- Attendance punch actions are key mobile flows.

### External API risk

- Resend, Cloudinary, PostgreSQL, Valkey, Ghostscript are operational dependencies.
- Production requires real Cloudinary/Resend credentials and disables mock storage.

## 7. Clarifying Questions

See `qa/BUSINESS_LOGIC_QUESTIONS.md`.

