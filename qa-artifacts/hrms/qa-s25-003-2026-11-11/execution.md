# QA-S25-003 local execution (developer evidence; independent QA pending)

Date: 2026-11-11 IST. Isolated worktree: `/home/hexmon/Desktop/HRMS-qa-s25-003`. The initial implementation evidence below was captured at fork HEAD `74cb28d01750dc0fa4262ce3366ef767867e12d8`, with PR release base `30783aa5ccaef41900195e1902f9dcb9f92d4270`. The first QA implementation was later committed at `d3b386635528dc826620989c0a231c4d359014c4`; the review fixes at the end of this document remain uncommitted. No final submitted-PR coverage percentage is claimed.

## Commands and outcomes

| Command | Outcome | Notes |
| --- | --- | --- |
| `pnpm --dir hrms_backend add -D @vitest/coverage-v8@4.1.6` | Passed | Local node_modules and package lockfile only. |
| `pnpm --dir hrms-client add -D vitest@4.1.6 @vitest/coverage-v8@4.1.6 jsdom @testing-library/react @testing-library/jest-dom` | Passed | Local node_modules and package lockfile only. |
| `APP_ENV=local HRMS_ENV_FILE=.env.test pnpm test:unit:coverage` from backend package | Passed | 45 test files, 535 tests passed; 394.33 s. V8 lines 4,949/15,408; branches 3,031/12,531; statements 5,144/16,705; functions 1,247/4,431. These are whole-package totals, not changed-line results. |
| `pnpm test:unit:coverage` from frontend package | Passed | 1 file, 2 rendered component tests passed; 13.12 s. V8 lines 8/12,708; branches 11/11,720; statements 8/14,176; functions 2/5,230. Whole-package totals; one new component runner example does not cover the existing frontend. |
| `node --experimental-test-coverage --test --test-coverage-lines=100 scripts/agent/changed-coverage.test.mjs` | Passed | 11/11 synthetic tests, 9.43 s on the final post-review run. The gate script reached 100.00% lines, 90.70% branches, 100.00% functions in Node V8; test source reached 100% lines/branches/functions. Covers merge-base/new-file, red/green, missing/stale/malformed report, docs-only N/A, deletions/replacements, config changes, dirty source, CLI, branch spans and spoofed exception rejection. Remaining technical gate-script branches need independent review or tests before a full branch claim. |
| `pnpm typecheck` backend; `pnpm typecheck` frontend | Passed | Both packages. |
| `pnpm lint` backend | Passed | 476 files; generated coverage directory skipped by custom walker. |
| `pnpm lint` frontend | Passed | 0 errors, 43 existing fast-refresh warnings after formatting the new component test. |
| `pnpm build` backend; `pnpm build:vercel` frontend | Passed | Frontend Vercel SSR smoke returned HTTP 200. |
| `bash scripts/agent/validate-agent-setup.sh`; `git diff --check`; Python YAML parse | Passed | 88 documentation references, patch integrity, workflow YAML syntax. |
| `node scripts/agent/changed-coverage.mjs --base origin/release-01 --head HEAD` | Failed as intended at pre-task fork | 0/0 added TypeScript lines; 10 unmeasured executable files in inherited bootstrap diff: three QA probe `.ts` and seven shell/Python verifier scripts. Two `tests/test_*.py` files are separately classified test source requiring assertion review. Exact output: `cumulative-gate-pre-commit.log`. This is the inherited bootstrap diff only, not the uncommitted QA task. |

The first backend coverage attempt without an environment override was stopped after existing auth tests failed because the local `.env.test` sets `APP_ENV=test`, which the runtime config rejects. The accepted local value `APP_ENV=local` made the full 535-test run pass. No hosted system was contacted. The backend custom lint initially encountered generated `coverage/.tmp/*.json` missing final newlines; the walker was updated to skip generated coverage output, and lint then passed.

## Real reachable branch red/green

Target: `hrms-client/src/components/ui-kit/action-button.tsx:62`, the rendered right-icon decision. With only the `submits an enabled action once` test selected via `pnpm exec vitest run --coverage -t 'submits an enabled action once'`, Vitest passed 1 test and skipped 1. The V8 `binary-expr` branch counters at line 62 were `[2, 0, 0]`; `assessChangedFile(..., Set([62]), ...)` reported `uncoveredBranches: ["62:6"]`. This is a real untested reachable path, not a manually fabricated report.

