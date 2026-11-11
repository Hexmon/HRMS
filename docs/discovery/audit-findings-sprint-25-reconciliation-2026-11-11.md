# Supplied Static Audit: Sprint 25 Finding Reconciliation

Date: 2026-11-11. Owner: Anurag Kumar. Baseline: 87618f88 on sprint-25/saas-s25-001, with pre-existing documentation changes preserved. Input is the owner-supplied 30-item report beginning “I completed the static review of all 444 previously unreviewed inventory rows.”

This task reads that report, checks the cited mechanisms against current source, reconciles all 30 items with live Sprint 25 and supplies more precise implementation/QA scope. It does not independently repeat or certify all 444 inventory rows, update their coverage status, reproduce exploits, or prove hosted behavior. The repository inventory is a dated snapshot; a supplied completion statement is not new per-row runtime evidence.

## Decisions and qualifications coders must preserve

- Item 16 is approved DEC-031 behavior: backend authorization uses all currently assigned company roles. Do not implement an active-role-only downgrade to satisfy an obsolete finding; test tenant, permission, assignment and self-approval boundaries.
- Item 4 has existing deletion guards for referenced EMS letters/policies. The hard-delete/history and failure-ordering problem remains for other references; do not remove those guards.
- Item 12 establishes session ordering/partial-state risk. Protected middleware may deny the resulting session; a usable tenant bypass was not demonstrated.
- A signed generic money type can be valid for reversals; item 8 requires purpose-specific positive/nonnegative rules and approved exception bounds.
- Public health detail is a hardening issue; no leaked credential is established. The legacy process's loop is intentional on Render, but unchecked interval and historical-close mismatch need repairs. Cloudflare jobs are bounded in source; hosted cutover state is unknown.

## Every supplied item mapped

