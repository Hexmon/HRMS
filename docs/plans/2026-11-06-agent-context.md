# Expand The HRMS Agent Entry Point

## Objective And Success Criteria

- Objective: Make root `AGENTS.md` a useful, evidence-based map of this repository for coding agents.
- User/business outcome: Agents can find the right implementation, contract, deployment and QA source before changing a feature.
- Observable success criteria: All referenced paths exist; current runtime and pending Cloudflare cutover are clearly distinguished; existing engineering safeguards remain intact; agent setup validation and documentation checks pass.

## Scope

- In scope: Root `AGENTS.md` and this execution record.
- Out of scope: Application behavior, generated contracts, deployments, hosted configuration and unrelated untracked architecture files.
- Affected roles, tenants, modules and environments: Repository-wide guidance only.

## Evidence And Decisions

- Current implementation evidence: `README.md`, package `AGENTS.md` files, `hrms_backend/src/app.ts`, `hrms_backend/src/modules/`, `hrms_backend/src/workers/`, `hrms_backend/wrangler.jsonc`, frontend route/domain structure and CI workflow.
- Approved requirements/decisions: Current user request to deepen root agent context and the existing repository engineering contract.
- Unknowns requiring an owner: Hosted Cloudflare activation state is not established by local source; do not claim cutover completion.
- Assumptions explicitly accepted for this task: Keep instructions portable across agents and link to detailed sources instead of copying old snapshot counts or provider secrets.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Completed | 1. Inspect worktree, current guidance and repository evidence. | Pre-existing uncommitted agent setup and unrelated ERD files preserved. |
| Completed | 2. Add project context and source navigation to root `AGENTS.md`. | Added architecture, code ownership, critical journeys, tenancy, environment and test guidance grounded in current files. |
| Completed | 3. Validate links, setup and diff integrity. | All 58 concrete references exist; agent setup and sensitive-file guards passed. |

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Completed | Validate linked repository paths and agent setup. | 58 concrete paths checked; `bash scripts/agent/validate-agent-setup.sh` passed. |
| Completed | Check diff integrity and sensitive-file guard. | `git diff --check`, `git diff --cached --check`, and `bash scripts/agent/protect-sensitive-files.sh` passed. |

## Risks, Compatibility And Recovery

- Tenant/security risks: Avoid presenting current company scoping as complete SaaS tenancy or UI role gates as authorization.
- Data/migration risks: None; no schema changes.
- API/deployment compatibility: No runtime change; avoid stale hosted status assertions.
- Observability: Verification command output in this task.
- Rollback or recovery: Revert only this documentation edit if it proves misleading.

## Handoff

- Files/artifacts: Root `AGENTS.md` and this plan.
- Commands and results: Path check 58/58; agent setup validation, sensitive-file guard and diff integrity passed. No application test was needed for a documentation-only change.
- Remaining blockers or human actions: None for documentation update.
- Commit/PR/deployment references: None requested.
