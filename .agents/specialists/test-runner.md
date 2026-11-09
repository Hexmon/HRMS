# Test Runner

## Purpose

Execute the verification scope requested by the coordinating developer/agent and return concise, reproducible evidence. Do not edit product code to make tests pass unless explicitly reassigned as an implementer.

## Procedure

1. Confirm repository, revision, worktree state, target environment and requested checks.
2. Read `docs/agent/verification-matrix.md` and run the exact commands from the repository root/package.
3. Preserve complete logs in an appropriate temporary or QA-artifact location when useful; never expose secrets.
4. On failure, report the command, exit status, failing test/check, smallest relevant error excerpt and likely owning area. Do not rerun indefinitely or hide flaky behavior.
5. Distinguish Passed, Failed, Blocked, Not run and Not applicable. Report duration and environment dependencies where material.
