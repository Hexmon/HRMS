# Sprint 25 Coordinated Delivery Run

## Objective And Success Criteria

- Deliver source-verified Sprint 25 remediation through focused task branches and PRs to `release-01`; the owner retains merges and deployment.
- Preserve existing uncommitted planning and historical evidence. Record exact test, review, and tracker state without treating planned cases as passed.

## Intake Snapshot (2026-11-11)

- Current checkout: `sprint-25/saas-s25-001` at `87618f88`; many pre-existing modified and untracked planning/QA files. Do not commit this worktree wholesale.
- Freshly fetched `origin/release-01` at `30783aa5`. The current checkout is six commits ahead, including prior auth code and planning. No open PR targeting `release-01` was returned by `gh pr list` at intake.
- Live workbook: `Sprint 25 Nov07-Nov13`, 140 task rows plus one header, `Sprint 25 Test Cases` with 482 planned cases. Existing QA-S25-003 task row 57 and cases 161–164 are Not Tested. The Google Drive plugin is installed but its Sheets tools currently return an unavailable-tool error; tracker writes remain pending.
- The 35 original TEN findings, later R2, business-rule, auth, mail and supplied-audit refinements overlap. Parent rows are rollups. The static 444-row inventory remains unreviewed; no full API clearance is claimed.

## Dependency Graph And Queue

| Order | Task / owner | Evidence and outcome | Dependencies and branch/base | Cases, gate and status |
| --- | --- | --- | --- | --- |
| 0 | Workflow bootstrap / Anurag Kumar | Copy only approved agent process and current task/case references needed by new worktrees; avoid accumulated product code in the current branch. | Fresh `origin/release-01`; `sprint-25/agt-s25-001`. | Documentation/link consistency and independent review in progress. |
| 1 | QA-S25-003 / Anurag Kumar | Backend lacks Vitest coverage configuration; frontend lacks unit/component runner; CI has no base/head changed-line gate. | Fresh `origin/release-01`; proposed `sprint-25/qa-s25-003`, may depend on bootstrap only for documented policy. | Refine S25-057-U/P/N/F case bodies in shared sheet; demonstrate fail then pass, new-file and branch handling, independent QA. Planned. |
| 2 | TEN-S25-001 + TEN-S25-018 first asset transaction slice / Anurag Kumar | `app.ts` onSend whole-domain flush and `postgres-data-store.ts` unconditional asset upsert permit two-instance lost update and post-rollback ghost memory. Historical disposable repro exists; current source mechanism persists. | QA gate first; task branch from current `origin/release-01` or explicit stack. Broader per-domain migration remains separate. | Two-instance CAS, wrong-version and failed-commit cases; real disposable PostgreSQL, browser journey, senior/security/QA review. Planned. |
| 3 | TEN-S25-016/017 tenant boundary foundation / Anurag Kumar | Resource authorization and RLS gaps must be verified route by route; only registered-device RLS migration found at intake. | Transaction foundation; separate scoped migrations/PRs. | Cross-company, role and related-ID denials plus SQL RLS tests. Planned. |
| 4 | TEN-S25-006, 019 and related R2/auth slices / Anurag Kumar | Document policy lacks company check; session revocation uses global Valkey scan/read/write. | Tenant/transaction foundation as applicable; resolve exact policy and provider gates. | Real SQL/Valkey, failure and role-browser tests; planned. |
| 5 | Remaining assigned Sprint 25 leaf tasks / Anurag Kumar | Reconcile 35 TEN findings and later auth/R2/mail/business/audit cards against current source and decisions before sequencing. No duplicate implementation or premature Done. | Dependency order in `docs/discovery/sprint-25-saas-remediation.md`; refine per leaf. | Full task-linked case bodies and exact-head test/review evidence required; not started. |

## Execution Ledger

| Date | Task | Branch / fork / head | Action and evidence | Reviewer / QA | Tracker / next action |
| --- | --- | --- | --- | --- | --- |
| 2026-11-11 | Intake | `sprint-25/saas-s25-001` / `87618f88`; `origin/release-01` / `30783aa5` | Read engineering contract and delivery rules; fetched origin; exported live sheet read-only; verified QA-S25-003 row/cases. Security/data and QA analysts performed read-only source reviews. | Independent implementation review not yet requested. | Workbook write blocked pending connection. Prepare bootstrap and QA tooling branches. |

## Verification And Handoff Rules

- Before any behavior PR: trace UI/API/service/persistence/side effects, publish complete case bodies, run unit and applicable real-boundary/browser checks, measure changed lines and branches, then obtain independent senior and QA review at the exact SHA.
- Keep unfinished cases Not Tested or Blocked. Track commands, revisions, environment, findings, migration/config and rollback per task. A draft stacked PR is not Done.
- No merge, deployment, cloud worker activation, hosted configuration change, production probe, or claim of human UAT/penetration testing in this run.
