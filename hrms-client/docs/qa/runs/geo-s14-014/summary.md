# GEO-S14-014 QA Summary

Date: 2026-10-06

## Scope

- Added append-only `attendance.mobile_evidence_warnings` persistence for live mobile replay conflicts, offline changed-body conflicts, duplicate offline device sequences, and registered-device eligibility rejections.
- Added manager selected-day read-model output as `mobile_evidence_warnings` without client event IDs, registered device IDs, request hashes, raw payloads, or exact coordinates.
- Updated the attendance reports drill-in UI to show offline/provisional evidence and mobile integrity/device warnings together.
- Updated OpenAPI source, generated OpenAPI JSON, frontend contract OpenAPI JSON, examples, and contract assertions.

## Warning Categories

- `replay_warning`: `mobile_replay.changed_body_conflict`, `offline_sync.changed_body_conflict`, `offline_sync.duplicate_sequence`
- `device_eligibility`: `mobile_registered_device_required`, `mobile_registered_device_revoked`, `mobile_registered_device_suspended`, `mobile_registered_device_unavailable`

## Validation

- PASS: Backend TypeScript compile via direct local binary: `.\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit`
- PASS: Frontend TypeScript compile via direct local binary: `.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.json`
- PASS: Touched frontend ESLint files: `.\node_modules\.bin\eslint.cmd src/domains/attendance/api.ts src/domains/attendance/manager-review-model.ts src/routes/_app/reports.attendance.tsx`
- PASS: Backend build compile and alias rewrite via direct local binaries: `.\node_modules\.bin\tsc.cmd -p tsconfig.build.json`; `.\node_modules\.bin\tsc-alias.cmd -p tsconfig.build.json`
- PASS: OpenAPI generation via compiled script: `node --conditions=production dist/scripts/api-docs-generate.js`
- PASS: Frontend contract generation via compiled script: `node dist/scripts/api-frontend-contract-generate.js`
- PASS: API docs verification via compiled script: `node --conditions=production dist/scripts/api-docs-verify.js`
- PASS: Migration history verification via compiled script: `node dist/scripts/verify-migration-history.js`
- PASS: Targeted backend unit tests: `.\node_modules\.bin\vitest.cmd run --project unit src/modules/attendance/__tests__/attendance-openapi-examples.unit.test.ts`
- PASS: Targeted backend unit tests: `.\node_modules\.bin\vitest.cmd run --project unit src/modules/attendance/__tests__/attendance-command-repository.unit.test.ts`
- BLOCKED: `pnpm --dir hrms_backend typecheck` and `pnpm --dir hrms-client typecheck` were stopped by pnpm's ignored-build-script gate for `esbuild@0.27.7` before TypeScript ran.
- BLOCKED: Affected backend integration/contract Vitest suites could not reach test Postgres at `127.0.0.1:55432`; failures occurred during `buildRealApp` fixture setup before test assertions.
- FAIL: Cross-schema FK verification reports existing pre-task violations in migrations `0036_attendance_shift_templates.sql` and `0037_attendance_policy_versions.sql`; migration `0062_attendance_mobile_evidence_warnings.sql` adds no cross-schema foreign keys.
- FAIL: Full frontend ESLint reported existing repository-wide Prettier CRLF violations, including many unrelated files outside this task scope.

## Notes

- The warning table is immutable through `platform.prevent_immutable_update_delete()`.
- Dedupe uses `(company_id, employee_user_id, client_event_id, category, reason_code)` so retry storms do not create duplicate warnings.
- The manager read model exposes safe status/reason/event/source/timestamp fields only.
