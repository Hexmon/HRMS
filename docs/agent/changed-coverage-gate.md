# Changed executable coverage gate

QA-S25-003 adds Vitest V8 coverage for backend unit tests and frontend component tests, plus a PR-base/head gate. The gate checks added and modified `.ts`/`.tsx` lines under `hrms_backend/src` and `hrms-client/src`, including every line in a new source file. It maps those lines to Istanbul statement/function locations and every overlapping changed decision-branch span in the generated `coverage-final.json` reports. A missing source location, zero count, missing report, modified report, dirty/stale source tree, unknown base or uncovered branch fails the gate. The gate also scans the full PR file list: deleted source, runtime replaced by non-executable lines, and executable/config files outside instrumented source fail as unmeasured rather than passing an empty denominator.

## Run locally

Use a committed task head and the real target branch or commit as base. Install each package from its lockfile, then:

```bash
APP_ENV=local HRMS_ENV_FILE=.env.test pnpm --dir hrms_backend test:unit:coverage
pnpm --dir hrms-client test:unit:coverage
node --experimental-test-coverage --test --test-coverage-lines=100 scripts/agent/changed-coverage.test.mjs
node scripts/agent/changed-coverage.mjs --base origin/release-01 --head HEAD
```

The backend unit command needs the isolated test environment described in `docs/agent/environment-safety.md`. In CI, a synthetic `TEST_DATABASE_URL` satisfies the test environment loader; unit tests use in-memory stores and do not connect to that URL. The separate backend integration/contract/E2E jobs still use disposable PostgreSQL and Valkey. Coverage scripts write ignored `coverage/coverage-final.json` and a stamp containing the current head, source digest and report digest. The package source must be committed and clean before stamping or verifying; untracked or unstaged source fails. Rerun coverage after any source edit. CI checks out the actual PR head with full base history, then generates both reports and executes the gate. This CI job runs on pull requests; branch protection must require it before merging and direct-push deployment paths need separate protection.

The stamp detects a report or source changed **after** stamping; it does not prove that Vitest created the report for the stamped head. A previously generated report could be manually restamped after a new commit if someone invokes `--stamp` directly. CI relies on a clean checkout and its ordered `vitest run --coverage && stamp` command in the same job. Review the CI test log and report provenance; do not treat a stamp alone as an attestation.

For a stacked branch, record two outcomes separately: `--base <stack-parent-SHA>` measures the task delta and `--base origin/release-01` measures the full submitted PR. A task-local pass does not waive uncovered inherited changes in the cumulative PR gate. A failed cumulative gate leaves the PR draft and the task incomplete until the inherited lines and branches are tested.

## Exclusions and interpretation

- `.unit.test.ts(x)`, other `.test.ts(x)` and `tests/test_*.py` files are test source, not product behavior in this gate. The gate prints them as `TEST SOURCE` where found outside the instrumented trees. Their assertions require independent review and execution evidence; test execution alone does not prove their quality.
- `.d.ts`, interfaces, type aliases, **type-only** imports/re-exports, comments, blank lines and punctuation-only lines have no directly instrumented statement. The gate classifies them as non-executable rather than assigning a false 100%. Value imports, re-exports and side-effect imports are runtime module dependencies and fail when uninstrumented.
- `hrms-client/src/routeTree.gen.ts` is TanStack's generated route tree. It is regenerated and checked by frontend build/route guards, not hand-tested line by line.
- `hrms-client/src/test/**` contains the Vitest setup harness, excluded from product coverage. SQL migrations and other generated/non-TypeScript files require their existing integration/build gates.
- The gate's own `scripts/agent` JavaScript, shell/Python verification scripts, package manifests and lockfiles, Docker/Compose/Render/Vercel/Cloudflare config, SQL migrations and CI workflow config are outside the two package source maps. A PR changing them fails the automated gate as **unmeasured**, even if its package source lines pass. The gate regression suite exercises synthetic diffs and failure modes, but numerical package coverage does not prove those boundaries. Instrument them or present exact test evidence for protected-branch adjudication; do not claim repository-wide 100% from a source-only report.
- Deleting an executable source hunk or whole source file can change behavior with zero added lines. Replacing executable code only with a comment or type is also detected from the old side of the diff. The gate fails these changes and requires explicit regression evidence/owner disposition. A spacing-only edit that retains executable code is not classified as runtime removal.
- A source rename is deliberately analyzed as a deletion and a new file. The new path needs coverage, and the old path remains a failed deletion until its behavior and references are reviewed. A rename is not counted as an automatic 0/0 pass.
- Git patch headers are parsed only before a hunk. A source line beginning `++ b/...` appears in the patch as `+++ b/...`; the gate keeps it inside the current hunk and still attributes later authorization edits to their real file.
- V8 line/branch coverage shows execution, not assertion quality or correct authorization. Review the behavioral oracle and run real DB/worker/browser tests for the affected feature under `docs/agent/test-and-qa-completion.md`.

The report prints exact uncovered source locations and counts. Do not add coverage-ignore comments, broad exclusions or fabricated report entries to clear it. Changed code with an unmeasured executable line or reachable decision branch remains incomplete.

## Manual evidence and independent approval

PR-authored JSON cannot authenticate an owner, reviewer or GitHub review URL. The CI gate **never accepts a manual evidence file as a bypass**; `--manual-evidence` is rejected. An exceptional unmeasured path stays failed in CI. Its exact executed commands, results and rationale may be attached to the PR for an independent owner decision under protected-branch rules. That human decision is separate from numerical coverage and cannot be represented as 100% by this gate.
