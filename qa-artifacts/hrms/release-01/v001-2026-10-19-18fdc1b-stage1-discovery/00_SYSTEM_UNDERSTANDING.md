# Hawkaii HRMS — Stage 1 System Understanding

Artifact version: `v001`  
Commit: `18fdc1bfd9144e98628d96411942918470a593f1`  
Analysis date: `2026-10-19`  
Status: `STAGE_1_DISCOVERY — G1 HOLD`

This document records static implementation evidence. It does not claim that a deployed environment behaves identically and does not contain product-test results.

## Product and user context

Hawkaii HRMS is a B2B workforce-management application covering authentication/onboarding, employee lifecycle, EMS, attendance and geolocation evidence, leave/WFH, expenses, documents, assets, projects, timesheets, helpdesk, notifications, administration, dashboards, and cross-module reporting/export.

Observed system roles are `Employee`, `Reviewer`, `Director`, `Finance Manager`, `Admin`, `Auditor`, `Asset Manager`, and `HR Manager` in `hrms_backend/src/shared/constants.ts::Roles` lines 1–10. The frontend maps backend `Reviewer` to its local Manager persona in `hrms-client/src/lib/auth.tsx::API_ROLE_BY_NORMALIZED` lines 165–190. Helpdesk Agent/Manager appear as designations rather than backend system roles.

Primary contexts that affect QA design are company assignment, employee hierarchy, active/inactive lifecycle, role combination, desktop versus responsive mobile web, online versus offline attendance, registered-device state, timezone/shift, payroll-period state, network dependency state, and concurrent actors.

## Actual implementation topology

### Frontend and SSR

- React `^19.2.0` with TanStack Start `1.168.60`.
- Vite registers TanStack Start with `server: { entry: "server" }` and Nitro for production builds (`hrms-client/vite.config.ts` lines 40–54).
- `hrms-client/vercel.json` runs `pnpm build:vercel`.
- `hrms-client/scripts/build-vercel.mjs` sets the Nitro Vercel preset, builds, imports `.vercel/output/functions/__server.func/index.mjs`, and performs one SSR smoke request to `/login` (lines 5–39).
- Protected route decisions in `hrms-client/src/routes/_app.tsx::AppLayout` run in a client `useEffect` after `useAuth()` initialization (lines 12–45).
- `hrms-client/src/shared/api/client.ts::apiRequest` sends `credentials: include` and an Authorization header only when a browser/session-storage token is available. `src/shared/api/session.ts` returns no token when `window` is unavailable.

Guarantee visible in source: an anonymous `/login` SSR build smoke is enforced during the configured Vercel build.  
Assumption requiring verification: authenticated deep-link SSR/hydration works when the frontend and API use separate origins and browser session/cookie state.  
Operational violations to examine later: cold start, missing build env, cookie-domain mismatch, absent server-side cookie forwarding, API outage, and refresh on a protected nested route.

### Backend modular monolith

- One Fastify application is assembled in `hrms_backend/src/app.ts`, with domain modules registered under `/api/v1`.
- Fastify version is `^5.6.2`; PostgreSQL driver `pg` is `^8.16.3`; `drizzle-orm` is `^0.44.7`.
- Drizzle defines the schema in `hrms_backend/src/db/schema.ts`; runtime persistence is principally raw SQL in `src/platform/postgres-data-store.ts` and direct Attendance repositories.
- The architecture is a modular monolith with a shared PostgreSQL database and one separately deployed worker process, not independently deployed domain services.

The design avoids cross-domain network calls and permits in-process domain composition. It also means authorization and tenant rules can differ between modules unless enforced through shared context consistently.

### Hydrated repositories and persistence flushes

`createPostgresDataStore()` creates a PostgreSQL pool, verifies Cloudinary, creates a Valkey client, then creates a `MemoryDataStore` and reloads domain tables into it (`hrms_backend/src/platform/postgres-data-store.ts` lines 407–442). Most domain services synchronously mutate those arrays. After a successful mutation, Fastify's `onSend` hook selects auth, bootstrap, logo, domain, or full persistence flushing (`hrms_backend/src/app.ts` lines 104–132). `flushDomain()` wraps the selected domain and outbox writes in a PostgreSQL transaction (lines 627–703 of `postgres-data-store.ts`).

Current guarantees visible in source:

- Failed/redirected requests outside the 2xx–3xx range are not flushed.
- Targeted domain transactions reduce the size of most writes.
- Domain data and its selected outbox records commit together during a successful flush.
- Memory mode requires `HRMS_ALLOW_MEMORY_STORE=true`; PostgreSQL and Valkey are required for normal runtime construction.

Apparent assumptions:

