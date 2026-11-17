# Sprint 25 Holiday QA Increment

## Objective

Prepare the already-integrated Holiday tenant-isolation feature as the first complete QA increment without mixing Admin, Asset, Export, Expense, or Media work into its PR.

## Exact Baseline

- Branch: `sprint-25/ten-s25-016-holiday-contract-sync`
- Base: `origin/release-01` at `b37dfc08f41e9a5bb8d85652ab70e898497405c2`
- Historical QA tip at intake: `origin/qa` at `2f5651f3c5ea8164ef98e6047d09d49aff3402a4`
- QA/release divergence at intake: one QA-only commit and 144 release-only commits
- A dry `git merge-tree --write-tree origin/qa origin/release-01` completed without conflicts and produced tree `bdc0106bd0a5a882e8aee9c77df2f8efad27f1e8`.

Re-fetch and reverify these values before PR publication or QA promotion.

## Scope

1. Keep canonical backend OpenAPI, backend frontend-contract artifacts, and frontend contract mirrors synchronized through supported generation/verification commands.
2. Preserve the existing Holiday request semantics:
   - new ID or unchanged retry may omit `expected_version`;
   - changed existing Holiday requires the current `expected_version`;
   - missing ID with a version, foreign ID, or deleted ID returns not found and creates no ghost record;
   - protected company/owner fields are rejected;
   - only authorized HR/Admin actors may mutate.
3. Verify the real UI/API/PostgreSQL/Valkey path for two synthetic companies with mocks disabled.
4. Include #132 Admin/signup behavior only as unchanged baseline regression. Do not claim the missing Admin reparent UI is delivered here.

## Explicit Non-Scope

- Admin hierarchy UI and pagination
- Asset, Export, Expense, Report, R2, or Media implementation
- Hosted QA configuration, merge, or deployment
- Broad completion of TEN-S25-016 beyond the Holiday slice

## Case Inventory

| ID | Actor/context | Action | Expected result | Required layers |
| --- | --- | --- | --- | --- |
| QAI-H01 | Company A Admin/HR and Employee | Create, reload, edit with current version, list/calendar | One durable Company A row; version and UI refresh are correct; employee is read-only; audit/outbox is authorized | Component, PostgreSQL, browser |
| QAI-H02 | Company A actor, Company B Holiday ID | Attempt edit; submit protected fields; wrong role attempts mutation | No Company B disclosure/change, no ghost Company A row, no forbidden outbox event | Contract, PostgreSQL, browser/API |
| QAI-H03 | Two Company A tabs | Save version N in tab 1; submit stale N in tab 2; refetch and retry; repeat identical request | Honest conflict preserves draft; recovery succeeds; identical retry has one effect and no duplicate event | Component, DB concurrency, browser |
| QAI-H04 | A/B calendars around month/year and UTC boundaries | List/calendar and leave working-day calculation | Civil date is stable and results remain company-scoped | Unit, integration, browser |
| QAI-H05 | Contract maintainer | Generate and verify API docs | All generated backend and frontend OpenAPI/index mirrors are byte-identical and drift fails verification | Unit/script, contract gate |
| QAI-H06 | Existing #132 baseline | Signup distinct companies and Admin master CRUD smoke | Existing behavior remains passing; no claim of Admin hierarchy UI completion | PostgreSQL, component smoke |

New execution evidence must record exact head, environment and actual status. Existing historical results are not automatically carried forward as a pass.

## Migration And Compatibility

This increment adds no migration. The integrated release ledger remains:

1. `0065_holiday_company_unique_constraint.sql`
2. `0066_attendance_policy_version_replay_guard.sql`
3. `0067_signup_employee_code_sequence.sql`

Before QA promotion, verify clean install, upgrade, replay/status and compatible recovery on disposable PostgreSQL. Do not import colliding `0065`-`0067` migrations from open Asset/Report/Expense/Media branches.

## Verification Order

1. Focused generator/mirror tests and Holiday unit/component tests.
2. OpenAPI generation, drift verification, consumer and frontend route/config guards.
3. Disposable Docker PostgreSQL and Valkey migrations plus Holiday/auth/Admin integration regression.
4. Real API-backed browser journeys with mock fallback disabled: desktop/mobile, keyboard, light/dark, stale tab, double submit, refresh/back and disconnect/recovery.
5. Change-aware verifier, changed executable line/branch coverage, then full gate once stable.
6. Independent senior/security/database and QA review at the final exact SHA. If unavailable, keep review pending.

## Rollback

- Revert the focused contract synchronization commit/PR.
- Runtime Holiday behavior and migrations are unchanged by this increment.
- Do not remove or rewrite applied migrations `0065`-`0067`.
- The browser journey mutates only a dedicated disposable QA database. Reset or
  discard that database after the run; never attempt deterministic cleanup in a
  shared database. If the release seed succeeds but the extras seed fails,
  discard/reset the dedicated database and rerun both phases from a clean ledger.
- Hosted QA seeding requires a QA-only database role plus a database-resident
  marker (`COMMENT ON DATABASE ... IS 'hawkaii-qa:<fingerprint>'`) provisioned
  independently from the seed job. Production databases must not carry this marker.

## Checkpoints

- Feature branch PR targets `release-01`; the owner merges it.
- After the owner confirms the merge, re-fetch the actual release merge SHA and prepare a history-preserving `release-01` to `qa` promotion candidate.
- Do not merge or deploy `qa` without explicit approval.

## Current Evidence (pre-commit working tree)

- Backend unit coverage run: 53 files / 610 tests passed; the changed-coverage
  stamp correctly refused the dirty working tree and must be rerun at the commit.
- Focused PostgreSQL integration: 3 files / 21 tests passed against disposable
  Docker PostGIS; Valkey remained isolated on loopback.
- Frontend Holiday component: 14 tests passed, including URL month persistence.
- Real API-backed Chromium with mocks disabled: 2 journeys passed (Admin, HR,
  Employee and Company B Admin; foreign known ID, protected field, stale tab,
  identical retry, mobile, keyboard, light/dark toggle, double action,
  disconnected retry, year boundary, back and refresh).
- Contract suite: 27 tests passed when the explicit production-style test
  environment supplied `BUILD_SHA`, a test-only `LOCAL_DEMO_PASSWORD`, and
  `RATE_LIMIT_ENABLED=true`. The earlier run without these settings is retained
  as a failed environment-configuration attempt, not a product pass.
- Independent preliminary senior, security/database and QA reviews found
  actionable gaps; fixes are implemented but exact-commit re-review remains
  required.