| Item | Concern | Task ownership | Disposition | Source recheck and implementation meaning |
| --- | --- | --- | --- | --- |
| 1 | Production invitation gap | AUTH-S25-003/004; MAIL-S25-008 | Enhance | core/service.ts:enableLogin/queuePasswordSetup creates a setup token but invite_sent is false. This is a source delivery gap; hosted delivery was not tested. |
| 2 | Broad document policy | TEN-S25-006/016; R2-S25-003 | Enhance | documents/policy.ts has role-wide Admin/Auditor/HR and nonrestricted Finance/Director/AssetManager branches without company/business-object scope. Apply operation, classification, assigned-HR and current ownership checks. |
| 3 | Expense attachment parent authorization | TEN-S25-007/016; TEN-S25-021 | Enhance | documents/routes.ts expense upload checks actor presence; expenses/service.ts:attachVerifiedDocument checks only a closed-requester condition. Authorize parent before object write and relation insert. |
| 4 | Hard document deletion and retention | TEN-S25-022; R2-S25-001 | Enhance with qualification | documents/service.ts hard-deletes bytes, metadata, versions and multiple domain links. It already rejects referenced EMS letters and policies, so the report's broad wording is not unconditional. Preserve retained history; separate privileged purge; do not swallow provider failure. |
| 5 | Global EMS administration | EMS-S25-001/002; TEN-S25-003; BIZ-S25-021/022 | New explicit ownership slices | EMS HR/Admin policy and admin lists/decisions lack immutable company predicates for service/profile requests, letters, checklists, probation, policies and acknowledgements. Existing proof/evidence cards do not describe this complete authorization scope. |
| 6 | Licence actor, seat race and offline placeholder | LIC-S25-001/002/003 | New split cards | assets/routes.ts activate/validate pass no actor; AssetService uses global product/entitlement/fingerprint lookup and check-then-insert seats, returning signed-dev-license-placeholder. Route-wide authentication alone does not establish entitlement ownership. |
| 7 | Termination consumer authorization | TEN-S25-010/016 | Enhance | assets/routes.ts events/employee-terminated accepts any request.actor and calls consumeEmployeeTerminated without it. Require scoped authority or service principal, eligible actual lifecycle event and idempotent recovery. |
| 8 | Financial amount validation | FIN-S25-001; BIZ-S25-016 | New boundary card plus settlement refinement | moneySchema permits signed fixed-precision text; releasePayment stores input.amount without an approved-bound check. Signed money is not universally invalid for ledger reversals: define positive schemas per operation, bounds and approved exceptions rather than banning every negative globally. |
| 9 | Global approver and setup-company fallback | BIZ-S25-015; AUTH-S25-003; TEN-S25-002 | Enhance | core/service.ts Director/alternate/Finance lookups search global users; setup token picks first active company. Use persisted company eligibility and independent approver rules; no guessed fallback. |
| 10 | Legacy historical auto-close mismatch | WORKER-S25-001; TEN-S25-023 | New focused legacy repair | attendance-auto-punchout-worker.ts filters active company/employee and nondeleted employee; cloudflare-jobs.ts sweep omits those filters for existing open historical sessions. Preserve original-company policy; runtime payroll outcome still needs testing. |
| 11 | Unpersisted bootstrap-resume generations | AUTH-S25-001; BIZ-S25-007; QA-AUTH-S25-001 | Enhance | Auth login and sessionContext can create resume tokens; avoid mutation in GET and unpersisted process-local continuation. Reuse durable one-time challenge and restricted setup design. |
| 12 | Session created before company validation | AUTH-S25-002; TEN-S25-002/019; QA-AUTH-S25-001 | Enhance with qualification | AuthService.login creates JWT/session before later session-context validation. Validate company before normal issuance or clean up failure. This is orphan/partial-session risk; subsequent protected middleware can still deny it, so no privilege bypass is established here. |
| 13 | Inactive account discovery | AUTH-S25-006; QA-AUTH-S25-001 | Enhance | authenticatePassword checks employment_status before password and emits a distinct forbidden error. Use public generic failures and protected detailed audit, including timing partitions. |
| 14 | Unused signup invitation and company-email rule | AUTH-S25-001/003; TEN-S25-002 | Enhance | auth/schemas.ts accepts invite_token; reviewed service does not consume it. Bind actual invitation acceptance, company/work email/domain authority and expiry without creating a public privilege path. |
| 15 | Unbound password-reset company context | AUTH-S25-003/004; TEN-S25-002; QA-AUTH-S25-001 | Enhance | requestPasswordReset accepts company_slug lookup or latest global company. Derive/validate company from the intended account; never trust supplied branding/context to select authority. |
| 16 | Backend authorizes all assigned roles | TEN-S25-005; QA-AUTH-S25-001 | Approved behavior, not an active-role defect | DEC-031 explicitly requires the union of all currently assigned company roles. Preserve it. Selected Employee is UX preference; deny unassigned/stale roles, self-processing and foreign resources separately. Do not replace the accepted rule with active-role-only API privileges. |
| 17 | Unvalidated related documents/assets/projects/assignees | TEN-S25-006/007/012/014/016; EMS-S25-001 | Enhance | Trace leave and EMS document arrays plus helpdesk document/asset/project/assignee/category paths. Validate company, purpose, access and lifecycle before linking; no document ID alone proves attachment authority. |
| 18 | Declared file type and unsafe processing fallback | R2-S25-002 | Enhance | Current upload checks declared metadata; PDF detection accepts declaration/name and failed processing may retain original. Validate actual bytes and decoder outcomes; isolate parser with time/memory limits; no parser exploit was run. |
| 19 | Unbounded Cloudinary operations and advertised URL expiry | R2-S25-001; TEN-S25-020/022 | Enhance | Source adapter has unbounded provider calls/swallowed delete errors and returns permanent-style public URLs despite 900-second claim. Implement private storage expiry/revocation and bounded operations; hosted anonymous URL behavior remains untested. |
| 20 | Mail before durable auth commit | AUTH-S25-004; TEN-S25-001/023 | Enhance | EmailDeliveryService is invoked inline before response persistence. Commit token/delivery intent before external side effect; test acceptance followed by database failure and superseded generations. |
| 21 | Process-state webhook dedupe | MAIL-S25-007; TEN-S25-023 | Enhance | Resend webhook searches/appends the process store before persistence. Enforce company/provider-account/event receipt uniqueness and transactionally update delivery across two replicas. |
| 22 | Leave balance and range races | LV-S25-001; TEN-S25-014; BIZ-S25-012/014 | New domain transaction card | Leave submit reads balance and overlapping requests before mutation in process store. Tenant ownership alone is insufficient: serialize/reserve balance and ranges with rollback-safe outbox. |
| 23 | Timesheet daily totals, cycles, stale edits and Admin self-approval | BIZ-S25-008/009/011; TEN-S25-026 | Enhance existing distinct scopes | Daily aggregate limit, unique cycles, segment locking and approver independence already have separate cards. Add simultaneous edits/submission and explicit Admin self-approval denial; do not count a new full timesheet rewrite. |
| 24 | Lifecycle state/date and global hierarchy rewrite | CORE-S25-001/002; AUTH-S25-002 | New focused core cards | Core update allows status/date inconsistencies; updateManager iterates all prefix-matching users without company predicate. Validate all entry paths and update only scoped descendants in one transaction. |
| 25 | Employee import is metadata only | CORE-S25-003; TEN-S25-006/023/029 | New missing feature card | createImportJob writes a queued outbox payload and getImportJob presents it. No reviewed consumer parses/imports employees; input source document is not validated there. Add authorized source, bounded parser, preview/results, idempotent consumer and creation-policy reuse. |
| 26 | Unknown report fallback and invalid XLSX control text | EXPORT-S25-001; TEN-S25-008 | New focused format/contract card | Reports exportRows default calls register; generated-exports.ts:xmlText escapes markup but not XML-invalid control characters. Reject unknown report type and produce valid intended workbooks. No cross-role disclosure is inferred merely from fallback. |
| 27 | Public readiness details | OPS-S25-001 | New hardening card | health/routes.ts returns environment/build/dependency detail on public routes. Preserve minimal public status/200/503 and protect operator detail. This is information hardening; no credential leak or exploit was demonstrated. |
| 28 | Orphan software_products runtime model | LIC-S25-001 | Included in new licence foundation | software_products is declared in initial SQL migration but not represented/validated by the reviewed runtime licence paths. Require explicit product ownership/parity rather than unvalidated entitlement product IDs. Four other SQL-only table owners are not separate new defects merely because they are SQL-only. |
| 29 | Global company configuration | TEN-S25-005; MAIL-S25-001/020; existing auth/finance cards | Enhance existing scope | Workflow/templates/channels/security and finance governance still use global state. Maintain company overrides and security floor; the existing control-plane foundation is not estimated again per connector. |
| 30 | Legacy polling loop and bad interval | WORKER-S25-001; TEN-S25-023 | New safeguards plus existing cutover | run-outbox-worker.ts intentionally loops as a dedicated process; numberFromEnv accepts finite zero/negative values and setTimeout can spin quickly. Reject invalid intervals, support shutdown, prevent dual active topology; never move that endless loop into Cloudflare. |

