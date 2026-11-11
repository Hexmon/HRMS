# Sprint Task Tracker

The shared [Hawkaii HRMS task sheet](https://docs.google.com/spreadsheets/d/1dr5qLKxq5IGIZAyIAdMlcDYDfld-LYxfvSHkKw1jBnA/edit?usp=sharing) is the sprint planning and delivery log. It records what was planned, completed, verified, and carried over. It is not evidence that code is committed, deployed, or working; check the repository and dated QA artifacts for those claims.

For substantive HRMS work, check the sheet at intake and reconcile its row at handoff when write access is available, unless the user opts out. A task may begin while access is unavailable; keep the exact pending sheet update in the handoff. Do not use a sheet entry as permission to commit, push, deploy, or change hosted configuration.

On 2026-11-09, read-only inspection confirmed the current tab `Sprint 25 Nov07-Nov13` and columns `Task`, `Project`, `Owner Name`, `Role`, `Domain`, `Priority`, `Story Points`, `Status`, `Start date`, `End date`, `Deliverable`, `Notes`, `Remarks`, and `Commit / QA Artifact`. Recheck the live sheet before each update; this snapshot is not a permanent schema guarantee.

## Find the Correct Sprint

1. Read the date range in the latest `Sprint <number> <start>-<end>` tab and the `SP Calculation` / `Story Point Rules` tabs. Use the sheet's existing calendar and naming convention. Identify the sprint and an existing or proposed artifact ID before substantive work.
2. If the work date falls in that range, use that tab. If it falls after the range, create the next numbered sprint tab with the next consecutive date range before adding current work. Correct a past sprint only for work actually performed in that sprint; do not backdate a later discovery or fix.
3. Name a new sprint branch `sprint-<number>/<artifact-id-or-short-purpose>` when branch creation is requested. Do not rename an existing branch just to match a tracker correction.

## Record a Task

- Read the existing sprint row before creating another one. At intake, record planned or in-progress work with its actual start date and evidence status; at handoff, update status, actual end date if finished, commit, QA evidence, blockers, and carryover. Never mark a source review or pending verification as a completed release.
- Follow the current tab's headers and the `SP Calculation` / `Story Point Rules` tabs. The sheet's current scale is 1, 2, 3, 5, 8, 13 points. Enter the task/topic, project `Hawkaii HRMS`, owner, Development or QA role, domain, priority, story points, status, actual start and end dates, deliverable, notes, remarks, and `Commit / QA Artifact`.
- Use a real commit hash only after a commit exists. Otherwise use the artifact ID and state `uncommitted` or `pending commit` in remarks. Link or name QA evidence only if it exists, and distinguish automated checks, browser journeys, human UAT, and hosted verification.
- Mark partially verified work accordingly; do not turn a plan, source review, or narrow local probe into a release or production claim. Record blockers and carryover explicitly.
- Preserve formulas and unrelated entries, and verify saved values after a sheet update. The `.agents/skills/commit-and-track/SKILL.md` procedure applies at handoff for substantive tracked work.

## Full Test Cases For Every Feature Task

Standing owner instruction, 2026-11-11: this applies to all future sprints, new features, behavior updates and bug fixes. During refinement, discuss concrete normal, rejected and edge/failure scenarios alongside business rules. Record approved expected outcomes and unresolved questions; do not infer intent from a current defect. Discussion may continue with provisional cases, but a material missing oracle prevents Ready for implementation.

When creating or materially updating the task row, write the complete cases in this shared workbook at the same time. Reuse its existing case-detail view or a filterable `Sprint <number> Test Cases` tab when needed; link the task to the exact case rows. Full inline cases are acceptable for a small task if readable. A case title/count, "testing planned" or a link only to repository documentation is insufficient. Preserve the current headers and case schema; do not replace the workbook.

Each distinct case records:

- Stable Task ID and Case ID, scenario/objective and intended test layer.
- Actor/assigned roles, company/context, initial state, preconditions and synthetic input data.
- Reproducible actions, including relevant UI/direct-API and retry paths.
- Explicit expected visible result, API/error where applicable, durable DB/audit/outbox effects and forbidden effects.
- Priority/risk, approved rule/source and any unresolved question with owner.
- Task/test owner, execution status, actual-result/evidence field, reviewed revision/environment/date and defect link when available. New cases start `Not Tested`; never prefill execution claims.

Derive applicable success, validation/boundary, tenant/role/related-ID, stale state/session/tab, duplicate/concurrent transition, dependency failure/recovery and real-user browser cases through the [per-feature workflow](../../.agents/skills/qa-master-checklist/references/feature-case-workflow.md). This is a starting design obligation, not a fixed case count or proof of all possible inputs. Refine cases against changed branches and actual controls during implementation; retain stable IDs and prior execution history, and rerun affected tests after changes. Parent rows roll up child cases without duplicate story points. Separate planned cases from actual unit/component/integration/browser evidence.

Read back the saved case bodies and task links. Missing tracker access requires the exact pending full-case rows/fields in local artifacts and the handoff, not a fabricated publication. Unresolved required oracles or unavailable tests/tooling/review keep the corresponding readiness/completion gate pending. Documentation-only or non-executable tasks record a justified N/A and their actual reference/workflow checks; do not invent application unit cases.

## Keep Product Evidence Separate

- Record approved business rules and unresolved owner decisions in `docs/discovery/owner-decisions.md`; record source-backed findings, priority, acceptance checks, and remediation dependencies in `docs/discovery/implementation-backlog.md`.
- Put a corresponding task in the sprint sheet with a concise topic and links or paths to those records and dated QA evidence. The sheet records delivery status, not the full rule, technical analysis, or proof of verification.

If the sheet is readable but not writable, keep the repository change complete and report the tab, existing row or proposed task, and fields still needing an authorized editor. Never substitute a private copy for the shared tracker without saying so.

## Approved Sprint 25 Scope

On 2026-11-10 the owner explicitly assigned all 35 findings in [Sprint 25 delivery backlog](../discovery/sprint-25-saas-remediation.md), the epic/workstreams and QA/tooling tasks to Sprint 25 and Anurag Kumar. Preserve the existing completed discovery rows. New remediations remain Planned or Needs decision with no invented actual start/end date or implementation commit. Parent rows carry no additive estimate; flag provisional/overlapping estimates and capacity uncertainty without moving scope to a different sprint. Require [test/QA completion evidence](../agent/test-and-qa-completion.md) before changing a behavior ticket to Done.
