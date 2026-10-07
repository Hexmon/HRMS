# GEO-S14-010 Mobile App API Handoff Kit

Date: 2026-10-05

## Task

GEO-S14-010 documents the mobile app API handoff for employee mobile integration. The scope is documentation-only: create a mobile handoff kit, add QA evidence, and link the new kit from the root documentation indexes.

## Files Reviewed

- `hrms_backend/docs/api/openapi.json`
- `hrms_backend/docs/api/frontend-contract/openapi.json`
- `hrms-client/docs/api/openapi.json`
- `hrms-client/docs/api/frontend-contract/openapi.json`
- `hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md`
- `hrms_backend/src/modules/attendance/routes.ts`
- `hrms_backend/src/modules/attendance/command-service.ts`
- `hrms_backend/src/modules/attendance/offline-sync-contract.ts`
- `hrms_backend/src/modules/platform/routes.ts`
- `hrms_backend/src/plugins/auth.ts`
- `hrms_backend/src/plugins/errors.ts`
- `hrms-client/src/domains/attendance/api.ts`
- `hrms-client/src/domains/attendance/use-manual-attendance-action.ts`
- `hrms-client/src/routes/_app/admin-settings.policies.tsx`

## Deliverables

- Created `docs/knowledge-transfer/mobile-api-handoff.md`.
- Updated `docs/README.md`.
- Updated `docs/knowledge-transfer/README.md`.
- Created this QA summary at `hrms_backend/docs/qa/runs/geo-s14-010/summary.md`.

## Coverage

The handoff kit covers:

- Employee mobile endpoint scope.
- Bearer authentication and current no-refresh-token behavior.
- Registered-device registration, status behavior, and `registered_device_id` semantics.
- Online attendance command envelope.
- Coordinate and permission-denied attendance request examples.
- Attendance response fields, geo outcomes, and safe reason-code handling.
- Error handling, idempotency, replay, and mobile retry rules.
- Manual geo fallback submit flow.
- Attendance read/self-evidence boundaries.
- Leave, WFH, EMS profile, holiday, and notification endpoint placement in the mobile scope.
- Provisional offline sync semantics.
- Privacy and exact-location boundaries.
- Admin policy placeholders that are not live mobile runtime policy.
- Generated type and SDK guidance for mobile teams.

## Contract Change Confirmation

No backend contract, OpenAPI file, frontend contract, generated API document, source file, schema, route, service, test, migration, or package manifest was intentionally changed for GEO-S14-010.

## Validation Results

| Command | Directory | Status |
| --- | --- | --- |
| `pnpm api:docs:verify` | `hrms_backend` | Blocked before verifier script. Lockfile supply-chain policy passed, then pnpm stopped during dependency status/install with `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.27.7`. |
| `pnpm api:consumer:verify` | `hrms_backend` | Blocked before verifier script. Same pnpm dependency approval gate: `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.27.7`. |
| `git diff --check` | repository root | Passed. |

## Environment Limitations

The two pnpm verification commands did not reach OpenAPI or consumer-contract verification. The local pnpm runner performed its dependency status/install check first and exited because `esbuild@0.27.7` has an ignored build script that requires `pnpm approve-builds`. No contract drift was reported; no contract verifier output was produced.

## Remaining Risks

- Mobile SDK generation is not provided by the repository; mobile teams must generate or hand-write native client bindings from the committed OpenAPI contract.
- Offline sync remains provisional and does not create authoritative attendance punches or payroll state.
- There is no refresh-token endpoint in the current authentication contract.
