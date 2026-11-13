# TEN-S25-016-HOL — Isolated Holiday QA candidate

## Objective

Prepare one coherent Sprint 25 product slice for isolated QA: active Admin and HR users can create and edit their company holidays; Employees can read but cannot mutate; another company cannot read or change the record by UUID; row and outbox commit atomically; stale and duplicate conflicts remain recoverable in the UI.

This is a QA-candidate plan, not deployment authorization or production acceptance.

## Candidate Boundary

- Branch: `sprint-25/ten-s25-016-holiday-qa`, cut directly from `origin/release-01=32b1358e9e96eac4346031e8077cbf311bdd1582`.
- The branch contains no unfinished Asset implementation and no candidate-owned changed-coverage workflow.
- The old stacked Holiday branch and PR are historical only and must not be deployed.
- Product surface: Holiday list/calendar, Admin/HR create and versioned edit, Employee read-only view, direct API authorization, PostgreSQL persistence, transactional outbox and QA seed/browser harness.
- Out of scope: office-specific calendar policy, leave/timesheet historical calculations, broad leave/WFH tenant remediation and hosted deployment.

## Approved Rules And Security Invariants

- A client UUID never grants ownership. A foreign holiday UUID returns 404 after actor/company authorization and causes no row, event or in-memory effect.
- A new UUID creates; a missing UUID with `expected_version` is an edit intent and returns 404.
- An unchanged same-UUID retry is idempotent. A changed existing holiday requires the current version.
- Same-company duplicate name/date/region is case-insensitive and rejected. Soft-deleted rows do not reserve the key. Different companies may use the same key.
- Selecting an Employee UI view does not remove another effective role for the same user. Company-owned role grants and the employee-transfer workflow are not implemented by this candidate; QA must use separate Company A and Company B users and must not treat a preference edit as an approved transfer.
- Database-level RLS remains the separate TEN-S25-017 production dependency. It cannot be safely enabled only for Holidays while startup reload and shared leave/timesheet/report consumers still hydrate cross-company holidays.

## Database And Deployment Order

`release-01` ends at migration 0064. This clean candidate owns:

1. `0065_holiday_company_unique_constraint.sql`: remove the legacy global constraint and add the partial case-insensitive company key.

The API resolves the actor/company before every Holiday read/write. RLS was tested and then removed from this candidate after independent QA demonstrated it would make the existing shared startup reload/full-flush paths incorrect under a restricted role. TEN-S25-017 must migrate all hydrated consumers to request-scoped SQL and test the real restricted runtime lifecycle before production RLS. Company-owned role grants and transfer approval remain a separate identity/authorization prerequisite. Migration 0065 is forward-only after cross-company duplicate keys are written. Old API instances must be drained before migration. Later Asset work must rebase and take migration numbers after 0065. See `docs/runbooks/holiday-sql-cutover.md`.

## Changed Behaviour And Required Evidence

| Area | Required result | Evidence gate |
| --- | --- | --- |
| Admin/HR | Create and edit through the real UI/API | Component plus real Chromium journey |
| Employee | Controls hidden and forged direct PUT denied 403 | Browser API attempt plus SQL integration no-row/no-outbox oracle |
| Tenant UUID | A cannot read/change B; B can still read/edit | Real PostgreSQL A/B integration |
| Effective roles | Employee-selected view still permits another effective Admin/HR role for the same user | Real PostgreSQL integration |
| Conflicts | Only `reason=stale_version` triggers stale recovery; duplicate remains editable | Backend response and component tests |
| Transaction | Row and outbox commit together; injected event failure rolls back | Real PostgreSQL integration |
| Concurrency/retry | One current-version edit wins; duplicate race creates one; unchanged retry emits no event | Two-instance PostgreSQL integration |
| Database defense | API/company predicates and company-aware keys prevent supported cross-tenant access | PostgreSQL A/B integration; RLS remains TEN-S25-017 |
| QA safety | Explicit local/QA opt-in and exact DB-name confirmation; production refused | Seed guard unit tests and isolated seed run |
| QA identity | Employee-code collision fails before dependent persona records | Guard regression and isolated collision rehearsal |

