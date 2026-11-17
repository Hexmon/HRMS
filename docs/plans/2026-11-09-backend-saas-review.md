# Backend SaaS Discovery And Remediation Review

## Objective And Success Criteria

- Objective: trace current backend business rules, tenant ownership, persistence and operational boundaries at `6a8d11f7` and produce an evidence-backed SaaS remediation plan.
- User/business outcome: understand what must change before a scalable, secure multi-tenant launch without changing application behavior in this stage.
- Observable success criteria: status inventory for every backend runtime file, route, job, table and data boundary; rule-to-code-to-risk traceability; prioritized backlog with evidence, dependencies and acceptance checks; modular-monolith design and resource assumptions; reconciled QA and Sprint 25 tracker.

## Scope

- In scope: source/migration/config/contract inspection, approved owner decisions, bounded disposable local verification, architecture and QA documentation, sprint tracker update.
- Out of scope: application/schema/deployment edits, hosted probes, production data mutation or production-readiness certification.
- Affected roles, tenants, modules and environments: all backend roles and company-owned modules; local synthetic environment only for execution.

## Evidence And Decisions

- Current implementation evidence: `docs/architecture/current-runtime-source-2026-11-09.md`, `docs/discovery/implementation-map.md`, `docs/discovery/implementation-backlog.md`, and `qa-artifacts/hrms/discovery-2026-11-09/` are starting evidence, not proof of complete review.
- Approved requirements/decisions: `docs/discovery/owner-decisions.md` DEC-001–016; unresolved DEC-Q entries remain open.
- Unknowns requiring an owner: identity assurance, transfer dispute, retention specifics, office effective dates, correction authority, overlap disposition and public QR revocation details.
- Assumptions explicitly accepted for this task: no application behavior change; use current checkout and local disposable services only.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Complete | 1. Inventory backend files, routes, jobs, tables and data boundaries; assign review status. | `backend-saas-review-inventory.csv` has 620 rows; lexical routes and migration-only tables are labeled. |
| Complete for selected critical paths | 2. Trace approved rules and critical user journeys through auth, ownership, service, storage, outbox, report and UI boundary. | `saas-rule-traceability.md`; 447 inventory rows remain unreviewed and are not cleared. |
| Partial | 3. Review shared state, concurrency, transactional, Redis, worker, upload, export and recovery failures. | Current source plus prior/renewed probes; Valkey/session and object-store ordering were source-reviewed; Redis outage, upload failure injection, DLQ and hosted recovery remain explicit execution gaps. |
| Partial | 4. Inspect constraints, indexes, query limits, pools and growth drivers; estimate resource scenarios. | `backend-resource-scenarios.md`; table declarations and selected indexes inspected; no EXPLAIN or measured capacity because Docker unavailable. |
| Complete as draft | 5. Propose modular-monolith ownership, interfaces, migration slices and rollback. | `modular-monolith-saas-proposal.md`; owner approval and policy details remain open. |
| Complete | 6. Reconcile QA artifacts, backlog, owner questions and Sprint 25 sheet. | Four Sprint 25 rows added and read back; `SP Calculation` row 19 now uses task-linked formulas. |

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Passed | Inventory paths and counts against source, migrations and contract. | 620 rows, zero missing source paths; 280 lexical routes vs 281 checked-in OpenAPI operations is explicitly qualified. |
| Partial / blocked | Bounded local reproduction of critical risks when services are available. | Two in-memory A/B probes passed at `6a8d11f7`; Docker Desktop daemon unavailable, so PostgreSQL test not rerun. |
| Passed | Documentation link and diff checks. | `verify-change.sh`, `git diff --check`, relative-link check, `pnpm api:docs:verify` passed. |
| Passed | Tracker row readback. | Sprint 25 task rows 5–8 and `SP Calculation` row 19 read back after Drive saved: 44 assigned/completed, 0 pending/blocked. |

## Risks, Compatibility And Recovery

- Tenant/security risks: current code may mix company ownership and process-local state; verify each path before making a claim.
- Data/migration risks: proposals require separate design/rollout and historical-data handling; no migrations here.
- API/deployment compatibility: no runtime or contract changes here.
- Observability: record detection signals and verification gaps for each critical finding.
- Rollback or recovery: documentation-only edits can be reverted; preserve existing user work and historical QA artifacts.

## Handoff

- Files/artifacts: inventory CSV/guide, rule traceability, session/media failure review, resource scenarios, modular-monolith draft, backlog v0.4, acceptance checkpoint, QA evidence, docs index and this plan.
- Commands and results: `./scripts/agent/verify-change.sh` passed; `pnpm api:docs:verify` passed; two existing synthetic in-memory probes exited 0; source inventory paths exist. Docker info could not connect to the local daemon.
- Remaining blockers or human actions: owner decisions DEC-Q01/Q02/Q03/Q04/Q05/Q09/Q10/Q11/Q13; disposable PostgreSQL/Valkey, isolated Cloudinary direct-URL/revocation test, browser/human UAT and hosted verification are future implementation gates. Route-level inventory deliberately leaves unreviewed items. Sprint tracker updated and read back; 44 assigned/completed story points for Sprint 25.
- Commit/PR/deployment references: base `6a8d11f7`; documentation review commit `06326dd6` on `sprint-25/saas-s25-001`. No PR or deployment in this stage. Sprint sheet: `https://docs.google.com/spreadsheets/d/1dr5qLKxq5IGIZAyIAdMlcDYDfld-LYxfvSHkKw1jBnA/edit?gid=1812876151#gid=1812876151`.
