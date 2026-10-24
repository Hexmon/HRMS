# Architecture failure model

## Scope and evidence posture

This model describes guarantees visible in source, assumptions inferred from structure, conditions that could violate those assumptions, and safeguards found during the strengthened inspection. It does not prescribe an architectural rewrite and does not claim production exploitability. Deployment behavior remains unverified because no fetch, service start, endpoint probe, test execution, or environment inspection was authorized.

## System topology

```text
Browser / TanStack Start + Vercel SSR
        |
        | HTTPS, cookie/bearer, JSON/download
        v
Fastify API (schema-per-domain modular monolith)
        |                         \
        |                          \ Cloudinary-compatible object storage
        v
PostgreSQL (Drizzle schemas; runtime pg SQL)
        |
        +---- transactional outbox ----> Valkey/Upstash stream
        |
        +---- separately deployed combined worker
              |- outbox publisher
              |- exact-coordinate purge
              `- attendance auto-punchout

Valkey/Upstash also stores sessions and rate-limit state.
```

Evidence: `hrms_backend/package.json`, `hrms-client/package.json`, `hrms_backend/src/app.ts:82-133`, `hrms_backend/src/platform/postgres-data-store.ts:407-442`, `hrms_backend/src/workers/run-outbox-worker.ts:106-171`, `render.yaml`, `hrms-client/vercel.json`.

## Design investigation

### 1. Hydrated in-memory domain repositories and PostgreSQL flush

**A — Current guarantees**

- `createPostgresDataStore` builds a process-local `MemoryDataStore`, reloads persisted data, and attaches PostgreSQL-backed persistence (`hrms_backend/src/platform/postgres-data-store.ts:407-442`).
- Fastify handlers mutate that process-local store. `onSend` selects domains and invokes persistence after a successful handler response path (`hrms_backend/src/app.ts:82-133`).
- Each `flushDomain` operation wraps its SQL statements in a PostgreSQL transaction and rolls back on SQL error (`hrms_backend/src/platform/postgres-data-store.ts:627-703`).
- Several records carry versions and selected services use optimistic checks. This is domain-specific, not a repository-wide serializability guarantee.

**B — Apparent assumptions**

- A single API writer, or externally serialized writes, appears necessary for the in-memory snapshot to remain authoritative between reloads.
- SQL transaction atomicity is assumed to make each selected flush internally consistent.
- A handler response can be constructed from memory before persistence completes; consumers appear to assume onSend failure handling is operationally visible/recoverable.

**C — Violating conditions**

- Two API instances load the same snapshot and later flush divergent changes.
- A long-lived instance does not observe another writer's update, role change, company config, or deletion.
- Process termination or database error occurs after the handler mutates memory or produces a response but before/during flush.
- Broad table rewrite/upsert in one domain overwrites a newer change created elsewhere.

**D — Safeguards found or strengthened**

- Domain flushes are SQL-transactional.
- Options narrow some flushes by user/company/document/aggregate IDs.
- Attendance is deliberately excluded from generic flushing for transaction-owned routes (`hrms_backend/src/app.ts:253-266`).
- Repository startup refuses implicit memory mode when required production dependencies are absent (`hrms_backend/src/app.ts:505-553`).

**E — Architect questions**

1. Is a single API writer a supported, monitored production invariant? If so, how are rolling deploy overlap and failover serialized?
2. If multiple writers are supported, where are cache invalidation, locking, or merge semantics defined?
3. What does the client receive and what alert/recovery occurs when `onSend` persistence fails?
4. Which domain's record version is an actual concurrency contract versus a UI stale-form aid?

Trade-off: hydration reduces repository complexity and can serve deterministic local tests/read-heavy paths, but the supported writer topology must be explicit. R-04 remains topology-dependent.

### 2. Direct transactional Attendance architecture

**A — Current guarantees**

- Online punches require a matching `Idempotency-Key` and body `client_event_id` (`hrms_backend/src/modules/attendance/routes.ts:343-398`).
- Commands use PostgreSQL transactions, advisory/entity locks, membership/device/policy checks, and atomic projections/outbox writes (`hrms_backend/src/modules/attendance/command-service.ts:760-930`).
- Offline synchronization validates company, device signature/sequence, duplicate event identity, and payroll eligibility (`hrms_backend/src/modules/attendance/offline-sync-service.ts:59-257`).
- Payroll locking uses advisory locks and immutable snapshot rows; post-lock changes are represented as adjustments (`hrms_backend/src/modules/attendance/payroll-period-service.ts:96-322,412-485`).

**B — Apparent assumptions**

- Server receipt and tenant timezone are authoritative for work date except captured client evidence.
- A stable idempotency identity is retained across client retries.
- Workers and reporting projections interpret session work date consistently.

**C — Violating conditions**

- Cross-midnight/night-shift checkout is projected under a request-derived date different from the open session.
- Offline replay occurs after a day, policy, role, device, holiday, or payroll-lock boundary.
- Timezone/DST rule changes or device clock skew alter interpretation.
- Approved regularization needs a next-calendar-day checkout but validation requires every timestamp to match one local date.

**D — Safeguards found or strengthened**

- Attendance is the strongest transactional domain inspected and has extensive unit/integration source.
- Duplicate same-key/changed-body behavior, device lifecycle, row locks, RLS for registered devices, exact-coordinate permissions, purge, and auto-punchout idempotency are explicitly modeled.
- Attendance ADRs dated 2026-07-13 explain why PostgreSQL-first replaced a hydrated command path and define at-least-once events.

**E — Architect/HR questions**

1. Is the canonical day the check-in day, shift-start day, or a split day for every projection and correction?
2. How is a post-lock adjustment approved and applied; is there an intentionally external resolution surface?
3. Which timestamp is authoritative for lateness and payroll when captured and received timestamps differ?

Trade-off: the direct model pays more implementation complexity for concurrency, idempotency, and multi-process safety. R-10 concerns boundary consistency, not the absence of transaction controls.

### 3. Cross-schema reference-integrity strategy

**A — Current guarantees**

- PostgreSQL is divided by business schema. Drizzle definitions/migrations define local constraints; project documentation states that cross-schema foreign keys are intentionally avoided.
- Migration `hrms_backend/src/db/migrations/0063_cross_schema_reference_integrity.sql` adds selected validation/restrict triggers.
- Tenant transaction context uses `SET LOCAL app.current_company_id` (`hrms_backend/src/platform/tenant-db-context.ts:1-34`), and registered-device RLS uses that context in `0058` migrations/tests.

**B — Apparent assumptions**

- Services, validation triggers, seed order, and reconciliation own logical integrity across domain boundaries.
- Independent migration/evolution and future extraction are valued over database-level cross-schema coupling.

**C — Violating conditions**

- A write path bypasses service validation, a parent is hard-deleted, migrations/backfills run out of order, or bulk restoration inserts logical orphans.
- A logical reference is added without extending trigger/service validation.
- A pooled connection executes a tenant query outside the transaction-local setting.

**D — Safeguards found or strengthened**

- Selected trigger checks in migration 0063 reduce orphan/restrict risk.
- Registered-device RLS is forced and fails closed without company context; integration test source covers it.
- Many services validate referenced in-memory records before mutation.

**E — Architect questions**

1. What is the authoritative inventory of cross-domain references and their owner (service, trigger, reconciliation, or intentionally weak reference)?
2. Which restore/migration procedure verifies logical integrity?
3. Is RLS intended to expand beyond registered devices, or is service-level isolation the approved standard?

Trade-off: avoiding cross-schema FKs can lower migration coupling and aid extraction, but requires explicit ownership and continuous orphan assurance.

### 4. Company and tenant isolation mechanisms

**A — Current guarantees**

- `resolveCompanyMembershipContext` verifies user, selected company preference, active company, assigned role, and—when required—active employment (`hrms_backend/src/platform/company-membership-context.ts:30-107`).
- Core records and modern Attendance commonly carry company IDs; Attendance commands validate membership and set tenant DB context.
- Device tables use forced RLS by `app.current_company_id`.

**B — Apparent assumptions**

- Every route/service that touches tenant data calls the membership context or filters by company.
- Admin/Auditor scope is either intentionally global or safely narrowed elsewhere.
- Legacy singleton/global collections only contain one company's data, or callers filter them.

**C — Violating conditions**

- A legacy module omits company keys/filters; direct object ID crosses companies; a report aggregates globally; active-company preference becomes stale.
- Admin/Auditor broad policy is interpreted as cross-company authority without an explicit super-tenant grant.

**D — Safeguards found or strengthened**

- Membership checks are substantial where adopted.
- Modern attendance/device implementation provides a stronger model with DB context/RLS.
- Production seed/mock flags reduce unrelated demo-data risk, though they do not replace isolation.

**E — Architect/Product questions**

1. Does any role have cross-company scope? If yes, how is it separately granted and audited?
2. Is every legacy record expected to gain `company_id`, or is there another authoritative ownership relation?
3. Should active employment be mandatory for all protected routes or only employee-self-service routes?

R-01/R-02 remain high-priority hypotheses because isolation is uneven, not absent everywhere.

### 5. Valkey/Upstash sessions and outbox

**A — Current guarantees**

- Hosted runtime requires Valkey and session operations fail rather than silently using memory (`hrms_backend/src/app.ts:505-553`).
- Valkey client uses lazy connection, command timeout, bounded retries, and reconnect backoff (`hrms_backend/src/platform/valkey-client.ts:5-50`).
- Sessions are stored with TTL; individual revocation and user-wide scan/revocation exist (`hrms_backend/src/auth/index.ts:84-136`).
- Outbox claims PostgreSQL rows, publishes stable event data to a Valkey stream, then marks processed; failures schedule retry/dead-letter (`hrms_backend/src/workers/outbox-worker.ts:106-160`).

**B — Apparent assumptions**

- Valkey is sufficiently durable/available for sessions and event transport.
- At-least-once consumers deduplicate by consumer and event ID, as the ADR requires.
- Key scanning for user-wide revocation remains operationally acceptable.

**C — Violating conditions**

- Valkey eviction/restart/network partition; many session keys make `KEYS` expensive; worker crash after stream append and before SQL commit; consumer omits dedupe; stream trims before consumption.

**D — Safeguards found or strengthened**

- Fail-closed session/rate-limit behavior, stable IDs, SQL locks/retry/dead-letter, and explicit at-least-once documentation.
- Worker error paths do not silently mark failed publications processed.

**E — Architect/SRE questions**

1. What Upstash persistence/eviction/stream-retention and reconnect guarantees are purchased/configured?
2. Where do consumers and their dedupe ledger live?
3. Who receives dead-letter alerts and how is a row replayed safely?
4. What is the maximum active-session cardinality for `revokeUser`?

### 6. Combined background worker

**A — Current guarantees**

- Render declares a separate worker process (`render.yaml:98-130`).
- Its loop runs outbox, coordinate retention and auto-punchout responsibilities with per-task catch/log behavior (`hrms_backend/src/workers/run-outbox-worker.ts:106-171`).
- Auto-punchout uses locks, paging and idempotency and has extensive test source.

**B — Apparent assumptions**

- Each task completes quickly enough not to starve the others.
- One/few worker processes can catch up within operational SLOs after downtime.
- Process supervisor/monitoring restarts and alerts.

**C — Violating conditions**

- Hung network call, very large outbox/backlog, DB lock contention, memory/CPU pressure, clock jump, or process crash.

**D — Safeguards found or strengthened**

- Failure in a normal task iteration is caught so later iterations can continue; lock/idempotency controls permit safe repeated attendance work.

**E — SRE questions**

1. What are per-task timeout, backlog, freshness and alert thresholds?
2. Is horizontal worker concurrency supported, and which locks prevent duplicate side effects?
3. What is the recovery/catch-up runbook after prolonged outage?

### 7. Expense/approval state machines

**A — Current guarantees**

- Self-processing is denied; assigned manager and finance actions are distinct (`hrms_backend/src/modules/expenses/policy.ts:5-42`).
- Submit, manager resolution, finance resolution, payment release, bill, and settlement are explicit transitions (`hrms_backend/src/modules/expenses/service.ts:341-581,1214-1437`).
- Finance governance validates primary/backup role eligibility (`hrms_backend/src/modules/platform/service.ts:170-282`).

**B — Apparent assumptions**

- Configuration always supplies eligible distinct actors.
- State/version checks serialize transitions.
- Roles permitted in different stages meet Finance's separation-of-duties intent.

**C — Violating conditions**

- Requester is only eligible approver; one human has multiple roles; configured actor becomes inactive; concurrent approve/reject/payment; foreign document attached; approved and paid values diverge.

**D — Safeguards found or strengthened**

- Requester exclusion, backup configuration, state preconditions, money normalization and audit/outbox events are present. Existing tests exercise common paths and some backup failures.

**E — Finance/Architect questions**

1. What minimum distinct-human invariant applies at each stage?
2. Should invalid staffing block configuration, submission, or route to an exception queue?
3. Who can change amount/currency or attach supporting documents after submission?

### 8. Document storage and deletion ordering

**A — Current guarantees**

- Upload validates, computes metadata/checksum and uploads before recording document/outbox (`hrms_backend/src/modules/documents/service.ts:86-197`).
- Delete removes the storage object before deleting metadata/related rows (`hrms_backend/src/modules/documents/service.ts:294-320,376-407`).
- UI asks for deletion confirmation (`hrms-client/src/routes/_app/ems.documents.tsx:149-175,362-392`).

**B — Apparent assumptions**

- Provider calls are reliable/idempotent enough; partial results are rare or manually recoverable.
- Hard deletion is legally permitted for the selected record.

**C — Violating conditions**

- Process/DB fails after upload; DB delete fails after storage delete; retry uses a new object key; legal hold applies; generated export object expires independently.

**D — Safeguards found or strengthened**

- Real storage is enforced outside local-like environments; checksums/object keys and outbox/audit data aid reconciliation; SQL portions are transactional.

**E — Architect/Security questions**

1. Is there an orphan/missing-object reconciliation job and ownership/runbook?
2. Which document types prohibit hard delete or require legal hold?
3. Are provider delete/upload operations idempotent under the chosen public ID/key scheme?

### 9. Vercel SSR authentication

**A — Current guarantees**

- TanStack Start SSR build output is configured; Vercel rewrites/routes are committed.
- Protected shell obtains session and redirects client-side (`hrms-client/src/routes/_app.tsx:23-45`).
- Browser API calls include credentials; build smoke checks `/login` (`hrms-client/src/shared/api/client.ts`, `hrms-client/src/shared/api/session.ts`, `hrms-client/scripts/build-vercel.mjs:1-39`).

**B — Apparent assumptions**

- Protected pages may render a safe shell until client session resolution.
- Cookie domain, SameSite, API origin and server/client routing match Vercel deployment.

**C — Violating conditions**

- Direct server request cannot forward/read API session; rewritten deep link 404s; client and server render disagree; expired cookie loops; API and web use incompatible origins.

**D — Safeguards found or strengthened**

- Local Playwright/E2E source covers many navigation paths; unauthenticated redirect exists; bearer/cookie backend behavior has contract coverage.

**E — Architect/SRE questions**

1. Is SSR expected to authenticate server-side, or is client-only auth an explicit design?
2. What are the exact production web/API origins and cookie attributes?
3. Which authenticated deep links are mandatory release smoke routes?

## Failure-mode inventory

| Boundary | Failure | Source-visible response/safeguard | Residual uncertainty | Risk |
|---|---|---|---|---|
| Browser → API | stale/expired cookie or bearer | auth plugin validates session; fail closed | cross-origin SSR/cookie deployment | R-12 |
| API → hydrated store → SQL | stale process snapshot or flush failure | domain transaction, versions in places | writer topology/recovery | R-04 |
| API → tenant data | missing company filter/object ownership | membership helper in adopted routes; device RLS | legacy/global collections | R-01/R-02/R-05 |
| API → Cloudinary | object succeeds, DB fails | checksum/key/audit context | cleanup/reconciliation | R-06/R-14 |
| Delete → Cloudinary → SQL | object removed, DB fails | ordered calls; SQL transaction for metadata | irreversibility/retry | R-06 |
| SQL outbox → Valkey | crash after publish | stable event ID, at-least-once contract | consumer dedupe/DLQ replay | R-11 |
| API/session → Valkey | timeout/eviction/outage | bounded retry, fail closed | SLO and UX | R-03/R-07 |
| Shared worker | slow task/process death | catches/logs, locks/idempotency | starvation/supervision | R-13 |
| Timezone/day → payroll | cross-midnight/DST/locked correction | server time, versioned policy, snapshot | canonical rule/application | R-10 |
| CI → deploy | branch/config/artifact mismatch | unsupported branch fails closed | release-01 promotion path | R-15 |

## Architecture decisions still required at G1

1. Supported API/worker instance counts and writer/concurrency contract.
2. Authoritative cross-domain reference and tenant-isolation enforcement strategy.
3. Company scope for privileged roles and reports.
4. Valkey durability, consumer dedupe, dead-letter replay and worker SLO/runbook.
5. Storage/metadata reconciliation and legal-hold behavior.
6. Authenticated SSR model, origin/cookie contract and deep-link release smoke.
7. Canonical work date and payroll-adjustment application contract.

No decision above is evidence that the current architecture is unsuitable; each identifies an operating envelope that must be made explicit before test oracles and release assurance can be finalized.
