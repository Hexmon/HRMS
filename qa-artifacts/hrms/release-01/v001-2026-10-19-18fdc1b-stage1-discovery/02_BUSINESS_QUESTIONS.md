# Business questions and decision package

Stage: Stage 1 discovery only  
Baseline: `release-01` at `18fdc1bfd9144e98628d96411942918470a593f1`  
Decision rule: source describes current behavior; it does not approve business intent. The historical files `qa/BUSINESS_LOGIC_QUESTIONS.md` and `qa/BUSINESS_RULES_CONFIRMED.md` are undated and contain no accountable-owner/date sign-off. Consequently, none of the 25 items qualifies as `approved-with-owner/date`.

## Historical-question status summary

| Status | Count | IDs |
|---|---:|---|
| `approved-with-owner/date` | 0 | none |
| `historical-comment` | 17 | BLQ-003, 004, 005, 006, 008, 010, 013, 014, 015, 016, 017, 018, 019, 020, 021, 022, 025 |
| `contradicted` | 8 | BLQ-001, 002, 007, 009, 011, 012, 023, 024 |
| `not-yet-traced` | 0 | none |

`Historical-comment` means current source broadly implements the recorded answer/default but the record lacks formal approval. `Contradicted` means at least one material source behavior differs from the recorded answer or confirmed-rules summary. It is not a defect verdict.

## All 25 historical questions mapped to current implementation

### BLQ-001 — Roles and personas

**Original question:** Should the final product expose `Auditor`, `Director`, and `Helpdesk Agent` as first-class frontend roles, or should they continue mapping into existing frontend personas?

- Historical requirement: backend is the permission source; remove the Reviewer persona in favor of Manager. Undated.
- Latest implementation: `Reviewer` remains a backend role and expense-manager guard; `Auditor` remains a backend role; frontend navigation is returned by auth. Evidence: `hrms_backend/src/shared/constants.ts:1-12`, `hrms_backend/src/auth/index.ts:211-225`, `hrms_backend/src/modules/platform/service.ts:180-197`.
- Policies/state/tests checked: auth permission map, finance-governance validation, contract navigation tests in `hrms_backend/src/__tests__/contracts.contract.test.ts:1907-1932`.
- Assessment: `contradicted`; the implementation has not removed Reviewer. Owner: Product Owner with Engineering Lead.
- QA effect: role/persona matrix and navigation expectations remain provisional; test Reviewer as implemented, but do not approve it as intended terminology.

### BLQ-002 — Expense approval routing

**Original question:** If a requester is the only manager, only finance manager, or the Admin, who must verify and approve that request?

- Historical requirement: at least two managers/finance managers; Admin follows manager then finance and cannot perform either role. Undated.
- Latest implementation: requester self-processing is blocked; assigned manager and finance approvers and configured backups are supported, but no global minimum-staff invariant or universal Admin exclusion was found. Evidence: `hrms_backend/src/modules/expenses/policy.ts:5-42`, `hrms_backend/src/modules/platform/service.ts:170-282`, `hrms_backend/src/modules/expenses/service.ts:406-581`.
- State/tests checked: manager/finance/payment/settlement transitions and `hrms_backend/src/modules/expenses/__tests__/expense.integration.test.ts`.
- Assessment: `contradicted`. Owner: Finance with Product Owner.
- QA effect: routing-exception and combined-role scenarios have no approved oracle; candidate tests must branch by decision.

### BLQ-003 — Expense workflow

**Original question:** Is `Director` approval still part of the live expense workflow, or is the active flow strictly Employee -> Manager/Reviewer -> Finance -> Payment -> Settlement?

- Historical requirement: v1 omits Director; requester → Manager → Finance Manager. Undated.
- Latest implementation: submit creates independent manager/finance review state; service transitions then release payment and settle, with no mandatory Director stage. Evidence: `hrms_backend/src/modules/expenses/service.ts:341-581`, `hrms_backend/src/modules/expenses/service.ts:1214-1437`.
- Assessment: `historical-comment`; source broadly agrees, formal owner/date absent. Owner: Finance.
- QA effect: keep Director out of the mandatory v1 path unless an owner changes the policy.

### BLQ-004 — Admin workflow configuration