## Missing cards added to Sprint 25

Rows A127:N141 contain 14 future delivery/QA cards (87 provisional SP) and one completed reconciliation row (8 SP). All are assigned to Anurag Kumar. Existing estimates are unchanged; no parent is counted again. The current full sprint roll-up is 940 SP: 86 completed discovery/planning, 854 pending, 0 blocked. This is allocation, not a one-person capacity promise.

| Row | Task | Role | Priority | SP | Status |
| --- | --- | --- | --- | --- | --- |
| 127 | AUD-S25-PLAN-001 - Reconcile the 30 supplied audit findings with Sprint 25 | Development | High | 8 | Completed |
| 128 | EMS-S25-001 - Scope EMS profiles, service requests and letters by company | Development | Critical | 8 | Planned |
| 129 | EMS-S25-002 - Scope EMS checklists, probation, policies and acknowledgements | Development | Critical | 8 | Planned |
| 130 | LIC-S25-001 - Authorize licence products, entitlements and device operations | Development | Critical | 8 | Planned |
| 131 | LIC-S25-002 - Reserve licence seats and device activations atomically | Development | Critical | 5 | Planned |
| 132 | LIC-S25-003 - Replace the offline licence placeholder with an approved contract | Development | High | 8 | Needs decision |
| 133 | FIN-S25-001 - Validate expense money signs, totals and payment bounds | Development | Critical | 5 | Needs decision |
| 134 | LV-S25-001 - Reserve leave balances and reject overlap in one transaction | Development | High | 8 | Planned |
| 135 | CORE-S25-001 - Enforce coherent employee lifecycle dates and status | Development | High | 5 | Planned |
| 136 | CORE-S25-002 - Update manager hierarchies atomically within the company | Development | High | 5 | Planned |
| 137 | CORE-S25-003 - Implement durable employee import with authorized source files | Development | High | 8 | Needs decision |
| 138 | EXPORT-S25-001 - Reject unknown report types and generate valid XLSX text | Development | High | 3 | Planned |
| 139 | OPS-S25-001 - Limit public health output and protect detailed readiness | Development | High | 3 | Planned |
| 140 | WORKER-S25-001 - Guard legacy polling and preserve historical auto-close policy | Development | High | 5 | Planned |
| 141 | QA-AUD-S25-001 - Verify EMS, licence, import and financial boundary repairs | QA | Critical | 8 | Planned |

## New card acceptance and dependencies

