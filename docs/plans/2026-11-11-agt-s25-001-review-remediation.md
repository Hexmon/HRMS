# AGT-S25-001 Exact-Head Review Remediation

## Objective And Success Criteria

- Objective: remediate the independent exact-head findings on draft PR #116 without importing the later QA-S25-003 coverage implementation.
- Success: every current direct OpenAPI dependency selects the contract/consumer guards; branch CI derives an authoritative event base and executes the repository verification framework against it; the sensitive-file guard fails closed for oversized untracked files and scans all bounded untracked text; machine-local evidence paths are portable or explicitly historical; exact verification evidence is recorded without claiming unavailable numerical coverage.

## Scope And Evidence

- Branch/head reviewed: `sprint-25/agt-s25-001` at `6881d9dbc28938d58f70fa36bbb29ef693691807`, based on `30783aa5ccaef41900195e1902f9dcb9f92d4270`.
- In scope: `scripts/agent/verify-change.sh`, its Python regressions, `protect-sensitive-files.sh`, authoritative CI event-base resolution, branch CI repository checks, non-portable evidence references, and truthful review evidence.
- Out of scope: product behavior, database migrations, hosted configuration, tracker mutation, and the QA-S25-003 changed-coverage implementation.
- Independent findings: missing API path selection and changed-line/branch evidence (P1); CI/tooling, sensitive-guard and tracker gaps (P2); machine-local paths (P3).

## Implementation And Verification

| Status | Step | Evidence |
| --- | --- | --- |
| Verified locally | Add failing path-selection and sensitive-guard regressions. | The first pre-fix run failed six cases; the first post-fix verifier suite passed 19/19. Re-review added six more failing/error cases, followed by 21/21 passing tests. The final P2 extended an existing resolver test, so the suite remains 21 tests; its focused assertions passed immediately because the production branches were already implemented, and no additional failing-before defect was reproducible. Coverage includes every currently identified direct contract-source path, event-base selection/failure branches, a pushed committed-token fixture, workflow config, a secret after line 400, and an oversized untracked file. |
| Verified locally | Correct classifiers, fail-closed scanning and CI repository-check job. | The six exact OpenAPI source/dependency paths select contract checks. PRs use the PR base SHA, pushes use the event `before` SHA, and manual runs use `HEAD^`; empty/missing, zero, malformed, unavailable, equal-to-head, non-ancestor, unsupported-event and manual-no-parent cases fail closed. CI runs the guard and real verification plan with that explicit base before deploy. |
| Verified locally | Replace or label machine-local evidence paths. | Architecture evidence uses repository-relative references; historical QA evidence labels its normalized `<CODEX_HOME>` origin; skipped visual review remains explicit. |
| Verified locally | Run verifier units, agent validation, sensitive guard, workflow/path plans, diff checks and relevant package checks. | Repository checks and backend typecheck passed; backend unit tests passed 540/540 across 46 files. No production/hosted mutation occurred. |
| Blocked by QA-S25-003 | Full numerical changed-line and decision-branch gate for scripts/config. | AGT-S25-001 predates the instrumentation. Contract tests are evidence, not numerical coverage; do not claim Done until the prerequisite is integrated and exact-head evidence is produced. |
| Blocked by connector | Shared tracker publication/readback. | Preserve exact pending update; do not claim sheet mutation. |

## Risks And Recovery

- CI fetches full history and validates that its event-specific base commit is available and is an ancestor of `HEAD`; failure stops the repository-check job. PRs do not substitute a mutable branch ref for the authoritative PR base SHA, and pushes do not substitute `origin/release-01` for `github.event.before`.
- Oversized untracked files are rejected rather than silently skipped. This is intentionally fail closed; legitimate large artifacts must be reviewed and stored through an approved path before inclusion.
- Provider-token regexes are bounded defense in depth, not a comprehensive secret detector. Secret stores, provider scanning, review and rotation remain required controls.
- A workflow run proves only the configured commands at that exact SHA. Independent re-review and QA-S25-003 numerical coverage remain mandatory before the PR can leave draft.
- No migration or data rollback exists. Recovery is a normal revert of the tooling/configuration commit after review.

## Handoff

- Owner: Anurag Kumar. Task: AGT-S25-001, Sprint 25.
- Local evidence: `qa-artifacts/hrms/agt-s25-001-review-remediation-2026-11-11/verification.md`.
- Commit, PR update, tracker publication, browser/UAT and hosted verification remain pending; this implementer pass is local and uncommitted.
