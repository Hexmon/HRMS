# Asset Tenant Ownership Cutover

## Objective And Success Criteria

- Objective: implement TEN-S25-010 by persisting immutable original-company ownership across the non-licensing asset lifecycle and enforcing that ownership on every authenticated read and mutation.
- User/business outcome: Company A retains its inventory and historical asset activity after employee status or company changes, while Company B cannot discover or alter Company A records by list, direct ID, related ID or replay.
- Observable success criteria: two-company PostgreSQL tests prove allowed same-company journeys and indistinguishable denial of foreign IDs; ownership agrees across asset, request, assignment, acknowledgement, maintenance, vendor, recovery, event, audit/outbox and command-result state; ambiguous legacy ownership fails closed instead of being guessed.

## Scope

- In scope: company ownership columns and constraints for asset inventory, assignments, state events, requests, acknowledgements, maintenance, software vendors and recovery tickets; safe legacy backfill; company-scoped list/detail/mutation policy; related-ID validation; tenant-scoped uniqueness where the value is company-owned; read snapshots and transactional persistence; seed and API/integration regressions.
- Out of scope: public QR rotation/revocation and response compatibility (TEN-S25-011), licensing product/entitlement/device authority and seat concurrency (LIC-S25-001/002/003), intercompany sale/transfer workflow, hosted migration/deployment, and unrelated asset UX.
- Affected roles, tenants, modules and environments: Employee, Asset Manager, Admin and HR recovery viewers across at least synthetic Company A and Company B; backend assets, schema/migrations, PostgreSQL persistence and existing frontend consumers; isolated local test only until owner authorizes hosted QA.

## Evidence And Decisions

- Current implementation evidence: asset domain tables except command results have no company key; asset manager/admin role shortcuts can see any loaded record; the discovery A/B probe reproduced foreign assigned-asset visibility; PR #118 makes writes atomic but explicitly leaves tenant ownership open.
- Approved requirements/decisions: one person belongs to one company at a time; historical records remain owned by the original company; current authorized HR/Admin/Auditor access historical reports and Finance can finish its own historical expenses; asset custody is not ownership; public asset QR may show the approved current fields.
- Unknowns requiring an owner: none for the bounded ownership cutover. A real intercompany asset sale/transfer remains a separate future workflow.
- Assumptions explicitly accepted for this task: licensing is governed by the separately recorded LIC tasks; legacy rows are backfilled only from a single provable company relationship and migration must stop with actionable evidence when ownership is absent or conflicting.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Done | 1. Inventory every asset table, API operation, related ID and existing SQL transaction path; define the ownership/backfill graph. | Reconciled onto PR #118 exact CI-green head `04c37894939713cacd83a309a4e1c1d5b3c40bd6`. |
| Done | 2. Add migration/schema/type ownership and database invariants with deterministic fail-closed backfill. | Migrations 0068/0069 preserve the writer fence and recovery assignment identity; missing/conflicting ownership fails closed. |
| Done | 3. Propagate company ownership through seeds, snapshots, repositories, services, persistence and outbox/event evidence. | Authenticated PostgreSQL snapshots and commands load only the active company; client company input is not accepted. |
| Done | 4. Enforce actor/resource/related-record company agreement on every authenticated asset route. | Inventory, requests, vendors, maintenance, acknowledgements and recovery use original company ownership; foreign IDs are non-enumerating. |
| Done locally | 5. Add two-company unit/integration, migration, rollback, retry, concurrency and stale-actor regressions. | Latest focused A/B and durable-authority tests pass; affected asset suites passed 34/34 before the final exact-head gate. |
| Pending | 6. Run change-aware verification, exact-head independent reviews, trusted CI and update PR/tracker evidence truthfully. | Remain draft/HOLD until all applicable gates pass. |

## Test Design And Shared Tracker

