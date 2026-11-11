# QA-S25-003: Unit, component and changed-line coverage gate

## Objective And Success Criteria

- Supply backend and frontend unit/component runners with reproducible coverage reports.
- Enforce coverage of every changed executable line and changed decision branch between the PR merge base and head, including new files. The gate fails when coverage or the base is missing and passes only after the corresponding behavior is exercised.
- Keep independent assertion-quality review separate from numerical coverage.

## Scope

- In scope: package test/coverage scripts and lockfiles; focused frontend component test; backend/fronted coverage configurations; diff-to-coverage gate and its regression tests; CI and agent verification integration; QA evidence/documentation.
- Out of scope: business feature behavior, database migrations, hosted deployment, historical test claims.
- Affected environment: isolated synthetic local and CI. No business tenant records or hosted credentials are needed.

## Evidence And Decisions

- At fork 74cb28d0 (parent bootstrap from origin/release-01 30783aa5), backend Vitest has unit/contracts/integration/E2E projects but no coverage provider/config. Frontend package has Playwright only, no unit/component runner. The branch CI workflow runs package tests/build but no changed-line gate.
- DEC-020 and docs/agent/test-and-qa-completion.md require all changed executable lines, changed business/security decision branches, meaningful assertions, and independent QA at exact SHA.
- Generated/typed-only lines are not executable; exclusions must be explicit and source-backed. Test quality is manually reviewed, not inferred from counts.
- The shared sheet currently has QA-S25-003 at Sprint 25 row 57 and four generic case bodies at Sprint 25 Test Cases rows 161-164. Connector access is unavailable to this task; exact replacement bodies are in qa-artifacts/hrms/qa-s25-003-2026-11-11/pending-sheet-cases.md and remain Not Tested until execution.
- At `eb6e94a8`, the cumulative PR gate lists 21 unmeasured entries. `qa-artifacts/hrms/qa-s25-003-2026-11-11/unmeasured-path-disposition.md` proposes path-specific executable contracts for workflow, package manifest, lockfile, runner configuration and shell paths, but explicitly records that the owner has **not** approved a protected-branch contract-evidence policy. The instrumentable script/probe paths still require numerical changed-line and branch evidence. No PR-authored approval file may clear either class.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Implemented | Install compatible Vitest coverage/frontend testing dependencies and configure package scripts. | Vitest 4.1.6/V8 in both packages; React Testing Library/jsdom in frontend. |
| Implemented; review pending | Implement and test base/head changed-line and branch mapping. | Synthetic red/green, missing/stale, new-file, deletion-only and outside-source cases; see execution artifact. |
| Implemented; PR rerun pending | Wire PR CI enforcement. | Run `42938804718` checked out exact head `eb6e94a8` but stopped at a boundary-flaky backend coverage test before the final gate. The local correction must be committed before an exact-head rerun. |
| Partially verified | Demonstrate red/green behavior and run package gates. | Real component branch red/green; historical exact-head CI passed 541/541 backend and 2/2 frontend tests before reporting 21 unmeasured paths. The local flake correction passed its complete 22-test file plus five focused repetitions; see the execution artifact. |
| Pending | Independent senior and QA review. | Lead will dispatch; no self-certification. |
| Needs owner decision | Define whether exact-path, same-run contract evidence may satisfy nonnumeric workflow/config/manifest/lockfile/shell changes. | No such policy is approved. Reject unknown outside paths, source paths, deletions, type/mode changes and missing contract execution. Do not implement an allowlist or self-authored waiver as a substitute. |

## Test Design And Shared Tracker

- Existing IDs S25-057-U/P/N/F are revised in the pending sheet artifact. They map unit/component setup, CI merge-base mapping, negative uncovered branch, and missing/stale/ambiguous report recovery.
- Proposed contract-policy partitions, pending owner approval: exact unchanged-mode path with a passing same-run contract; missing/failed contract; unknown executable/config path; instrumentable script; product line/branch; deleted/symlink/mode-changed path. Product and instrumentable-script omissions remain red; the proposal is not current gate behavior.
- Expected outcome is grounded in DEC-020, not current absence of tooling. No business-policy oracle is missing for this infrastructure task.
- Affected executable branch inventory will be reconciled to final diff and added tests. Browser journey, tenant data, audit/outbox and PostgreSQL integration are N/A because this task changes test infrastructure, not product behavior.

## Verification

| Status | Check | Environment/evidence |
| --- | --- | --- |
| Passed | Backend/frontend unit and coverage tests | Isolated local, `qa-artifacts/hrms/qa-s25-003-2026-11-11/execution.md` |
| Passed | Diff-gate red/green, new-file and missing-report tests | Synthetic temporary git fixture and real rendered component branch |
| Passed locally | Package lint/typecheck/build and CI workflow syntax | Backend/frontend passed; YAML parsed; Vercel SSR smoke 200. CI runner itself awaits PR. |
| Pending | Changed-line/branch report on exact task diff | Requires committed task head; parent owns git. |

## Risks, Compatibility And Recovery

- A false-green gate could conceal security or payroll regressions. Reject missing coverage/base and review every exclusion.
- Coverage instrumentation adds CI time; run only unit/component projects in this gate and leave existing integration/E2E matrix intact.
- No schema/config migration. Rollback is reverting package scripts, gate and CI step; retain existing test commands.

## Handoff

- Task branch: sprint-25/qa-s25-003; parent/fork 74cb28d0; PR must target release-01 as draft until bootstrap is merged/reconciled.
- Owner: Anurag Kumar. Lead owns commit, push, tracker and PR. This plan alone is not execution evidence.
