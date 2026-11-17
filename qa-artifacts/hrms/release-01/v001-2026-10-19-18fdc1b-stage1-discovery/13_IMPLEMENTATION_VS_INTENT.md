# Implementation versus intent

## Interpretation

“Implemented” below means visible in source at commit `18fdc1b`; “intent” comes from historical QA/product prose and remains non-authoritative unless an accountable owner/date exists. No such approval metadata exists for the 25 historical business questions. Detailed source analysis and original wording are in `02_BUSINESS_QUESTIONS.md`.

## Business-rule comparison

| ID | Historical intent / answer | Source-observed implementation | Alignment | Consequence for QA |
|---|---|---|---|---|
| BLQ-001 | Backend roles authoritative; remove Reviewer UX/model in favor of Manager | Reviewer remains a backend constant and finance-governance eligibility role | Contradicted | Maintain implementation coverage for Reviewer but hold persona/navigation oracle |
| BLQ-002 | At least two eligible managers/finance; Admin cannot act in either lane | Self-action denied and backups supported; no universal staffing invariant/Admin exclusion | Contradicted | Cannot finalize combined-role/routing-exception outcomes |
| BLQ-003 | V1 excludes Director approval | No mandatory Director transition in expense state machine | Broadly aligned; historical only | Candidate happy path can omit Director |
| BLQ-004 | Persist settings; prove before claiming runtime effect | Admin workflows persist; expense uses separate finance-governance path | Broadly aligned; historical only | Separate CRUD coverage from consuming-engine behavior |
| BLQ-005 | Off-day work captured and visible; compensation later | Attendance captures worked data; no automatic comp-off found | Broadly aligned; monetary rule missing | Do not invent pay/comp-off result |
| BLQ-006 | Company/admin default with shift override | Company hours and shift/policy resolution exist | Broadly aligned; precedence not signed | Conflicting policy sources need decision table |
| BLQ-007 | Cross-midnight belongs to check-in date | Session retains start date, but projection/outbox and regularization show date inconsistency candidates | Contradicted | P0 night-shift oracle pending |
| BLQ-008 | Leave calculation preview/read values only; formulas not approved | Lifecycle/stored balances exist; no complete formula engine located | Broadly aligned; requirement deliberately incomplete | No invented accrual/carry/encashment assertions |
| BLQ-009 | `All` holidays global; optional display-only unless applied | Company-aware writes but broad holiday selection; employee region not visibly applied | Contradicted | Company/region/optional expected duration pending |
| BLQ-010 | Allow variance, report warning/analytics | No universal exact-hours block found | Broadly aligned; historical only | Cover acceptance/analytics; no penalty expectation |
| BLQ-011 | Over-allocation allowed after acknowledgement plus authority/approval | Up to 200 and acknowledgement recorded; no approval flow found | Contradicted | Validate acknowledgement only; authority unresolved |
| BLQ-012 | Optional cost center auto-fills from department | Nullable department/project field; no dependable auto-fill found | Contradicted | Null compatibility is coverable; propagation is a gap |
| BLQ-013 | Confirm and hard-delete storage/DB where safe | UI confirms; service deletes storage then metadata/relations | Broadly aligned; “safe” undefined | Retention classes and partial failure remain open |
| BLQ-014 | No automatic cleanup assertion yet | General retention cleanup not found; coordinate purge is specialized | Broadly aligned; missing policy | Cover creation only until retention decision |
| BLQ-015 | Real Cloudinary in QA/UAT/prod | Runtime guard rejects mock outside local-like env; Render false | Broadly aligned; deployment unverified | Require effective-config/provider evidence |
| BLQ-016 | Hosted verification requires explicit confirmation | Hosted UI confirmation behavior and backend token controls exist | Broadly aligned; deployment/browser unverified | Include scanner/no-mutation-before-confirm candidates |
| BLQ-017 | Hard-coded backend policies authoritative | Sensitive modules use policy functions/roles | Broadly aligned | UI grants must never be treated as backend authorization |
| BLQ-018 | Consume API SLA values; thresholds unapproved | SLA fields/states exist; enterprise threshold matrix absent | Broadly aligned; missing policy | Do not assert business-time thresholds |
| BLQ-019 | Basic current notifications; full matrix later | Channel config and notifications exist; comprehensive event map absent | Broadly aligned; missing policy | Cover traced emissions only |
| BLQ-020 | On-demand exports only for current release | On-demand reports/export storage exists; scheduler/cleanup not found | Broadly aligned | Schedule/retention/parity remain uncommitted |
| BLQ-021 | Direct accepted fields; rejected fields through change request | Direct profile schema and change-request store coexist | Broadly aligned; field matrix absent | Sensitive-field boundary needs HR/privacy decision |
| BLQ-022 | Asset settlement only; payroll/ack future | Recovery settlement exists without traced payroll/ack | Broadly aligned | Do not claim payroll deduction completion |
| BLQ-023 | Leave docs/OpenAPI public pending security review | Auth allowlist mentions them but production blueprint disables OpenAPI | Contradicted by declared production config | Deployed exposure must be inspected after policy decision |
| BLQ-024 | Empty tenant shows only its real data | Production seed/mock disabled; legacy/global reads can still mix persisted data | Contradicted as a complete guarantee | Two-company/empty-company verification is P0 |
| BLQ-025 | Desktop and mobile important | Responsive/offline code exists; no route/browser/device support matrix | Broadly aligned; scope missing | QA matrix cannot be sized yet |

