---
name: fix-bug
description: Diagnose and fix a reproducible Hawkaii HRMS defect with regression evidence. Use when the user requests correction of incorrect behavior, an exception, data inconsistency, UI failure, or operational bug; not for feature redesign without a demonstrated defect.
---

# Fix A Bug

1. Read the applicable instructions and record the reported actor, role, tenant, environment, inputs, expected behavior, observed behavior, time, request ID/log evidence, and affected revision when available.
2. Reproduce safely at the lowest suitable layer. Do not mutate production merely to reproduce a report.
3. Trace the complete path: UI/client -> authentication/authorization -> validation -> service/policy -> transaction/data -> cache/queue/external effects -> audit/read model -> user-visible result.
4. State the root-cause hypothesis and add a failing regression test before the fix when a reliable seam exists. If no test can be added, document why and define alternative evidence.
5. Apply the narrowest correction that preserves public contracts, tenant boundaries, historical data and valid workflow states. Check adjacent callers and inverse/negative cases.
6. Run the regression test, affected package checks and `scripts/agent/verify-change.sh`. Exercise the actual UI journey when the defect is user-facing.
7. Report root cause, fix, regression coverage, commands/results, data-repair or rollback needs, and anything not reproduced or verified.

## Completion gate

Apply qa-completion-gate and docs/agent/test-and-qa-completion.md after the fix. Require meaningful regression assertions and failing-before/passing-after evidence where a seam exists, changed executable line and decision-branch coverage, real boundary tests and independent QA. A documented inability to reproduce or measure is a gap, not an automatic exemption from Done requirements.

## Task-Linked Case Design

For every sprint, discuss the reproducer, valid neighboring behavior and rejected/failure cases during refinement; publish full case bodies when writing/updating the task under docs/process/task-tracker.md. Before editing, follow [per-feature case workflow](../qa-master-checklist/references/feature-case-workflow.md) and record approved input/state/role/tenant/side-effect partitions and test IDs for the task. After implementation refine the inventory against changed branches, run the meaningful unit and applicable integration/component/browser cases, reconcile actual evidence with the sprint row, then apply qa-completion-gate. Pending required cases/tooling/oracles/review prevent Done; a generated test plan does not constitute execution.
