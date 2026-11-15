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
| Done locally | 2. Add migration/schema/type ownership and database invariants with deterministic fail-closed backfill. | Migrations 0068/0069 perform the ownership cutover; append-only migration 0070 rejects unattributed, unknown-verifier, orphan and owner-mismatched map rows, captures immutable recovery identity, freezes the evidence map, prevents hard deletion/re-keying of mapped roots and revokes PUBLIC map DML. Inactive historical companies remain valid owners when the company row exists. |
| Done locally | 3. Propagate company ownership through seeds, bounded read projections, repositories, services, persistence and outbox/event evidence. | Authenticated asset list/detail/request/maintenance/vendor/recovery, employee detail, dashboard and report reads now use endpoint-specific SQL projections/counts; commands remain full transactional snapshots. Embedded per-asset maintenance is explicitly capped at 100 with total/has-more metadata. |
| Done locally | 4. Enforce actor/resource/related-record company agreement on every authenticated asset route. | Inventory, requests, vendors, maintenance, acknowledgements and recovery use original company ownership; foreign IDs are non-enumerating. Memory and PostgreSQL command paths both reject a foreign-company assignee. Recovery responses expose only immutable original-company employee identity snapshots. |
| Done locally | 5. Add two-company unit/integration, migration, rollback, retry, concurrency and stale-actor regressions. | Full backend unit tests pass 627/627; asset transaction PostgreSQL tests pass 35/35; assets integration passes 4/4; reports integration passes 5/5; contracts pass 27/27; migration finalization passes 1/1. Exact-clean-commit coverage and CI remain separate pending gates. |
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
| Passed locally | Migration forward/backfill/constraint and ambiguous-data refusal | Disposable PostgreSQL proves missing map 23502, conflict 23514, orphan map 23503, successful backfill, finalized map update/delete 55000, immutable recovery identity, cross-company FK denial and company-delete restriction. |
| Passed locally | Asset Manager/Admin same-company lifecycle and foreign direct-ID denial | Synthetic A/B API test covers inventory, equal codes, requests, equal vendor names, maintenance and recovery. |
| Passed locally | Employee own assets/requests/acknowledgements and stale company/session behavior | Authenticated SQL reads fail closed after durable user, company or preference changes; final exact-head full gate remains pending. |
| Passed locally (focused) | Original-company recovery after employee company/profile/role movement | Memory and real PostgreSQL cases assert only the captured `id`, `full_name` and `employee_code`; current foreign-company email/roles/profile are absent. Soft-delete and all-role permutations remain part of the final affected run. |
| Passed locally (focused) | Bounded reads and command concurrency | PostgreSQL cases assert one-row SQL hydration for a one-row page, explicit maintenance truncation metadata, same-version race preservation, and Company B command progress while Company A's command lock is held. |
| Pending | Retry, duplicate delivery and rollback full regression | Existing exact-row/outbox/command-result tests must pass at the final working tree. |
| Partial | Lint, typecheck, focused/full affected tests, changed line/branch coverage and trusted CI | Lint (499 files), typecheck, backend unit 627/627, asset transaction 35/35, assets integration 4/4, reports integration 5/5, contracts 27/27, migration finalization, OpenAPI docs and API consumer verification pass locally. An earlier coverage collection ran with 625/625 tests but the trusted stamp correctly refused the uncommitted working tree; exact-clean-commit coverage and CI remain pending. |
| Pending | Independent senior, security/database and QA review | Exact branch head after final fix loop. |

## Risks, Compatibility And Recovery

- Tenant/security risks: missing one read or related-ID check creates BOLA; role possession alone is never sufficient; idempotency replay must re-authorize current actor and resource ownership before returning stored data.
- Data/migration risks: unassigned legacy inventory may have no provable owner; conflicting historical associations must stop migration and be repaired explicitly. No default company or first-company assignment is allowed.
- API/deployment compatibility: company ownership remains server-derived and is not accepted from clients; public QR behavior is intentionally unchanged; tenant-local uniqueness may allow equal asset/vendor codes in different companies. Asset detail/list responses now document `maintenance_total` and `maintenance_has_more`; recovery employee projection is explicitly allow-listed in OpenAPI.
- Observability: migration errors identify counts/record classes without exposing personal or secret data; denied operations use existing non-enumerating errors and audit/outbox evidence where the domain currently requires it.
- Rollback or recovery: before hosted rollout, export/validate ownership mapping and take a database backup. After migration 0069, do not roll the application back to a pre-ownership binary; after 0070, the verified map and recovery identity are intentionally immutable. Pause asset writes and repair/roll the application forward, or restore the complete pre-cutover application and database backup during an approved outage. Once tenant-local duplicate values exist, removing company-scoped uniqueness or ownership columns is not automatically reversible.

## Handoff

- Files/artifacts: this plan, ordered migration, schema/types, asset service/repository/routes/persistence changes, focused tests, PR and tracker evidence.
- Commands and results at the current uncommitted correction tree: backend lint/typecheck passed; unit 627/627, asset transaction PostgreSQL 35/35, assets integration 4/4, reports integration 5/5, contracts 27/27 and migration finalization 1/1 passed; migration history/schema drift/no-cross-schema-FK passed for 70 migrations; OpenAPI generation/verification and API consumer verification passed. The trusted changed-coverage stamp remains pending because it correctly requires an exact clean commit.
- Remaining blockers or human actions: exact-head full verification, changed coverage, trusted CI, independent senior/security/database/QA review, hosted ownership-map review, isolated-QA migration/browser checks and deployment remain owner-controlled gates.
- Commit/PR/deployment references: branch `sprint-25/ten-s25-010-asset-tenant` at committed head `3b52b5f2d38a3d0d30f0ccdc3020d4631e7563a0` plus this uncommitted correction set; no push, merge or deployment performed by this correction task.
