# QA Artifact Upgrade Analysis

Date: 2026-05-28

Scope: Upgrade Hawkaii HRMS QA artifacts for a first full-product QA cycle after dev testing. This is a QA/docs-only pass; application source code is not modified.

## 1. Current Artifact Problems

The current workbook `qa/TESTING_TEST_CASES.xlsx` is useful as a first smoke artifact, but it is too thin for a first full software QA cycle.

Current workbook tabs found by parsing `xl/workbook.xml`:

- `Execution Summary`
- `P0 Smoke UAT Gate`
- `Sprint Regression`
- `Full Regression`
- `Role Permission Matrix`
- `Business Rule Traceability`
- `Test Data`
- `Defect Log`
- `Environment Matrix`
- `Future Scope`
- `Signoff`

Problems:

- The sheet does not contain the required `README`, `Sprint Plan`, `Coverage Matrix`, or `Blocked Questions` tabs.
- The previous P0/P1/P2 split is too small for a full product with authentication, onboarding, employees, EMS, attendance, leave/WFH, timesheets, expenses, documents, projects, assets, helpdesk, reports, notifications, and admin settings.
- The Role Permission Matrix is too short because it summarizes roles at a high level instead of role + module + action rows.
- Business Rule Traceability is too short because it does not trace all BLQ-001 through BLQ-025 rules to positive, negative, and regression test ids.
- Sprint planning is missing story points, 7-day sprint grouping, and the required 48-point sprint capacity guardrail.
- Mobile/responsive coverage is present only as a broad item, not as a specific smoke suite.

## 2. First-Time Full QA Coverage Decision

Coverage levels used for the upgraded workbook:

- **P0 UAT Gate**: Go/no-go tests. These validate release-critical authentication, role access, workspace scoping, attendance punch, expense approval, documents/storage, Cloudinary readiness, basic reports, notifications, and mobile employee smoke.
- **P1 Core Full Regression**: Important full-product workflows that should be run during a full QA cycle but should not automatically block UAT unless the business impact is high. This includes employee admin, EMS, leave/WFH, timesheets, projects, assets, helpdesk, reports, admin settings, and notifications.
- **P2 Deep Regression / Compatibility / Rare Edge Cases**: Negative, boundary, compatibility, mobile table overflow, direct unauthorized API calls, stale versions, file size/MIME limits, optional holidays, public docs security review, and other lower-frequency checks.

Not every test is P0 because this is a full-product QA cycle, not a release panic checklist. Marking every row P0 would hide the actual release blockers and overwhelm a fast startup QA tester. The workbook keeps P0 focused on user journeys that can block UAT/release, then uses P1/P2 for systematic coverage.

Story point model:

- 0.5: quick single verification or simple smoke
- 1: simple flow with one role and one expected result
- 2: medium flow with multiple screens or important validation
- 3: complex role/workflow/API-backed suite
- 5: high-risk multi-role end-to-end flow, used sparingly

Sprint model:

- 7-day sprint length
- 48 story points maximum per sprint
- Three sprints are used because whole-product first QA coverage cannot be done honestly in one or two 48-point sprints without either overloading testers or removing meaningful modules.

## 3. Whole-Product Module Inventory

