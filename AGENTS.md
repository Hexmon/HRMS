# AGENTS.md - Hawkaii HRMS Engineering Contract

Hawkaii HRMS is a multi-role workforce application being prepared as a SaaS product. This repository contains the Fastify/PostgreSQL backend in `hrms_backend/`, the TanStack Start/React frontend in `hrms-client/`, shared product documentation, QA evidence, and deployment automation.

## Project At A Glance

- This is one product repository with **two independently installed packages**, not a root pnpm workspace. Run package commands from `hrms_backend/` or `hrms-client/`; each has its own `package.json` and lockfile.
- The backend is a Fastify API with domain modules and a PostgreSQL-backed runtime. The frontend is a TanStack Start app whose routes use domain API adapters and TanStack Query. The backend owns validation, authorization, workflow transitions, and persistence; the frontend owns presentation and interaction.
- Product areas include signup/onboarding, employees, attendance and geolocation, leave/WFH, EMS, expenses/finance, documents, projects, timesheets, assets, helpdesk, notifications, reports, and admin governance. Start with `docs/knowledge-transfer/project-overview.md` and the relevant module's code; the overview is a navigation aid, not proof that every flow is complete.
- Current company scoping resolves one assigned company from the user's session preference in `hrms_backend/src/platform/company-membership-context.ts`; it is not a completed multi-company membership model. A target SaaS design or an ERD is not implementation evidence. Check each domain's persisted scope before describing or changing tenancy.
- Approved SaaS direction is one person at one company at a time, with multiple authorized roles in that company and a separate employer login after an approved transfer. See `docs/discovery/owner-decisions.md`; the earlier simultaneous-membership idea was superseded. Historical payroll/audit ownership remains with the original company.

## Read Before Acting

- For business-rule changes, read `docs/discovery/business-rule-gaps-2026-11-10.md` and the current `owner-decisions.md` checkpoint. Use approved decisions as test oracles; keep unresolved details explicit. DEC-022 allows normal WFH with valid work and requires HR review only for genuine conflicts. Documentation/refinement does not close runtime remediation.

- Read the root `README.md` and the nearest nested `AGENTS.md` for files in scope.
- Use `docs/README.md` as the documentation index.
- For cross-module discovery or architecture work, read `docs/discovery/implementation-map.md`, current owner decisions, and `docs/architecture/current-runtime-source-2026-11-09.md` as source-indexed snapshots. Reverify their cited paths against the current revision.
- Use `docs/agent/verification-matrix.md` to select checks and `docs/agent/environment-safety.md` before touching hosted systems.
- Treat current source, migrations, generated OpenAPI, approved business decisions, and dated runtime evidence as different evidence types; follow `docs/agent/evidence-policy.md`.
- For multi-step or high-risk work, write and maintain `docs/plans/<date>-<topic>.md` from `docs/plans/TEMPLATE.md` before editing. Do not silently expand the requested scope.

## Find The Right Code

| Concern | First source to inspect | Deeper guide |
| --- | --- | --- |
| Backend assembly and request lifecycle | `hrms_backend/src/app.ts`, `src/server.ts`, `src/plugins/` | `docs/knowledge-transfer/backend-guide.md` |
| Auth, sessions, company onboarding and RBAC | `hrms_backend/src/modules/auth/`, `src/auth/index.ts`, `src/plugins/auth.ts`, domain `policy.ts` | `docs/architecture/security-auth-rbac.md` |
| Domain workflow and persistence | `hrms_backend/src/modules/<domain>/`, `src/platform/data-store.ts`, `src/platform/postgres-data-store.ts` | `docs/architecture/backend-architecture.md` |
| Database schema and history | `hrms_backend/src/db/schema.ts`, `src/db/migrations/` | `docs/architecture/data-architecture.md` |
| Background work and events | `hrms_backend/src/workers/`, `src/modules/*/events.ts`, `wrangler.jsonc` | `docs/deployment/cloudflare-worker-cutover.md` |
| Frontend route, state and API call | `hrms-client/src/routes/`, `src/domains/<domain>/`, `src/shared/api/` | `docs/knowledge-transfer/frontend-guide.md` |
| API shapes and error contract | `hrms_backend/docs/api/openapi.json`, `hrms_backend/docs/api/frontend-contract/` | `docs/knowledge-transfer/api-contract-and-integrations.md` |
| Role journeys and module expectations | Actual routes/services and their tests | `docs/knowledge-transfer/modules-and-roles.md` |
| Hosted environment and operations | `.github/workflows/`, `render.yaml`, `hrms_backend/wrangler.jsonc`, `hrms-client/vercel.json` | `docs/deployment/README.md`, `docs/runbooks/README.md` |
| Current verification and QA evidence | `hrms_backend/src/**/__tests__/`, `hrms-client/e2e/`, dated `hrms_backend/docs/qa/runs/` and `hrms-client/docs/qa/runs/` | `docs/agent/verification-matrix.md`, `docs/knowledge-transfer/testing-release-qa.md` |

