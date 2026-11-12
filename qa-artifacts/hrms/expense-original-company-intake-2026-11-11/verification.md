# TEN-S25-007 Expense Original-Company Authority Verification

Date: 2026-11-11

Owner: Anurag Kumar

Branch: `sprint-25/ten-s25-007-expense-auth`

Exact transaction implementation: `c44a01bb3067cac20d513bfcd8105746b25d8ade`

Exact reviewed integration correction: `380f0708930029e5581ae43bdefcbca79ca74583`

Task base: `eb6e94a86d8a9447eba9b42aed9dd2a9a02ebdf8`

Target: `release-01`

## Outcome

The transaction implementation has no independently established scoped P0-P3 source defect, and the exact integration correction passed independent senior, data-integrity and QA review. The task is not Done or merge-ready because the mandatory changed-line/branch coverage gate remains red. PostgreSQL generic document listing and receipt-byte availability, hosted cutover/reconciliation, and human browser journeys are not verified.

## Approved authority outcomes covered

- A durable requester may read their own original-company historical expense after transfer.
- Current original-company Finance may finish its company's eligible expense under the configured assignment and segregation rules.
- Current original-company Admin and Auditor may read historical ticket detail.
- Raw receipt access allows the durable requester, assigned Manager/Finance, and Admin under the parent policy; Auditor alone is denied.
- Foreign-company identifiers, stale roles, inactive actors, ambiguous owners, invalid related IDs, and self-processing attempts fail closed without committed child, audit, notification, outbox, or object-I/O effects in the exercised paths.

## Functional evidence

`./scripts/agent/verify-change.sh` completed successfully at the earlier source revision `039cad06`; its full-gate counts below are historical evidence and are not presented as an exact-head rerun:

- sensitive-file and committed/unstaged/staged patch checks: passed;
- agent setup and documentation references: passed;
- verifier tests: 16/16 passed;
- disposable database preflight: passed;
- backend lint/typecheck: passed;
- backend unit tests: 54 files, 560 tests passed;
- backend contracts: 28/28 passed;
- OpenAPI drift and API consumer checks: passed;
- migration history/schema drift: 65 migrations, passed;
- no-cross-schema foreign keys: passed;
- local Cloudflare Queue DLQ/replay: passed;
- frontend lint: zero errors, 43 existing Fast Refresh warnings;
- frontend typecheck: passed;
- frontend unit tests: 5 files, 21 tests passed;
- production configuration guard: passed;
- Vercel production build and SSR smoke: passed with HTTP 200;
- implemented-route and frontend-contract route guards: passed.

Generated contract equality:

- four OpenAPI artifacts: `45dce3419d441c5c7f5b9aba8869fec46f4c51710fc98233a96ee3113657f9d1`;
- two endpoint indexes: `65b152af94e21ea7068224bd778c9ee92e5f8bdd2cbec9d4621f1aa1e6f66a0c`.

At exact correction revision `380f0708`:

- the four previously failing integration files passed 37/37 sequentially against disposable Docker PostgreSQL/Valkey;
- the complete integration project exercised 359 cases: 358 passed in the full run, while the PostGIS capability test correctly refused an invalid equal `DATABASE_URL`/`TEST_DATABASE_URL` setup; that same remaining test passed 1/1 immediately with distinct disposable databases;
- backend lint passed for 492 files, typecheck passed, and `git diff --check` passed;
- the correction changes test fixtures/oracles only and does not claim PostgreSQL document list or receipt upload availability.

## Independent review

- The prior security/database review accepted `d8222011`, senior review accepted `14118568`, and QA accepted `039cad06` for their then-current scopes.
- At transaction head `c44a01bb`, independent senior, data-integrity and QA reviews found no additional scoped source defect but rejected the head because backend integration and changed coverage were red and evidence was stale.
- At correction head `380f0708`, all three independent reviewers passed the four-file correction with no P0-P2 finding. The tests preserve exact attendance evidence, require a real historical shift, prevent bootstrap-token exposure from `/auth/me`, and assert fail-closed SQL document/receipt behavior without claiming it is implemented.
- Residual non-blocking P3: automate subprocess tests that deliberately corrupt/miss each generated artifact and assert the verifier diagnostic. Equality is already asserted in the 28-test contract suite; the negative verifier behavior was manually and independently exercised.

## Coverage gate — failed

Coverage report generation itself passed at final evidence head `0b6ea636`:

- backend coverage run: 54 files/560 tests passed;
- frontend coverage run: 5 files/27 tests passed;
- changed-coverage gate regression tests: 25/25 passed, with 100% line coverage for the gate scripts.

Mandatory changed coverage remains red:

| Diff | Changed executable lines | Changed branches | Unmeasured/deletion/config paths |
| --- | ---: | ---: | ---: |
| `origin/release-01` merge base `6881d9db..0b6ea636` | 841/4,484 | 109/640 | 30 |

This is not clearance. Coverage exclusions were not weakened and no manual evidence was used as a bypass. GitHub CI must reproduce the exact-head result after push.

## Remaining hard gates

- Add the missing unit decision coverage or split/rebase the stacked work so every submitted executable change has a passing gate.
- Implement tenant-scoped PostgreSQL `GET /documents`; the current blanket 409 is a deliberate fail-closed outage, not a completed feature.
- Implement and verify transaction-owned SQL receipt authorization with private object storage; current SQL receipt routes intentionally return 409 before object I/O.
- Reconcile quarantined historical ticket owners from independent evidence before hosted migration/cutover.
- Complete report export persistence/authorization and the separately approved DEC-024 settlement arithmetic work.
- Run real-browser Employee, Manager, Finance, Admin, Auditor and adversarial tenant journeys in an isolated environment.
- Run hosted Render/Vercel/Neon/Upstash/Cloudflare configuration and recovery verification after explicit deployment authorization.
- Publish the exact-head task/case evidence to the Sprint 25 sheet and read it back.

## Release disposition

Draft PR only. Do not merge, deploy, migrate hosted data, enable Cloudflare workers, or mark Sprint 25 cases Passed from this evidence.
