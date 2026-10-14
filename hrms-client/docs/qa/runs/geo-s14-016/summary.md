# GEO-S14-016 Privacy Notice / Settings UI

## Scope

- Implemented a read-only employee attendance privacy notice.
- Added a policy-derived backend privacy summary for the authenticated employee.
- Did not add editable privacy settings, employee consent persistence, opt-out handling, or privacy preference storage.
- Did not change attendance mutation, geo collection, offline sync, registered-device lifecycle, exact-location reveal, reporting/export, or retention worker behavior.

## Backend Privacy API

- Endpoint: `GET /api/v1/attendance/privacy`.
- Scope: authenticated employee self-service only.
- Authorization: uses the existing active-company attendance context and self-attendance authorization convention.
- Request selection fields such as employee ID, company ID, policy ID, assignment ID, manager ID, and actor ID are not accepted.
- Response is a strict employee-safe DTO, not the raw effective policy object.

## Effective Policy Resolution

- Reuses `resolveEffectiveAttendancePolicy`.
- Uses server `as_of` generated at request time.
- Preserves existing precedence: employee assignment, department assignment, company assignment, built-in default.
- The response describes the currently effective policy only.

## Policy Context

- Response includes `generated_at` and `as_of`.
- UI states that current policy applies to newly collected evidence.
- UI states that earlier evidence may have been collected under a different policy version.

## Manual / Geo / Offline Collection

- Manual-only mode explains that normal web attendance does not require exact coordinates.
- Geo modes explain one-time browser location requests during attendance actions.
- Permission-denied, unavailable-location, outside-fence, boundary-uncertain, stale-evidence, and accuracy-exceeded outcomes are derived from backend action fields.
- Offline/mobile text explains registered-device requirement, provisional server receipt, optional location evidence, and no payroll-final status from offline sync alone.

## Coordinate Retention

- Backend derives retention using `resolveCoordinateRetention` from the effective policy.
- UI formats `coordinate_retention_seconds` dynamically.
- No hardcoded current retention duration is used.

## Purge Worker Caveat

- UI explains that precise coordinates become eligible after the configured retention period.
- UI explains that a background worker processes eligible records and removal is not guaranteed at the exact expiry instant.

## Historical Evidence

- DTO marks `applies_to_new_coordinate_evidence` as `true`.
- DTO marks `historical_evidence_uses_recorded_expiry` as `true`.
- UI distinguishes precise-coordinate purge from retention of ordinary attendance records, derived decisions, review metadata, and audit history.

## Evidence Access

- Routine employee view: sanitized own evidence.
- Manager view: scoped sanitized evidence.
- HR/Admin/Auditor view: role-scoped sanitized evidence.
- Reports and exports continue to exclude exact coordinates.

## Exact-Location Authorization

- DTO states employees cannot view exact coordinates directly.
- DTO states exact reveal requires record visibility and `attendance:view_exact_location`.
- Existing exact-location authorization and reveal path were not changed.

## Exact-Location Audit

- DTO states successful authorized exact-coordinate reveals are audited.
- DTO states denied reveal attempts are not guaranteed in the exact-coordinate audit.
- Existing audit implementation was not changed.

## Browser Permission

- DTO exposes browser permission control as `browser_or_os_settings`.
- UI explains employees control browser/OS location permission outside HRMS.
- Privacy page does not request or capture location.

## Employee Actions

- Review attendance evidence: `/attendance/calendar`.
- Correct attendance: `/attendance`.
- Manage registered devices: `/ems/profile`.

## Privacy Data Exclusions

The privacy DTO and UI do not expose raw sensitive values or internal identifiers such as:

- latitude
- longitude
- exact coordinate values
- raw geofence geometry
- geofence IDs
- policy IDs
- policy version IDs
- policy assignment IDs
- location evidence IDs
- attendance event IDs
- command IDs
- client event IDs
- registered device IDs
- installation hashes
- audit IDs
- request snapshots
- raw location payloads
- attestation details
- session tokens

## Responsive Verification

- New privacy E2E verifies 320 x 568.
- New privacy E2E verifies 390 x 844.
- Assertions include no document-level horizontal overflow and visible section headings.

## OpenAPI / Generated Contracts

- Regenerated `hrms_backend/docs/api/openapi.json`.
- Regenerated `hrms_backend/docs/api/frontend-contract/openapi.json`.
- Regenerated `hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md`.
- Verified docs and consumer handoff with compiled scripts.

## Backend Tests

- Added `hrms_backend/src/modules/attendance/__tests__/attendance-privacy.integration.test.ts`.
- Coverage includes authentication, self-service authorization, authenticated employee scope, policy precedence, geo actions, manual fallback, retention semantics, exact-location summary, offline summary, and privacy exclusions.
- Integration execution is environment-blocked locally because PostgreSQL is unavailable at `127.0.0.1:55432`.

## Frontend Tests

- Added `hrms-client/e2e/attendance-privacy.spec.ts`.
- Coverage includes navigation, no geolocation side effects, manual-only policy text, geo policy text, dynamic retention, evidence access, exact-location boundary text, offline provisional text, real employee action links, no fake settings, error state, and mobile viewports.
- Updated `hrms-client/e2e/attendance-manager-exact-location.spec.ts` to assert the current rendered exact-location summary copy after permission denial.