Paths after `hrms_backend/` or `hrms-client/` in this table are relative to that package. Some older architecture and knowledge-transfer pages carry dated snapshots; recheck their counts, deployed status, and worker descriptions against current code and environment evidence.

## Follow A Feature Across Layers

1. Identify the user, active role and company context, then locate the frontend route and its domain query/mutation. The usual path is `route/component -> src/domains/<domain>/queries.ts -> api.ts -> src/shared/api/client.ts -> /api/v1/*`.
2. Locate the backend route/schema, service/policy, state machine, repository or data store, SQL migration, and tests. `hrms_backend/src/app.ts` registers plugins and modules and controls persistence flushes for mutation routes; check that boundary when adding a new write path.
3. Trace side effects: outbox rows, queue jobs, notifications/email, document metadata/object storage, audit history, read models, exports, and visible UI state. Confirm transaction and retry behavior, not just the HTTP response.
4. Check the generated OpenAPI contract and frontend route/adapter coverage. Regenerate contract artifacts through repository commands when an implemented API changes.
5. Verify with an affected role and a second company where tenancy matters. Include empty/error/loading, stale session or tab, duplicate submission, and concurrency cases according to risk.

Backend modules commonly have `routes.ts`, `schemas.ts`, `service.ts`, `policy.ts`, `repository.ts`, `state-machine.ts`, `events.ts`, and `__tests__/`; smaller modules omit files they do not need. Frontend file routes live under `hrms-client/src/routes/`, authenticated pages under `src/routes/_app/`, domain adapters under `src/domains/`, and shared UI under `src/components/ui/` and `src/components/ui-kit/`. Read each package's `AGENTS.md` for the detailed conventions.

## Critical Journey Starting Points

| Journey | Follow these implementation paths | Pay attention to |
| --- | --- | --- |
| Signup, verification, login and company bootstrap | `hrms_backend/src/modules/auth/`, `src/plugins/auth.ts`, `src/platform/company-membership-context.ts`; `hrms-client/src/domains/auth/` and auth routes | Token/session lifecycle, current employment and role, company activation, resend/reset abuse, stale sessions. |
| Employee administration and EMS | `hrms_backend/src/modules/core/`, `src/modules/ems/`; matching frontend domains/routes | Employee status, manager hierarchy, soft deletion, role changes, company ownership and audit trail. |
| Attendance and geo/offline commands | `hrms_backend/src/modules/attendance/`, `src/workers/`; `docs/architecture/adr/attendance/` | Idempotency, ordering, device/geofence evidence, breaks, regularization, payroll locks, company timezone and auto-close. |
| Expense to settlement | `hrms_backend/src/modules/expenses/service.ts`, `state-machine.ts`, `policy.ts`; frontend expense/finance routes | Independent manager and finance approval, forbidden transitions, duplicate decisions, payment and settlement evidence. |
| Documents, assets and public QR scan | `hrms_backend/src/modules/documents/`, `src/modules/assets/`, `src/plugins/auth.ts` | Upload and download access, metadata versus file content, public scan field exposure, tenant IDs and audit. |
| Reports and exports | `hrms_backend/src/modules/reports/`, `src/platform/postgres-data-store.ts`; frontend reports domain/routes | Active-company reads, historical event ownership, bounded pages, CSV formulas and generated document access. |
| Admin policy and access changes | `hrms_backend/src/modules/admin/`, `src/shared/constants.ts`, auth/session code | Permission changes, current role, concurrent edits, audit evidence and stale sessions. |

