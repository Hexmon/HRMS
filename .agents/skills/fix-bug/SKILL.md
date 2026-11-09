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
