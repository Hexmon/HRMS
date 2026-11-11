# Coordinated Delivery Preparation Verification — 2026-11-11

Prepared the owner-requested main-chat activation prompt, delivery procedure, narrow coordinate-delivery skill, non-secret credential-register template and agent/index/branch routing. Preserved pre-existing changes. No application implementation, active goal, subagent dispatch, branch/commit/push/PR, actual credential inventory, external sheet mutation or hosted configuration was performed here.

## Checks Actually Run

- skill-creator `quick_validate.py .agents/skills/coordinate-delivery`: Skill is valid.
- `git diff --check`: passed.
- `git check-ignore --no-index hrms_backend/.env hrms-client/.env.local`: both paths ignored under current rules; no file value was read or written by this check. Actual supported loader/path must still be checked per task.
- `./scripts/agent/verify-change.sh --plan`: selected documentation/integrity checks, no runtime files detected.
- `./scripts/agent/verify-change.sh`: sensitive-file guard, staged/unstaged patch-integrity and agent setup/reference checks passed. These do not implement or test the delivery software itself.

## Static Workflow Review

| Scenario | Required outcome checked in the prepared procedure/prompt |
| --- | --- |
| Workflow changes exist only in dirty local checkout | Preserve/reconcile ownership; prepare an owned bootstrap dependency PR rather than discard changes or assume release-01 contains them. |
| Child task requires an unmerged parent | Record parent/fork SHA, task-local/cumulative changes, draft PR to release-01 and explicit prerequisite merge order. |
| Parent merged by squash/rebase and child SHA changes | Reconcile ancestry without duplicating changes; inspect new diff, rerun affected tests/CI and independent review. No old-SHA approval reused. |
| Reviewer finds a valid material issue | Fix, add regression, test and scoped re-review; no round cap turns a failing gate into a pass. |
| Repeated identical failure yields no new evidence | Replan root cause or record named owner/environment blocker; continue independent work, no endless retry loop or false completion. |
| Provider credential missing | Populate exact non-secret register row from current source; use authorized existing configuration/local contract where appropriate, otherwise request required owner action. Never fabricate/reveal values or treat a mock as delivery. |
| Owner has not merged PRs or human QA remains | Keep phase and release goal pending; supply merge order and exact remaining gates, no protected-branch merge or readiness certification. |
| Owner merges release-01 PR | Verify actual merged SHA, run affected regression, reconcile children, and later run full integrated regression; corrections use fresh task PRs. |

Research used find-skills leaderboard plus actual community skill source/GitHub adoption and official OpenAI documentation. No external skill/helper installed or executed. Structural/static review is not independent live multi-agent behavioral validation, human UAT, application unit/E2E execution, external penetration testing or hosted verification. Those remain work for the activated main chat and authorized later owner gates.