- Work-date sprint and task/artifact IDs: Sprint 25, TEN-S25-010 / SAAS-ASSET-017, work started 2026-11-14.
- Cases discussed during refinement: Company A manager can manage A inventory; Company B list/detail/direct mutation/related-ID/replay cannot reveal or alter A; A asset cannot be assigned to B employee; unassigned A asset remains A-owned; request, acknowledgement, maintenance/vendor and recovery joins must agree on company; historical A custody/recovery survives employee deactivation, soft deletion or later company movement; duplicate tenant-local codes are isolated; conflicting or ownerless legacy data blocks migration; retry/concurrency keeps one durable tenant-owned effect.
- Full case-body location in shared workbook and exact task-to-case links (not just titles or repository links): Sprint 25 task row and linked Test Cases rows must be updated after exact case inventory/readback; repository plan is not a substitute for the workbook.
- For each distinct case: stable TEN-S25-010 case IDs will record actor/role/company, synthetic A/B preconditions, HTTP and durable SQL expectations, forbidden cross-company effects, layer, priority, result, exact revision and environment.
- Applicable unit/component/integration/browser cases and changed decision branches; N/A rationale and coverage gaps: backend unit and real PostgreSQL integration are mandatory; frontend component/browser regression is required only if the response/UI contract changes. Hosted/manual role UAT and penetration testing remain Not Tested until actually executed.
- After implementation: record exact commands, counts, changed coverage, affected reruns, independent senior/security/database/QA conclusions and workbook readback before any completion claim.
- Missing sheet/tooling/oracle/reviewer: no business oracle is missing; sheet publication, exact-head reviews, trusted CI and hosted/manual evidence remain pending.

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Passed locally | Migration forward/backfill/constraint and ambiguous-data refusal | Disposable PostgreSQL proves missing map 23502, conflict 23514, successful backfill, immutable ownership, cross-company FK denial and company-delete restriction. |
| Passed locally | Asset Manager/Admin same-company lifecycle and foreign direct-ID denial | Synthetic A/B API test covers inventory, equal codes, requests, equal vendor names, maintenance and recovery. |
| Passed locally | Employee own assets/requests/acknowledgements and stale company/session behavior | Authenticated SQL reads fail closed after durable user, company or preference changes; final exact-head full gate remains pending. |
| Pending | HR/Admin recovery after inactive, soft-deleted or moved employee | Durable assignment/company history assertions. |
| Pending | Retry, duplicate delivery, rollback and concurrent mutation | Exact rows, outbox and command-result assertions. |
| Pending | Lint, typecheck, focused/full affected tests, changed line/branch coverage and trusted CI | Exact branch head. |
| Pending | Independent senior, security/database and QA review | Exact branch head after final fix loop. |

## Risks, Compatibility And Recovery

- Tenant/security risks: missing one read or related-ID check creates BOLA; role possession alone is never sufficient; idempotency replay must re-authorize current actor and resource ownership before returning stored data.
- Data/migration risks: unassigned legacy inventory may have no provable owner; conflicting historical associations must stop migration and be repaired explicitly. No default company or first-company assignment is allowed.
- API/deployment compatibility: company ownership remains server-derived and is not accepted from clients; public QR behavior is intentionally unchanged; tenant-local uniqueness may allow equal asset/vendor codes in different companies without changing response shapes.
- Observability: migration errors identify counts/record classes without exposing personal or secret data; denied operations use existing non-enumerating errors and audit/outbox evidence where the domain currently requires it.
- Rollback or recovery: before hosted rollout, export/validate ownership mapping and take a database backup; rollback application first. Once tenant-local duplicate values exist, removing company-scoped uniqueness or ownership columns is not automatically reversible and requires a reviewed forward repair.

## Handoff

- Files/artifacts: this plan, ordered migration, schema/types, asset service/repository/routes/persistence changes, focused tests, PR and tracker evidence.
- Commands and results: migration history and schema drift passed for 69 migrations; no unresolved cross-schema FKs; semantic coverage tests 76/76; affected asset unit/integration 43/43 across recorded runs; API docs and consumer verification passed. Exact committed-head coverage/CI remains pending.
- Remaining blockers or human actions: PR #118 is exact-head CI-green but remains draft/HOLD; hosted ownership-map review, migration, browser QA and deployment remain owner-controlled.
- Commit/PR/deployment references: branch `sprint-25/ten-s25-010-asset-tenant`, stacked from PR #118 head `04c37894939713cacd83a309a4e1c1d5b3c40bd6`; no child PR or deployment yet.
