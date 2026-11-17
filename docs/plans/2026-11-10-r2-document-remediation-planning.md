# R2 Document Storage Review And Sprint 25 Refinement

## Objective And Success Criteria

- Review storage-facing feature paths and choose targeted fixes versus a shared architecture change.
- Record source evidence, a proposed production design, acceptance tests and deduplicated Sprint 25 work assigned to Anurag Kumar.
- Success: indexed repository proposal and existing ticket refinements; new work appears in the shared tracker only after live rows and saved values can be checked. No runtime remediation is implied by planning.

## Scope

- In scope: documents/EMS proofs, expense/leave/helpdesk/project links, company logos, profile photos, exports, storage adapter, persistence selection, retries, audits, resource limits and Cloudflare official documentation.
- This request records implementation tasks; application code, schema execution, commits, deployment and hosted security probes are outside this planning change.
- All affected roles and company boundaries are included in the proposed acceptance matrix. Use synthetic fixtures for future execution.

## Evidence And Decisions

- Baseline: `87618f88f464847d049c9e2cf97968238cae1b66`, branch `sprint-25/saas-s25-001`; initially clean worktree. Source inspection only.
- Owner direction: remove Cloudinary completely and use Cloudflare R2; product has not launched, so no existing customer-object migration is required. Development schema migrations and API regeneration are still implementation work.
- Preserve DEC-011 and current document/activation/retention decisions. No new retention duration, public-media permission, scanner provider, face-crop replacement or performance promise is assumed approved.
- Follow root/backend AGENTS, architecture-review/security-review and commit-and-track procedures. Repository cross-schema FK gate remains applicable.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Complete | Recheck source and existing canonical tickets | TEN-S25-006/007/020/021/022 already cover authorization and consistency; preserve IDs. |
| Complete | Compare R2 access, consistency, cleanup and image-processing options | Official Cloudflare sources are recorded in the proposal. |
| Complete | Record findings, proposed design, bounded tasks and acceptance tests | See `docs/discovery/r2-document-storage-remediation-2026-11-10.md`. |
| Complete | Reconcile live Sprint 25 rows and verify saved values | Existing user-tab binding failed; a fresh tab in the same browser opened the authorized link without login. Read live rules and existing rows; added A79:N82 and appended suggestions to 12 existing remarks cells. Downloaded saved workbook readback matched expected values. |
| Complete | Verify links, IDs, diff and sensitive-file guard | Documentation-only checks; see verification evidence. Application tests are not execution evidence for this plan. |

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Complete | Read upload/read/delete/replacement/link/export/persistence code and relevant tests | Source review at named baseline; no attack or failure scenario executed. |
| Complete | Check Markdown links, ticket IDs and documentation diff | Local repository; dated verification evidence. |
| Complete | Read before write and reread edited Sprint 25 rows | Shared tracker readback, preserved prior values/formulas, new task ownership/status/points checked. |
| Not run | R2 integration, crash/restart, concurrency, abuse, load and role UI journeys | Implementation tickets define these gates; no R2 credentials or hosted data accessed. |

## Risks, Compatibility And Recovery

- Tenant/security: provider replacement alone does not repair policy, linked-record or cache boundaries.
- Data: Neon and R2 cannot share a transaction; proposed durable intents, immutable versions and reconciliation must be implemented together.
- Compatibility: replace Cloudinary transformations and URL contracts deliberately; regenerate contracts rather than hand-editing generated files.
- Recovery: planned tombstones, retention-aware purge, retries and bounded reconciliation; no existing object is deleted by this review.

## Handoff

- Files/artifacts: proposal, existing discovery/backlog refinements, pending tracker patch and this plan.
- Commit/PR/deployment: none requested or created.
- Tracker: `Sprint 25 Nov07-Nov13`, new rows 79–82; suggestions appended to M15/M25/M26/M27/M28/M31/M33/M39/M40/M41/M48/M61. All assignees Anurag Kumar. New estimates 8/8/5/8 SP, Planned, no implementation dates/commits.
- SP Calculation recalculated from 539 to 568 assigned and 469 to 498 pending; completed remains 70. No formula edits or other-tab authored changes. See `qa-artifacts/hrms/r2-storage-review-2026-11-10/verification.md`.