**Original question:** Which Admin workflow settings must actively change runtime approval routing today, and which are configuration-only for now?

- Historical requirement: prove end-to-end behavior; do not infer authority from persistence. Undated.
- Latest implementation: Admin workflows validate and persist through `hrms_backend/src/modules/admin/schemas.ts:96-119`, `hrms_backend/src/modules/admin/repository.ts:130-168`, and `hrms_backend/src/platform/postgres-data-store.ts:957-968,2769-2789`; expense routing instead reads finance governance in `hrms_backend/src/modules/platform/service.ts:170-282`.
- Assessment: `historical-comment`; persistence is evident, general runtime control is not. Owner: Product Owner and Engineering Lead.
- QA effect: candidate coverage separates configuration CRUD from proof that a consuming workflow changes.

### BLQ-005 — Attendance off-day policy

**Original question:** How should off-day punches be treated when Admin allows them: overtime, regular attendance, exception, comp-off credit, or only visible worked time?

- Historical requirement: capture work; expose worked/overtime information; compensation/promotion use may be future. Undated.
- Latest implementation: attendance policy gates punching and records day/session/project data; no automatic comp-off grant was found. Evidence: `hrms_backend/src/modules/attendance/command-service.ts:760-930`, `hrms_backend/src/modules/attendance/service.ts`, `hrms_backend/src/modules/reports/service.ts`.
- Assessment: `historical-comment`; exact payroll/overtime semantics remain unapproved. Owner: HR / Payroll.
- QA effect: verify capture/reporting candidates, not monetary or comp-off outcomes until approved.

### BLQ-006 — Target working hours

**Original question:** What is the authoritative source for employee target hours: company working day config, shift master data, attendance policy, timesheet policy, or user-specific assignment?

- Historical requirement: Admin company/policy default with explicit shift override. Undated.
- Latest implementation: company profile supports work hours/week; attendance resolves versioned policies and shift assignments. Evidence: `hrms_backend/src/modules/admin/schemas.ts:250-260`, `hrms_backend/src/modules/attendance/shift-resolver.ts`, `hrms_backend/src/modules/attendance/policy-resolver.ts`.
- Assessment: `historical-comment`; precedence needs an owner-approved matrix. Owner: HR / Payroll.
- QA effect: default and shift-override candidates exist; conflicting inputs cannot have a final oracle yet.

### BLQ-007 — Midnight and timezone attendance

**Original question:** How should punch sessions crossing midnight be assigned to work dates?

- Historical requirement: keep the session on check-in work date in the user's timezone. Undated.
- Latest implementation: the open attendance session retains its original work date, while parts of punch projection/outbox derive a current request work date; regularization enforces each target timestamp's local calendar date. Evidence: `hrms_backend/src/modules/attendance/command-service.ts:779-823,1157-1219,2166-2210`.
- Assessment: `contradicted` because the rule is not consistently evident across all projections/corrections. Owner: HR / Payroll with Engineering Lead.
- QA effect: cross-midnight, DST, auto-punchout, regularization, and payroll snapshot expectations remain decision-dependent.

### BLQ-008 — Leave policy

**Original question:** What are the leave accrual, carry-forward, encashment, probation eligibility, and negative-balance rules?

- Historical requirement: read-only Admin calculation preview in this stage; formulas require later business definition. Undated.
- Latest implementation: request lifecycle and stored balance presentation exist, but no complete accrual/carry/encashment/probation rule engine was found. Evidence: `hrms_backend/src/modules/leave-wfh/service.ts:500-610`, `hrms_backend/src/modules/leave-wfh/routes.ts`.
- Assessment: `historical-comment`; the missing formula is intentionally unresolved, not an approved zero-rule. Owner: HR / Payroll.
- QA effect: lifecycle and source-provided values can be covered; calculated entitlements cannot receive invented expected values.

### BLQ-009 — Holidays and regions

**Original question:** Are holidays global, regional, location-based, or employee-specific? How do optional holidays affect attendance and leave balance?

