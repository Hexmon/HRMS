# AGT-S25-001 Review Remediation Verification

## Scope And Provenance

- Branch: `sprint-25/agt-s25-001`.
- Reviewed starting head: `6881d9dbc28938d58f70fa36bbb29ef693691807`.
- Comparison base: `origin/release-01` at `30783aa5ccaef41900195e1902f9dcb9f92d4270`.
- Date: 2026-11-11 (Asia/Kolkata).
- Environment: local checkout only. No commit, push, deployment, hosted configuration, tracker mutation, or production data access was performed.

## Failing-Before Evidence

Before the production-script fixes, this command ran the newly added regression tests:

```bash
python3 -m unittest discover -s scripts/agent/tests -v
```

Result: **failed, 6 of 19 tests**. The failures covered the intended gaps:

1. direct `hrms_backend/src/platform/openapi.ts` selection;
2. direct `hrms_backend/src/shared/schemas.ts` selection;
3. branch workflow selection of repository verifier tests;
4. branch CI execution of repository checks;
5. an untracked secret after line 400;
6. an untracked file larger than 1 MiB.

No secret value from the fixtures was written to this artifact.

### Re-review Failing-Before Evidence

The same command was run after adding the re-review regressions and before the second production-script/workflow fix. Result: **failed with 5 failures and 1 error across 21 tests**. The six expected problems were:

1. missed `hrms_backend/src/shared/attendance-contract.ts` contract classification;
2. missed `hrms_backend/src/modules/attendance/attendance-openapi-examples.ts` contract classification;
3. missed `hrms_backend/src/modules/attendance/reporting-projection.ts` contract classification;
4. missed `hrms_backend/src/modules/attendance/reporting-evidence.ts` contract classification;
5. missing event-base/real-plan CI workflow contract;
6. missing fail-closed CI event-base resolver.

The pushed-commit token regression already proved that the sensitive guard detects a committed constructed token when it receives the authoritative prior SHA, even if `origin/release-01` already points to `HEAD`. It was then connected to the event-base resolver in the passing-after suite. The constructed value was not printed by the guard or copied into this artifact.

### Final P2 Resolver-Branch Evidence

The existing `test_ci_base_resolver_uses_event_sha_and_fails_closed` test was extended with deterministic assertions for:

1. `workflow_dispatch` selecting `HEAD^`;
2. a base equal to `HEAD` failing closed;
3. an empty/missing event SHA failing closed;
4. a malformed SHA failing closed;
5. an unsupported event failing closed;
6. `workflow_dispatch` on a root commit with no parent failing closed.

The focused test passed on its first run after adding these assertions. The production resolver already implemented all six branches, so no new failing-before product defect was reproducible. Because the assertions extend an existing test method, the full-suite count remains 21 rather than increasing.

## Post-Fix Evidence

| Check | Command | Result |
| --- | --- | --- |
| Final P2 focused resolver test | `python3 -m unittest scripts.agent.tests.test_verification_scripts.VerificationScriptTests.test_ci_base_resolver_uses_event_sha_and_fails_closed -v` | Passed, 1/1 on the first run after adding the six branch assertions. |
| Verifier regression suite | `python3 -m unittest discover -s scripts/agent/tests -v` | Passed, 21/21 after re-review remediation. |
| Agent/reference validation | `bash scripts/agent/validate-agent-setup.sh` | Passed, 87 documentation references. |
| Event-base resolver | `bash scripts/agent/resolve-ci-base.sh push '' "$(git rev-parse origin/release-01)"` | Resolved the local simulated push base to `30783aa5ccaef41900195e1902f9dcb9f92d4270`; synthetic tests cover PR, push, `workflow_dispatch`/`HEAD^`, empty, zero, malformed, unavailable, equal-to-head, non-ancestor, unsupported-event and manual-no-parent behavior. |
| Sensitive-file guard | `bash scripts/agent/protect-sensitive-files.sh --base "$event_base"` | Passed against the explicit resolved event base. |
| Change-selection plan | `bash scripts/agent/verify-change.sh --plan --base "$event_base"` | Selected the sensitive guard, patch integrity, agent/reference validation, verifier regressions, disposable database preflight, backend lint, backend typecheck, and backend unit tests for the cumulative event diff. This is the real repository command now configured in CI. |
| Workflow structure | PyYAML `safe_load` of `.github/workflows/branch-ci-cd.yml` | Parsed; jobs are `repository-checks`, `backend-checks`, `frontend-checks`, and `deploy-backend`. |
| Shell syntax | `bash -n scripts/agent/protect-sensitive-files.sh scripts/agent/resolve-ci-base.sh scripts/agent/verify-change.sh scripts/agent/validate-agent-setup.sh` | Passed. |
| Patch hygiene | `git diff --check` | Passed. |
| Disposable database preflight | `python3 scripts/agent/assert-disposable-test-db.py hrms_backend/.env.test` | Passed. |
| Backend lint | `pnpm --dir hrms_backend lint` | Passed for 477 files. |
| Backend typecheck | `pnpm typecheck` in `hrms_backend/` | Passed. |
| Backend unit suite | `pnpm test:unit` in `hrms_backend/` | Passed, 540/540 tests across 46 files in 386.03 seconds. |

The CI workflow itself has not run at this uncommitted working-tree state. After an authorized commit and push, the exact-head GitHub checks must pass and an independent reviewer must re-review the resulting SHA.

## Coverage And Decision-Branch Evidence

The new regression tests exercise each corrected decision branch through observable contracts:

- `platform/openapi.ts`, `shared/schemas.ts`, `shared/attendance-contract.ts`, `attendance-openapi-examples.ts`, `reporting-projection.ts`, and `reporting-evidence.ts` each select backend contract generation/validation and frontend contract-route coverage;
- branch workflow changes select the agent/reference and verifier-test checks;
- PR, push and manual event bases are resolved from explicit immutable commits, while empty/missing, all-zero, malformed, unavailable, equal-to-head, non-ancestor, unsupported-event and manual-no-parent inputs fail closed;
- a pushed committed-token fixture is rejected using the push `before` SHA even when `origin/release-01` already equals `HEAD`, and the error never echoes the token;
- bounded untracked text is scanned beyond line 400;
- oversized untracked files are rejected with a path-only error instead of being skipped;
- deploy is structurally dependent on the repository-check job.

This is behavioral branch evidence, **not numerical changed-line or branch coverage**. AGT-S25-001 does not contain the QA-S25-003 coverage instrumentation/gate, so no changed-line percentage, changed-branch percentage, or coverage pass is claimed. Release readiness remains blocked until QA-S25-003 is integrated into the reviewed exact head and produces the required numerical evidence without lowered thresholds, exclusions, or fabricated results.

The token regex is explicitly defense in depth and non-comprehensive. It supplements rather than replaces secret stores, provider-side scanning, review, and credential rotation. Token fixtures are constructed from separate non-secret strings inside disposable test repositories and are never emitted in failure output.

## Remaining External Gates

- Commit/push and exact-head CI are not authorized in this implementer pass.
- Tracker publication and readback remain blocked until the configured spreadsheet connector is available.
- Independent exact-head re-review remains required.
- Full numerical changed-line and decision-branch coverage remains dependent on QA-S25-003.
