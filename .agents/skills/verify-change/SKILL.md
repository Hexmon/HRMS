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