### AUD-S25-PLAN-001 - Reconcile the 30 supplied audit findings with Sprint 25

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Completed.
- Deliverable: Finding-to-task mapping, source qualifications, existing-card refinements and missing implementation/QA cards.
- Dependencies: Attached static report; source baseline 87618f88; docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md
- Acceptance and estimate basis: 8 SP: cross-component persistence, policy and failure verification. Planning/source recheck only; does not independently certify all 444 inventory rows or claim runtime exploitation. Estimate provisional 2026-11-11; uncommitted planning only.

### EMS-S25-001 - Scope EMS profiles, service requests and letters by company

- Owner: Anurag Kumar. Role: Development. Priority: Critical. Estimate: 8 SP. Status: Planned.
- Deliverable: Immutable company ownership and scoped SQL/policy for profile changes, service request decisions, letters and related documents.
- Dependencies: Audit 5/17; TEN-S25-001/002/006/016/017; AUTH/R2 foundations.
- Acceptance and estimate basis: 8 SP: cross-component persistence, policy and failure verification. Reject foreign record/document/employee IDs for HR/Admin/Auditor; original-company history survives transfer; transaction/audit/outbox agree. Estimate provisional 2026-11-11; implementation and QA pending.

### EMS-S25-002 - Scope EMS checklists, probation, policies and acknowledgements

- Owner: Anurag Kumar. Role: Development. Priority: Critical. Estimate: 8 SP. Status: Planned.
- Deliverable: Company-owned checklist/probation/policy/version/ack records and scoped admin lists, decisions and publication.
- Dependencies: Audit 5; TEN-S25-003/016/017; BIZ-S25-021/022/024.
- Acceptance and estimate basis: 8 SP: cross-component persistence, policy and failure verification. This card owns EMS isolation; evidence gates and policy materiality remain existing BIZ cards. Prove independent two-company HR/Admin denial. Estimate provisional 2026-11-11; implementation and QA pending.

### LIC-S25-001 - Authorize licence products, entitlements and device operations

- Owner: Anurag Kumar. Role: Development. Priority: Critical. Estimate: 8 SP. Status: Planned.
- Deliverable: Authenticated actor or approved device principal, company/product/entitlement checks, scoped revoke and software-product runtime/schema parity.
- Dependencies: Audit 6/28; TEN-S25-010/016/017; assets/routes.ts and service.ts.
- Acceptance and estimate basis: 8 SP: cross-component persistence, policy and failure verification. Guessed product/entitlement/fingerprint cannot activate, validate or revoke another company device. software_products must have validated runtime ownership. Estimate provisional 2026-11-11; implementation and QA pending.

### LIC-S25-002 - Reserve licence seats and device activations atomically

- Owner: Anurag Kumar. Role: Development. Priority: Critical. Estimate: 5 SP. Status: Planned.
- Deliverable: Transactional seat reservation, unique active device binding, idempotent activate/revoke and safe retry.
- Dependencies: Audit 6; LIC-S25-001; TEN-S25-001.
- Acceptance and estimate basis: 5 SP: contained domain/runtime change with boundary regressions. Parallel activations never exceed seats; same device retry reuses result; revoked/expired entitlement and concurrent revoke cannot validate active. Estimate provisional 2026-11-11; implementation and QA pending.

### LIC-S25-003 - Replace the offline licence placeholder with an approved contract

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Needs decision.
- Deliverable: Define signed offline claims, verification, expiry/revocation/key rotation or explicitly disable unsupported offline issuance.
- Dependencies: Audit 6; LIC-S25-001/002; owner must approve offline licensing need and trust model.
- Acceptance and estimate basis: 8 SP: cross-component persistence, policy and failure verification. Never return signed-dev-license-placeholder as a usable licence; no client secret/private key exposure. Tamper, expiry and replay tests after policy choice. Estimate provisional 2026-11-11; implementation and QA pending.

### FIN-S25-001 - Validate expense money signs, totals and payment bounds

- Owner: Anurag Kumar. Role: Development. Priority: Critical. Estimate: 5 SP. Status: Needs decision.
- Deliverable: Purpose-specific fixed-precision amount schemas, positive payments/advances, valid line totals and approved amount/adjustment rules.
- Dependencies: Audit 8; BIZ-S25-016 settlement owns paid-versus-actual reconciliation.
- Acceptance and estimate basis: 5 SP: contained domain/runtime change with boundary regressions. Do not ban negatives globally where an authorized ledger reversal needs a sign. Reject invalid financial inputs at schema/service/SQL; overpayment exception policy remains open. Estimate provisional 2026-11-11; implementation and QA pending.