- A process-local hydrated snapshot remains sufficiently current while a request is handled.
- Mutations that use optimistic version fields see current versions.
- API process count or request routing does not allow divergent snapshots to overwrite each other.
- Every new mutation route remains covered by `persistenceFlushTarget()`.

Conditions that could violate those assumptions include multiple API processes, long-lived processes, concurrent writes to the same aggregate, worker/direct-SQL writes not reloaded before another request, route additions missing the flush map, and crash/serialization failure during `onSend`. The general rationale for retaining hydrated repositories is not recorded as an approved architecture decision and must be confirmed by Engineering; the docs describe the mechanism and test/local compatibility but not its supported multi-instance consistency contract.

### PostgreSQL-first Attendance bounded context

Attendance is deliberately different. The dated 2026-07-13 ADR pack records a move from memory-first mutation to an isolated PostgreSQL-first bounded context because of cross-process concurrency, duplicate protection, tenant safety, immutable evidence, offline replay, and payroll locking (`docs/architecture/adr/attendance/02-postgreSQL-first-attendance-command-path`, Context and Decision).

Selected command routes are explicitly excluded from generic flush because they own a transaction including outbox (`hrms_backend/src/app.ts::transactionOwnedMutationRoutes`, lines 253–266). The current command path resolves membership/company, obtains idempotency state and runtime locks, resolves policy/geo/device facts, persists evidence/decision/session/projection/outbox, and commits as one database transaction.

Source-visible safeguards include:

- Stable idempotency/client-event identities and changed-body conflict detection.
- Row locks and a database uniqueness rule for one open session.
- Registered-device eligibility and transaction-local company context.
- Row-level security on `platform.registered_devices`, failing closed without `app.current_company_id` (`0058_registered_devices_rls.sql` lines 1–20).
- Versioned policies/shifts, immutable evidence/decision records, regularization actions, and projection rebuild support.
- Company advisory locks and snapshots for payroll periods.
- Exact-coordinate access control/audit and coordinate retention purge.
- Offline accepted evidence explicitly remains `payroll_eligible: false`.

Remaining assumptions include clock/timezone authority, cross-midnight projection semantics, downstream use of pending payroll adjustments, supported client/offline versions, and safe worker recovery.

### Schema-per-domain PostgreSQL

There are 63 ordered source migrations ending in `0063_cross_schema_reference_integrity.sql`. Domain schemas include `core`, `platform`, `attendance`, `leave_wfh`, `expenses`, `documents`, `assets`, `timesheets`, `projects`, `helpdesk`, and `ems`.

Cross-schema SQL foreign keys are prohibited by project convention. Dated architecture documentation states that the purpose is independent schema evolution, reduced migration coupling, easier seed/test data, and future extraction (`docs/knowledge-transfer/database-and-data.md`, lines 99–107). Migration 0063 replaces selected cross-schema FKs with child-validation and parent-restrict triggers, including employee-company validation for attendance.

Guarantees are limited to the references explicitly covered by constraints, triggers, and service checks. The architecture assumes every uncoupled cross-domain reference is validated on write and restricted or reconciled on parent mutation. A complete reference inventory and owner-approved reconciliation contract were not found.

### Company membership and tenant isolation

`resolveActiveCompanyMembershipContext()` in `hrms_backend/src/platform/company-membership-context.ts` resolves one assigned company from `userSessionPreferences`, validates the company is active, validates the selected role is assigned, optionally requires active employment, and rejects a requested company mismatch (lines 30–107).

Core and modern Attendance call this context. Registered devices also receive database RLS. Other older modules frequently authorize against role, creator, hierarchy, or object IDs stored in a global hydrated repository without a company column. Therefore the repository shows multiple isolation mechanisms rather than one universal tenant boundary.

The intent appears to be company-isolated SaaS, but whether Admin/Auditor may be platform-global and whether every older record must be migrated to a company owner is a Product/Security/Architecture decision.

### Sessions, Valkey and Upstash

Authenticated requests validate the JWT, require a non-revoked session in Valkey, then load the actor from the current in-process user store (`hrms_backend/src/plugins/auth.ts` lines 60–83). `ValkeySessionStore` stores one key per JWT ID with a TTL; per-user revocation scans keys using `KEYS` and updates matching sessions (`hrms_backend/src/auth/index.ts` lines 84–136).

`createValkeyClient()` accepts only `redis://`/`rediss://`, uses lazy connection, a 5-second connection timeout, two retries per request, and bounded reconnect backoff (`src/platform/valkey-client.ts` lines 5–50). Render documents the Upstash TCP connection string.

Current guarantees:

- Missing/revoked session fails authentication closed.
- Session records expire with JWT lifetime.
- Logout/reset/disable-login can revoke session records.
- Connection errors are redacted and throttled in logs.

Assumptions/open conditions:

- Valkey availability is part of authenticated API availability.
- The number of session keys remains safe for `KEYS` plus sequential reads/writes.
- Deactivation and role changes always invoke the correct revocation path; current source does not do so universally.

### Outbox and combined worker

The PostgreSQL outbox worker selects pending/retry rows `FOR UPDATE SKIP LOCKED`, publishes to `hrms.<aggregate_type>`, then marks the row published in the surrounding transaction. Failures retry after 15 seconds and become `dead_letter` after five attempts (`hrms_backend/src/workers/outbox-worker.ts` lines 106–160).

The Attendance event ADR explicitly defines delivery as at least once and requires consumers to deduplicate by `consumer_name + event_id` in `platform.processed_events`. This design reduces ambiguity about duplicates but does not prove every external consumer follows it. No operator replay endpoint/runbook procedure for dead letters was located.

The single Render worker process runs three responsibilities sequentially:

1. Outbox publish cycle, normally every 2 seconds.
2. Attendance coordinate purge, normally hourly.
3. Attendance auto-punchout schedule check, every 5 minutes.

Each responsibility has a catch block, so one failure does not terminate the loop. Auto-punchout has advisory-lock, idempotency, catch-up, and per-company isolation safeguards in its source/tests. Nonetheless, a slow awaited responsibility delays later work in the same loop, and the shared worker is a common operational failure domain.

### Object storage and transactional email

Cloudinary is backend-owned. Upload/download policy, MIME/size checks, optional compression, metadata, and access logs are implemented. Production configuration rejects mock uploads. Storage calls occur outside SQL transactions:

- Document upload writes the object before inserting in-memory metadata and flushing SQL.
- Document hard-delete removes the object before the SQL delete transaction.
- Generated export writes the object before adding document metadata/outbox.

The architecture assumes retry/reconciliation or low partial-failure exposure, but no comprehensive orphan/missing-object reconciler was located.

Resend is transport only; application tokens decide verification/reset authority. Auth source has enumeration resistance, hashed one-time tokens, cooldowns, delivery telemetry, webhook signature/timestamp validation, and session revocation on password reset. The checked-in production Render blueprint nevertheless sets `EMAIL_DELIVERY_MODE=disabled`; actual deployed overrides are unknown.

## Counts and documentation freshness

- Generated OpenAPI at this SHA: 240 paths and 281 operations.
- All four backend/frontend OpenAPI JSON mirrors have the same SHA-256.
- README and June architecture docs state 245 operations / 214 paths.
- Source migrations: 63; June data architecture describes 25.
- Backend test source files: 98; frontend Playwright specs: 20. No tests were run in this discovery.
- Most architecture/runbook pages say last verified 2026-06-30; Attendance ADRs are dated 2026-07-13; API/mobile KT pages are dated 2026-10-05.

## Trust and data boundaries

1. Browser/mobile web → Vercel SSR/browser code.
2. Vercel/browser → Render Fastify API across cookie/bearer/CORS boundary.
3. Authenticated request → JWT verification → Valkey session → in-process user/company context.
4. Domain services → hydrated store or direct PostgreSQL transaction.
5. Cross-schema identifiers → service checks/selected triggers rather than general FKs.
6. API/worker → Cloudinary, Resend, Valkey/Upstash, PostgreSQL/Neon.
7. Outbox stream → downstream consumers not identified in this repository.
8. Reports/exports → document store and downloadable user-visible artifacts.

## Source classes and limitations

Current code/config is evidence of implementation, not approved business intent. Test source is evidence that a scenario was contemplated, not that it passed. Historical QA entries are not current execution evidence. Deployment blueprints are intended configuration, not proof of live settings. External service dashboards, branch protections, live secrets, runtime scale, production data, consumers, and incidents were not inspected.

## Engineering decisions still required

- Supported API process count and consistency guarantee for hydrated repositories.
- Intended universal tenant boundary and platform-global role exceptions.
- Supported cross-domain reference integrity/reconciliation model.
- Valkey outage availability behavior and scalable session-revocation mechanism.
- At-least-once consumer inventory, deduplication, DLQ replay, and acceptable lag.
- Whether the three worker responsibilities require independent scaling/health objectives.
- Object/SQL compensation and reconciliation expectations.
- Vercel SSR authenticated-cookie/token design and deep-link acceptance criteria.
- Production email/dependency configuration and promotion evidence.

These questions are carried into `02_BUSINESS_QUESTIONS.md`; no architectural replacement is recommended at this stage.