## Current Implementation Status — 2026-11-13

Implemented in the clean worktree:

- Tenant-authorized SQL GET/PUT, atomic outbox, optimistic versioning and idempotent unchanged retry.
- Admin/HR edit UI, stale-draft preservation, explicit latest-version load and multiple same-day calendar rendering.
- Stable backend conflict reasons; the UI distinguishes stale, duplicate and generic failures.
- Partial case-insensitive Holiday uniqueness; unsafe leaf-only RLS was removed after lifecycle review.
- Company-owned role grants and transfer approval were removed from this slice because their broader identity/authentication design is unfinished.
- QA seed checks for explicit safe target, active Admin/company, deterministic persona identity and active persona company preference.
- Browser journey performs real Admin and HR mutations and a forged Employee PUT denial.

Verified before the latest security changes: backend unit 8/8, frontend component 8/8, PostgreSQL 4/4 and Docker Chromium 1/1 at `10c8970a`; PostgreSQL 4/4 at `75f67754` after the migration rename. These are historical revision-specific results, not final-head evidence.

Latest focused development evidence before the RLS correction: backend unit/seed-guard 16/16, frontend component 9/9, backend/frontend typecheck passed and PostgreSQL 5/5 passed. Independent QA then found the leaf-only RLS lifecycle incompatibility; final exact-head reruns are required after its removal.

## Remaining Completion Gates

1. Re-run the four-case disposable PostgreSQL suite, including Admin and HR foreign-UUID denial.
2. Run migration-history/schema-drift/no-cross-schema-FK checks against the dedicated disposable database.
3. Run backend/frontend lint, API contract/consumer checks, production builds and task change gate.
4. Run the guarded QA seed, then the exact-head Docker Chromium journey with Admin, HR and Employee.
5. Measure changed executable lines/branches against `origin/release-01`; list any remaining uncovered path rather than weakening the gate.
6. Obtain exact-head independent senior, security/database and QA review; resolve material findings.
7. Update Sprint 25 task/case rows only with exact verified evidence.
8. Push the clean branch and create the isolated-QA PR/handoff. Do not merge or deploy without explicit owner approval.

## Hosted QA Requirements

- Dedicated QA PostgreSQL, Valkey, object storage and email-delivery configuration; no production data or credentials.
- `APP_ENV=qa`, `NODE_ENV=production` and environment-specific secret stores.
- QA seed requires `HRMS_QA_SEED_ALLOW=true` and `HRMS_QA_SEED_CONFIRM_DATABASE=<exact QA database name>`; values belong in the approved runtime, not source.
- Browser mutation run requires `E2E_ALLOW_HOLIDAY_MUTATIONS=true`, `E2E_EXPECTED_APP_ENV=qa`, the exact QA frontend/API URLs and synthetic role accounts.
- Backup, old-binary drain, migration preflight, smoke monitoring and forward-recovery plan from the runbook.

## Rollback And Known Limits

- Before writes resume, a failed candidate can be rolled back by keeping traffic paused and restoring the reviewed pre-migration backup/build.
- After cross-company duplicate holidays are written, do not reintroduce global uniqueness. Pause writes and roll forward or repair from approved evidence.
- The current candidate does not certify office calendar rules, broad transfer workflow, all modules' tenant isolation, penetration testing, load/soak, accessibility/mobile or human UAT. QA must report those as outside this slice or pending.
- The candidate is not production-ready until TEN-S25-017 replaces shared holiday hydration/flush with tenant-scoped runtime access and verifies RLS using the real restricted application role. Company-owned role grants and the approved transfer workflow also remain separate authorization prerequisites.

## Historical Evidence

The original disposable probe demonstrated the pre-fix foreign-UUID corruption: Company A received HTTP 200 while Company B's row acquired A fields and a misleading event committed. The older stacked branch later mixed Holiday with unfinished Asset/coverage ancestry and used migration 0067. That sequence is superseded by this clean migration-0065 candidate and must not be used as current deployment instruction.