### LV-S25-001 - Reserve leave balances and reject overlap in one transaction

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Planned.
- Deliverable: Employee/company-scoped balance reservation and range conflict enforcement across submit/approve/cancel/retry.
- Dependencies: Audit 22; TEN-S25-001/014/025; BIZ-S25-012/013/014.
- Acceptance and estimate basis: 8 SP: cross-component persistence, policy and failure verification. Competing requests cannot overspend or overlap; one loser has no balance/event side effect. Use configured year/half-day policy without guessing entitlements. Estimate provisional 2026-11-11; implementation and QA pending.

### CORE-S25-001 - Enforce coherent employee lifecycle dates and status

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Planned.
- Deliverable: Single validated lifecycle command and constraints for active/inactive/suspended/terminated state and effective dates.
- Dependencies: Audit 24; AUTH-S25-002; TEN-S25-003/019; BIZ-S25-024.
- Acceptance and estimate basis: 5 SP: contained domain/runtime change with boundary regressions. Reject impossible date/status pairs on create/update/import; termination and activation preserve proof/session rules and immutable history. Estimate provisional 2026-11-11; implementation and QA pending.

### CORE-S25-002 - Update manager hierarchies atomically within the company

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Planned.
- Deliverable: Company-scoped manager/descendant queries and versioned transactional tree updates with cycle prevention.
- Dependencies: Audit 24; TEN-S25-001/002/004/016.
- Acceptance and estimate basis: 5 SP: contained domain/runtime change with boundary regressions. A prefix collision or shared code cannot rewrite another tenant; reject foreign manager/cycles and prove concurrent reparent/rollback behavior. Estimate provisional 2026-11-11; implementation and QA pending.

### CORE-S25-003 - Implement durable employee import with authorized source files

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Needs decision.
- Deliverable: Bounded import parser, source-document authorization, mapping/preview/dry run, per-row outcomes and resumable consumer.
- Dependencies: Audit 25; TEN-S25-001/006/023/029; R2-S25-002; employee onboarding gates.
- Acceptance and estimate basis: 8 SP: cross-component persistence, policy and failure verification. Current queued metadata is not completion. Reuse employee creation policy; reject mass assignment/foreign refs/formulas/macros, duplicate rows and replay; import format/error policy needs refinement. Estimate provisional 2026-11-11; implementation and QA pending.

### EXPORT-S25-001 - Reject unknown report types and generate valid XLSX text

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 3 SP. Status: Planned.
- Deliverable: Explicit report-type contract and shared XML-safe export normalization with real workbook-open regression.
- Dependencies: Audit 26; TEN-S25-008/029; generated-exports.ts and reports/service.ts.
- Acceptance and estimate basis: 3 SP: focused endpoint/format contract with regression. Unknown type returns validation error with no fallback export. Control characters, ampersands, emoji and empty values produce valid intended XLSX; retain CSV formula safeguards. Estimate provisional 2026-11-11; implementation and QA pending.

### OPS-S25-001 - Limit public health output and protect detailed readiness

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 3 SP. Status: Planned.
- Deliverable: Minimal public live/ready status and protected operator diagnostics with bounded dependency checks.
- Dependencies: Audit 27; health/routes.ts; deployment health consumers/runbooks.
- Acceptance and estimate basis: 3 SP: focused endpoint/format contract with regression. Preserve public 200/503 health semantics while withholding environment/build/internal failure detail. Information-hardening finding; no secret leak/exploit demonstrated. Estimate provisional 2026-11-11; implementation and QA pending.

### WORKER-S25-001 - Guard legacy polling and preserve historical auto-close policy

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Planned.
- Deliverable: Positive bounded interval validation, graceful shutdown and legacy attendance sweep parity while that runner remains available.
- Dependencies: Audit 10/30; TEN-S25-023 owns queue migration/cutover; command-service auto-close policy.
- Acceptance and estimate basis: 5 SP: contained domain/runtime change with boundary regressions. Reject zero/negative/non-finite interval. Close historical open shifts for inactive/deleted/transferred users under original company; bounded Cloudflare jobs stay loop-free. Estimate provisional 2026-11-11; implementation and QA pending.

### QA-AUD-S25-001 - Verify EMS, licence, import and financial boundary repairs

- Owner: Anurag Kumar. Role: QA. Priority: Critical. Estimate: 8 SP. Status: Planned.
- Deliverable: Independent two-company/role browser and competing-request checks for the newly split EMS/licence/core/import/finance/leave/export/health/legacy paths.
- Dependencies: New EMS/LIC/FIN/LV/CORE/EXPORT/OPS/WORKER cards; QA-S25-003.
- Acceptance and estimate basis: 8 SP: cross-component persistence, policy and failure verification. Anurag coordinates a separate reviewer. Do not recount existing auth/R2/email QA; assert denied actions leave no audit/outbox/storage success or licence seats. Estimate provisional 2026-11-11; implementation and QA pending.

