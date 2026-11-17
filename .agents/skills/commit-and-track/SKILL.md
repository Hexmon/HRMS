---
name: commit-and-track
description: Prepare a verified Hawkaii HRMS change for commit or handoff and reconcile its sprint-sheet evidence. Use for substantive tracked work, explicit commit or PR requests, and task-sheet updates; commits, pushes, and deployments still require their own authorization.
---

# Commit And Track

1. Inspect branch, status, staged/unstaged/untracked files and recent history. Separate task files from pre-existing user changes; never discard or include unrelated work.
2. Run the applicable verification and `scripts/agent/protect-sensitive-files.sh`. Review the diff for generated noise, secrets, debug output, local paths, credentials and missing documentation.
3. Group one logical change and propose a concise conventional-style message that states the affected area and outcome. Commit only when explicitly requested; do not amend, push or merge unless separately requested.
4. For substantive tracked work, open the shared sheet linked from `docs/process/task-tracker.md` at intake and again at handoff. Verify the live sprint dates and columns, locate the existing row before adding one, and use the work-date sprint for new work. Correct older tabs only for work actually performed then. Record truthful topic, project, owner, role, priority, story points, status, dates, deliverable, notes, remarks, commit, QA and artifacts. Link owner decisions, implementation findings, and QA evidence rather than replacing them with sheet text.
5. When creating or materially updating a behavior task in any sprint, publish complete cases in the shared workbook at the same time under docs/process/task-tracker.md and link the exact case rows; titles/counts or repository-only links are insufficient. Preserve existing evidence and initial Not Tested status for new cases. Reconcile discussion-stage cases with final branches, actual test results and unresolved oracles. If access fails, retain exact pending full-case rows locally and report the publication gap. Reconcile the row at handoff when writable, unless the user opts out. Preserve formulas and other rows; reread the saved row. Never fabricate completion, QA, commit IDs or links; record unavailable evidence as pending/blocked.
6. Report the sheet tab and row updated, or the precise pending row/fields if the sheet cannot be written. Report the resulting commit/status and remaining push, PR, approval, deployment or QA steps. A sheet update does not authorize those actions.

## Behavior-change handoff

Before recording Done or preparing a ready-for-merge claim, apply qa-completion-gate and docs/agent/test-and-qa-completion.md. Link independent review and actual unit/input-output/changed-line/branch/boundary evidence for the submitted SHA. A commit or a sheet update does not close missing QA. Sprint 25's owner-approved allocation includes every item in docs/discovery/sprint-25-saas-remediation.md; preserve historical rows and do not imply they implement the newly planned fixes.
