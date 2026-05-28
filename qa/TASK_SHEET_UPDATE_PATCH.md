# External HRMS Task Sheet Patch

Apply these rows to `/Users/anuragkumar/Desktop/Tasks/HRMS.xlsx`.

| Task ID | Sprint | Story Points | Priority | Owner | Status | Description | Acceptance Criteria | Verification | QA/Test Cases | Notes |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| HRMS-DEPLOY-001 | Sprint 1 | 5 | P0 | DevOps | Implemented | Branch-based GitHub CI/CD for `dev`, `qa`, `main` | PRs run checks without deployment; pushes to deploy branches trigger matching Render API/worker hooks after checks pass | GitHub workflow YAML parsed | CI-CD Validation | Production branch is `main` based on repo evidence |
| HRMS-DEPLOY-002 | Sprint 1 | 5 | P0 | DevOps | Implemented | Render environment isolation | Production, QA, and hosted dev each have API, worker, and Valkey definitions | Render YAML parse passed | Deployment Smoke / Data Isolation | Secrets remain dashboard-managed |
| HRMS-DEPLOY-003 | Sprint 1 | 3 | P0 | Backend | Implemented | `APP_ENV` deployment model | Hosted QA/prod use optimized `NODE_ENV=production`; product env uses `APP_ENV` | Backend typecheck/build | Secrets Config Checklist | `APP_ENV=local/development/qa/production` |
| HRMS-DEPLOY-004 | Sprint 1 | 2 | P1 | Backend | Implemented | Health/release metadata | Health responses expose app env, version, build SHA, uptime without secrets | Backend typecheck/build | Deployment Smoke | `BUILD_SHA` must be supplied by deployment |
| HRMS-DEPLOY-005 | Sprint 1 | 3 | P0 | DevOps | Implemented | Hosted env docs | Environment matrix, CI/CD, rollback, DNS, secrets docs created | Markdown reviewed | Deployment Smoke / Rollback Checklist | Cloudflare frontend remains documented deployment target |
| HRMS-QA-DEPLOY-001 | Sprint 1 | 5 | P0 | QA | Implemented | Deployment-aware QA workbook | Workbook includes required deployment/agile sheets and validates successfully | `python3 qa/scripts/validate_testing_workbook.py` passed | `qa/TESTING_TEST_CASES.xlsx` | 51 cases, sprint totals <= 48 |
| HRMS-PROCESS-001 | Sprint 1 | 3 | P1 | Delivery Lead | Implemented | Agile process docs | Branching, DoR, DoD, QA handoff, sprint ceremonies, release governance documented | Docs created under `docs/process` | Agile Sprint Plan | 7-day sprint, 48 SP cap |
| HRMS-MANUAL-001 | Sprint 1 | 2 | P0 | Release Owner | Manual Required | Configure GitHub environments and secrets | `development`, `qa`, `production` environments exist; production requires approval; deploy hook secrets added | GitHub settings review | CI-CD Validation | Cannot be done from source code alone |
| HRMS-MANUAL-002 | Sprint 1 | 3 | P0 | Release Owner | Manual Required | Configure hosted resources | Neon branches, Render services, Cloudinary env/folders, Resend, DNS configured | Hosted smoke commands | Deployment Smoke / DNS SSL CORS | Requires external dashboards |
