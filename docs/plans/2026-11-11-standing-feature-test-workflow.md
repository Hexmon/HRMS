# Standing Feature Test Planning And Tracker Workflow

## Objective And Success Criteria

- Owner instruction: 2026-11-11. Apply the existing unit/QA gate to every future feature, behavior update and bug fix in every sprint.
- Discuss concrete test cases during refinement; publish their full bodies when writing the task in the shared tracker; update and execute applicable tests before Done.

## Scope

- In scope: root/backend/frontend agent routing, existing QA/implementation/tracking skills, readiness/handoff policies and plan template.
- Out of scope: product implementation, runner/CI setup, application testing, new sprint/task estimates, rewriting existing Sprint 25 cases, external sheet edits, git mutations and deployment.
- Preserve concurrent changes and current completion thresholds. Documentation-only tasks use justified N/A executable coverage.

## Evidence And Decisions

- Unit/changed-line/branch/boundary and independent QA gates already apply to all behavior changes in docs/agent/test-and-qa-completion.md.
- Gaps: task-tracker.md has no required full-case schema; QA handoff calls cases suggested; per-feature workflow describes a detail tab as optional; plan/readiness templates do not require the discussion-to-case-to-task mapping.
- Use the existing case CSV schema and shared HRMS workbook. Sprint 25 is an example, not a limit. No finite suite establishes all possible inputs.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Complete | Inspect current policies, skills, templates and worktree | All existing concurrent edits preserved. |
| Complete | Make refinement and full sheet case bodies mandatory across sprints | Central workflow/tracker policy; concise agent/skill links. |
| Complete | Validate references, skill frontmatter and documentation workflow | Existing repository checks; no application execution. |

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Complete | New feature, feature update, bug, unresolved rule, unavailable tracker and docs-only workflow walkthrough | Verify explicit outcomes and no false Done claim. |
| Complete | Skill validators and verify-change.sh | Documentation-only selection; no unit tests for prose. |
| Not run | Product tests and independent runtime QA | No behavior implemented; tooling remains QA-S25-003. |

## Risks, Compatibility And Recovery

- No API, DB, runtime, dependency or CI change. Preserve existing security/evidence and authorization boundaries.
- Do not make early discussion wait for final decisions: record provisional cases/questions, but block Ready/Done when a material oracle is missing.
- Sheet access failure retains exact pending full-case rows and links; it never creates a fabricated publication or passing result.
- Rollback only this standing-policy refinement; preserve earlier Sprint 25 work and unrelated edits.

## Handoff

- Canonical destinations: docs/process/task-tracker.md, docs/agent/test-and-qa-completion.md and the existing per-feature case workflow.
- Detailed evidence: qa-artifacts/hrms/feature-test-workflow-2026-11-11/verification.md.
- No commit, deployment, application testing or external tracker mutation performed by this task.
