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
- Review decision: deletion/removal evidence must be bound to the exact removal signature, old/new Git blobs and exact regression-test blobs that the immutable full-suite worker actually selected and passed. Machine-readable results must be digest-bound to the exact clean coverage head and limited to the backend unit/integration and frontend unit selectors. Unknown, mutated, skipped, failed, outside-selector, stale, missing or ambiguous evidence stays red. A candidate cannot supply evidence through a CLI/JSON bypass.
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

### Exact-head execution ledger

- `6af0a1065f8c72c712413eef5adfb109cafbd030`: change-aware verification passed (30 verifier tests; 95 documentation references) and the gate regression suite passed 80/80.
- The first disposable full-suite run at that SHA passed backend unit/integration 1,011/1,011 and frontend component 60/60, then correctly failed the submitted delta at 72/85 changed lines, 26/43 changed branches and one removal disposition.
- Root cause: newly added fail-closed validation branches lacked adversarial cases, and the counter rewrite appeared as a deletion-only hunk. This is recorded as red-before evidence, not a completion result.

## Independent review correction after `66a46d93`

Senior, security/database and QA review independently rejected `66a46d93df868be60a6e4702941fc0ba91481815`. The revision proved exact Git blobs but did not prove that a referenced regression was selected, executed, non-skipped and passed by the trusted full suite; its positive fixtures also asserted constants rather than executing the replacement behavior. The correction emits backend/frontend Vitest JSON from the immutable full-suite worker, restricts regression paths to the real unit/integration selectors, binds each result digest to the exact-head coverage stamp, rejects malformed/duplicate/skipped/failed/stale results, requires globally unique contract IDs and canonical repository paths, and replaces tautological fixtures with executable red-before/green-after behavior tests. This correction remains pending a clean commit, exact-head coverage and renewed independent review.

The first correction candidate `878ccb6bee10254650ea0cafcc8d3f69736dbfaf` passed 83 validator tests, the focused gate at 174/174 changed executable lines and 77/77 changed decision branches, and repository change verification. Senior and QA approved it, but security/database review found that the backend selector admitted `.tsx` while the actual projects execute only `.ts`, and that a syntactically digest-bound JSON result could report zero aggregate tests while carrying an independently passed assertion. The follow-up matches the actual selectors exactly, requires a successful Vitest run, reconciles suite/test/assertion totals, rejects every failed/skipped/pending/todo/empty result, and documents that digest/head binding provides integrity and freshness rather than independent same-user process attestation. A new clean commit and all exact-head reviews are required.

At `ee4583c2eb39a2220aef969ef65b5aac6790aab3`, the focused suite and gate passed again, but security and QA independently showed that suite counters reconciled only with each other, not with file/nested-suite evidence. A direct `testResults.length` equality would be incorrect because Vitest counts the file suite plus nested `describe` suites; real API-test JSON contains one file result and two suites. The correction reconstructs Vitest suite identities from each result file plus every unique `ancestorTitles` prefix and requires that value to equal both total and passed suite counts. Regressions cover extra/missing file suite claims, malformed ancestry and legitimate nested suites.
- Remediation in progress: cover every printed validation outcome, parse Git tree identities through a directly testable fail-closed boundary, and retain a replacement line for the legacy removal counter so the mechanism does not need circular self-approval.
- `9942fad854f475c42286a414c452200505eb992a`: focused real V8 conversion and gate verification improved the delta to 83/83 changed lines, 38/42 changed branches and zero removal dispositions. The remaining four branches were the fail-closed null/undefined fallbacks for ID and blob fields; explicit negative cases were added before the next exact-head run.

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