- Historical requirement: `region = All` global; optional holidays display-only unless applied. Undated.
- Latest implementation: holiday write operations are company-scoped, but leave calculation collects holidays broadly and does not visibly apply employee region; optional status is stored. Evidence: `hrms_backend/src/modules/leave-wfh/service.ts:427-447,549-581`, `hrms_backend/src/shared/schemas.ts:570-572`.
- Assessment: `contradicted`. Owner: HR / Payroll.
- QA effect: multi-company, region, optional, year-boundary, and employee-location cases have no final expected duration/balance.

### BLQ-010 — Timesheet variance

**Original question:** Can employees submit fewer or more hours than expected, and should approval block, warn, or allow under/over-submitted cycles?

- Historical requirement: allow accepted submissions and report variance as analytics/warning. Undated.
- Latest implementation: timesheet submission/approval and expected-versus-submitted reporting exist; no universal hard equality constraint was found. Evidence: `hrms_backend/src/modules/timesheets/service.ts`, `hrms_backend/src/modules/timesheets/routes.ts`.
- Assessment: `historical-comment`. Owner: Product Owner with HR / Payroll.
- QA effect: under/over candidates should observe implementation without asserting penalty or block absent a decision.

### BLQ-011 — Project allocation

**Original question:** Should allocation over 100 percent be blocked at save time, allowed with overload warnings, or allowed only for specific roles?

- Historical requirement: warning plus explicit acknowledgement and some authorization/approval. Undated.
- Latest implementation: schema permits up to 200 and records `over_allocation_acknowledged` and reason; no separate approval state machine was found. Evidence: `hrms_backend/src/shared/schemas.ts:644-677`, `hrms_backend/src/modules/projects/repository.ts:159-174`.
- Assessment: `contradicted`. Owner: Product Owner.
- QA effect: acknowledgement validation is coverable; approval authority cannot be asserted.

### BLQ-012 — Cost center

**Original question:** When should cost center become mandatory, and for which entities: project, expense, department, employee, or finance report only?

- Historical requirement: optional, auto-filled from department when configured. Undated.
- Latest implementation: department and project accept nullable cost centers; no reliable department-to-project/expense auto-fill path was found. Evidence: `hrms_backend/src/modules/admin/schemas.ts:179-192`, `hrms_backend/src/shared/schemas.ts:623`, `hrms_backend/src/platform/postgres-data-store.ts:2600-2617,3980-4027`.
- Assessment: `contradicted`. Owner: Finance and Product Owner.
- QA effect: null handling can be covered; auto-fill and mandatory rules need decisions/implementation proof.

### BLQ-013 — Document deletion

**Original question:** Should document deletion be permanent from storage, soft-delete only, or blocked for verified/legal/finance documents?

- Historical requirement: confirmation and complete deletion from object storage and DB where safe. Undated.
- Latest implementation: UI confirmation is present; service removes object then deletes metadata/related rows and records an outbox event. Evidence: `hrms-client/src/routes/_app/ems.documents.tsx:149-175,362-392`, `hrms_backend/src/modules/documents/service.ts:294-320,376-407`.
- Assessment: `historical-comment`; “where safe” and retention classes remain undefined. Owner: Security / Privacy with Product Owner.
- QA effect: ordinary hard-delete candidate coverage is possible; verified/legal/finance retention expectations remain pending.

### BLQ-014 — Retention and audit

**Original question:** How long should document access logs, email event payloads, and generated exports be retained?

- Historical requirement: only record creation is in scope; no automatic cleanup assertion. Undated.
- Latest implementation: records/exports are created; a general retention schedule and deletion worker for these classes was not found. Evidence: `hrms_backend/src/modules/documents/service.ts`, `hrms_backend/src/platform/generated-exports.ts:48-114`, `hrms_backend/src/platform/postgres-data-store.ts`.
- Assessment: `historical-comment`, with a missing compliance requirement. Owner: Security / Privacy.
- QA effect: creation/audit integrity candidates only; duration and erasure tests await policy.

### BLQ-015 — Cloudinary storage

**Original question:** For demo/UAT, should `CLOUDINARY_MOCK_UPLOADS=true` be acceptable, or must every UAT use real Cloudinary persistence?

- Historical requirement: real Cloudinary for QA/UAT/production; mock local/dev/test only. Undated.
- Latest implementation: object-storage construction rejects mock uploads outside local-like environments, and Render config sets false. Evidence: `hrms_backend/src/platform/object-storage.ts:58-79`, `render.yaml:56-58,124-126`.
- Assessment: `historical-comment`; deployed values still require platform verification. Owner: Platform / SRE.
- QA effect: release-environment storage tests require real provider and restart persistence.

