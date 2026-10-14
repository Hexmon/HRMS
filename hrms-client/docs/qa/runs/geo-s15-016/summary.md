# GEO-S15-016 QA Summary

Date: 2026-10-08
Branch: sprint-15/geo-s15-016

## Task

- Task ID: GEO-S15-016
- Domain: Release/demo preparation
- Scope: Sprint 15 attendance release notes, live demo walkthrough, guarded synthetic demo seed, demo sanitization, internal release checklist update, and consolidated QA/release evidence.
- Production frontend/backend business logic changes: none.

## Release Gap Traceability

| Gap | Required outcome | Evidence |
| --- | --- | --- |
| `GEO-S15-016-R01` | Sprint 15 attendance release notes | `docs/release/sprint-15-attendance-release-notes.md` |
| `GEO-S15-016-R02` | Live demo walkthrough | `docs/release/sprint-15-attendance-demo-walkthrough.md` |
| `GEO-S15-016-R03` | Persistent synthetic attendance demo seed | `hrms_backend/scripts/seed-s15-attendance-demo.ts` and `release:seed:attendance-demo` |
| `GEO-S15-016-R04` | Demo coordinate/site sanitization | Synthetic site/geofence labels, production/remote seed guards, no release-doc coordinate disclosure |
| `GEO-S15-016-R05` | Consolidated Sprint 15 QA/release evidence mapping | This QA summary and Sprint 15 evidence matrix |

The internal release checklist is a required artifact, but it is not a replacement Rxx item.

## Release Artifacts

- Added Sprint 15 attendance release notes at `docs/release/sprint-15-attendance-release-notes.md`.
- Added live demo walkthrough at `docs/release/sprint-15-attendance-demo-walkthrough.md`.
- Updated the internal QA checklist with a GEO-S15-016 release/demo readiness gate.
- Client checklist was inspected and left unchanged because it is a high-level client-facing release-blocker summary, while this task adds internal demo/release execution detail.

## Demo Data

- Added backend script `hrms_backend/scripts/seed-s15-attendance-demo.ts`.
- Added package script `release:seed:attendance-demo`.
- Seeded scenario design covers:
  - manual web attendance for `E1`;
  - web geo attendance for `E2`;
  - pending geo manual fallback review for `E1`;
  - pending regularization review for `E2`;
  - attendance report segmentation across manual, geo, review-required, and pending-correction rows.
- Date strategy is a deterministic rolling four-day window ending on the seed execution date in `Asia/Kolkata`: manual = seed date - 3, geo = seed date - 2, fallback = seed date - 1, regularization = seed date.
- The seed prints the concrete `date_range` after a successful run. This local run did not reach script startup, so no local concrete seeded range or database mutation is verified.

## Demo Personas

| Persona | Use |
| --- | --- |
| `ADM` | Admin geo/settings context |
| `E1` | Manual attendance and fallback review scenario |
| `E2` | Geo attendance and regularization scenario |
| `D1` | Manager review queue |
| `AUD` | Report/export read validation |

## Demo Seed Safety

- The seed refuses production-marked environments.
- The seed refuses remote database hosts unless `S15_ATTENDANCE_DEMO_SEED_ALLOW_REMOTE=true` is explicitly set.
- The seed bootstraps missing default company/session preference context for release personas without changing unrelated application logic.
- The seed tags synthetic rows with `GEO-S15-016`.
- The demo work site and geofence are labeled synthetic Sprint 15 demo data.
- The seed does not create open attendance sessions, so live manual punching remains possible in a clean dedicated demo environment.
- The seed avoids global cleanup and only upserts/resets rows it owns.

## Release Claims Review

- No native mobile app delivery is claimed.
- Mobile readiness is described as API/contract readiness: idempotency semantics, registered-device expectations, and provisional offline sync posture.
- GEO-S15-014 remains explicitly documented as pending stakeholder/UAT feedback; no UAT pass is claimed.
- Exact-location controls are described as permissioned, gated, and audited.

## Sensitive-Data Review

