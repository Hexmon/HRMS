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
- Stable PostgreSQL and memory-mode conflict reasons; the UI distinguishes stale, duplicate and generic failures.
- Partial case-insensitive Holiday uniqueness; unsafe leaf-only RLS was removed after lifecycle review.
- Company-owned role grants and transfer approval were removed from this slice because their broader identity/authentication design is unfinished.
- The composite QA seed now checks the explicit safe target before either the broad release seed or QA extras can mutate data. On a fresh isolated database it creates the exact deterministic QA company and release-Admin preference before adding deterministic personas. An existing Admin preference or same-slug company must match that exact active company UUID; a foreign or inactive identity fails closed and rolls back. The mutation opt-in exists only in the one-shot migration container.
- The Compose file defaults to the config-valid local harness (`APP_ENV=local`, `NODE_ENV=development`, mock storage enabled). Hosted QA must explicitly supply `APP_ENV=qa`, `NODE_ENV=production`, mock storage disabled and its provider configuration.
- Browser journey performs real Admin and HR mutations and a forged Employee PUT denial.

Baseline executable revision `8e0b04128db4deb836119aa84e00ae9399c637df` passed on 2026-11-13:

- backend unit 563/563 and contracts 27/27;
- focused Holiday/seed guard 18/18 and frontend Holiday component 9/9;
- disposable PostgreSQL Holiday transaction suite 4/4, including Admin/HR foreign-ID denial, rollback, concurrency, cross-company duplicate allowance and soft-delete key reuse;
- clean migration/schema verification with 65 migrations, no unresolved cross-schema foreign keys, API docs and consumer contract checks;
- backend/frontend typecheck, backend lint, frontend lint with 43 pre-existing warnings and no errors, and both production builds;
- guarded seed production refusal before connection, isolated QA extras seed, and Docker Chromium real-user journey 1/1 (Admin, HR, Employee and two-tab stale edit).

Executable revision `09a9e98762f9e4d84838e0cf8d4a00819dde523b` added the initial QA-startup correction and memory-mode conflict compatibility. The following focused evidence passed on 2026-11-13 before the later deterministic-identity hardening:

- `env TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:59999/hrms_unit_synthetic pnpm exec vitest run --project unit src/__tests__/qa-seed-safety.unit.test.ts src/modules/leave-wfh/__tests__/holiday-tenant.unit.test.ts`: 2 files and 24/24 tests passed;
- `pnpm typecheck`: passed;
- `pnpm lint`: passed for 483 backend files;
- `docker --context default compose --env-file .env.qa.example -f infra/docker/docker-compose.qa.yml -p hawkaii_hrms_backend_qa config --quiet`: passed;
- fresh disposable-volume run with local synthetic overrides, `env POSTGRES_PASSWORD=postgres POSTGRES_HOST_PORT=56432 VALKEY_HOST_PORT=57379 API_HOST_PORT=3201 CLOUDINARY_MOCK_UPLOADS=true docker --context default compose --env-file .env.qa.example -f infra/docker/docker-compose.qa.yml -p hrms_holiday_compose_fix up --build --abort-on-container-exit --exit-code-from hawkaii-hrms-migrate hawkaii-hrms-migrate`: exited 0 after applying 65 migrations and completing both guarded release and QA-extra seed phases;
- repeating that Compose command against the retained disposable database exited 0 with 0 migrations applied, 65 already applied, and both seed phases successful;
- `docker --context default exec hrms_holiday_compose_fix-postgres-1 psql -U postgres -d hrms_platform_qa -Atc "SELECT (SELECT count(*) FROM platform.company_profiles WHERE company_slug = 'hawkaii-hrms' AND status = 'active') || ',' || (SELECT count(*) FROM platform.user_session_preferences p JOIN core.users u ON u.id = p.user_id JOIN platform.company_profiles c ON c.id = p.company_id WHERE u.employee_code = 'ADM' AND p.active_role = 'admin' AND c.company_slug = 'hawkaii-hrms' AND c.status = 'active');"` returned `1,1`, proving one active `hawkaii-hrms` company and one matching Admin preference after the rerun;
- `git diff --check`: passed, and the disposable Compose containers, network and volumes were removed after verification.