### BLQ-016 — Email verification interaction

**Original question:** Should email verification auto-submit when the link opens, or should the user confirm on a page first to avoid security scanners verifying accounts?

- Historical requirement: auto-submit only local/dev; hosted environments require confirmation. Undated.
- Latest implementation: the UI exposes a confirmation action for hosted flow and dev-only conveniences conditionally; backend tokens are single-purpose/expiring. Evidence: `hrms-client/src/routes/verify-email.tsx:62-108,251-260`, `hrms_backend/src/modules/auth/service.ts:297-417`.
- Assessment: `historical-comment`; browser/scanner behavior requires authorized environment validation. Owner: Security / Privacy and Product Owner.
- QA effect: cover preview/no mutation then explicit confirmation in hosted QA; never assume mail delivery from source alone.

### BLQ-017 — Admin RBAC

**Original question:** Should custom RBAC roles fully control backend permissions, or are hard-coded backend role policies authoritative for sensitive workflows?

- Historical requirement: backend hard-coded policies remain authoritative. Undated.
- Latest implementation: module policy functions and role constants gate sensitive calls; Admin configuration does not replace those checks. Evidence: `hrms_backend/src/auth/index.ts:211-225`, `hrms_backend/src/modules/expenses/policy.ts:5-42`, `hrms_backend/src/modules/documents/policy.ts:9-29`.
- Assessment: `historical-comment`. Owner: Security / Privacy.
- QA effect: candidate matrix must cover both UI visibility and backend denial; UI role configuration alone is not an oracle.

### BLQ-018 — Helpdesk SLA

**Original question:** What are SLA thresholds, escalation owners, and category-specific closure/reopen rules?

- Historical requirement: consume API values without inventing business thresholds. Undated.
- Latest implementation: categories/tickets carry SLA-related states and service transitions, but business thresholds are configuration/source values rather than an approved enterprise matrix. Evidence: `hrms_backend/src/modules/helpdesk/service.ts`, `hrms_backend/src/shared/constants.ts:115-123`, `hrms_backend/src/shared/schemas.ts:739-832`.
- Assessment: `historical-comment`. Owner: Product Owner / Helpdesk owner.
- QA effect: validate returned state/timing mechanically; escalation-time expected values remain pending.

### BLQ-019 — Notifications

**Original question:** Which business events must create in-app notifications, emails, or push notifications?

- Historical requirement: basic current notifications now; complete channel matrix later. Undated.
- Latest implementation: notification channel configuration and stored in-app notifications exist; no complete event/channel guarantee across every module was found. Evidence: `hrms_backend/src/modules/admin/schemas.ts:157-167`, `hrms_backend/src/platform/postgres-data-store.ts:1027-1041,3054-3079`.
- Assessment: `historical-comment`. Owner: Product Owner.
- QA effect: cover only events emitted by traced code; missing events are requirement gaps, not automatically defects.

### BLQ-020 — Reports and exports

**Original question:** Are scheduled exports, export retention cleanup, and XLSX field parity required for go-live?

- Historical requirement: on-demand export/download only. Undated.
- Latest implementation: on-demand report/export generation and storage exist; scheduling/retention was not found as a completed requirement. Evidence: `hrms_backend/src/modules/reports/service.ts:850-885`, `hrms_backend/src/platform/generated-exports.ts:48-114`.
- Assessment: `historical-comment`. Owner: Product Owner and Finance.
- QA effect: inventory on-demand formats and authorization only; scheduled cleanup/parity remain out of oracle scope.

### BLQ-021 — EMS profile fields

**Original question:** Which EMS profile fields require HR approval versus direct employee edit?

- Historical requirement: backend-accepted direct fields allowed; rejected fields use change request. Undated.
- Latest implementation: direct profile schema and separate profile-change request records/actions coexist, but no owner-approved field-level matrix was found. Evidence: `hrms_backend/src/shared/schemas.ts:70-88`, `hrms_backend/src/platform/postgres-data-store.ts:2380-2398`, `hrms_backend/src/modules/ems/service.ts`.
- Assessment: `historical-comment`. Owner: HR / Payroll and Security / Privacy.
- QA effect: derive candidate boundary cases from schema/policy but hold final expectations for sensitive identity/payroll fields.