## Existing cards clarified without additive points

All earlier notes/estimates/status and actual dates are preserved. Five source-supported document/asset/approver boundary cards (rows 25, 26, 29, 41, 69) are now Critical. The following 29 cards receive path-level acceptance refinement:

| Row | Existing card | New clarification |
| --- | --- | --- |
| 21 | TEN-S25-002 - Separate person, company account and employment | (items 9,14,15): Bind account, work-email/domain, invitation and recovery context to persisted company ownership. Remove first/latest global company fallbacks; domain policy remains owner-approved, not inferred from a slug. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 24 | TEN-S25-005 - Isolate effective company Admin settings | (items 16,29): DEC-031 intentionally authorizes the union of currently assigned roles. Selecting Employee changes UX, not backend entitlement. Preserve union semantics while denying unassigned/stale roles and cross-company resources; do not implement active-role-only authorization. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 25 | TEN-S25-006 - Enforce document company and purpose authorization | (items 2,17): Replace role-wide allow branches in documents/policy.ts with company, business-object, classification and operation checks. Finance/Director/Asset Manager cannot read/delete unrelated files; assigned-HR rules apply to proofs; Auditor never gains write by a read grant. Denial precedes bytes and durable access audit records the decision. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 26 | TEN-S25-007 - Scope expense reads and attachment relationships | (items 3): For POST /expenses/:id/documents and attachVerifiedDocument, authorize the expense parent and document company/purpose before storage/link mutation. Reject guessed foreign or unrelated same-company tickets; failed relation checks leave no orphan bytes, links or success events. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 27 | TEN-S25-008 - Isolate reports and neutralize every CSV producer | (items 26): TEN-S25-008 retains report/company authorization and CSV neutralization. EXPORT-S25-001 separately owns strict report-type rejection and invalid XML controls; shared rendering must serve all export producers. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 29 | TEN-S25-010 - Scope the complete asset lifecycle | (items 7): The employee-terminated HTTP consumer currently accepts any logged-in actor. Require scoped HR/Admin or an authenticated service-event principal, a real eligible lifecycle event and idempotent recovery. Licensing auth/seat/offline contracts are split into LIC-S25-001/002/003. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 31 | TEN-S25-012 - Scope helpdesk tickets, categories and linked objects | (items 17): Validate every helpdesk document/asset/project/assignee/category relation against current company, access and purpose, including create/update/comments/category defaults. Internal notes remain private; reject dangling or foreign IDs before side effects. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 33 | TEN-S25-014 - Persist leave and WFH company ownership | (items 17,22): Validate leave/WFH document IDs through the common document policy. LV-S25-001 owns atomic balances/range conflict enforcement; this existing card keeps persisted company ownership and tenant reads/writes. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 35 | TEN-S25-016 - Authorize resources after middleware tenant resolution | (items 2,3,7,17): Resource authorization is required after login on direct and nested routes, not only via UI visibility or role checks. Include document links, expense attachment, termination consumer and EMS references in the two-company/role matrix. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 39 | TEN-S25-020 - Enforce protected document URL lifetime | (items 19): Static source returns permanent provider URLs despite expires_in_seconds=900. Private storage delivery must enforce current authorization, revocation and actual expiry; test copied URLs after role removal and after expiry. No live provider public-access test was executed. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 41 | TEN-S25-022 - Make document deletion recoverable | (items 4): Current hard delete removes metadata, versions and cross-module links after object deletion; EMS letter/policy guards exist, so deletion is not universally unrestricted. Replace ordinary deletion with retained soft-delete/history and retention-aware purge; provider errors must not silently remove metadata. Prove crash/retry and reference integrity. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 42 | TEN-S25-023 - Deduplicate outbox delivery and recover replay | (items 10,30): Legacy Render while-loop is a dedicated-process design, not a Cloudflare entry point. WORKER-S25-001 owns positive interval and historical auto-close parity. This card owns one active topology, old-worker shutdown, bounded Cloudflare queue jobs and duplicate-safe cutover; hosted coexistence is not verified. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 45 | TEN-S25-026 - Lock submitted timesheets and approve corrections | (items 23): Enforce submitted/approved segment immutability/version checks in API/SQL, including stale overwrite. BIZ-S25-008 owns total-day limits, BIZ-S25-011 owns cycles, BIZ-S25-009 owns independent approver rules. No silent Admin self-approval exemption. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 48 | TEN-S25-029 - Bound per-company resource use and SQL reads | (items 25): CORE-S25-003 owns the missing employee-import parser/consumer and durable row outcomes. This card owns common per-company resource admission and bounded SQL/export reads; do not count the entire import feature here again. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 62 | BIZ-S25-008 - Validate total daily timesheet hours, not only each segment | (items 23): Validate the sum across all employee/day segments, not only a single hours value. Use approved day/cycle rules and competing updates; no accepted over-24-hour day via multiple segments. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 63 | BIZ-S25-009 - Make configured timesheet routing and billable review effective | (items 23): Enforce self-approval denial even when actor has Admin unless an explicit independent authorized exception is approved. Selecting another UI role does not hide assigned privileges or waive workflow independence. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 65 | BIZ-S25-011 - Prevent overlapping submission cycles and repair resubmission | (items 23): Use durable employee/company/cycle uniqueness and transactional segment/submission links; duplicate or overlapping cycles and simultaneous resubmits cannot create multiple active approval versions. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 69 | BIZ-S25-015 - Keep every approval request routable after staffing changes | (items 9): Director, alternate and Finance fallback searches must stay inside the same company and preserve independent approver rules. An eligible global user is not an eligible tenant fallback; missing route blocks or follows approved reassignment policy. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 70 | BIZ-S25-016 - Reconcile expenses with actual disbursement and adjustments | (items 8): Use FIN-S25-001 for amount sign/precision and approved payment bounds. Settlement here compares actual disbursement to verified actuals and records refunds/additional payments separately; estimated amount is not automatically an approved overpayment ceiling. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 75 | BIZ-S25-021 - Require evidence before completing EMS checklists | (items 5): Full EMS company isolation is now explicit in EMS-S25-001/002. This card owns evidence-backed checklist completion, not all EMS authorization. Keep published-policy versions and original-company records after transfer. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 79 | R2-S25-001 - Replace Cloudinary with private Cloudflare R2 | (items 19): Active adapter removal must replace unbounded Cloudinary requests and swallowed deletion outcomes with bounded private-object operations. Do not claim a returned public URL has a 900-second lifetime; lifecycle and delivery policy remain TEN-S25-020/022. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 80 | R2-S25-002 - Validate and bound uploaded file content and processing | (items 18): Validate actual signatures/decode/size/hash before processing, isolate risky PDF/image parsers and enforce memory/time budgets. Fake PDF, malformed image and processing failure cannot silently fall through as trusted proof. Exploitation remains untested. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 83 | AUTH-S25-001 - Bind signup ownership and consume challenges atomically | (items 11,14): Do not mint new unpersisted bootstrap tokens on each login or GET /auth/me. Use durable, purpose-bound resumable setup with atomic consume and bounded generations; pending-company reservation and app-token ownership remain authoritative. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 84 | AUTH-S25-002 - Preserve access lifecycle through password setup and reset | (items 12): Resolve valid current company/employment/account context before issuing a normal JWT/cookie and creating its session. If later session setup fails, revoke/clean the partial record. Current ordering is an orphan-session risk; protected middleware may still deny it, so no bypass is asserted. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 85 | AUTH-S25-003 - Implement company-bound employee invitations | (items 1,14,15): enableLogin currently creates a token but invite_sent=false, and signup invite_token is accepted but unused. Bind and validate invite acceptance, deliver after commit via selected company connection and reject foreign/expired/revoked invitation or reset company context. No first active company fallback. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 86 | AUTH-S25-004 - Commit auth delivery intents and recover mail failures | (items 20): External mail must follow the committed auth-token/intent transaction. Inject provider acceptance then DB failure/restart and reordered replacement generations; no invalid durable link or false sent claim. Reuse shared queue/delivery foundation rather than duplicate transport. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 88 | AUTH-S25-006 - Persist auth security events and enforce credential policy | (items 13): authenticatePassword checks inactive state before password verification and returns a distinct error. Make public login failures enumeration-safe across absent/wrong-password/inactive states and keep detailed reason only in scoped security audit; measure relevant timing partitions. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 90 | QA-AUTH-S25-001 - Verify auth recovery and authorization across all feature groups | (items 11,12,13,14,15,16): Add malformed membership login/no-orphan-session, unpersisted resume, inactive-account enumeration, ignored invitation and wrong-company reset cases. Preserve DEC-031 assigned-role union; test unassigned-role attempts and resource denial instead of flagging UI Employee mode as privilege escalation. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |
| 99 | MAIL-S25-007 - Normalize provider events and reconcile delivery state | (items 21): Persist provider-event receipt under a company/provider-account/event unique key and update delivery in the same transaction. Two replicas or replay before commit apply once logically; correlate only within that provider account/company; memory dedupe is insufficient. See docs/discovery/audit-findings-sprint-25-reconciliation-2026-11-11.md. Source-only; fix and runtime QA pending. |