## Architecture intent compared with implementation

| Topic | Stated/documented intent | Source-observed implementation | Gap or drift |
|---|---|---|---|
| Modular monolith | Schema-per-domain boundaries; shared PostgreSQL | Domain schemas and modules exist; runtime uses Drizzle schema/migrations plus raw `pg` persistence | No issue by itself; cross-domain integrity ownership must be inventoried |
| Cross-schema references | Avoid cross-schema FKs for independent evolution/testability/future extraction | Service checks plus selected validation/restrict triggers in migration 0063 | Coverage is selective; no complete logical-reference registry found |
| Attendance | PostgreSQL-first command path for concurrency, idempotency, tenancy | Attendance routes own direct transactions and bypass generic flush | Strong alignment; cross-midnight/correction semantics still incomplete |
| Other domains | PostgreSQL persistence | Hydrated memory is loaded and flushed on response | “PostgreSQL-backed” does not alone define multi-instance consistency |
| Events | Transactional outbox; at-least-once; consumer dedupe | Atomic Attendance outbox; worker publishes then marks processed | Consumers/dedupe ledger and DLQ replay are outside inspected source |
| Tenant isolation | One selected active company | Strong helper/RLS in selected paths; legacy/global paths remain | Enforcement is uneven and privileged scope is unapproved |
| Sessions | Hosted Valkey session store and revocation | TTL/revoke implemented; deactivation and disable-login differ | Offboarding semantics are not unified/approved |
| Object storage | Real provider outside local-like environments | Guard and Render values align | Cross-system atomicity/reconciliation unresolved |
| Frontend hosting | TanStack Start SSR on Vercel | SSR build/rewrite exists; protected auth is client-resolved | Authenticated deep-link behavior lacks hosted evidence |
| Worker | Separate background execution | One worker process combines outbox, purge and auto-punchout | SLO, fairness, supervision, scaling not documented in repo |

## Documentation and baseline drift

- The four OpenAPI mirrors inspected are identical and contain 240 paths / 281 operations. `docs/README.md` records 214 paths / 245 operations, so its count is dated.
- Source contains 63 numbered migration files through `0063`; dated documentation refers to 25 migrations.
- Many architecture/QA documents say “Last verified 2026-06-30”; Attendance ADRs are dated 2026-07-13 and API/mobile KT material 2026-10-05. These dates identify evidence age, not correctness.
- Historical release signoff/checklist records are not attributable execution proof for the current commit. Their assertions remain historical evidence only.
- Local `release-01` and the existing local `origin/release-01` remote-tracking ref are identical at `18fdc1b` (ahead/behind 0/0). No fetch was authorized, so current remote freshness is unverified.

## Safeguards that reduce earlier risk estimates

- Attendance has transaction ownership, advisory locks, idempotency, company/device validation, immutable payroll snapshots, precise-coordinate access controls and purge machinery.
- Registered-device forced RLS fails closed without transaction-local company context.
- Session and rate-limit dependencies fail closed rather than silently falling back to memory in hosted runtime.
- Production declarations disable seed data, client mock mode, Cloudinary mock uploads and public OpenAPI.
- Spreadsheet formula prefix sanitization is present for export; structured logs redact common secrets/tokens.
- Expense self-processing prohibition and backup approver validation exist.
- Outbox has stable IDs, row locking, retry and dead-letter status; at-least-once behavior is documented.

These safeguards reduce likelihood or blast radius but do not close the associated risk without business/deployment context and authorized execution.

## Missing requirements, not presumed defects

1. Cross-company authority for every privileged role.
2. Canonical leave accrual/carry/encashment/probation/negative-balance formulas.
3. Region/optional-holiday assignment.
4. Cross-midnight work-date and locked-payroll correction application.
5. Minimum distinct expense approvers and routing exception behavior.
6. Sensitive-document retention/legal hold and Auditor mutation boundary.
7. Notification event/channel completeness.
8. Browser/device/accessibility support targets and scale/SLOs.
9. Valkey/outbox/worker recovery and dead-letter operations.
10. Release promotion, rollback and restore acceptance criteria.
