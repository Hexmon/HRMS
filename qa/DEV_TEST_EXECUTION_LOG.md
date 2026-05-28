# Dev Test Execution Log

Command: `pnpm typecheck`
Working directory: `hrms_backend`
Result: Pass
Evidence/output summary: TypeScript noEmit passed.
Failure reason: N/A
Follow-up needed: None

Command: `pnpm lint`
Working directory: `hrms_backend`
Result: Pass
Evidence/output summary: Lint passed for 304 files after sandbox escalation.
Failure reason: N/A
Follow-up needed: None

Command: `pnpm build`
Working directory: `hrms_backend`
Result: Pass
Evidence/output summary: Backend build passed after sandbox escalation.
Failure reason: N/A
Follow-up needed: None

Command: `HRMS_DB_VERIFY_ENV_FILE=.env.local pnpm db:verify:no-cross-schema-fks`
Working directory: `hrms_backend`
Result: Pass
Evidence/output summary: No cross-schema SQL FKs found.
Failure reason: N/A
Follow-up needed: None

Command: `pnpm api:docs:verify`
Working directory: `hrms_backend`
Result: Pass
Evidence/output summary: API docs verification passed.
Failure reason: N/A
Follow-up needed: None

Command: `HRMS_ENV_FILE=.env.local pnpm test:unit`
Working directory: `hrms_backend`
Result: Pass
Evidence/output summary: 5 files, 14 tests passed.
Failure reason: N/A
Follow-up needed: None

Command: `HRMS_ENV_FILE=.env.local pnpm test:contracts`
Working directory: `hrms_backend`
Result: Pass
Evidence/output summary: 1 file, 17 tests passed.
Failure reason: N/A
Follow-up needed: None

Command: `CLOUDINARY_MOCK_UPLOADS=true HRMS_ENV_FILE=.env.local pnpm test:integration`
Working directory: `hrms_backend`
Result: Pass
Evidence/output summary: 25 files, 84 tests passed.
Failure reason: N/A
Follow-up needed: None

Command: `HRMS_ENV_FILE=.env.local pnpm test:integration`
Working directory: `hrms_backend`
Result: Fail
Evidence/output summary: 5 upload tests failed because .env.local has CLOUDINARY_MOCK_UPLOADS=false and real Cloudinary is not available in this environment.
Failure reason: 5 upload tests failed because .env.local has CLOUDINARY_MOCK_UPLOADS=false and real Cloudinary is not available in this environment.
Follow-up needed: Use real Cloudinary credentials/network or local mock mode for integration tests.

Command: `pnpm exec tsc -p tsconfig.json --noEmit`
Working directory: `hrms-client`
Result: Pass
Evidence/output summary: Frontend typecheck passed.
Failure reason: N/A
Follow-up needed: None

Command: `pnpm lint`
Working directory: `hrms-client`
Result: Pass
Evidence/output summary: 0 errors, 39 existing fast-refresh warnings.
Failure reason: N/A
Follow-up needed: None

Command: `pnpm api:implemented-route-guard`
Working directory: `hrms-client`
Result: Pass
Evidence/output summary: 60 files checked against 214 OpenAPI paths.
Failure reason: N/A
Follow-up needed: None

Command: `pnpm api:frontend-contract:route-coverage`
Working directory: `hrms-client`
Result: Pass
Evidence/output summary: 85 routes mapped across 15 groups.
Failure reason: N/A
Follow-up needed: None

Command: `pnpm api:production-config-guard`
Working directory: `hrms-client`
Result: Pass
Evidence/output summary: Production mock fallback disabled and API mode required.
Failure reason: N/A
Follow-up needed: None

Command: `pnpm build`
Working directory: `hrms-client`
Result: Pass
Evidence/output summary: Frontend production build passed after sandbox escalation; large chunk warnings remain.
Failure reason: N/A
Follow-up needed: None

## Deployment and Agile Hardening Validation - 2026-05-29

Command: `ruby -e "require 'yaml'; %w[.github/workflows/branch-ci-cd.yml render.yaml infra/render/render.dev.yaml infra/render/render.qa.yaml].each { |f| YAML.load_file(f); puts \"ok #{f}\" }"`
Working directory: repo root
Result: Pass
Evidence/output summary: GitHub workflow and all Render YAML files parsed successfully.
Failure reason: N/A
Follow-up needed: None

Command: `python3 qa/scripts/generate_deployment_agile_artifacts.py`
Working directory: repo root
Result: Pass
Evidence/output summary: Regenerated QA workbook, client/internal QA docs, tester run book, release signoff, and future-scope files.
Failure reason: N/A
Follow-up needed: None

Command: `python3 qa/scripts/validate_testing_workbook.py`
Working directory: repo root
Result: Pass
Evidence/output summary: Workbook validation passed with 51 test cases; P0=28, P1=16, P2=7; sprint totals are within the 48-point cap.
Failure reason: N/A. A later non-escalated rerun was blocked by filesystem permissions while writing the log; it was rerun with approval and passed.
Follow-up needed: None

Command: `pnpm typecheck`
Working directory: `hrms_backend`
Result: Pass
Evidence/output summary: Backend TypeScript typecheck passed after APP_ENV/build metadata/config changes.
Failure reason: N/A
Follow-up needed: None

Command: `pnpm build`
Working directory: `hrms_backend`
Result: Pass
Evidence/output summary: Backend build passed after deployment config and health metadata changes.
Failure reason: N/A
Follow-up needed: None

Command: `pnpm api:production-config-guard`
Working directory: `hrms-client`
Result: Pass
Evidence/output summary: Frontend production API/mock fallback guard passed.
Failure reason: N/A
Follow-up needed: None

Command: `pnpm build`
Working directory: `hrms-client`
Result: Pass
Evidence/output summary: Frontend production build passed with existing large chunk warnings only.
Failure reason: N/A
Follow-up needed: None

Command: `rg -n "yourdomain\.com|app\.hawkaii\.in|CLOUDINARY_MOCK_UPLOADS=true|VITE_API_MOCK_FALLBACK=\"?true" .github render.yaml infra/render docs/deployment hrms_backend/.env.dev.hosted.example hrms_backend/.env.qa.hosted.example hrms_backend/.env.prod.hosted.example hrms-client/.env.dev.hosted.example hrms-client/.env.qa.example hrms-client/.env.production.example`
Working directory: repo root
Result: Pass
Evidence/output summary: No wrong production frontend domain or placeholder domain found in active deployment files. The only match was an intentional warning line in `docs/deployment/secrets-checklist.md` stating that `CLOUDINARY_MOCK_UPLOADS=true` is a blocker.
Failure reason: N/A
Follow-up needed: None

Command: `rg -n "NODE_ENV=qa|NODE_ENV=development" render.yaml infra/render hrms_backend/.env.dev.hosted.example hrms_backend/.env.qa.hosted.example hrms_backend/.env.prod.hosted.example`
Working directory: repo root
Result: Pass
Evidence/output summary: Hosted deployment examples and Render blueprints do not set unsupported `NODE_ENV=qa`; hosted dev/QA use production Node builds with `APP_ENV`.
Failure reason: N/A
Follow-up needed: None
