# SaaS Modular-Monolith Proposal (Draft, Not Approved)

Source revision `6a8d11f7`, 2026-11-09. This is a design proposal informed by source traces and the owner decisions in `owner-decisions.md`; it changes no runtime behavior, schema or deployment. Open decisions are listed below. The current source remains the authority for implemented behavior.

## Current boundary and why it fails at SaaS scale

`app.ts` assembles one Fastify backend and 19 modules. Most services share a `MemoryDataStore` that is hydrated from PostgreSQL at startup. The API `onSend` hook chooses a domain flush after successful mutations. For assets, `AssetRepository.updateVersioned` checks a version in the local array, while `PostgresPersistence.flushAssets` upserts **every** hydrated asset without a database version predicate. A prior disposable PostgreSQL two-instance test reproduced a successful assignment overwritten by a later unrelated create; current source still contains that mechanism. Many modules derive company visibility from a mutable user preference or related participant, and several records lack immutable company ownership. The current auth hook validates a session, active user and assigned company; it cannot establish ownership of every requested object by itself.

The public API and UI are a single product. A modular monolith remains appropriate while domain consistency and tenant boundaries are being repaired: one deployable API, explicit module interfaces and PostgreSQL transactions, with bounded external Workers for asynchronous work. Splitting services now would add distributed transactions to boundaries that have not yet been defined. This is an engineering inference, not a deployment mandate.

## Target invariants and open decisions

- One customer tenant contains one company and multiple offices (DEC-001). A person has one active employment/company at a time, potentially several authorized roles there, and a new work email with a new employer (DEC-002/003/005). A separate stable person identity can coordinate sequential employment but must not become a cross-company data shortcut. Identity assurance and old-HR unavailability remain DEC-Q01/Q02/Q04.
- Every tenant-owned aggregate captures immutable `original_company_id` or `company_id` when created. Historical payroll/audit remains owned by that company after a person transfers (DEC-004). Effective dating and retention/viewer rules remain open.
- Server authorization joins actor's current employment and authorized role to the requested resource's **captured owner company**. Related IDs (employee, approver, project, asset, document, office) are checked in the same trusted transaction. A client-supplied company ID is never authority.
- Office-specific calendars, versioned company settings with a non-weakening platform security floor, verified onboarding documents, timesheet submission lock and leave-work conflict review follow DEC-007–015. Public asset QR detail exposure follows DEC-016, with QR hash echo/revocation undecided.
- Business writes commit aggregate, audit and outbox in one PostgreSQL transaction. Consumers dedupe by durable event ID and tolerate retries/reordering. The process snapshot is not an authoritative write source.

## Proposed module ownership

| Module boundary | Owns | Reads from other modules through a narrow interface | Transaction or event rule |
| --- | --- | --- | --- |
| Identity & organization | person link, employment, company, office assignment, sessions, role grants, transfer state | document verification status, company policy | Activation/transfer/session revocation must have a committed state transition and audit; exact person assurance is open. |
| Documents | object metadata/versions, captured owner company, document policy, access log | actor employment and HR assignment | Object bytes plus DB metadata need staged upload/cleanup; no raw URL in event payload. |
| Attendance & payroll | punch command, session, projection, office/shift policy version, payroll lock | employment/company history, leave conflict resolution | Direct SQL command path remains authoritative; idempotency and row locks retained. |
| Leave/WFH | requests, balance, office-calendar policy snapshot, approvals | attendance conflict API, office assignment | Approval and conflict creation are atomic or reconciled through a durable event. |
| Timesheets & projects | segments/submission/correction and project ownership/membership | employment, office calendar | Submission snapshot and lock are atomic; use project ID, not text code, for linkage. |
| Expenses | ticket, independent approvers, line items, payment, immutable audit | documents access, company finance policy | Ticket and document relation must share owner company; approver assignment captured. |
| Assets | inventory, assignment, request, recovery, public QR capability | employment, company settings | Owner company is captured at asset creation; state/version update uses DB predicate. |
| Helpdesk | company categories, ticket, SLA, comments, attachment links | document/asset/project ownership | Each linked object must match ticket company. |
| Company control plane | company overrides, versioned platform defaults, security floor | organization, identity, notification adapter | Effective policy and default version are auditable; changing B cannot alter A. |
| Notifications/reports | recipient inbox, export jobs and company-scoped read models | durable domain events/read interfaces | Reports use captured ownership; exports are bounded and neutralize spreadsheet formulas. |