This table points to risk and code ownership, not a claim that every listed edge case is already covered. For a broad QA exercise, use the risk and evidence process in `.agents/skills/qa-master-checklist/`.

## Sources Of Truth

- Backend API contract: `hrms_backend/docs/api/openapi.json` and generated frontend-contract documents.
- Database structure: `hrms_backend/src/db/schema.ts` plus ordered migrations under `hrms_backend/src/db/migrations/`.
- Runtime authorization: backend authentication, policy, permission, and service code. Frontend route guards are UX only.
- Authenticated company context: `hrms_backend/src/platform/company-membership-context.ts`, session/user preference checks in `src/modules/auth/` and `src/plugins/auth.ts`, then resource-specific policy and query scoping. Never infer historical ownership from a user's current company preference.
- Frontend route tree: `hrms-client/src/routes/` and generated `src/routeTree.gen.ts`; generated files are outputs, not a place for manual feature edits.
- Product and operational documentation: the indexed documents under `docs/`; stale handoff notes do not override current code or approved decisions.
- Secrets and hosted configuration: environment secret stores and tracked example files, never local `.env*` contents.

## Runtime And Environment Map

- Browser traffic reaches the TanStack frontend, which calls the Fastify API. PostgreSQL is the durable business store; Valkey/Redis supports sessions, rate limits and related runtime behavior; backend-owned private object storage uses Cloudflare R2 in hosted environments and the email adapter uses Resend. See `docs/architecture/system-architecture.md` and `docs/architecture/integrations-events.md` for the conceptual map, then inspect current adapters and config.
- The documented hosted mapping is `dev -> development`, `qa -> QA`, and `main -> production`. Vercel builds the frontend; Render runs the API; Neon and Upstash hold environment-specific data/state. The presence of a branch, URL, workflow, or runbook does not verify that a particular hosted deployment is live. Confirm the target and readiness before hosted work.
- The repository contains both legacy Render polling worker code and a Cloudflare Worker design using bounded Queues/Cron jobs. `hrms_backend/src/workers/cloudflare-worker.ts`, `cloudflare-jobs.ts`, `wrangler.jsonc`, `.github/workflows/deploy-cloudflare-worker.yml`, and `docs/deployment/cloudflare-worker-cutover.md` describe that path. Worker activation is staged and inactive by default in the checked-in config; never assume a successful bundle means the cutover occurred.
- The API's post-commit signal and one-minute recovery cron drain outbox rows; five-minute attendance sweeps and hourly coordinate purges use bounded jobs. Queue consumers re-read durable PostgreSQL events. No new business-event side effect should be inferred from transport alone.
- Local development and tests use isolated Docker PostgreSQL/Valkey and synthetic data; see `docs/knowledge-transfer/local-development.md`. Keep test, dev, QA, and production databases and queues distinct.

## Non-Negotiable Product Invariants

- Scope every tenant-owned read and write to the authenticated actor's company. Never trust a client-supplied company, tenant, role, owner, or user identifier without server-side authorization.
- Resolve authorization from the current backend actor/session and resource ownership. A valid JWT or visible frontend control alone does not establish permission; account deactivation, password/role changes, and company transfers can invalidate earlier assumptions.
- Test cross-tenant denial for every changed tenant-owned resource and test privilege boundaries for every affected role.
- For historical records, retain the company that owned the event or shift at creation; do not silently reassociate it because a person transferred, was deactivated, or was soft-deleted. Confirm the relevant domain's approved policy before changing payroll or retention semantics.
- Preserve soft-delete semantics and immutable audit history. Workflow-critical mutations must emit their required audit/event evidence.
- Business writes that publish events use the transactional outbox. Consumers and scheduled work must be bounded, idempotent, retry-safe, and tolerant of duplicate or reordered delivery.
- Preserve event identity and tenant payloads after commit. Delivery state may change; audit/export visibility must not be determined from a mutable current user preference.
- Validate external input at the boundary and prevent undocumented fields from changing protected state.
- Do not expose credentials, auth/setup/reset tokens, personal data, document URLs, or sensitive payloads in code, logs, fixtures, screenshots, commits, or chat.
- Do not run demo seeds, destructive operations, vulnerability probes, load tests, or bulk mutations against production.
- Never report a test, deployment, migration, security property, or user journey as successful unless it was actually verified and the evidence is identified.

