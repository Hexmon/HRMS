# Coordinated Delivery Workflow And Main-Chat Goal Prompt

## Objective And Success Criteria

- Prepare the owner's main-chat goal prompt and durable project workflow for source-backed prioritization, sequential implementation, independent multi-agent review, one branch/PR per implementation task, owner-controlled release-01 merges and regression before main promotion.
- Owner decisions this turn: stacked branches are allowed for dependencies, all PRs target release-01; actual secrets use existing approved stores plus ignored local environment files.

## Scope

- In scope: delivery/branch workflow, central non-secret credential register, a narrow coordinator skill, agent/index routing, primary-source skill research and copyable activation prompt.
- Out of scope: starting a goal or agents in this side conversation, application implementation/testing, git mutations, remote PR creation, deployments, provider/secret configuration and existing tracker mutations.

## Evidence And Decisions

- Read current root/package instructions, task tracker, branching policy, implementation/QA skills, specialist profiles, environment safety and ignore rules.
- Existing generic branch guide routes through dev/qa; the owner's requested delivery run requires an explicit scoped release-01 integration path, without asserting that hosting workflows have changed.
- Reviewed official OpenAI long-horizon/multi-agent guidance and community skill source via find-skills. Do not import rules that allow invented business decisions or weaken the local QA gate.
- Preserve all pre-existing worktree edits. The prompt authorizes the main chat, not this preparatory side conversation, to implement/commit/push/open PRs.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Complete | Inspect repository workflows and research candidate skills | Public primary sources only; no proprietary code upload or remote helper execution. |
| Complete | Resolve stacking and credential-storage choices | Owner accepted stacked branches and existing stores/ignored .env files. |
| Complete | Write main-chat prompt, reusable coordinator and scoped workflow | Preserve owner merges, honest states and bounded review loops. |
| Complete | Validate skill, links and scenario consistency | Documentation/skill checks only. |

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Complete | Unmerged dependency, squash merge, stale review, unavailable secret, repeated failure and human merge checkpoints | Static workflow walkthrough; no application test claims. |
| Complete | Skill frontmatter, patch/reference validation and verify-change.sh | Documentation-only execution selection. |
| Not run | Product implementation/runtime QA/hosted operations | Intentionally deferred to activated main chat and later owner gates. |

## Risks, Compatibility And Recovery

- Existing independent-QA, full case publication and changed-line/branch requirements remain authoritative.
- No secret values belong in the tracked register, sprint sheet, prompt, evidence or chat. Store inventory is initially unverified.
- Record task-local and cumulative stacked diffs; reconcile children after parent merges and rerun affected checks at new heads.
- Remove only these new workflow artifacts/routing additions to roll back; preserve prior planning and code.

## Handoff

- Activation prompt: docs/agent/main-chat-delivery-goal-prompt.md.
- Procedure: docs/process/coordinated-delivery.md.
- Credential index: docs/agent/credential-register.md.
- No active goal, agent, commit, PR or deployment was started by this side-chat preparation.
