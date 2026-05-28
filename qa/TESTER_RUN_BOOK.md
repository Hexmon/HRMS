# Tester Run Book

## 1. Purpose Of This QA Cycle

This is the first full software QA cycle for Hawkaii HRMS after dev testing. It is not only a smoke test. The goal is to prove release-critical flows first, then cover the whole product at practical startup speed.

- P0 UAT Gate: release blockers and client go/no-go flows.
- P1 Core Regression: important product coverage across modules.
- P2 Deep Regression: edge, compatibility, negative, and lower-risk checks.

## 2. How To Use `qa/TESTING_TEST_CASES.xlsx`

Open the `README` tab first. Then use `Execution Summary` and `Sprint Plan` to understand scope. Run the tabs in this order: `P0 UAT Gate`, `P1 Core Regression`, `P2 Deep Regression`.

For each row:

- Fill `Status`: `Not Run`, `Pass`, `Fail`, `Blocked`, or `Not Applicable`.
- Fill `Actual Result` with what actually happened.
- Fill `Defect ID` if the test failed.
- Fill `Evidence Link / Screenshot` with screenshot, video, API response, downloaded file, or backend `request_id`.
- Use `Notes` for environment, role, or data observations.

When a test fails, do not continue repeating the same failed flow in other tabs. Log one clean defect, link duplicate test cases to that defect, and continue with unaffected areas if P0 rules allow it.

When blocked, write the missing condition clearly, such as missing Cloudinary credentials, missing role seed, unavailable backend, or unclear expected result.

## 3. Execution Order

1. Read the workbook `README`.
2. Prepare environment and users.
3. Run P0 UAT Gate.
4. Stop and escalate if any P0 blocker exists without approved waiver.
5. Run P1 Core Regression.
6. Run P2 Deep Regression if time permits or before major release.
7. Run mobile/responsive smoke.
8. Complete `Defect Log` and `Signoff`.

## 4. Local QA Setup From Repo Docs

### macOS

Required tools proven by repo docs: Node.js 22+, pnpm 10+, Docker Desktop or Docker Engine with Compose. Ghostscript is needed for local PDF compression if testing that path outside Docker.

Backend:

```bash
cd hrms_backend
pnpm install
pnpm dev:infra:up
pnpm db:migrate
pnpm release:seed
pnpm dev
```

Frontend:

```bash
cd hrms-client
pnpm install
pnpm dev
```

Health check: open/call backend health routes such as `/health/ready` or `/api/v1/health/ready` after backend starts.

Tests:

```bash
cd hrms_backend
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:contracts

cd ../hrms-client
pnpm exec tsc -p tsconfig.json --noEmit
pnpm lint
pnpm build
```

Reset local data: use documented Docker down/up and migration/seed commands only. Do not manually delete production-like databases.

### Ubuntu/Linux

Required tools are the same as macOS: Node.js 22+, pnpm 10+, Docker Engine with Compose. Use the same backend/frontend commands above. If Docker permissions block commands, add the user to the docker group or run according to your local policy. Ghostscript package name is commonly `ghostscript`, but install command depends on distro.

### Windows

Use Windows Terminal with PowerShell, Git Bash, or WSL2. Repo commands are POSIX-style and Docker-based, so WSL2 is the safest path. Required tools: Node.js 22+, pnpm 10+, Docker Desktop with WSL2 integration. Use the same `pnpm` commands from the backend and frontend folders. If shell syntax with inline env vars fails in PowerShell, run through WSL2 or Git Bash.

## 5. QA/UAT Environment Rules

- QA/UAT/prod must use real Cloudinary when validating document persistence.
- Local/dev may use mock Cloudinary for developer regression.
- Frontend must run in API mode for release validation.
- Production mock fallback must be disabled.
- Do not use seed/demo data as proof for a newly bootstrapped production workspace.

## 6. Role Login Guide

- Employee: self-service, attendance, leave/WFH, expenses, documents, timesheets, helpdesk.
- Manager: user-facing name for backend `Reviewer`; approval queues and team visibility.
- Finance Manager: finance verification, payment, settlement, finance reports.
- Admin/Main Admin: workspace/admin settings, employees, RBAC, reports, configuration.
- Auditor: read-only audit/report visibility.
- HR Manager: EMS, employee lifecycle, leave/HR operations; not full Admin unless backend allows.
- Asset Manager: asset inventory, assignment, return, recovery.
- Helpdesk Agent: needs backend alignment if no backend role/permission exists.
- Director: backend role exists; not a mandatory expense v1 approval stage.

## 7. Defect Logging Guide

Title format: `[Module][Role][Priority] short issue`.

Include:

- Test Case ID
- Role used
- Environment
- Preconditions and data
- Steps to reproduce
- Expected result
- Actual result
- Screenshot/video
- Backend `request_id` or API response when available
- Severity and priority

Severity guide:

- Critical: auth broken, data leak, self-approval, data loss, P0 flow impossible.
- High: major module broken for key role.
- Medium: important regression with workaround.
- Low: copy/layout/minor usability issue.

## 8. Common Doubts / FAQ

- Missing Cloudinary credentials: mark storage P0 as Blocked, not Pass. Local mock can validate developer flow but not UAT persistence.
- UI shows action but backend blocks it: log defect if the action should not be visible; backend block is still correct security behavior.
- Backend allows something UI hides: log as UX/business alignment defect if user should access it.
- P1 fails after P0 passes: continue testing but mark release risk for Product decision.
- Mobile broken but desktop works: P0 only for employee-critical mobile smoke; admin table mobile overflow is P2 unless it blocks required mobile use.
- Data is empty: pass only if empty state is expected for that role/workspace.
- Expected result unclear: mark Blocked and add to `Blocked Questions`.
- Not applicable: use only when role/module truly does not exist in target environment.
- Role does not exist in seed data: mark blocked and request seed/user setup.

## 9. Signoff Process

QA signoff requires all P0 tests Pass or approved waiver, all P1 failures triaged, and all blockers documented.

Product signoff requires no release-blocking defects, accepted known issues, and environment readiness for Cloudinary/email/API mode.

Release blocker rules: any P0 fail/blocker, permission bypass, cross-org data leak, broken auth/session, broken expense payment flow, document storage loss, or production mock fallback enabled.

## Sprint Plan Summary

| Sprint | Scope | Story Points | Priority Mix |
| --- | --- | --- | --- |
| 1 | Auth, onboarding, RBAC, attendance, expenses, documents, Cloudinary, empty workspace, mobile smoke | 40.5 | P0:15 |
| 2 | Employees, EMS, leave/WFH, holidays, attendance regression, timesheets, notifications, dashboard, admin master/RBAC | 39.5 | P1:16 |
| 3 | Projects, assets, helpdesk, reports, admin settings, API negatives, deep mobile/security/edge tests | 44.5 | P1:11, P2:7 |
