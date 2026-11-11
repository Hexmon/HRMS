# Backend SaaS Review Inventory Guide

Checkpoint: 2026-11-09, `sprint-25/saas-s25-001` at `6a8d11f7`. The row-level artifact is [`backend-saas-review-inventory.csv`](backend-saas-review-inventory.csv). It is a **review coverage map**, not a security clearance or proof of production topology.

| Kind | Count | Scope and extraction |
| --- | ---: | --- |
| Source file | 202 | `hrms_backend/src/**/*.ts`, excluding `__tests__`, `.test.ts`, `.spec.ts` and SQL migrations; `src/testing/index.ts` is listed as excluded test support. Backend `scripts/` maintenance commands are outside this API/runtime inventory. |
| Direct route registration | 280 | Literal `fastify.get/post/put/patch/delete/head/options` calls in those source files, with source-relative path and line. Registration prefixes in each `modules/*/index.ts` must be applied before treating a path as a public URL. Checked-in OpenAPI has 240 paths and 281 operations, so this lexical count is **not** a contract-parity assertion; generator verification and route-level tracing remain. |
| Worker entry file | 7 | All source files in `src/workers/`, including legacy runner files; deployment/cutover status is unknown. |
| Functional job | 4 | Cloudflare outbox drain, attendance sweep, location purge and published event handler. Cron/Queue binding source is `wrangler.jsonc`; tracked `WORKER_ACTIVE=false` does not prove hosted state. |
| Table | 111 | Union of 106 Drizzle declarations in `src/db/schema.ts` and five additional `CREATE TABLE` names in ordered SQL migrations. The five migration-only names are `assets.asset_state_events`, `assets.software_products`, `attendance.mobile_evidence_warnings`, `platform.auth_tokens`, `platform.finance_governance_config`; their absence from Drizzle is a review question, not automatically drift. |
| Data boundary | 16 | Explicit API, session, tenant, DB, Valkey, object, email, worker, export, QR and audit seams. |

`partially reviewed` means a selected path was read or addressed in a dated journey/source trace; it does **not** clear all operations, ownership checks or failure modes. `unreviewed` means indexed only. `excluded` means a named item lies outside runtime scope. `reviewed` is reserved for a complete bounded trace with source and verification; no item receives that label yet. Individual routes remain `unreviewed` until their successful and denied paths, related IDs, persistence and side effects are traced. Tables are `partially reviewed` where their Drizzle declaration was indexed; constraints, migration parity and tenant ownership are still open. The five SQL-only tables are `unreviewed`.

All 19 registered module groups are represented by file and route rows. Their current **module-level** status is `partially reviewed` because the prior journey documents cover representative paths, but that is not a per-route completion claim. The highest-risk open boundaries are resource ownership after transfer, whole-domain snapshot writes, document/expense attachment scope and direct proof URLs, report/export scope, global Admin settings, authentication revocation across replicas and Worker retry/replay. See `session-media-failure-boundaries.md` for the latest source pass. See `saas-rule-traceability.md`, `implementation-backlog.md` and `modular-monolith-saas-proposal.md`.

This inventory is a snapshot. Regenerate/reconcile it after code changes; do not silently promote statuses based on file presence or passing a narrow test. A complete route-level implementation review is a separate staged work item; the CSV makes its remaining scope explicit.