### BLQ-022 — Asset recovery

**Original question:** Does asset recovery deduction require finance approval, employee acknowledgement, or payroll integration?

- Historical requirement: current Asset Manager/Admin settlement only; integrations future. Undated.
- Latest implementation: asset recovery supports recovered/deduction/waived/lost-damaged settlement without a traced payroll posting or employee acknowledgement. Evidence: `hrms_backend/src/modules/assets/routes.ts:287-297`, `hrms_backend/src/modules/assets/service.ts:388-439`.
- Assessment: `historical-comment`. Owner: Finance and HR / Payroll.
- QA effect: cover the current ticket state/audit only; do not assert a payroll deduction.

### BLQ-023 — Production documentation exposure

**Original question:** Should `/docs` and `/api/v1/openapi.json` remain public in production?

- Historical requirement: keep current public behavior but security-review it. Undated.
- Latest implementation: auth allowlist contains documentation paths, while Render explicitly sets `OPENAPI_PUBLIC=false`; route registration therefore depends on configuration. Evidence: `hrms_backend/src/plugins/auth.ts:29-57`, `hrms_backend/src/app.ts`, `render.yaml:34-36`.
- Assessment: `contradicted` at the declared production configuration level. Owner: Security / Privacy with Platform / SRE.
- QA effect: deployed-route expectation must come from the approved exposure policy and actual environment configuration.

### BLQ-024 — Empty workspace

**Original question:** After a new company bootstrap, should dashboards and module pages show zero/empty real organization data only, or is seeded demo data ever allowed?

- Historical requirement: production/API mode must show only tenant-owned real data. Undated.
- Latest implementation: production seed enablement is false and client mock mode is disabled, but several legacy repositories/report aggregations are not consistently company-keyed, so unrelated persisted rows could still surface. Evidence: `render.yaml:90-96`, `hrms_backend/src/platform/data-store.ts:1800-2300`, `hrms_backend/src/modules/reports/service.ts:371-379,522-561,795-885`.
- Assessment: `contradicted` as a complete guarantee; mock/seed safeguards reduce likelihood but are not row isolation. Owner: Product Owner and Engineering Lead.
- QA effect: a two-company empty/non-empty matrix is release-critical.

### BLQ-025 — Mobile support

**Original question:** Which routes are P0 mobile-supported workflows: attendance punch only, all employee self-service, or full admin/finance operations?

- Historical requirement: desktop and mobile screens both priority, without a route-level support matrix. Undated.
- Latest implementation: responsive client components and mobile/offline attendance code exist, but no approved browser/device/route support matrix was found. Evidence: `hrms-client/src/routes`, `hrms-client/src/components`, `hrms_backend/src/modules/attendance/offline-sync-service.ts`.
- Assessment: `historical-comment`; scope remains ambiguous. Owner: Product Owner and QA Lead.
- QA effect: device/browser selection and responsive depth cannot be finalized until support tiers are named.

## Active stakeholder decision package — first seven material items

These seven are the first decision batch. They consolidate the 25 historical questions and avoid asking owners to resolve facts already visible in source.

### Product Owner — DEC-PO-01 (PENDING; decision date TBD)

- Business context: cross-company privacy and “empty workspace” behavior across EMS, assets, projects, leave, expenses, documents, and reports.
- Source-observed behavior: modern membership context and attendance enforce a selected active company, but several legacy records/services are not consistently company-keyed.
- Evidence: `hrms_backend/src/platform/company-membership-context.ts:30-107`; `hrms_backend/src/modules/reports/service.ts:371-379,522-561,795-885`.
- Why the decision matters: it defines whether observed global reads are defects and supplies the allow/deny oracle for every tenant and privileged-role test.
- Question: Is every business record and every privileged read/export strictly confined to the actor's selected company, including Auditor/Admin, or are any explicitly approved cross-company roles/views required?
- Options/trade-offs: strict tenant confinement (strongest privacy, requires company keys/migration for legacy domains); explicit super-tenant role (operational flexibility, needs separate grant/audit); global current behavior (least change, conflicts with empty-workspace intent).
- Engineering consideration: encode the decision once in membership/policy/repository boundaries rather than relying on UI filters.
- Owner: Product Owner. Affects: R-01, R-02, R-05, R-09, R-14; BLQ-001, 017, 024; future multi-company authorization cases.