These are proposed ownership boundaries, not a claim that existing directories already enforce them. Avoid cross-module imports of mutable stores. Use typed command/query interfaces carrying `ActorContext` (`userId`, `employmentId`, `companyId`, authorized roles, session/version) and a server-created transaction handle. Query interfaces return only company-scoped facts. Do not put a generic "admin bypass" in repository APIs.

## Incremental order and rollback

1. **Containment:** add per-route tenant/object/related-ID denials and regression matrices for the highest-risk assets, helpdesk, projects, expenses, documents, leave and timesheets. Keep responses compatible where possible. Deny unsafe requests when ownership cannot be established. No feature-wide claim until each route is tested.
2. **Ownership expansion:** add nullable captured-company fields and additive indexes in an append-only migration. Backfill from trustworthy creation-time evidence; ambiguous records enter a review queue, never an inferred company. Dual-read with metrics, then require non-null for new writes. Preserve legacy IDs and original-company audit access. Separate owner approval is needed for retention and transfer exception policy.
3. **Transactional write slices:** start with asset inventory/assignment (reproduced lost update), replacing full-array flush for that domain with request-local SQL `UPDATE ... WHERE id = ? AND version = ? AND company_id = ?` and same-transaction assignment/audit/outbox. Repeat domain by domain. Keep an explicit compatibility adapter for still-legacy modules; remove each flush path only after its reads, writes and replay tests pass.
4. **Identity and control plane:** implement employment/transfer and company-policy versioning after identity assurance and unavailable-old-HR resolution. Sessions bind to employment/company/role grant version; replace the current all-session `KEYS` revocation scan with a bounded per-user/versioned design, revoke stale sessions after committed changes and verify across replicas.
5. **Reports and asynchronous boundaries:** migrate exports/read models to owner-company predicates; preserve outbox IDs; add recipient dedupe, DLQ replay and reconciliation checks. Roll out office calendars, proof gates, correction and overlap workflows with policy-version snapshots and staged backfills.
6. **Contract and cleanup:** regenerate OpenAPI/client contract only with implemented behavior, remove obsolete array flushes, run isolated two-company/two-instance/browser gates, and stage production cutover separately.

For each slice: ship additive schema first, backfill and compare counts, switch reads under a controlled flag, switch writes, observe mismatches, then remove legacy code. Roll back a flag or API version while additive columns remain; do **not** restore an older whole-domain writer once new transactional writes have begun, because it could overwrite committed state. Recovery must reconcile ambiguous rows and outbox delivery by durable IDs. A backward-compatible migration/rollback test is required before each deployment plan.

## Alternatives and tradeoffs

| Alternative | Reason it is not the first slice | Revisit when |
| --- | --- | --- |
| Keep shared arrays and serialize all API requests | Does not safely coordinate multiple API instances or Workers and scales reads/writes with total retained rows. | Only as a temporary single-instance emergency containment, with strict limits. |
| Tenant database per company | Stronger physical isolation but creates migration, connection, reporting and operations complexity before identity/domain ownership is established. | Tenant volume, contractual isolation or measured noisy-neighbor needs justify it. |
| Split into microservices now | Distributed consistency and event contracts would be built around unclear owner rules. | Module interfaces and transactional boundaries are stable and independently scalable. |
| Add PostgreSQL row-level security alone | Useful defense in depth but cannot fix missing captured ownership, stale in-memory writes or cross-system object access by itself. | After owner columns and trusted session-to-DB context exist. |

## Observable acceptance gate

A synthetic A/B matrix must deny every cross-company ID and related-ID mutation, including after an authorized transfer; A retains history according to an approved retention rule. Two API instances must pass same-row/different-row concurrency and rollback tests with DB/assignment/audit/outbox reconciliation. Cookie, bearer, role-change and deactivation sessions must be denied at the next protected request across replicas. Reports/export totals must reconcile to company-owned source rows. Scheduled jobs must remain bounded, idempotent and recover through retry/DLQ. Resource tests use assumptions and measurements in `backend-resource-scenarios.md`. Browser journeys and human UAT remain separate gates.
