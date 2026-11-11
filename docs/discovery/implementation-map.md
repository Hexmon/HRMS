# HRMS Implementation Map

Snapshot: 2026-11-09, `af89c6a` plus uncommitted work in `sprint-24/agt-s24-001`. Status: **source map with linked domain traces and narrow local probes**, not full runtime or browser verification. Each focused journey states what was read, inferred, tested and left open.

## Repository And Runtime Boundaries

| Component | Responsibility and current evidence | Dependencies / open inspection |
| --- | --- | --- |
| Backend package | Fastify app assembled by `hrms_backend/src/app.ts`; `src/server.ts` starts it. `app.ts` registers config, request context, security, CORS, multipart, auth, rate limit and 19 route modules. | `hrms_backend/package.json` declares Fastify 5, Zod 4, Drizzle, `pg`, `iovalkey`, Vitest. Per-module business paths remain to be traced. |
| Frontend package | TanStack Start/React routes in `hrms-client/src/routes/`; authenticated layout in `src/routes/_app.tsx`; domain adapters in `src/domains/`; shared fetch in `src/shared/api/client.ts`; auth query/state in `src/lib/auth.tsx`. | `hrms-client/package.json` declares TanStack Query/Router/Start, React 19, Playwright. Per-route query invalidation, accessibility and failure state inspection remain. |
| Durable data | `hrms_backend/src/db/schema.ts` declares `core`, `expenses`, `documents`, `assets`, `timesheets`, `attendance`, `leave_wfh`, `ems`, `projects`, `helpdesk`, `platform` schemas; ordered SQL migrations are under `src/db/migrations/`. | `src/platform/postgres-data-store.ts` and `src/platform/data-store.ts` require deeper transaction/ownership tracing. Uncommitted migration 0065 is present; do not report it as deployed. |
| Runtime state and external adapters | Backend package declares `iovalkey`; `src/app.ts` creates email delivery and configures multipart. | Inspect session/rate-limit failure behavior, Cloudinary adapter, Resend transport, TTL and outage paths before claiming guarantees. |
| Background work | `hrms_backend/src/workers/` contains legacy outbox/attendance/location runners and Cloudflare entry/jobs. `wrangler.jsonc` defines cron and Queues variants; `.github/workflows/deploy-cloudflare-worker.yml` gates activation. | Runtime cutover state is unknown from source. Trace event identity, retry/DLQ and recovery locally. |
| Local infrastructure | `hrms_backend/infra/docker/docker-compose.{dev,qa,prod}.yml`; backend package scripts expose test infrastructure. | Confirm all service connections use isolated local hosts before browser journeys. |
| CI and hosted configuration | `.github/workflows/branch-ci-cd.yml`, `deploy-cloudflare-worker.yml`, `render.yaml`, frontend `vercel.json`, backend `wrangler.jsonc`. | Config proves intended mapping and gates, not active deployment or actual secrets. No hosted action in this goal. |

## Module Entry Points

The backend modules below are registered in `hrms_backend/src/app.ts`. Prefixes are from each module's `index.ts`; actual route inventory and authorization decisions require `routes.ts` and policies. Frontend domains are direct subdirectories of `hrms-client/src/domains/`.