## Implementation order and completion evidence

1. Reuse existing company identity, SQL transaction/repository, RLS, resource policy, durable auth and storage foundations. Add explicit company ownership to EMS and licence products/entitlements before allowing their privileged operations.
2. Fix direct parent/resource authorization and retention first: document reads/deletes, expense attachment parent, asset termination event and foreign approver fallback. A successful login or broad role never substitutes for resource ownership.
3. Implement domain transaction invariants: licence seats/devices, leave reservation/range conflicts, core lifecycle dates and hierarchy updates. Include two replicas, simultaneous requests, stale versions and rollback.
4. Finish actual import and strict export contracts; preserve activation/evidence gates and CSV controls. Offline licence semantics, payment exceptions and import partial-failure policy remain Needs decision.
5. Apply existing auth/R2/mail refinements, minimal readiness diagnostics and safe legacy worker configuration/parity. Single-active-worker cutover is owned by TEN-S25-023; no hosted topology was changed.
6. Anurag coordinates QA-AUD-S25-001 with a reviewer separate from implementation author. Existing QA-AUTH, QA-R2 and QA-MAIL still own their suites. Use synthetic tenants and actual role-browser journeys plus competing-request/boundary tests; do not call a static report or self-review independent acceptance.

Development cards include meaningful unit/branch regressions and appropriate SQL/HTTP boundaries. Separate QA estimates cover independent acceptance, not the same unit effort again. No future implementation row has an actual start/end date or implementation commit. Needs decision rows stay pending until their business oracle is resolved.