### Engineering Lead / Architect — DEC-ARCH-01 (PENDING; decision date TBD)

- Business context: non-attendance domain state is hydrated into process memory, mutated, and flushed to PostgreSQL after responses.
- Source-observed behavior: each process loads a snapshot; selected domains flush in `onSend`; Attendance owns direct transactions.
- Evidence: `hrms_backend/src/app.ts:82-133,253-266`; `hrms_backend/src/platform/postgres-data-store.ts:407-442,627-703`.
- Why the decision matters: supported instance count determines whether stale reads/lost writes are plausible defects or excluded operating conditions.
- Question: What deployment topology and concurrency guarantee is the hydrated repository designed to support—exactly one API writer, or multiple API instances with a coordination/refresh mechanism not present in this repository?
- Options/trade-offs: single writer (simple, operational single point/bounded throughput); coordinated multi-writer (requires explicit locking/version/refresh guarantees); accept bounded staleness per named domains (must define tolerable loss/conflict).
- Engineering consideration: document authoritative source, mutation serialization, and recovery after failed post-response flush before choosing changes.
- Owner: Engineering Lead / Architect. Affects: R-04, R-07, R-08, R-13; all concurrency/stale-write candidates.

### HR / Payroll — DEC-HR-01 (PENDING; decision date TBD)

- Business context: night shifts, holidays, leave durations, regularization, and locked payroll can disagree at day boundaries.
- Source-observed behavior: attendance sessions and some projections use different work-date inputs; leave calculation does not visibly apply employee region; post-lock adjustments are stored but no resolution route was located.
- Evidence: `hrms_backend/src/modules/attendance/command-service.ts:779-823,1157-1219,2166-2210`; `hrms_backend/src/modules/leave-wfh/service.ts:549-581`; `hrms_backend/src/modules/attendance/payroll-period-service.ts:412-485`.
- Why the decision matters: the choice changes leave duration, attendance day projections, overtime and final payroll amounts.
- Question: Approve the canonical work-date/timezone rule for cross-midnight shifts, holiday/optional-holiday applicability, and how approved corrections alter a locked payroll snapshot.
- Options/trade-offs: check-in date; shift-start date; split by calendar date. Holiday scope may be All-only, employee region/location, or elective optional holiday. Locked corrections may be next-cycle adjustments or controlled snapshot revision.
- Engineering consideration: one versioned policy decision should feed attendance, leave, reports, and payroll.
- Owner: HR / Payroll. Affects: R-09, R-10; BLQ-005–010; future boundary/payroll cases.

### Finance — DEC-FIN-01 (PENDING; decision date TBD)

- Business context: independent approval is intended, but combined roles, missing backups, payment amount, attachments, and settlement need a governance oracle.
- Source-observed behavior: self-processing is blocked and backup approvers exist; no global two-person staffing invariant was found.
- Evidence: `hrms_backend/src/modules/expenses/policy.ts:5-42`; `hrms_backend/src/modules/platform/service.ts:170-282`; `hrms_backend/src/modules/expenses/service.ts:341-581,1214-1437,1589-1622`.
- Why the decision matters: it defines separation of duties, prevents unapprovable tickets and determines whether combined-role/payment paths are compliant.
- Question: Define the minimum distinct people/roles required from request through settlement, the behavior when no eligible backup exists, and who may attach verified documents or adjust payment/settlement amounts.
- Options/trade-offs: strict four-eyes with blocked submission; routing-exception queue; explicitly approved combined roles excluding requester. Stronger separation increases staffing requirements.
- Engineering consideration: validate governance at configuration and submission time, not only when an action is attempted.
- Owner: Finance. Affects: R-08, R-05; BLQ-002, 003, 012, 020, 022; financial-integrity cases.

### Security / Privacy — DEC-SEC-01 (PENDING; decision date TBD)

