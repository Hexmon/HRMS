# Trusted changed-coverage bootstrap and GitHub protection

The changed-coverage program is a correctness gate, not a self-authenticating security boundary. A pull request can modify an ordinary workflow and the repository validator that the workflow executes. Requiring that PR-controlled status by name does not prove that the original validation ran. The first trusted validator revision therefore needs an explicit human root-of-trust decision and a protection configured outside the candidate branch.

## Recommended option A: organization required workflow

Use GitHub's organization or enterprise ruleset rule **Require workflows to pass before merging**. Select this repository (or a separate internal policy repository), `.github/workflows/trusted-changed-coverage.yml`, and the exact independently reviewed commit SHA containing the workflow and validator. Do not select a mutable candidate-branch workflow. The required workflow checks out two trees:

1. the candidate at the exact pull-request or merge-group SHA; and
2. the validator repository at `job.workflow_sha`, the immutable SHA GitHub used for the required workflow.

It then runs the validator from the trusted tree with `HRMS_COVERAGE_REPO_ROOT` pointing at the candidate. The `--trusted-validator` value is propagated to the isolated worker, so the worker does not switch back to the candidate's `scripts/agent/changed-coverage.mjs`. GitHub Cloud documents `job.workflow_repository` and `job.workflow_sha` specifically for identifying and checking out the repository/SHA that defines the current job. Those `job.workflow_*` properties are not available on GitHub Enterprise Server, so this workflow is a GitHub Cloud design; a GHES installation needs a separately validated equivalent rather than an empty fallback. The workflow uses `pull_request` and `merge_group`; it does **not** use `pull_request_target`, expose secrets to candidate steps, or grant write permissions to candidate code.

Candidate dependency installation uses both `--ignore-scripts` and `--ignore-pnpmfile`. These are separate mandatory controls: candidate lifecycle scripts or `.pnpmfile.cjs` hooks must not execute before the immutable validator because they could otherwise write GitHub environment/path command files and alter later `node`, `git` or validator execution. The trusted-workflow regression checks both candidate install commands for both flags.

The workflow creates its pinned Python coverage runtime with `python3 -m venv --copies` and prepends only that copied interpreter directory for the validator step. The gate deliberately rejects symlinked executable identities; a normal GitHub-hosted runner exposes `/usr/bin/python3` as a symlink, so installing `coverage` into the system interpreter is not sufficient evidence that the selected executable is the validated regular file.

GitHub documents ruleset workflows as an organization/enterprise control whose configuration identifies the source repository and workflow. Its rules API exposes workflow `repository_id`, `path`, `ref` and `sha`; the workflow identity contexts expose the actual workflow repository and SHA; strict required checks force an up-to-date topic branch; and merge queues require the separate `merge_group` trigger. See [available rules for rulesets](https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [rules API](https://docs.github.com/en/rest/orgs/rules), [Actions contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts), [creating rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository), and [events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group).

### One-time owner/admin procedure

1. Reconcile the bootstrap branch with the latest protected `release-01` and obtain independent security/QA review of the complete workflow, validator, dependencies and tests.
2. Merge that bootstrap through an explicit owner/admin decision. Its local and PR runs are evidence only; the bootstrap cannot prove itself.
3. Record the immutable merged commit SHA. Configure an active organization ruleset targeting `release-*`, `dev`, `qa` and `main`, requiring `.github/workflows/trusted-changed-coverage.yml` from that exact source repository, path and SHA. The recommended first deployment uses the same repository so no cross-repository credential is needed. A separate policy repository is valid only when the checkout has explicit read access without exposing a reusable credential to candidate code; verify that access in a harmless PR before enforcement.
4. Require pull requests, strict up-to-date branches, dismissal of stale approvals, approval of the most recent push by someone other than its author, and review from code owners. Do not give routine contributors bypass access. The PR event measures the candidate head against the recorded base SHA; it is equivalent to the proposed result only while strict up-to-date protection keeps that base an ancestor and forces a rerun whenever the base advances. A merge queue must require the `merge_group` run so the generated merge-group SHA, not an earlier PR-head result, is evaluated.
5. Add .github/CODEOWNERS only after the real authorized GitHub team or owner identity is confirmed. Own at least `/.github/`, `/scripts/agent/changed-coverage.mjs`, package/Vitest coverage configuration, lockfiles and the CODEOWNERS file itself. GitHub reads CODEOWNERS from the base branch; enable **Require review from Code Owners**. Do not invent a team name in source control.
6. Push a harmless follow-up commit or reopen the pull request so an already-open PR receives the newly required workflow. Confirm the merge box identifies the organization ruleset workflow, not merely a same-named candidate status.
7. Preserve the ruleset export/audit evidence and the pinned workflow SHA in the release record. Updating the validator requires another independently reviewed bootstrap and a deliberate ruleset SHA update.

## Option B: external GitHub App or CI

If the GitHub plan does not provide organization required workflows, use a separately administered GitHub App or external CI service. Configure the branch ruleset to require its check and select that App as the expected status source. The service must fetch the trusted validator from an immutable reviewed revision, evaluate the exact candidate/base SHAs, and publish the result itself. A same-repository workflow with the same check name is not a substitute.

## Nonnumeric files remain failed

Workflow, manifest, lockfile, configuration and shell changes remain `unmeasured` unless the trusted validator has evidence tied to every changed semantic node or executable line and decision outcome. Substring presence, successful neighboring commands, executable mode and a minimum number of shell trace lines do not clear a path. Unknown changes fail closed. Vitest configuration should be loaded and instrumented under a trusted harness; shell decisions need real changed-line/decision instrumentation with observable assertions or remain red for explicit owner review.

## Isolation and provenance limit

The local wrapper uses a random external output directory, a detached exact-commit checkout, read-only tracked files/directories, canonical paths, source/report digests and clean-tree checks before and after child commands. These controls catch accidental mutation and many stale/substitution errors. They do not create a hostile-code sandbox: candidate code running as the same operating-system user can change permissions transiently or forge writable V8, Istanbul or coverage.py artifacts before restoring state. Therefore:

- local and ordinary same-run coverage is developer correctness evidence, not cryptographic attestation;
- do not claim that the checkout or report is immutable against malicious candidate code;
- use the pinned required workflow, independent review and restricted bypasses as the security boundary; and
- if attacker-resistant report provenance is required, move collection to separately administered infrastructure or an external service with trusted instrumentation. Do not represent repository-only self-instrumentation as solving that problem.
