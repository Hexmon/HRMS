# Tester Run Book

## Purpose

This manual explains how to use `qa/TESTING_TEST_CASES.xlsx` for hosted deployment validation and first full-product QA.

## Environment URLs

- Production: `https://hawkaii.in` and `https://api.hawkaii.in`
- QA: `https://qa.hawkaii.in` and `https://qa-api.hawkaii.in`
- Hosted dev: `https://dev.hawkaii.in` and `https://dev-api.hawkaii.in`
- Local development remains local and is not the same as hosted dev.

## Execution Lanes

1. Release Gate P0: must pass before signoff.
2. Deployment Smoke: run after every hosted deployment.
3. Sprint Regression: changed modules.
4. Full Regression: first full product QA and major releases.
5. Deep/Future: lower-risk or hardening checks.

## Filling The Workbook

- Actual Result: write what happened, not what should have happened.
- Status: use Not Run, Pass, Fail, Blocked, or Not Applicable.
- Defect ID: add ticket ID for every failure.
- Evidence: add screenshot, video, downloaded file, API response, request ID, or CI run URL.
- Notes: mention role, environment, test data, or blockers.

## Defect Rules

Fail means the feature was testable and behaved incorrectly. Blocked means the test could not be executed because setup, credentials, role, data, or environment was missing.

Capture backend `request_id` from API error responses whenever possible.

## Role Safety

Use dedicated QA users. Backend permissions are source of truth. If UI hides an action but direct API allows it, log a security/business defect. If UI shows an action but backend forbids it, backend is correct but UI may need a defect.

## Avoid Wrong Environment

Before testing, confirm the browser URL and API base URL match:

- Production frontend must call `api.hawkaii.in`.
- QA frontend must call `qa-api.hawkaii.in`.
- Hosted dev frontend must call `dev-api.hawkaii.in`.

## Cloudinary Storage Check

QA/prod must use real Cloudinary. Upload a document, open it, restart/redeploy backend if needed, then confirm it still opens. Local mock is not enough for UAT persistence.

## Email Verification Check

In QA/prod, opening the verification link should show a confirmation step and should not auto-submit. Verification completes only after user action.

## Empty Workspace Check

Create/bootstrap a new company. Dashboards and module pages should show empty real org-scoped states, not unrelated demo data.

## CI/CD Manual Check

Review the GitHub Actions run. PRs should run checks only. Pushes to `dev`, `qa`, and `main` should deploy only after checks pass. Production should require GitHub Environment approval if configured.

## Local QA Setup - macOS

Prerequisites proven by repo scripts: Node 22+, pnpm 10+, Docker with Compose.

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

Health check: `http://localhost:3001/api/v1/health/ready`.

## Local QA Setup - Ubuntu/Linux

Use Node 22+, pnpm 10+, Docker Engine with Compose. Use the same backend/frontend commands as macOS. Install Docker permissions according to local policy.

## Local QA Setup - Windows

Use WSL2 or Git Bash for POSIX-style commands. Install Node 22+, pnpm 10+, and Docker Desktop with WSL2 integration. Run the same backend/frontend commands from WSL2.

## Common Errors

- Missing Cloudinary credentials: mark storage tests Blocked for QA/UAT.
- Wrong API domain: stop testing and fix frontend env.
- 401 while still viewing dashboard: log auth/session defect with request ID.
- Empty data: pass only if workspace is expected to be empty.