- Business context: Auditor document mutation, public QR response, hard deletion, audit/export retention, and session invalidation are policy-sensitive.
- Source-observed behavior: Auditor is allowed document write/delete/verify; QR scan returns a limited public asset projection; document deletion removes storage first; user deactivation does not use the explicit session-revocation path.
- Evidence: `hrms_backend/src/modules/documents/policy.ts:9-29`; `hrms_backend/src/modules/assets/service.ts:476-485`; `hrms_backend/src/modules/documents/service.ts:294-320`; `hrms_backend/src/modules/core/service.ts:522-587`.
- Why the decision matters: these choices set destructive access, anonymous disclosure, former-user access and legally required retention boundaries.
- Question: Approve the Auditor mutation boundary, public QR data contract, record-class retention/legal-hold policy, and whether deactivation must revoke all active sessions immediately.
- Options/trade-offs: read-only Auditor versus controlled mutation; minimal anonymous QR versus authenticated details; hard-delete versus retention/legal hold; immediate revocation versus short bounded session lifetime.
- Engineering consideration: distinguish employment deactivation, login disablement, and data retention as separate auditable controls.
- Owner: Security / Privacy. Affects: R-05, R-06, R-07, R-14; BLQ-013, 014, 017, 023.

### Platform / SRE — DEC-SRE-01 (PENDING; decision date TBD)

- Business context: email, Valkey, outbox, combined worker, Vercel SSR, promotions, rollback, and recovery depend on deployed conditions absent from source.
- Source-observed behavior: declared Render email delivery is disabled; API/session fail closed on Valkey; outbox is at-least-once; one process runs three worker loops; release branches do not deploy; Vercel smoke covers `/login` only.
- Evidence: `render.yaml:70-72`; `hrms_backend/src/platform/valkey-client.ts:5-50`; `hrms_backend/src/workers/outbox-worker.ts:106-160`; `hrms_backend/src/workers/run-outbox-worker.ts:106-171`; `.github/workflows/branch-ci-cd.yml:5-18,160-181`; `hrms-client/scripts/build-vercel.mjs:1-39`.
- Why the decision matters: source defaults cannot establish that users receive mail, sessions/events recover, workers meet deadlines, or the inspected commit is the deployed release.
- Question: Provide the release-01 deployment manifest/runbook: instance counts, real email mode, Valkey durability/reconnect, worker supervision/DLQ replay, Vercel auth routing, promotion branch, backup/restore, and rollback ownership.
- Options/trade-offs: evidence from the intended QA environment; production-equivalent staging; or explicit risk acceptance for unverified items. Source defaults alone cannot prove deployment.
- Engineering consideration: make promotion conditional on environment evidence, not historical QA prose.
- Owner: Platform / SRE. Affects: R-03, R-04, R-11, R-12, R-13, R-15.

### QA Lead — DEC-QA-01 (PENDING; decision date TBD)

- Business context: Stage 2 scope depends on supported clients, data volumes, integrations, and owner-approved oracles.
- Source-observed behavior: automation exists unevenly (strong Attendance, sparse legacy modules); no current execution was performed; mobile/browser/accessibility/scale matrices are absent.
- Evidence: backend test files under `hrms_backend/src`; `hrms-client/e2e`; `qa/QA_SHEET_VALIDATION_LOG.md`; `qa/QA_TIMELINE_VALIDATION_LOG.md`.
- Why the decision matters: without an approved environment and support matrix, Stage 2 cannot be sized or produce attributable release evidence.
- Question: After the six owner decisions above, approve the Stage 2 environment, browsers/devices, accessibility target, test-data/tenant matrix, integration sandbox accounts, performance volumes, and evidence retention standard.
- Options/trade-offs: risk-minimal release matrix versus broader compatibility/scale assurance; each option changes duration and residual risk.
- Engineering consideration: keep current Stage 1 candidate IDs stable so approved decisions can produce traceable cases without rewriting discovery.
- Owner: QA Lead. Affects: all risks, especially R-01, R-03, R-12, R-15; BLQ-025 and all future cases.

## Gate treatment

All seven active questions are material. G1 remains on hold until accountable owners answer enough of them to define test oracles and the deployable topology. The remaining historical questions stay mapped above and should be reopened only if an active decision does not resolve them.