- Release notes and walkthrough do not include passwords, bearer tokens, production credentials, database URLs, or exact coordinate values.
- The seed script contains synthetic coordinate constants only to exercise exact-location permission/audit behavior in non-production databases.
- The walkthrough directs presenters to approved seeded login methods instead of documenting credentials.

## Sprint 15 QA Evidence Matrix

| Task | Evidence |
| --- | --- |
| GEO-S15-010 | Attendance admin/employee manual setup QA summary |
| GEO-S15-011 | Manager decision/action QA summary |
| GEO-S15-012 | Export/report QA summary |
| GEO-S15-013 | Documentation/API handoff QA summary |
| GEO-S15-014 | UAT intake deferred summary |
| GEO-S15-015 | Accessibility/responsive QA summary |
| GEO-S15-016 | This release/demo readiness summary |

## Walkthrough Validation

- Walkthrough covers pre-demo setup, personas, date range, manual attendance, geo attendance, manual fallback review, regularization review, reporting/export segmentation, privacy, and mobile-ready positioning.
- It includes contingencies for prior demo runs, permission-denied browser location, unavailable export adapters, and decided review rows.
- It avoids exact coordinate values and seeded credential values.

## Demo Seed Validation

- Seed implementation/static validation: PASS.
- TypeScript compilation passed.
- Focused Prettier check passed.
- `git diff --check` passed with Git line-ending warnings only.
- Runtime seed execution was blocked in this local shell before script startup because Node's `os.userInfo()` call fails with `uv_os_get_passwd returned ENOMEM`; `tsx` depends on that call for temporary-directory setup.
- The `pnpm release:seed:attendance-demo` wrapper was also blocked before script startup by local pnpm ignored-build policy for `esbuild`.
- Seed execution/database mutation validation: BLOCKED by local environment.
- No successful database mutation, runtime idempotency, UI row visibility, manager queue population, or report population is claimed in this local validation pass.

## Release Checklist

- Release notes created: PASS.
- Walkthrough created: PASS.
- Demo seed script created: PASS.
- Internal checklist updated: PASS.
- Client checklist inspected and left unchanged: PASS.
- Backend typecheck: PASS.
- Seed implementation/static validation: PASS.
- Seed execution/database mutation validation: BLOCKED by local runtime/package-manager environment before script startup.
- Production code/API/migration/dependency scope: PASS, unchanged except optional seed script/package command.

## Validation

| Command | Result |
| --- | --- |
| `hrms_backend`: `.\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit` | PASS |
| `hrms-client`: focused Prettier check for release docs, checklist, package, and seed script | PASS |
| repository: `git diff --check` | PASS with Git line-ending warnings only |
| repository: sensitive-data scan across GEO-S15-016 release artifacts | PASS for release docs/evidence; only synthetic coordinate constants inside the seed script matched |
| `hrms_backend`: `.\node_modules\.bin\tsx.cmd scripts\seed-s15-attendance-demo.ts` | BLOCKED before script startup: Node `os.userInfo()` failed with `uv_os_get_passwd returned ENOMEM` |
| `hrms_backend`: `pnpm.cmd release:seed:attendance-demo` | BLOCKED before script startup: pnpm ignored-build policy for `esbuild` |

## Known Limitations

- Local seed execution could not be proven because the shell runtime failed before script startup.
- Hosted/non-production remote seeding still requires explicit approval and `S15_ATTENDANCE_DEMO_SEED_ALLOW_REMOTE=true`.
- Exact-location reveal may show restricted/unavailable states unless the signed-in role has the required permission.
- GEO-S15-014 remains deferred until real stakeholder/UAT feedback exists.

## Scope Confirmation

- No frontend production components were changed.
- No backend attendance business logic was changed.
- No API routes, OpenAPI contracts, database migrations, or dependencies were added.
- Only release/demo documentation, QA documentation, an optional seed script, and package script wiring changed.

## Git Diff Summary

- Added `hrms_backend/scripts/seed-s15-attendance-demo.ts`.
- Updated `hrms_backend/package.json` with `release:seed:attendance-demo`.
- Added Sprint 15 attendance release notes and demo walkthrough.
- Updated `qa/TESTING_CHECKLIST_INTERNAL.md`.
- Added this GEO-S15-016 QA evidence summary.
