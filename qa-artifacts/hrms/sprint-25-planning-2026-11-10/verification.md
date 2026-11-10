# Sprint 25 Planning And Agent-Policy Verification

Date: 2026-11-10. Owner: Anurag Kumar. Baseline: 92756681 on sprint-25/saas-s25-001, initially clean. These results concern documentation and tracker changes only, not product remediation.

## Repository Checks Actually Run

- `./scripts/agent/verify-change.sh`: Passed. Sensitive-file guard, unstaged/staged diff integrity, agent setup and documentation references passed. No runtime source paths changed, so package/application tests were not selected.
- Bundled skill-creator `quick_validate.py` on qa-completion-gate and all six amended existing skills: Passed (seven validations). Structural frontmatter/naming validation does not prove independent QA behavior.
- Extra reference validation on the backend/frontend guides, PR/handoff and specialists initially flagged the pre-existing package-relative backend evidence path when run from the root; changed that reference to the explicit repository-relative `hrms_backend/docs/qa/runs/` and reran the scoped check.
- Final semantic mapping check: Passed. All TEN-S25-001 through TEN-S25-035 appear once as a card; Original 1–15 and Additional 1–20 preserve order; all card workstreams exist and their listed finding membership agrees.

## Shared Workbook Verification Actually Run

Read the live workbook through browser and exported XLSX before/after changes. Used Python standard-library ZIP/XML parsing read-only; no workbook library was installed and no local workbook substituted for the shared tracker.

Sprint 25 Nov07-Nov13 (gid 1812876151): A9:N57 contains 49 added rows: one epic, ten workstreams, 35 findings and three planning/QA/tooling tasks. Every new owner is Anurag Kumar. Actual implementation dates/commits are absent; only the completed planning row has start/end 2026-11-10. Findings remain Planned or Needs decision; QA review and tooling remain Planned.

Checks: 35 unique finding IDs in correct order; every card title, workstream, priority, provisional estimate and status agrees with the detailed backlog. Historical Sprint 25 cells from rows 1–8 retain their original values. All unrelated worksheet values were compared and preserved. Parent epic/workstream estimates are blank; no duplicated parent points. New work is 299 SP (270 provisional findings + 13 completed planning + 8 planned QA + 8 planned tooling).

SP Calculation R19:T19 is the only directly edited calculation range. Existing formulas recalculate to 343 assigned, 57 completed and 286 pending. R19 now computes 313 above the 30 SP team minimum; S19 states that comparison and T19 explains the provisional allocation. Team minimum is not an established upper capacity; no one-sprint delivery assurance is asserted.

Visual review: new rows use wrapped Arial 10 text with fitted heights and middle alignment; epic/workstream rows are bold. Existing headers, columns and prior row formatting were preserved. Browser screenshots were inspected for parent/finding and final planning rows. An initial menu paste used an unrelated clipboard value in empty A9; it was immediately undone before the correct 49-row paste, and the final export confirms no residual value.

## Workflow Scenario Review (Self-review, Not Independent Execution)

| Scenario | Expected policy outcome | Checked result |
| --- | --- | --- |
| Happy-path test executes a denied branch line without asserting its error | Missing meaningful assertion/branch oracle prevents Done even with full line execution. | Present in completion policy and skill. |
| A mocked SQL unit test claims cross-company RLS isolation | Real PostgreSQL runtime-role integration evidence is still required. | Present in policy and backend guide. |
| Frontend feature has no unit runner or coverage provider | QA-S25-003 is a prerequisite; no made-up passing command or E2E-only substitution. | Present in frontend guide, backlog and sheet row 57. |
| Delegation is unavailable or prohibited | Prepare evidence for independent human review, keep executable task QA pending; self-review is not independent. | Present in policy, specialist and skill. |
| Documentation-only update | Executable line coverage N/A with reason; validate references, rules and workbook preservation. | Applied to this task; no product unit tests fabricated. |
| Platform identity matches an employee who changed employer | New company receives only explicitly authorized summary fields; ordinary old-company records remain isolated. | DEC-017/018 and TEN-S25-033/034/035 retain decisions and no paid-tier scope. |

No independent subagent was run because this side conversation prohibits delegation. No independent human QA, browser application journey, new unit test, changed-line CI enforcement, hosted test, commit, push, PR or deployment is claimed. The new policies describe future required gates; QA-S25-003 still owns implementation of missing test tooling.