## Working On Data, Contracts, And UI

- PostgreSQL uses multiple domain schemas, including `core`, `platform`, `attendance`, `leave_wfh`, `expenses`, `documents`, `assets`, `timesheets`, `projects`, `helpdesk`, and `ems`. Drizzle declarations and ordered SQL migrations together describe the current database. Do not use an older ERD or the dated migration count in a knowledge-transfer page as a current schema inventory.
- Migrations are append-only after sharing. Review forward compatibility, data backfill, indexes, company isolation, failure recovery and rollback; run them only against the intended isolated database. Cross-schema SQL foreign keys are prohibited by the repository gate; current cross-domain integrity may also use database triggers.
- Backend role names and frontend navigation role names differ. Obtain the actor and permissions from `/api/v1/auth/me`; use backend policy for enforcement and frontend role mapping for navigation. Consult `hrms-client/docs/api/API_AUTH_SESSION_GUIDE.md` for the client contract.
- Keep OpenAPI/generated frontend contracts in sync with implemented routes. Use `hrms_backend` scripts `api:docs:generate`, `api:docs:verify`, and `api:consumer:verify`; then run frontend route/contract guards. Planned endpoints are not implemented merely because a task sheet mentions them.
- Document content is stored through the backend media boundary, while metadata and access history live in PostgreSQL. Treat uploads, download URLs, generated exports, CSV content, and public QR paths as authorization and input-validation surfaces.
- Follow existing design-system components and domain query hooks for UI changes. Handle loading, empty, validation, authorization, offline/slow network, refresh, back navigation and double submission as the affected journey requires. See `hrms-client/AGENTS.md`.

## Working Agreement

- Inspect the worktree before editing. Preserve user changes and unrelated untracked files.
- For each substantive HRMS task, consult `docs/process/task-tracker.md` at intake, identify the work-date sprint and an existing or proposed artifact ID, and reconcile the shared sprint row at handoff when writable. Do not invent a sprint, ID, commit, or QA result when the sheet is unavailable.
- Use the applicable procedure under `.agents/skills/` when the task matches it.
- Keep route handlers thin; keep business decisions in backend services/policies and UI behavior in frontend domain/components.
- Add or update tests for behavior changes. A bug fix requires a regression test when a reliable test seam exists.
- Keep generated artifacts generated; use the repository commands rather than hand-editing generated API documents.
- Update relevant architecture, runbook, environment example, QA, and rollback documentation when behavior or operations change.
- Treat `docs/implementation/` task sheets, untracked design files, and dated QA artifacts as leads or history; reconcile them with current source, approved decisions and fresh execution evidence before making a current-state claim.
- Do not commit, push, deploy, or change hosted configuration unless the user explicitly requests that action. Sprint-sheet updates are authorized as part of substantive HRMS work under `docs/process/task-tracker.md`, unless the user opts out; they do not authorize any other external mutation.

## Verification

Use the smallest defensible verification during development and the full gate before release:

```bash
./scripts/agent/verify-change.sh
./scripts/agent/verify-full.sh
```

Use `./scripts/agent/verify-change.sh --plan` to inspect the selected checks without running them. Browser E2E and human-role validation require the documented isolated environment; do not substitute HTTP scripts for human UI verification.