| Backend module(s) | Registration prefix / frontend domain | Responsibility, dependency and side-effect trace | Discovery status |
| --- | --- | --- | --- |
| `auth` | `/api/v1/auth`, `/api/v1/onboarding`; `auth` | Login, verification/reset and company bootstrap depend on core users, company preference, Valkey sessions, document/logo storage and email delivery; see [identity/company journey](identity-company-journey.md). | Source traced; auth preference unit 12/12 and onboarding integration 2/2 passed for their narrow cases. Cross-employer person proof and stale-session browser journey open. |
| `core`, `ems` | `/api/v1/core`, `/api/v1`; `core`, `ems` | Employee creation/activation and onboarding/exit checklists touch user status, roles, documents, asset handoff and audit; see [employee journey](employee-lifecycle-journey.md). | Source traced; core unit 14/14 passed. Required-proof activation rule DEC-007 is an implementation gap. |
| `attendance`, `locations` | `/api/v1/attendance`, `/api/v1/locations`; `attendance`, `admin-geo`, `locations` | Punch/offline evidence and payroll projection use direct SQL command paths, geofence policy and scheduled auto-close/cleanup; see [attendance journey](attendance-leave-timesheet-journey.md) and [runtime source](../architecture/current-runtime-source-2026-11-09.md). The separate `locations` module is an authenticated, bounded India-reference search (`routes.ts`, `india-locations.ts`), not geofence CRUD. Admin geo routes under attendance resolve active company/HR-or-Admin, and `admin-geo-repository.ts` uses company-qualified PostgreSQL reads/writes and row-locked version checks. | Attendance/worker source partly traced. Admin geo has existing tenant/isolation integration cases in `admin-geo.integration.test.ts` but they were not executed this loop; browser behavior remains blocked. No human punch journey executed. |
| `leave-wfh`, `timesheets` | `/api/v1`, `/api/v1/timesheets`; `leave-wfh`, `timesheets` | Requests, approvals, office calendars, work segments and payroll/report effects; see [leave/timesheet journey](attendance-leave-timesheet-journey.md). | Source traced; focused integration 6/6 passed. Cross-company, office-calendar and correction rules remain unverified. |
| `expenses`, `documents` | `/api/v1`; `expenses`, `documents` | Expense routing/settlement, document bytes/metadata/access and outbox/notification side effects; see [finance/document journey](finance-documents-reports-journey.md). | Source traced; cross-company ticket/document and partial-upload failure cases unexecuted. |
| `projects`, `assets`, `helpdesk` | `/api/v1`, `/api/v1/assets`, `/api/v1`; same-named frontend domains | Project/capacity, asset lifecycle/public QR/recovery and ticket/SLA/attachment paths; see [focused journey](projects-assets-helpdesk-journey.md). | Source traced; unit 1/1 and integration 6/6 baselines passed. In-memory A/B probe reproduced three boundary gaps; asset multi-instance PostgreSQL overwrite separately reproduced. Browser and broader write matrices open. |
| `notifications`, `dashboard`, `reports` | `/api/v1`, `/api/v1/dashboard`, `/api/v1/reports`; same-named frontend domains | Inbox read state, aggregate counts and exports depend on source module ownership and outbox; see [Admin/dashboard/notification journey](admin-platform-dashboard-notifications-journey.md) and [report journey](finance-documents-reports-journey.md). | Source traced; report/export A/B and notification delivery matrices unexecuted. |
| `admin`, `platform` | `/api/v1/admin`, `/api/v1/platform`; same-named frontend domains | Company policy/device paths coexist with global workflows, security, RBAC, email and finance governance; see [control-plane journey](admin-platform-dashboard-notifications-journey.md). | Source traced; in-memory settings mutation reproduced shared state. Independent Admin/PostgreSQL and effective-default tests open. |
| `health`, `webhooks` | unprefixed, `/api/v1/webhooks`; no frontend domain found | Readiness checks PostgreSQL/Valkey/object adapter; signed Resend webhook deduplicates delivery events; see [operations journey](operations-health-webhooks-journey.md). | Source traced; webhook unit 25/25 passed. Dependency outage and hosted paths unverified. |

## Tenancy: Implemented Versus Target

**Implemented source path:** `hrms_backend/src/platform/company-membership-context.ts` resolves one `user` by ID, one `userSessionPreference` by user ID, and its `companyProfile`. It rejects missing/deleted users, missing preference, inactive company, unassigned active role, and a requested company ID that differs from the preference. Active employment rejection is conditional on `requireActiveEmployment`. The file explicitly describes this as one assigned company, intended for future replacement. This is a static code observation; domain queries and runtime denial still need review.

**Latest approved target direction:** One customer tenant has one company with multiple offices; a person belongs to one company at a time, may have several authorized roles there, and uses a new work email after changing employer. Earlier simultaneous multi-company membership direction was superseded on 2026-11-09. Old and new HR approve transfers; cross-employer person verification and unavailable-old-HR exceptions remain open in `owner-decisions.md`. No target schema or workflow is implemented merely because this direction is approved.

## Test And Evidence Inventory

- Backend `vitest.config.ts` defines unit, contract, integration and E2E projects; `package.json` includes migration, OpenAPI, consumer and worker checks.
- Frontend `hrms-client/e2e/` includes attendance, device, background-worker and production-smoke specs; package scripts also provide route, implemented-route and production-config guards.
- `docs/agent/verification-matrix.md` is a test selection guide. Old QA artifacts are historical. Dated narrow execution evidence is under `qa-artifacts/hrms/discovery-2026-11-09/`: an in-memory A/B route probe, sequential Admin settings mutation, and a two-instance PostgreSQL asset write probe. None is a human/browser journey or a full tenant-security test.

## Documentation Conflicts / Questions To Investigate

1. `docs/README.md` says last verified 2026-06-30, while the current source includes later migrations and worker design. Refresh dates only after each document is reconciled; do not treat the older snapshot as current proof.
2. Root `README.md` states 245 generated operations, while the source architecture snapshot counted 281 operations and 240 paths in the checked-in OpenAPI file at HEAD. Reconcile the root count before repeating it as current.
3. Root `AGENTS.md` and deployment docs describe a staged Cloudflare cutover. The local config cannot prove whether hosted Workers were activated.
4. The name `company-membership-context` does not imply a membership table or multi-company user identity; the current implementation uses a session preference.

## Next Source Traces

1. Signup → email verification → company bootstrap → login → active role/company session, including reset/deactivation and second-company denial.
2. Finish isolated two-company and approval-state verification of attendance, leave and timesheets when execution is authorized through the available local test surface.
3. Verify source-traced tenant and operational failure cases in isolated two-company/multi-instance tests; distinguish browser-blocked user journeys from API evidence.
