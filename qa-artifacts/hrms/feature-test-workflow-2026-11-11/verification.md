# Standing Test Workflow Verification — 2026-11-11

Scope: documentation and existing skill routing only. Root/backend/frontend AGENTS, the shared case workflow, canonical testing policy, task tracker, Definition of Ready, QA handoff, plan template and four existing skill entrypoints were refined. Prior Sprint 25 case data and unrelated concurrent work were preserved; this task made no external sheet mutation, code/dependency/CI change, commit or deployment.

## Structural Checks Actually Run

- `python3 /home/hexmon/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/<name>` for qa-master-checklist, implement-feature, fix-bug and commit-and-track: all valid.
- `git diff --check`: passed.
- `./scripts/agent/verify-change.sh --plan`: selected sensitive-file, staged/unstaged patch-integrity and agent documentation checks; no runtime files detected.
- `./scripts/agent/verify-change.sh`: all selected checks passed; agent setup/reference validation passed.

## Static Policy Walkthrough

| Input situation | Required route verified in the revised documents |
| --- | --- |
| New feature in a later sprint | Discuss concrete allowed/denied/failure cases during refinement; publish full bodies with the task and link exact rows. Sprint 25 is an example only. |
| Update to an existing feature | Retain task/case IDs and history, refine changed expectations and branches, add missing cases, rerun affected tests and record actual reviewed-head evidence. |
| Bug correction | Discuss reproducer and valid neighboring behavior; add meaningful failing-before/passing-after regression where reliable, plus relevant authorization/recovery cases. |
| Material business rule unresolved | Keep provisional expected result/question/owner visible; do not invent an oracle or mark Ready/Done. Discussion may continue. |
| Tracker inaccessible | Preserve exact pending full-case rows locally and report the publication gap; do not claim a sheet write. |
| Documentation-only task | Justified N/A executable testing and actual reference/workflow validation; no artificial application unit tests. |
| Required test/tooling/reviewer missing | Existing completion gate still blocks Done. Full planned cases or green build alone do not replace meaningful unit, branch, actual boundary/browser and independent QA evidence. |

These are source/policy reviews, not application test execution or independent behavioral validation. No subagents were used in this side conversation; a separate human may review the policy changes. Product unit/component/integration/browser tests were not run because no product behavior changed. Frontend unit/coverage/CI implementation remains the existing QA-S25-003 prerequisite; documentation does not implement that tooling.
