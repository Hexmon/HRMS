# TEN-S25-007 Expense Original-Company Authority Verification

Date: 2026-11-11

Owner: Anurag Kumar

Branch: `sprint-25/ten-s25-007-expense-auth`

Exact reviewed implementation: `039cad06ab624566bcfb75634a83453ae0536de6`

Task base: `eb6e94a86d8a9447eba9b42aed9dd2a9a02ebdf8`

Target: `release-01`

## Outcome

The functional change-aware gate and independent exact-head review pass. The task is not Done or merge-ready because the mandatory changed-line/branch coverage gate remains red. SQL receipt-byte availability, hosted cutover/reconciliation, human browser journeys, and shared-sheet readback are not verified.

## Approved authority outcomes covered

- A durable requester may read their own original-company historical expense after transfer.
- Current original-company Finance may finish its company's eligible expense under the configured assignment and segregation rules.
- Current original-company Admin and Auditor may read historical ticket detail.
- Raw receipt access allows the durable requester, assigned Manager/Finance, and Admin under the parent policy; Auditor alone is denied.
- Foreign-company identifiers, stale roles, inactive actors, ambiguous owners, invalid related IDs, and self-processing attempts fail closed without committed child, audit, notification, outbox, or object-I/O effects in the exercised paths.

## Exact functional gate

`./scripts/agent/verify-change.sh` completed successfully at `039cad06`:

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

## Independent review

- Security/database exact review accepted `d8222011` with no P0-P3 scoped finding.
- Senior exact review accepted `14118568` with no P0-P3 scoped finding.
- QA exact review accepted `039cad06` with no P0-P2 finding. QA independently demonstrated that runtime-source drift and each contract-mirror drift fail `pnpm api:docs:verify` with exit code 1.
- Residual non-blocking P3: automate subprocess tests that deliberately corrupt/miss each generated artifact and assert the verifier diagnostic. Equality is already asserted in the 28-test contract suite; the negative verifier behavior was manually and independently exercised.

## Coverage gate — failed

Coverage report generation itself passed:

- backend coverage run: 54 files/560 tests passed and stamped exact HEAD;
- frontend coverage run: 5 files/21 tests passed and stamped exact HEAD;
- changed-coverage gate regression tests: 25/25 passed, with 100% line coverage for the gate scripts.

Mandatory changed coverage remains red:

| Diff | Changed executable lines | Changed branches | Unmeasured/deletion/config paths |
| --- | ---: | ---: | ---: |
| `eb6e94a8..039cad06` | 751/3,349 | 106/481 | 15 |
| `origin/release-01` (`30783aa5`) `..039cad06` | 751/3,349 | 106/481 | 36 |

The extra cumulative paths come from inherited stacked-branch work. Neither result is clearance. Coverage exclusions were not weakened and no manual evidence was used as a bypass.

## Remaining hard gates

- Add the missing unit decision coverage or split/rebase the stacked work so every submitted executable change has a passing gate.
- Implement and verify transaction-owned SQL receipt authorization with private object storage; current SQL receipt routes intentionally return 409 before object I/O.
- Reconcile quarantined historical ticket owners from independent evidence before hosted migration/cutover.
- Complete report export persistence/authorization and the separately approved DEC-024 settlement arithmetic work.
- Run real-browser Employee, Manager, Finance, Admin, Auditor and adversarial tenant journeys in an isolated environment.
- Run hosted Render/Vercel/Neon/Upstash/Cloudflare configuration and recovery verification after explicit deployment authorization.
- Publish complete case bodies and evidence to the Sprint 25 sheet and read them back after Google Drive is connected.

## Release disposition

Draft PR only. Do not merge, deploy, migrate hosted data, enable Cloudflare workers, or mark Sprint 25 cases Passed from this evidence.