For backend changes, the test projects are unit, contract, integration and E2E in `hrms_backend/vitest.config.ts`. Integration tests reset `TEST_DATABASE_URL`; confirm that it points only to a disposable test database before running them. Frontend Playwright lives under `hrms-client/e2e/` and may mutate seeded application state. Run role journeys in an authorized isolated environment and record what was actually exercised. The QA master checklist is a planning workflow, not execution evidence.

## Git And Handoff

- Branch flow is documented in `docs/process/branching-release-process.md`; sprint work uses `sprint-<number>/<artifact-id-or-short-purpose>` when the sprint number is known.
- The [Hawkaii HRMS task sheet](https://docs.google.com/spreadsheets/d/1dr5qLKxq5IGIZAyIAdMlcDYDfld-LYxfvSHkKw1jBnA/edit?usp=sharing) tracks sprint tasks. Follow `docs/process/task-tracker.md` for the current sprint, field definitions, evidence, and historical corrections; the sheet does not override code or verified runtime behavior.
- Keep one logical change per commit and use a message that states the affected area and outcome.
- Handoffs must list scope, roles/tenants affected, migrations/config changes, exact commands run, results, remaining risks, rollback considerations, and artifact paths.
- At handoff, report the sheet tab and row updated, or the precise pending update if access was unavailable. Never hardcode a developer-specific filesystem path as the shared tracker.

## Test And Independent QA Completion Contract

Every feature/bug/behavior task follows [test and QA completion](docs/agent/test-and-qa-completion.md) and .agents/skills/qa-completion-gate/SKILL.md before Done. Require meaningful input/output assertions for every added/changed executable behavior, full changed executable line coverage, all changed decision-branch cases, actual boundary tests and independent QA review with PR evidence. Request a separate QA specialist when delegation is authorized; otherwise leave independent review pending for a human. Do not invent all-input coverage, exclude reachable code, or label self-review independent. Unit coverage does not replace PostgreSQL/RLS/concurrency or real browser verification. Missing test tooling is a prerequisite blocker. Docs/types/generated non-executable changes use documented N/A coverage plus appropriate validation. Preparing evidence does not authorize push/PR submission.

Sprint 25's SaaS scope and all 35 finding assignments to Anurag Kumar are recorded in docs/discovery/sprint-25-saas-remediation.md. Apply tenant isolation through middleware, service/policy, scoped repository, transaction, constraints/RLS, storage, cache and worker context; a company column alone is insufficient.

## Per-Feature Test Case Traceability

This is a standing rule for every sprint and every new feature, feature update and bug fix. During requirements discussion, review concrete success, rejection and edge/failure cases with expected results and ask only material unanswered business questions. When writing the task, publish complete case bodies in the shared sheet under [task-tracker rules](docs/process/task-tracker.md); case titles or a repository link alone are insufficient. Before coding, use [.agents/skills/qa-master-checklist/references/feature-case-workflow.md](.agents/skills/qa-master-checklist/references/feature-case-workflow.md) to trace the feature and assign task-linked cases with independent approved oracles, applicable input/state/role/tenant/failure partitions and forbidden effects. After each behavior slice run its meaningful unit tests and all applicable component/integration/browser gates, then independent QA, before Done. Keep case status, exact source head, actual evidence and gaps in the shared tracker. Sprint 25's initial cases are in qa-artifacts/hrms/sprint-25-test-design-2026-11-11/; all start Not Tested and must be refined against changed branches. A generated plan is not passing coverage.

## Coordinated Delivery Runs

For owner-activated team/backlog delivery, use [coordinated-delivery](docs/process/coordinated-delivery.md) and .agents/skills/coordinate-delivery/SKILL.md: evidence-backed dependency order, sequential task implementation, independent review/QA loops, focused sprint branches and PRs to release-01, exact case/tracker evidence, owner merge order and integrated regression. Stacked dependency branches are owner-approved; reconcile and retest new heads after prerequisite merges. Commit/push/PR authority comes from the run activation, not this reference. The owner retains release-01/main merges and deployment approval. Track missing credentials only in [credential-register](docs/agent/credential-register.md); values remain in approved stores or verified ignored local files. Respect side-chat and tool restrictions; unavailable agents/review never become fictional approvals.
