# Sprint 25 Cumulative QA Promotion Coverage

## Objective And Success Criteria

- Objective: make the cumulative `release-01` to `qa` promotion measurable without changing the QA baseline, weakening the changed-coverage policy, or accepting candidate-authored waivers.
- User/business outcome: the first complete Sprint 25 feature can be promoted to the isolated QA branch only after every shipped runtime change has executable or trusted semantic regression evidence.
- Observable success criteria: the promotion candidate reports 100% changed executable lines, 100% changed decision branches, zero unresolved paths/deletions/modes, green repository checks at one exact SHA, and independent exact-head review.

## Scope

- In scope: QA-S25-003 cumulative promotion coverage; fail-closed removal evidence; runtime product coverage; external operational-script instrumentation; strict config/migration/mode contracts; exact-SHA PR and review evidence.
- Out of scope: changing the `qa` baseline to hide earlier release changes, coverage ignores, manual evidence files, protected-branch merges, hosted deployment, and unrelated Sprint 25 features.
- Affected roles, tenants, modules and environments: engineering/QA infrastructure for every role and tenant; disposable local PostgreSQL/Valkey only; GitHub PR validation after push.

## Evidence And Decisions

- Current implementation evidence: `origin/release-01` is `843154fb966f03a8e32235ff2bb73b6bd6c1cc9c`; PR #136 candidate `bd7ceea43e0fc5aab412cf9e5eeee219aa2114fe` is tree-identical to that release and preserves `qa` history.
- Current failing evidence: PR #136 measures 4,979/5,549 changed lines, 1,058/1,128 branches and 30 non-line dispositions. The cumulative merge base is `0eec5615a4cb24d265003b10576527faef178c01`.
- Approved requirements/decisions: preserve the real QA history; do not weaken AGENTS/coverage/security/QA gates; deliver one coherent increment at a time; owner merges and deploys.
- Review decision: deletion/removal evidence must be bound to the exact removal signature, old/new Git blobs and exact regression-test blobs. Unknown, mutated, stale, missing or ambiguous evidence stays red. A candidate cannot supply evidence through a CLI/JSON bypass.
- Unknowns requiring an owner: none for the first infrastructure increment. Hosted required-workflow/ruleset activation remains an owner/admin action after independent validator review.
- Assumptions explicitly accepted for this task: this continues existing task QA-S25-003 and does not add story points.

## Dependency And Delivery Order

1. Trusted promotion-evidence contract mechanism and adversarial tests.
2. Attendance, health, Valkey and worker runtime coverage.
3. Expense and report product coverage.
4. Cloudflare operational-script instrumentation.
5. Frontend and repository operational-script instrumentation.
6. Strict remaining configuration/migration/mode contracts, full cumulative rerun, independent exact-head review, and QA promotion handoff.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Verified | Reconcile release, QA and promotion state. | Release `843154fb`; QA `2f5651f`; candidate `bd7ceea`; PR #136 remains blocked. |
| Implemented; verification in progress | Add a fail-closed exact removal-contract mechanism. | Branch `sprint-25/qa-s25-003-cumulative-promotion`; starts at current release. No production removal is cleared merely by adding the mechanism. |
| Pending | Add product/runtime coverage in bounded slices. | Prioritize payroll/attendance, worker retry/ack, tenant reports and session/Valkey paths. |
| Pending | Instrument external operational scripts. | Refactor only where required into import-safe functions with thin CLI entrypoints. |
| Pending | Run the full cumulative promotion gate and exact-head reviews. | Requires disposable services and one stable candidate SHA. |
| Pending | Prepare release integration and QA promotion handoff. | No merge or deployment without explicit owner approval. |

## Test Design And Shared Tracker

- Work-date sprint and task/artifact IDs: 2026-11-18; Sprint 25; existing QA-S25-003.
- Case QA-S25-003-RM-01: exact registered deletion hunk, exact old/new blobs and exact regression blobs pass the semantic removal contract; no product/API side effects; unit layer; P0; initially Not Tested.
- Case QA-S25-003-RM-02: an unknown or differently located deletion remains uncovered; unit layer; P0; initially Not Tested.
- Case QA-S25-003-RM-03: stale/wrong old blob, new blob or regression blob fails closed; unit layer; P0; initially Not Tested.
- Case QA-S25-003-RM-04: missing, non-test, symlinked, non-regular or ambiguous regression evidence fails closed; unit layer; P0; initially Not Tested.
- Case QA-S25-003-RM-05: runtime replaced only by non-executable text follows the same exact contract and unknown replacement remains red; unit layer; P0; initially Not Tested.
- Case QA-S25-003-RM-06: candidate CLI/manual JSON cannot provide or override removal contracts; unit/CLI layer; P0; initially Not Tested.
- Full case bodies are retained here pending verified Google Sheet publication. Do not mark them Passed or the task Completed until exact-head execution evidence is recorded and read back.
- Browser testing is N/A for this infrastructure-only increment. Browser/API-backed testing remains required for each later product slice.

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Passed before final commit | Removal-contract focused Node tests | Two focused cases passed; synthetic temporary Git repositories; no hosted services. |
| Passed before final commit | Complete changed-coverage regression suite | Final uncommitted tree: 80/80 passed locally in 46.1 seconds after literal-pathspec and strict test-file hardening; rerun at committed exact head remains required. |
| Pending | `verify-change.sh` for the committed increment | Local; exact base/head. |
| Pending | Trusted changed-line/branch coverage | Disposable local PostgreSQL/Valkey; exact committed head. |
| Pending | Independent senior, security/database and QA review | Exact final SHA; separate reviewers. |

## Risks, Compatibility And Recovery

- Tenant/security risks: a false green could hide cross-tenant, payroll or session regressions. Contracts therefore use exact Git identities and cannot be supplied through candidate runtime arguments.
- Data/migration risks: none in the first infrastructure increment; later database slices require disposable clean-install/upgrade/replay/rollback evidence.
- API/deployment compatibility: no API or runtime product behavior changes in the first increment.
- Observability: the gate prints each accepted semantic contract and every unresolved removal separately.
- Rollback or recovery: revert the focused gate commit; unresolved removals then return to the prior always-red behavior.

## Handoff

- Files/artifacts: this plan, changed-coverage implementation/tests, existing QA-S25-003 execution artifacts.
- Commands and results: record only after execution.
- Remaining blockers or human actions: owner merge; external trusted-validator/ruleset administration; later hosted/manual QA.
- Commit/PR/deployment references: pending. No protected branch or hosted environment is modified by this work.
