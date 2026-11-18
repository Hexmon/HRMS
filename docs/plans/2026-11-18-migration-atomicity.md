# Migration Runner Atomicity Before QA Promotion

## Objective And Success Criteria

- Objective: keep every migration body and its ledger insert in one runner-owned PostgreSQL transaction without changing the already released `0065` migration file or checksum.
- User/business outcome: `release-01` can be promoted to isolated QA without a migration failure leaving schema state ahead of `platform.schema_migrations`.
- Observable success criteria: the exact released `0065` wrapper is removed only at execution time; new or modified migrations containing transaction control fail before execution; real PostgreSQL failure tests prove schema and ledger rollback together.

## Scope

- In scope: migration execution validation, the reviewed `0065` compatibility exception, unit/integration regression tests, verification and QA handoff evidence.
- Out of scope: changing historical migration SQL/checksums, applying hosted migrations, merging protected branches, or implementing Holiday product behavior.
- Affected roles, tenants, modules and environments: release engineering across all tenants; isolated disposable local PostgreSQL only.

## Evidence And Decisions

- Current implementation evidence: `applyPendingMigrations` opens a transaction, but released migration `0065_holiday_company_unique_constraint.sql` also contains `BEGIN`/`COMMIT`; PostgreSQL therefore commits its DDL before the runner writes the ledger row.
- Approved requirements/decisions: applied migrations are immutable; promotion must use append-only, checksum-preserving migration history; destructive verification must use disposable local infrastructure.
- Unknowns requiring an owner: hosted QA ledger contents remain a later read-only deployment checkpoint.
- Assumptions explicitly accepted for this task: SHA-256 `231b5a18f0d0eab8b94c8b7aec8c55fdf92fccdf97f4160c648a36a4f0cf5408` is the released `0065` identity verified from `origin/release-01`.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Complete | 1. Add fail-closed transaction ownership validation and exact `0065` execution compatibility. | All pending files are validated before the first database query; file bytes and ledger checksum are preserved. |
| Complete | 2. Add unit and real PostgreSQL rollback/replay tests. | Tracker cases `S25-057-MIG-U/I/F/R`. |
| Complete | 3. Run focused and proportional repository verification. | Results recorded below; final exact committed-tree coverage remains pending. |
| In progress | 4. Obtain exact-head senior, security/database and independent QA review. | The first exact-head review found and rejected unsafe destructive-target derivation; the corrected head requires re-review. |
| Pending | 5. Commit, push and open a dependent PR targeting `release-01`. | Depends on PR #138 until reconciled. |

## Test Design And Shared Tracker

- Work-date sprint and task/artifact IDs: Sprint 25, `QA-S25-003`; this is a safety completion slice and adds no story points.
- Cases discussed during refinement: exact released compatibility, modified legacy rejection, all PostgreSQL transaction-control forms, quoted/comment/PL/pgSQL false positives, clean apply/replay, body failure, ledger failure and retry.
- Full case-body location in shared workbook and exact task-to-case links: Sprint 25 Test Cases rows 502–505, cases `S25-057-MIG-U`, `S25-057-MIG-I`, `S25-057-MIG-F`, `S25-057-MIG-R`.
- Applicable cases: unit plus real disposable PostgreSQL integration; browser/component tests are N/A because this runner has no UI or HTTP contract.
- After implementation: update actual commands, revision, environment and results; keep hosted ledger inspection unexecuted until promotion approval.

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Passed | Focused migration-runner unit tests | 41/41, local Node/Vitest |
| Passed | Atomic apply, rollback, retry and replay | 14/14 integration cases on a unique, runner-owned loopback child database; target/app equivalence and pre-existing unowned-child preservation are covered. |
| Passed | Clean install, pre-0064 upgrade and replay | 67/67 clean; replay 0; 63 base + 4 upgrade; exact `0064`–`0067` ledger identities |
| Passed | Change-aware repository gate | Secret/setup/verifier checks; lint; typecheck; 645/645 backend unit tests; 67-file migration history; 0-pending/67-ledger schema drift; cross-schema FK verification. |
| In progress | Changed-line/branch coverage and change verification | Historical exact SHA `190eeff1` passed 68/68 selected tests and 17/17 changed branches but correctly failed at 98/99 changed executable lines; the uninstrumented regex declaration was normalized and final amended exact-head evidence remains required. |
| Pending | Independent exact-head reviews | Senior, security/database and QA all rejected `190eeff1` on the derived destructive-target risk; corrected exact-head re-review is required. |

## Risks, Compatibility And Recovery

- Tenant/security risks: migration failure affects every tenant schema; validation must fail before any SQL is sent. Destructive integration setup now derives and validates the child target before connection, canonicalizes loopback/default-port identity independently of credentials, uses a unique per-run name, creates before claiming ownership, and drops only a database created by that run.
- Data/migration risks: a broad compatibility exception could permit future unsafe SQL. The exception is bound to exact id, filename and checksum.
- API/deployment compatibility: no API change; `0065` file and ledger identity stay unchanged.
- Observability: runner logs the migration name and propagates validation/database errors.
- Rollback or recovery: revert the runner commit before promotion. Never edit or delete an applied ledger row; investigate a mismatched hosted ledger read-only.

## Handoff

- Files/artifacts: this plan, migration runner, unit and integration tests.
- Commands and results: focused unit 41/41; corrected integration 14/14; actual migrations `0001`–`0064`, failed/rolled-back `0065`, successful `0065`–`0067` and replay are executable cases; `./scripts/agent/verify-change.sh` passed at an earlier revision. A historical exact-head trusted run on `190eeff1` passed its 68 selected tests and 17/17 changed branches but failed 98/99 changed lines at the multiline regex declaration. Independent review then found the derived destructive child could equal `DATABASE_URL` and a fixed pre-existing child could be dropped. The corrected implementation canonicalizes source/target/application identities, uses a unique per-run child, never drops before ownership is established, and preserves a pre-existing unowned child; final exact-head verification and re-review remain pending.
- Remaining blockers or human actions: PR #138 merge/reconciliation, protected-branch merge and hosted QA promotion approval.
- Commit/PR/deployment references: pending.
