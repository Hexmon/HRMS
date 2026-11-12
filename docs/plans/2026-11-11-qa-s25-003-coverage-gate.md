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
- At `50f45203`, the cumulative PR gate listed 21 unmeasured entries. The later committed implementation adds stamped numerical reports for nine instrumentable external programs (one backend helper, four discovery probes, two Node programs and two Python programs). An isolated synthetic run at `286823070c7cbee1d2d1a37c14e9611970579cfd` reported **1,486/1,486 changed executable lines** and **419/419 changed decision branches**, but its **0 unmeasured** result is rejected. Independent review reproduced false passes for an `if: false` workflow and an untraced dangerous shell branch under the former alternate-evidence policy. That policy has been removed; changed workflow/manifest/lock/config/shell paths remain red without changed-semantic-node or changed-line/decision-specific proof. After reconciliation with `release-01` `a08e2ab7722b7aaa94482f5ed5db9f187f87ba71`, exact committed head `1fd6d32fa7c3189ec999bdd7de197eab18aa7700` reported **1,331/1,331 changed executable lines**, **394/394 changed decision branches**, and the intended **9 unmeasured nonnumeric paths**. No PR-authored approval file may clear either class.
- Exact head `119bf9052c7b1b6b628191ee43c918b7bb450ce6` later passed **1,334/1,334 lines** and **395/395 branches** with the same nine nonnumeric paths red. Its hosted trusted run exposed only dependency symlinks as dirty because `node_modules/` does not match a symlink on a runner without global ignore rules. The root component rule is corrected to `node_modules`; `.gitignore` is now a tenth explicit nonnumeric review path, not a waiver.
- The next hosted run passed exact-checkout creation and focused verifier suites, then exposed Corepack shim canonicalization selecting pnpm 12.18.0 inside the worker. The workflow now publishes a regular read-only runner-temporary wrapper that invokes exact `corepack pnpm@10.25.0`, so the validator can enforce both canonical-file and package-manager-version identity.
- PR #124's ordinary `Changed executable coverage` job at reconciled head `f69c403c9a98cb478a284509c4301d4ec52ffc83` installed `coverage==7.11.0` into setup-python successfully, but the sanitized resolver rejected setup-python's symlinked `python3`/`python` shims and stopped before measurement. The ordinary workflow now creates a runner-temporary virtual environment with `--copies`, installs exact coverage 7.11.0, and supplies the canonical regular `python3` path explicitly. The resolver verifies that exact module version and does not let a candidate-controlled `PATH` substitute another interpreter.
- PR #125's task-local gate at clean head `cd4db65a` exposed missing direct V8 attribution for a static value `ImportDeclaration`. The first correction incorrectly made all static imports non-executable and was rejected after senior review and QA reproduced a changed side-effect import passing 0/0 without execution. Runtime imports remain executable; the gate now attributes only runtime static import/module-export declaration syntax when the importing module has positive real coverage. Declaration-wide and all-inline named type imports/re-exports are non-executable because TypeScript erases them, while mixed/default/namespace/value forms, dynamic imports and imported-module initialization remain independently measured. Dynamic imports, top-level calls and all other expressions require direct real coverage and never inherit a module-level count. One shared syntax classification drives changed-line analysis, static module-evaluation attribution and production dependency-risk scanning.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Implemented | Install compatible Vitest coverage/frontend testing dependencies and configure package scripts. | Vitest 4.1.6/V8 in both packages; React Testing Library/jsdom in frontend. |
| Implemented; review pending | Implement and test base/head changed-line and branch mapping. | Synthetic red/green, missing/stale, new-file, deletion-only and outside-source cases; see execution artifact. |
| Implemented; latest exact-head evidence recorded | Numerically instrument external JS/TS/Python programs. | Node raw V8 is AST-remapped to Istanbul, isolated Vitest covers external TypeScript, and coverage.py line/arcs are converted without extending branch spans across target lines. The wrapper requires a clean worktree/index and exact HEAD at checked boundaries, generates reports outside the repository, and rejects stale/canonical-path/digest/Git-mode failures. These are correctness and accidental-mutation controls, not attacker-resistant same-user provenance. Exact head `1fd6d32f` produced full numeric coverage while leaving nine nonnumeric paths red. |
| Partially implemented; owner bootstrap pending | Wire PR CI enforcement. | A candidate-controlled workflow cannot authenticate itself. The proposed organization required workflow checks out an independently reviewed immutable validator revision and runs it against the exact candidate SHA. It becomes authoritative only after the owner/admin pins it in a GitHub organization/enterprise ruleset; the external-App/CI fallback is documented. No hosted ruleset was changed. |
| Partially verified | Demonstrate red/green behavior and run package gates. | Real component branch red/green; historical exact-head CI passed 541/541 backend and 2/2 frontend tests before reporting 21 unmeasured paths. The local flake correction passed its complete 22-test file plus five focused repetitions; see the execution artifact. |
| In review/fix loop | Independent senior and QA review. | Reviews rejected self-validation, weak alternate evidence and candidate install hooks. Those are corrected. Hosted runners then exposed dependency-link ignore, package-manager identity, and ordinary setup-python symlink mismatches. Each correction remains subject to a new exact-head hosted run. |
| Rejected and removed | Clear nonnumeric workflow/config/manifest/lockfile/shell paths through same-run fragments, receipts or trace counts. | Review proved this could false-pass disabled workflow logic and an untraced dangerous shell branch. The gate now leaves these paths unmeasured/red. A future trusted validator must provide changed-node/line/decision-specific proof; independent owner review remains required where that proof does not exist. |