With the second component test enabled, it asserts the accessible label and actual left/right rendered icon placement. `pnpm test:unit:coverage` passed 2 tests; the same branch counters became `[4, 2, 1]`, and `assessChangedFile` reported no uncovered branches. This demonstrates numerical failure and success tied to an observable UI behavior. It does not imply that ActionButton changed in this task's diff or that the full frontend is covered.

## Remaining gates

- Run the checker on the exact committed QA task head versus stack parent and release-01. Parent owns commit/rebase. Full PR gate must include inherited bootstrap verifier changes and cannot be called green from this pre-task fork result.
- The checker now fails closed for changed executable/config files outside backend/frontend `src`, deletion-only source hunks, and runtime replaced with non-executable lines. The current QA task itself changes package manifests, a root `.mjs` checker, backend script and CI workflow, so a final PR source-only coverage pass is insufficient. A PR-authored manual exception JSON cannot clear the gate; owner/branch-protection adjudication is external to CI and must not be described as numerical 100%.
- Independent QA and senior reviewers have reported findings, which prompted the post-review fixes below. Final independent acceptance and the committed-head PR run remain pending. All shared-sheet case execution statuses remain pending there until accessible and independently reconciled.

## Post-review regression additions

Senior/QA review identified and the developer fixed these false-green paths: package/deployment config outside the original extension matcher; PR-authored JSON impersonating an owner/reviewer; V8 branch spans changed on continuation lines; runtime replaced only by comment/type; coverage stamped from uncommitted source; value-import target changes; and TypeScript scanner tokens spanning template interpolation. The 11-case gate suite above was the run before the additional PR #117 review below. A direct check against the prior backend V8 report for `hrms_backend/src/modules/expenses/service.ts` lines 302–306 marks each executable; line 305 now maps to uncovered decision branch IDs 23 and 24. The earlier `cumulative-gate-pre-commit.log` was generated before these changes and describes only the inherited 74cb28d0 fork. The final task head must be committed, reports regenerated, and the exact PR gate rerun before disposition.

## PR #117 review follow-up (uncommitted)

The exact-head review found that a TypeScript content line beginning `++ b/` becomes `+++ b/` in a patch, which the old parser mistook for a file header. A synthetic patch now changes a guard after such a template-literal line. The new stateful hunk parser attributes both changed lines to the guard and the full gate fails on its uncovered authorization branch. It also checks hunk lengths and rejects malformed patches.

The follow-up suite adds a covered **modified** source fixture as well as the existing new-file case. A pure source rename remains fail-closed: `--no-renames` reports the old path as a deletion requiring disposition and the new path as added source. A temporary real Vitest project runs an allowed-only behavior test, stamps its report, and makes both `verify()` and the CLI fail for the uncovered changed decision; adding a rejected-behavior assertion makes both pass. Separate fixtures verify that a missing frontend report fails, and that a covered changed `hrms-client/src/` line is counted as source. All four real frontend-path regex corrections have explicit regressions: frontend source recognition, deleted source recognition, source JSON classification, and uncovered-line numerator counting. An older stamped report is rejected after HEAD changes.

Command: `node --experimental-test-coverage --test --test-coverage-lines=100 scripts/agent/changed-coverage.test.mjs`. Result: **18/18 passed**, 21.997 s. Node V8 reports gate script 100.00% lines, 91.71% branches, 100.00% functions; test script 100.00% lines/branches/functions. These percentages describe the gate script itself, not the cumulative product or exact PR diff. Tests use isolated temporary git repositories and frontend dependencies; no hosted service or product DB was touched.

Stamp freshness has a trust limit: a person can manually restamp an old report at a newer committed source revision. CI must generate the report and stamp it sequentially in the same clean job. This check establishes revision consistency, not cryptographic provenance. A fresh exact-head PR run and independent QA review remain pending after the parent commits these fixes. All four shared-sheet cases remain **Not Tested** until tracker reconciliation and independent QA disposition.