## Source entry points

- [Core lifecycle/import/hierarchy/invitation](../../hrms_backend/src/modules/core/service.ts)
- [Document policy](../../hrms_backend/src/modules/documents/policy.ts), [routes](../../hrms_backend/src/modules/documents/routes.ts), [lifecycle](../../hrms_backend/src/modules/documents/service.ts), [storage](../../hrms_backend/src/platform/object-storage.ts)
- [EMS policy](../../hrms_backend/src/modules/ems/policy.ts) and [service](../../hrms_backend/src/modules/ems/service.ts)
- [Assets routes](../../hrms_backend/src/modules/assets/routes.ts) and [licence/termination service](../../hrms_backend/src/modules/assets/service.ts)
- [Money input](../../hrms_backend/src/shared/schemas.ts) and [expense payment/attachment paths](../../hrms_backend/src/modules/expenses/service.ts)
- [Auth service](../../hrms_backend/src/modules/auth/service.ts), [schema](../../hrms_backend/src/modules/auth/schemas.ts), [delivery](../../hrms_backend/src/platform/email/email-delivery-service.ts), [webhook](../../hrms_backend/src/platform/email/resend-webhook-service.ts)
- [Leave/WFH](../../hrms_backend/src/modules/leave-wfh/service.ts), [timesheet policy](../../hrms_backend/src/modules/timesheets/policy.ts), [service](../../hrms_backend/src/modules/timesheets/service.ts), [helpdesk](../../hrms_backend/src/modules/helpdesk/service.ts)
- [Report export dispatch](../../hrms_backend/src/modules/reports/service.ts), [XLSX renderer](../../hrms_backend/src/platform/generated-exports.ts), [public health](../../hrms_backend/src/modules/health/routes.ts)
- [Legacy runner](../../hrms_backend/src/workers/run-outbox-worker.ts), [legacy sweep](../../hrms_backend/src/workers/attendance-auto-punchout-worker.ts), [Cloudflare jobs](../../hrms_backend/src/workers/cloudflare-jobs.ts), [initial SQL product table](../../hrms_backend/src/db/migrations/0001_initial.sql)

## Tracker and verification

The [shared Sprint 25 tab](https://docs.google.com/spreadsheets/d/1dr5qLKxq5IGIZAyIAdMlcDYDfld-LYxfvSHkKw1jBnA/edit?gid=1812876151) contains new rows 127–141 and the 29 existing refinements above. SP Calculation row 19 records the new checkpoint; formulas recalculate affected totals. The basic filter includes A1:N141.

[Verification record](../../qa-artifacts/hrms/audit-reconciliation-2026-11-11/verification.md): native readback matched all 15 new rows; saved export checked owners, unique IDs, estimates, blank future dates, formulas and preserved unrelated values. Source/documentation only; no fix, exploit, browser application journey, concurrency, hosted check or deployment was executed.