## Validation Results

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm lint` from `hrms_backend` | BLOCKED | `ERR_PNPM_IGNORED_BUILDS esbuild@0.27.7` before lint ran. |
| `pnpm typecheck` from `hrms_backend` | BLOCKED | Same pnpm ignored-build-script gate before typecheck ran. |
| `pnpm build` from `hrms_backend` | BLOCKED | Same pnpm ignored-build-script gate before build ran. |
| `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` from `hrms_backend` | PASS | Backend typecheck completed. |
| `node node_modules/typescript/bin/tsc -p tsconfig.build.json` from `hrms_backend` | PASS | Backend build compile completed. |
| `node node_modules/tsc-alias/dist/bin/index.js -p tsconfig.build.json` from `hrms_backend` | PASS | Backend compiled alias rewrite completed. |
| `node dist/scripts/lint.js` from `hrms_backend` | FAIL | Pre-existing repository hygiene: frontend-only monorepo references in docs/scripts, old migration missing newlines, unrelated whitespace in attendance attestation adapter and reports test. |
| `node node_modules/vitest/vitest.mjs run --project integration src/modules/attendance/__tests__/attendance-privacy.integration.test.ts` | BLOCKED | PostgreSQL connection refused at `127.0.0.1:55432`. |
| `node node_modules/vitest/vitest.mjs run --project integration src/modules/attendance/__tests__/attendance-policy-resolver.integration.test.ts src/modules/attendance/__tests__/attendance-location-retention.integration.test.ts` | BLOCKED | PostgreSQL connection refused at `127.0.0.1:55432`. |
| `node node_modules/vitest/vitest.mjs run --project contracts` | BLOCKED | Contract suite partially loaded, then PostgreSQL connection refused at `127.0.0.1:55432`. |
| `node dist/scripts/api-docs-generate.js` from `hrms_backend` | PASS | OpenAPI generated. |
| `node dist/scripts/api-frontend-contract-generate.js` from `hrms_backend` | PASS | Frontend endpoint contract generated for 281 operations. |
| `node dist/scripts/api-docs-verify.js` from `hrms_backend` | PASS | API docs verification passed. |
| `node dist/scripts/api-consumer-verify.js` from `hrms_backend` | PASS | API consumer handoff verification passed. |
| `pnpm lint` from `hrms-client` | BLOCKED | `ERR_PNPM_IGNORED_BUILDS esbuild@0.27.7` before lint ran. |
| `pnpm typecheck` from `hrms-client` | BLOCKED | Same pnpm ignored-build-script gate before typecheck ran. |
| `pnpm build` from `hrms-client` | BLOCKED | Same pnpm ignored-build-script gate before build ran. |
| `node_modules/.bin/eslint.cmd e2e/attendance-privacy.spec.ts src/domains/attendance/privacy-copy.ts src/routes/_app/attendance.privacy.tsx` | PASS | Focused new privacy files lint clean. |
| `node_modules/.bin/eslint.cmd e2e/attendance-manager-exact-location.spec.ts` | PASS | Updated exact-location regression lint clean. |
| `node_modules/.bin/eslint.cmd e2e/attendance-privacy.spec.ts e2e/attendance-manager-exact-location.spec.ts src/domains/attendance/api.ts src/domains/attendance/queries.ts src/domains/attendance/privacy-copy.ts src/routes/_app/attendance.tsx src/routes/_app/attendance.privacy.tsx src/routeTree.gen.ts` | PASS | All touched frontend source/test files lint clean. |
| `node_modules/.bin/tsc.cmd --noEmit --project tsconfig.json` from `hrms-client` | PASS | Frontend typecheck completed. |
| `node_modules/.bin/vite.cmd build` from `hrms-client` | PASS | Production build completed. |
| `node_modules/.bin/playwright.cmd test e2e/attendance-privacy.spec.ts` | FAIL | Path did not match tests under configured `testDir`; rerun with filename pattern. |
| `node_modules/.bin/playwright.cmd test attendance-privacy.spec.ts` | PASS | 6 privacy tests passed. |
| `node_modules/.bin/playwright.cmd test attendance-browser-geo.spec.ts attendance-mobile-responsive.spec.ts attendance-manager-exact-location.spec.ts device-management.spec.ts` | FAIL | Parallel mocked regression batch produced harness timeouts and one stale exact-location assertion; rerun serially. |
| `node_modules/.bin/playwright.cmd test attendance-browser-geo.spec.ts attendance-mobile-responsive.spec.ts attendance-manager-exact-location.spec.ts device-management.spec.ts --workers=1` | FAIL | 32/33 passed; remaining failure was stale exact-location assertion. |
| `node_modules/.bin/playwright.cmd test attendance-manager-exact-location.spec.ts --workers=1` | PASS | 4 exact-location regression tests passed after assertion update. |
| Static sensitive-field search over new privacy files | PASS | Hits were explanatory text, DTO booleans, existing unrelated attendance APIs, or negative exclusion assertions; no privacy DTO/UI raw sensitive values found. |
| `git diff --check` from repository root | PASS | No whitespace errors; Git printed CRLF normalization warnings only. |

## Environment Limitations

- PostgreSQL is unavailable at `127.0.0.1:55432`, blocking backend integration and contract execution.
- `pnpm` command wrapper attempts are blocked by `ERR_PNPM_IGNORED_BUILDS esbuild@0.27.7`.
- Direct local binaries were used for TypeScript, Vite, ESLint, Playwright, and compiled API docs tooling.
- Existing backend lint hygiene failures remain outside GEO-S14-016 scope.

## Migration Statement

**No database migration was required.**

## Out Of Scope

- Consent acknowledgement.
- Editable retention settings.
- Editable geo policy.
- Coordinate deletion.
- Exact-location permission changes.
- Retention worker changes.
- Legal policy drafting.