Final executable revision `509f326a37c154951acf107af02bf18293eb2b6f` hardens deterministic tenant identity, rollback error preservation and effective runtime configuration. The following exact evidence passed on 2026-11-13:

- `env TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:59999/hrms_unit_synthetic pnpm exec vitest run --project unit src/__tests__/qa-seed-safety.unit.test.ts src/__tests__/qa-compose-config.unit.test.ts src/modules/leave-wfh/__tests__/holiday-tenant.unit.test.ts`: 3 files and 32/32 tests passed. These cases include foreign-preference/same-slug refusal, primary-error preservation when rollback fails, effective local/hosted Compose environments and the real runtime configuration floor;
- `env TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57432/hrms_platform_test pnpm exec vitest run --project integration src/__tests__/qa-seed-company-context.integration.test.ts`: 1 file and 4/4 real PostgreSQL tests passed. A foreign active Admin preference and active/inactive same-slug foreign UUID each aborted with the attempted marker rolled back and no rebind/reactivation; an exact deterministic company rerun preserved the original rows unchanged;
- `pnpm typecheck`: passed;
- `pnpm lint`: passed for 485 backend files;
- `qa-compose-config.unit.test.ts` executed `docker compose ... config --format json` with `/dev/null` and `.env.qa.example`: the effective local environment was `local/development/mock=true`; the hosted template was `qa/production/mock=false`; the seed opt-in appeared only on the one-shot migration service;
- fresh local-default stack, `env POSTGRES_HOST_PORT=57432 VALKEY_HOST_PORT=58379 API_HOST_PORT=3301 docker --context default compose --env-file /dev/null -f infra/docker/docker-compose.qa.yml -p hrms_holiday_secure_fix up -d --build --wait`: exited 0 after 65 migrations, guarded release/QA seeding, healthy PostgreSQL/Valkey/API/outbox worker and successful API readiness;
- `curl --fail --silent --show-error http://127.0.0.1:3301/health/ready`: returned `status=ok`, `app_env=local`, `node_env=development`, PostgreSQL ready, Valkey ready and mock object storage ready;
- repeating `docker ... compose ... up -d --wait` against the retained disposable volumes exited 0; migration logs recorded 0 applied/65 already applied and both seed phases successful;
- the disposable Compose services, network and volumes were removed. The associated container `pnpm start` process exited with stack cleanup.

The broader baseline suites were executed at `8e0b0412`; the focused startup delta was tested at `09a9e987`; the security/config hardening above is tested at final executable head `509f326a37c154951acf107af02bf18293eb2b6f`. These results do not substitute for changed-line/branch coverage, hosted QA or human acceptance.

The trusted changed-coverage runner cannot execute on this candidate because QA-S25-003 is not present in `release-01` or this branch. Running the external validator against this exact SHA correctly failed closed on the missing candidate-owned scripts; that is a dependency blocker, not coverage evidence.

## Remaining Completion Gates

1. Land/reconcile QA-S25-003 in the approved dependency order, then measure changed executable lines/branches against `origin/release-01`; do not treat the current tooling refusal as a pass.
2. Obtain independent senior, security/database and QA re-review of the final documentation head after deterministic-company, rollback and effective-environment fixes; resolve material findings.
3. Update Sprint 25 task/case rows only with the verified evidence above and keep coverage/hosted/manual gates pending.
4. Push the clean branch and create the isolated-QA PR/handoff. Do not merge or deploy without explicit owner approval.
5. In hosted isolated QA, repeat migration preflight, smoke checks and the listed human journeys before QA acceptance.

## Hosted QA Requirements

- Dedicated QA PostgreSQL, Valkey, object storage and email-delivery configuration; no production data or credentials.
- `APP_ENV=qa`, `NODE_ENV=production`, `CLOUDINARY_MOCK_UPLOADS=false`, real QA storage-provider configuration and environment-specific secret stores.
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