| Module | Exists? | Evidence | QA Representation Decision |
| --- | --- | --- | --- |
| Auth, email verification, password reset, onboarding/workspace bootstrap | Yes | `hrms_backend/src/modules/auth/routes.ts`, frontend auth routes, README | P0 and P1 |
| Dashboard | Yes | `hrms_backend/src/modules/dashboard/*`, `hrms-client/src/routes/_app/dashboard.tsx` | P0 and P1 |
| Employees/core user admin | Yes | `hrms_backend/src/modules/core/*`, `/employees` routes | P1 with selected P0 role sanity |
| Role mapping/RBAC/permissions | Yes | `hrms_backend/src/shared/constants.ts`, `hrms_backend/src/modules/admin/*`, `hrms-client/src/lib/auth.tsx` | P0/P1/P2 |
| EMS/profile/self-service/documents/policies/letters | Yes | `hrms_backend/src/modules/ems/*`, `/ems*` routes | P1 |
| Attendance/punch/break/off-day/cross-midnight/regularization | Yes | `hrms_backend/src/modules/attendance/*`, `/attendance*` routes | P0/P1/P2 |
| Leave/WFH/holidays/balances | Yes | `hrms_backend/src/modules/leave-wfh/*`, `/leave-wfh*` routes | P1/P2 |
| Timesheets | Yes | `hrms_backend/src/modules/timesheets/*`, `/timesheet*` routes | P1/P2 |
| Expenses/finance/payment/settlement/documents | Yes | `hrms_backend/src/modules/expenses/*`, expense docs | P0/P1/P2 |
| Documents/media/Cloudinary | Yes | `hrms_backend/src/modules/documents/*`, `object-storage.ts`, docs | P0/P2 |
| Projects/team utilization/cost center/over-allocation | Yes | `hrms_backend/src/modules/projects/*`, `/projects`, `/team-utilization` | P1/P2 |
| Assets/license/recovery | Yes | `hrms_backend/src/modules/assets/*`, `/assets*` routes | P1/P2 |
| Helpdesk/SLA/categories/tickets/comments/attachments | Yes | `hrms_backend/src/modules/helpdesk/*`, `/helpdesk*` routes | P1/P2 |
| Reports/exports/audit reports | Yes | `hrms_backend/src/modules/reports/*`, `/reports*` routes | P0/P1/P2 |
| Admin settings/workflows/policies/security/master data/templates/notifications | Yes | `hrms_backend/src/modules/admin/*`, `/admin-settings*` routes | P0/P1 |
| Notifications | Yes | `hrms_backend/src/modules/notifications/*` | P0/P1 |
| Platform/health/API mode/storage/email/Valkey/PostgreSQL | Yes | health/platform routes, config, README, package scripts | P0/P2 |
| Desktop and mobile/responsive flows | Yes | frontend routes and Playwright scripts | P0/P2 |

## 4. Evidence List

| Evidence ID | Module | Source files/docs/API routes used |
| --- | --- | --- |
| QA-EV-001 | Repository/product map | `README.md`, `hrms_backend/package.json`, `hrms-client/package.json` |
| QA-EV-002 | Backend roles/permissions | `hrms_backend/src/shared/constants.ts`, `hrms_backend/src/modules/*/policy.ts` |
| QA-EV-003 | Frontend routes | `hrms-client/src/routes/_app/*`, public auth routes under `hrms-client/src/routes` |
| QA-EV-004 | Backend modules | `hrms_backend/src/modules/*/routes.ts`, `service.ts`, `policy.ts` |
| QA-EV-005 | Auth/email | `hrms_backend/src/modules/auth/*`, `hrms_backend/src/platform/email/*`, `hrms-client/src/routes/verify-email.tsx` |
| QA-EV-006 | Expense workflow | `hrms_backend/src/modules/expenses/*`, `hrms-client/docs/api/API_EXPENSE_WORKFLOW_GUIDE.md`, `API_FINANCE_GUIDE.md` |
| QA-EV-007 | Attendance/leave/timesheets | `hrms_backend/src/modules/attendance/*`, `leave-wfh/*`, `timesheets/*` |
| QA-EV-008 | Documents/storage | `hrms_backend/src/modules/documents/*`, `hrms_backend/src/platform/object-storage.ts`, `README.md` |
| QA-EV-009 | Admin settings | `hrms_backend/src/modules/admin/*`, `/admin-settings*` frontend routes |
| QA-EV-010 | Setup/commands | `hrms_backend/README.md`, package scripts, Docker compose script names |
| QA-EV-011 | Existing QA decisions | `qa/BUSINESS_LOGIC_QUESTIONS.md`, `qa/BUSINESS_RULES_CONFIRMED.md`, `qa/DEV_TEST_EXECUTION_LOG.md` |

## 5. Upgrade Decision

The workbook will be rebuilt with the required 15 tabs plus optional `Automation Candidates`, `API Negative Tests`, and `Mobile Responsive Tests` tabs. It will represent the whole product but keep execution practical by using three 7-day sprints and a clear P0/P1/P2 execution sequence.
