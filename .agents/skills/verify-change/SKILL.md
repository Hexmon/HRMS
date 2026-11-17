---
name: verify-change
description: Select and execute risk-based verification for current Hawkaii HRMS changes. Use before handoff, commit, PR, or release, and when asked what tests a change requires; it reports evidence and never assumes passing results.
---

# Verify A Change

1. Read `docs/agent/verification-matrix.md`, inspect tracked/untracked diffs, and classify affected backend modules, frontend journeys, roles, tenants, contracts, migrations, workers, configuration and operations.
2. Run `scripts/agent/verify-change.sh --plan` and review the selection. Add focused tests or commands the path-based selector cannot infer.
3. Execute `scripts/agent/verify-change.sh`. For release candidates, execute `scripts/agent/verify-full.sh`; use `--with-frontend-e2e` only in the documented isolated, seeded environment.
4. For user-facing changes, run the real application and verify relevant roles, negative actions, stale/double actions, refresh/back navigation, mobile/keyboard behavior and network failures based on risk.
5. For tenant/security changes, include mismatched company/resource IDs, role removal, deactivation, stale sessions, mass assignment, enumeration and audit/log redaction cases.
6. Record each command and outcome as Passed, Failed, Blocked or Not run. Do not collapse partial execution into a passing gate and do not claim production readiness from local checks.

## Completion contract

Use qa-completion-gate with docs/agent/test-and-qa-completion.md before a behavior change is marked Done. The path-based script does not measure changed-line coverage or perform independent QA by itself. Inspect actual runner/provider availability, base/head including new files, meaningful input/output assertions, changed branches and real integration/browser outcomes. Record separate reviewer identity/SHA and PR evidence; missing required tooling/review remains pending. For documentation-only changes use reference/workflow checks and N/A executable coverage with rationale.

## Task-Case Reconciliation

Use [feature-case-workflow](../qa-master-checklist/references/feature-case-workflow.md) to map the task's cases to changed branches and required unit/component/integration/browser layers. Record actual results and source head against stable case IDs; Not Tested in the planning CSV means Not run. Path-selected checks and a case count cannot clear missing required cases or independent QA. Keep the shared tracker truthful under its authorization policy.
