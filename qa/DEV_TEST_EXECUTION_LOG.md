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
