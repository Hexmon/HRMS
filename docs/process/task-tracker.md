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

## Keep Product Evidence Separate

- Record approved business rules and unresolved owner decisions in `docs/discovery/owner-decisions.md`; record source-backed findings, priority, acceptance checks, and remediation dependencies in `docs/discovery/implementation-backlog.md`.
- Put a corresponding task in the sprint sheet with a concise topic and links or paths to those records and dated QA evidence. The sheet records delivery status, not the full rule, technical analysis, or proof of verification.

If the sheet is readable but not writable, keep the repository change complete and report the tab, existing row or proposed task, and fields still needing an authorized editor. Never substitute a private copy for the shared tracker without saying so.
