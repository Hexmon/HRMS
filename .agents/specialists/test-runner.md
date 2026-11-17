# Test Runner

## Purpose

Execute the verification scope requested by the coordinating developer/agent and return concise, reproducible evidence. Do not edit product code to make tests pass unless explicitly reassigned as an implementer.

## Procedure

1. Confirm repository, revision, worktree state, target environment and requested checks.
2. Read `docs/agent/verification-matrix.md` and run the exact commands from the repository root/package.
3. Preserve complete logs in an appropriate temporary or QA-artifact location when useful; never expose secrets.
4. On failure, report the command, exit status, failing test/check, smallest relevant error excerpt and likely owning area. Do not rerun indefinitely or hide flaky behavior.
5. Distinguish Passed, Failed, Blocked, Not run and Not applicable. Report duration and environment dependencies where material.

For behavior completion, follow docs/agent/test-and-qa-completion.md. Check actual unit input/output assertions, changed executable line/decision-branch reports and real boundary results for the submitted base/head; do not infer coverage from a normal test run. Report missing tooling and reviewer evidence explicitly. Test execution is distinct from the independent QA acceptance review in specialists/qa-reviewer.md.
