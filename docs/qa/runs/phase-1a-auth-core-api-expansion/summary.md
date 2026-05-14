# Phase 1A Auth/Core API Expansion QA Summary

Generated: 2026-05-14T12:58:09.050764+00:00

## Scope

- Expanded `GET /api/v1/auth/me` with active role, available roles, permissions, navigation hints, company context, preferences, and low-bandwidth defaults.
- Expanded `GET /api/v1/core/users` with scoped employee directory data, filters, sorting, department/designation/manager references, login state, and summary counts.
- Expanded `GET /api/v1/core/users/{id}` with scoped employee detail tabs, reporting line, role assignments, and compact cross-module summaries.
- Kept all endpoint paths stable and added only backward-compatible response fields.

## Verification Commands

- `pnpm typecheck` - passed.
- `pnpm test:unit -- src/modules/core/__tests__/core.unit.test.ts` - passed.
- `npx vitest run --project integration src/modules/core/__tests__/core.integration.test.ts` - passed after running test infrastructure sequentially.
- `npx vitest run --project contracts src/__tests__/contracts.contract.test.ts` - passed after running sequentially.
- `pnpm lint` - passed.
- `pnpm api:docs:generate` - passed and regenerated 68-operation OpenAPI/frontend contract artifacts.
- `pnpm api:docs:verify` - passed.
- `pnpm api:consumer:verify` - passed.
- `HRMS_ENV_FILE=.env.qa pnpm db:migrate` - passed.
- `HRMS_ENV_FILE=.env.qa pnpm db:verify:no-cross-schema-fks` - passed.
- `pnpm test` - passed: unit 3 files/8 tests, contracts 1 file/13 tests, integration 6 files/12 tests, e2e no files with passWithNoTests.

## Notes

- Initial parallel integration/contract run failed because both processes reset the same test PostgreSQL database concurrently. Sequential reruns passed.
- No new API operations were added; OpenAPI remains at 68 operations.
- Planned APIs remain out of OpenAPI until implemented in later phases.