## Test Design And Shared Tracker

- Existing IDs S25-057-U/P/N/F are revised in the pending sheet artifact. They map unit/component setup, CI merge-base mapping, negative uncovered branch, and missing/stale/ambiguous report recovery.
- Nonnumeric partitions remain fail-closed: workflow/manifest/lock/config/shell changes stay red unless trusted tooling supplies proof for every changed semantic node or executable line and decision outcome. Content fragments, same-run receipts, mode and trace totals are insufficient.
- Expected outcome is grounded in DEC-020, not current absence of tooling. No business-policy oracle is missing for this infrastructure task.
- Affected executable branch inventory will be reconciled to final diff and added tests. Browser journey, tenant data, audit/outbox and PostgreSQL integration are N/A because this task changes test infrastructure, not product behavior.

## Verification

| Status | Check | Environment/evidence |
| --- | --- | --- |
| Passed | Backend/frontend unit and coverage tests | Isolated local, `qa-artifacts/hrms/qa-s25-003-2026-11-11/execution.md` |
| Passed | Diff-gate red/green, new-file and missing-report tests | Synthetic temporary git fixture and real rendered component branch |
| Passed at reconciled exact head; trust hardening rerun pending | External report regressions and trusted bootstrap checks | At `1fd6d32f`, gate regressions 52/52, resolver 16/16, Python verifier/workflow tests 29/29, isolated TypeScript 16/16, backend 551/551, frontend 2/2 and 90 documentation references passed. New adversarial regressions keep a disabled workflow and dangerous untraced shell branch red. Candidate package lifecycle/pnpmfile hooks were then disabled and require a new exact-head rerun. No hosted or destructive probe ran. |
| Numeric pass; intentional bootstrap red | Cumulative instrumentable and nonnumeric paths | Exact reconciled head `1fd6d32fa7c3189ec999bdd7de197eab18aa7700` measured 1,331/1,331 numeric lines and 394/394 numeric branches. Nine nonnumeric workflow/manifest/lock/config/shell paths remain red by design. This is not a completed required check or bootstrap approval. |
| Passed locally | Package lint/typecheck/build and CI workflow syntax | Backend/frontend passed; YAML parsed; Vercel SSR smoke 200. CI runner itself awaits PR. |
| Pending final rerun | Changed-line/branch report on final bootstrap diff | The last recorded clean exact-head report remains numerical evidence only. The ordinary copied-Python correction changes workflow/tool/tests/docs and must be committed and rerun; no hosted green is claimed. |

## Risks, Compatibility And Recovery

- A false-green gate could conceal security or payroll regressions. Reject missing coverage/base and review every exclusion.
- Coverage instrumentation adds CI time; run only unit/component projects in this gate and leave existing integration/E2E matrix intact.
- No schema/config migration. Rollback is reverting package scripts, gate and CI step; retain existing test commands.

## Handoff

- Task branch: sprint-25/qa-s25-003; parent/fork 74cb28d0; PR must target release-01 as draft until bootstrap is merged/reconciled.
- Owner: Anurag Kumar. Lead owns commit, push, tracker and PR. This plan alone is not execution evidence.
