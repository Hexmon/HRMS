# Hawkaii HRMS — Business Rule Catalogue

Commit: `18fdc1bfd9144e98628d96411942918470a593f1`  
Status: Stage 1 discovery; all runtime behavior is statically observed and unexecuted.

No reviewed source supplies a named authorized owner and decision date for the 25 historical BLQs. Consequently this catalogue contains no `CONFIRMED_BUSINESS_RULE`. Code-defined behaviors are `IMPLEMENTED_RULE`; contested or missing expected behavior is `NEEDS_BUSINESS_CONFIRMATION`.

## Rule inventory

### BR-ROLE-001 — Reviewer/Manager compatibility

- **Classification:** `NEEDS_BUSINESS_CONFIRMATION`
- **Actor/context:** Manager/Reviewer across frontend navigation and backend policies.
- **Implemented behavior:** Backend role constant is `Reviewer`; frontend normalizes `reviewer` to local `manager` and maps local Manager back to `Reviewer`.
- **Evidence:** `hrms_backend/src/shared/constants.ts::Roles` lines 1–10; `hrms-client/src/lib/auth.tsx::API_ROLE_BY_NORMALIZED` lines 165–190.
- **Intended oracle:** Historical confirmed file says Reviewer is the backend source-of-truth compatibility role; BLQ inline text asks to remove Reviewer. No owner/date resolves the conflict.
- **Risk/questions:** R-01, DEC-PO-01; role/action matrix changes if Reviewer remains a compatibility alias versus a distinct business role.

### BR-EXP-002 — Expense actors cannot process their own request

- **Classification:** `IMPLEMENTED_RULE`
- **Actor/context:** Requester acting as assigned Manager, Finance, payment releaser, or settlement actor.
- **Implemented behavior:** `assertNoSelfProcessing()` rejects manager verification, finance approval, payment release, and settlement close when actor equals requester. Submission resolves an active non-requester Manager and Finance actor or valid backup.
- **Evidence:** `hrms_backend/src/modules/expenses/policy.ts::assertNoSelfProcessing` lines 5–19; `service.ts::submit` lines 341–403.
- **Intent/oracle:** Separation is historically desired; minimum staffing, Admin exceptions, and routing-exception behavior remain unapproved.
- **Risk/questions:** R-08, DEC-FIN-01.

### BR-EXP-003 — Expense v1 state sequence

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** The active path is requester submission → assigned Manager decision → assigned Finance decision → payment release → bill submission/settlement. Director is not a mandatory state.
- **Evidence:** `hrms_backend/src/modules/expenses/state-machine.ts`; `service.ts::managerVerify` line 1214, `financeApprove` line 1260, `releasePayment` line 1322, `settle` line 1409.
- **Intent/oracle:** Broadly agrees with historical comment; detailed terminal/return/clarification semantics need Finance approval.
- **Risk/questions:** R-08, DEC-FIN-01.

### BR-ADMIN-004 — Admin workflow configuration is not universal runtime authority

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** Admin workflows persist through Admin repository/service. Searches outside Admin/persistence do not show Expense or Leave consuming `adminWorkflows`; Timesheets use separate workflow definitions and Attendance resolves policies/versions.
- **Evidence:** `hrms_backend/src/modules/admin/service.ts` workflow methods around lines 357–395; `src/modules/admin/repository.ts`; `src/modules/timesheets/service.ts::upsertWorkflow` line 530.
- **Intent/oracle:** Historical documentation already cautions that persistence does not prove runtime authority.
- **Risk/questions:** DEC-PO-01; later tests must distinguish configuration CRUD from actual routing changes.

### BR-ATT-005 — Off-day work is visible and can offset weekly shortage

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** Weekly calculations apply off-day worked time against weekday shortage and retain excess as overtime/visibility data.
- **Evidence:** `hrms_backend/src/modules/attendance/service.ts` weekly balance logic around lines 4043–4103.
- **Intent/oracle:** Whether this creates comp-off or payroll credit is not approved.
- **Risk/questions:** R-10, DEC-HR-01.

### BR-ATT-006 — Attendance targets derive from company/policy with shift overrides

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** Modern Attendance resolves a company-scoped policy version and versioned shift assignment; company working week/hours supply defaults.
- **Evidence:** `hrms_backend/src/modules/attendance/command-service.ts::resolveEffectiveAttendancePolicy` call lines 781–785; `attendance-shift-resolver.unit.test.ts` as test-source evidence only.
- **Intent/oracle:** Historical default broadly agrees, but precedence and effective-date rules need HR/Engineering confirmation.
- **Risk/questions:** R-10, DEC-HR-01.

### BR-ATT-007 — Cross-midnight work-date attribution is inconsistent across artifacts

- **Classification:** `NEEDS_BUSINESS_CONFIRMATION`
- **Implemented behavior:** An open session retains its original `work_date`, but online checkout computes `workDate` from server receipt and passes that date to `projectDay()` and the outbox event. Regularization rejects timestamps whose local calendar date differs from the requested `workDate`.
- **Evidence:** `hrms_backend/src/modules/attendance/command-service.ts` lines 779–786, 1157–1219, and 2166–2210.
- **Intent/oracle:** Historical rule says all cross-midnight attendance stays on check-in work date. Execution evidence and an approved detailed rule are absent.
- **Risk/questions:** R-10, DEC-HR-01.

### BR-LEAVE-008 — Admin leave preview is read-only

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** Admin exposes calculated preview without a mutation path for the computed result; Leave service uses fixed/default entitlements and active policy config.
- **Evidence:** `hrms_backend/src/modules/admin/service.ts` calculation preview around lines 1536–1558; `src/modules/leave-wfh/service.ts::leaveEntitlements` lines 549–560.
- **Intent/oracle:** Accrual, carry-forward, encashment, probation, and negative-balance formulas remain TBD.
- **Risk/questions:** R-09, DEC-HR-01.

### BR-LEAVE-009 — Holiday applicability is not company/region-complete

- **Classification:** `NEEDS_BUSINESS_CONFIRMATION`
- **Implemented behavior:** Holiday CRUD lists by actor company, but calculation uses the first active company and every nonoptional holiday in the global store; region is not evaluated.
- **Evidence:** `hrms_backend/src/modules/leave-wfh/service.ts::listHolidays` lines 427–447 and `activeCompany/holidayDates` lines 563–576.
- **Intent/oracle:** Historical comment says `region=All` is global and optional is display-only; company/region scope remains contradicted by current calculation.
- **Risk/questions:** R-09, DEC-HR-01.

### BR-TIME-010 — Under/over timesheets can be submitted and are reported

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** A segment is limited to greater than zero and at most 24 hours; submission requires segments but does not block variance from expected hours. Analytics expose missing/variance/under-submitted state.
- **Evidence:** `hrms_backend/src/modules/timesheets/service.ts::createSegment` lines 110–124; `submit` lines 133–191; analytics around lines 613–676.
- **Intent/oracle:** Broadly matches historical comment. Payroll/product consequences of over-submission remain unapproved.
- **Risk/questions:** DEC-HR-01.

### BR-PROJ-011 — Over-allocation requires explicit acknowledgement

- **Classification:** `NEEDS_BUSINESS_CONFIRMATION`
- **Implemented behavior:** Allocation above 100% is saved only when an acknowledgement is supplied; reason is recorded in notes/outbox. No additional approval request/state exists.
- **Evidence:** `hrms_backend/src/modules/projects/service.ts` lines 90–103 and 244–390.
- **Intent/oracle:** `BUSINESS_RULES_CONFIRMED` agrees with acknowledgement; BLQ inline text also asks for a request/approval flow.
- **Risk/questions:** DEC-PO-01.

### BR-PROJ-012 — Project cost center is optional and not auto-filled

- **Classification:** `NEEDS_BUSINESS_CONFIRMATION`
- **Implemented behavior:** Create/update stores supplied `cost_center` or null; department defaults from the manager, but cost center is not derived from department.
- **Evidence:** `hrms_backend/src/modules/projects/service.ts` lines 127–139 and 184–203.
- **Intent/oracle:** Historical direction asks for department-based autofill, which code does not implement.
- **Risk/questions:** DEC-PO-01.

### BR-DOC-013 — Authorized deletion warns and performs a hard delete

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** UI displays an irreversible-action confirmation. Service validates write access and limited EMS references, deletes object storage, then hard-deletes SQL/in-memory document records and appends an outbox event.
- **Evidence:** `hrms-client/src/routes/_app/ems.documents.tsx` lines 149–175 and 362–382; `hrms_backend/src/modules/documents/service.ts::delete` lines 294–407.
- **Intent/oracle:** Which classifications/record states are legally deletable and whether Auditor can delete remain unapproved.
- **Risk/questions:** R-05, R-06, R-14, DEC-SEC-01.

### BR-PRIV-014 — General retention cleanup is unspecified

- **Classification:** `NEEDS_BUSINESS_CONFIRMATION`
- **Implemented behavior:** Document access, email events, audit/outbox records, and generated exports are persisted; no general retention/cleanup policy was found. Attendance coordinates have a distinct configured purge workflow.
- **Evidence:** `hrms_backend/src/workers/attendance-coordinate-purge-worker.ts`; `src/modules/documents/service.ts`; `src/platform/generated-exports.ts`.
- **Intent/oracle:** Historical comment explicitly deferred automatic cleanup, but no owner/date/retention policy exists.
- **Risk/questions:** R-14, DEC-SEC-01.

### BR-STOR-015 — Hosted environments require real Cloudinary

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** Configuration rejects mock uploads outside local/development and in production; Render production sets `CLOUDINARY_MOCK_UPLOADS=false`.
- **Evidence:** `hrms_backend/src/plugins/config.ts` lines 126–166; `render.yaml` lines 56–65 and 124–133.
- **Intent/oracle:** Broadly agrees with historical comment. Deployed secret/config state remains unverified.
- **Risk/questions:** R-06, DEC-SRE-01.

### BR-AUTH-016 — Hosted verification requires explicit user confirmation

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** Verification token links auto-submit only in local/development experience; hosted UI presents a confirm action.
- **Evidence:** `hrms-client/src/routes/verify-email.tsx` lines 62–108 and 251–260.
- **Intent/oracle:** Agrees with historical comment; email delivery availability is a separate unresolved condition.
- **Risk/questions:** R-03, DEC-SRE-01.

### BR-RBAC-017 — Hard-coded backend policy remains authoritative

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** Services enforce role-specific policy functions; configurable RBAC records do not replace these checks for sensitive workflows.
- **Evidence:** `hrms_backend/src/modules/documents/policy.ts`; `expenses/policy.ts`; `leave-wfh/policy.ts`; `ems/policy.ts`.
- **Intent/oracle:** Broadly agrees with historical comment. Desired long-term authority of custom RBAC remains a Product/Architecture question.
- **Risk/questions:** R-01, R-05, DEC-PO-01.

### BR-HELP-018 — Helpdesk SLA values are code constants

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** Priority maps to response/resolution hours in `SLA_MATRIX`; API reports return that matrix and computed due states.
- **Evidence:** `hrms_backend/src/modules/helpdesk/service.ts::SLA_MATRIX` lines 68–73 and `computeSla` around lines 523–547.
- **Intent/oracle:** No owner-approved thresholds/escalation calendar were located; tests may observe API values but cannot assert business correctness.
- **Risk/questions:** DEC-PO-01.

### BR-NOTIF-019 — Notification feed is user-owned and code-event limited

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** Notifications list/filter by target user and owned IDs; read transitions use version checks. Title/category support only known emitted event names.
- **Evidence:** `hrms_backend/src/modules/notifications/repository.ts` lines 13–68; `service.ts` lines 31–131.
- **Intent/oracle:** Full event-to-channel matrix and configured notification-channel authority are not approved.
- **Risk/questions:** DEC-PO-01.

### BR-REPORT-020 — Exports are on demand

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** Report APIs synchronously render CSV/XLSX to a document and append an export outbox event. No export scheduler/cleanup job was located.
- **Evidence:** `hrms_backend/src/modules/reports/service.ts::createExport` lines 850–885; `src/platform/generated-exports.ts` lines 33–130.
- **Intent/oracle:** Agrees with historical comment; retention and large-export operating model remain TBD.
- **Risk/questions:** R-02, R-06, R-14, DEC-SEC-01/DEC-SRE-01.

### BR-EMS-021 — Contact/address profile fields allow direct edits

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** Personal email, phones, addresses, city, and country are accepted by direct patch with optimistic versioning. The same field family can also be submitted through an HR approval request.
- **Evidence:** `hrms_backend/src/shared/schemas.ts::emsProfilePatchSchema` lines 70–89; `src/modules/ems/service.ts::patchMyProfile/createProfileChangeRequest` lines 82–112.
- **Intent/oracle:** Historical default says backend-accepted direct edits are allowed; why both paths exist and which UI chooses which path need Product/HR confirmation.
- **Risk/questions:** DEC-HR-01.

### BR-ASSET-022 — Recovery settlement is currently Asset/Admin-owned

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** Asset recovery can settle as deduction/waived/lost/recovered through Asset Manager/Admin paths; no Finance approval or payroll write was located.
- **Evidence:** `hrms_backend/src/modules/assets/service.ts` lines 365–455.
- **Intent/oracle:** Broadly agrees with historical deferral of payroll integration; financial meaning of deduction remains owner-unapproved.
- **Risk/questions:** DEC-FIN-01.

### BR-DOCS-023 — Production OpenAPI/docs are private by configuration

- **Classification:** `IMPLEMENTED_RULE`
- **Implemented behavior:** Auth allowlists docs only when `OPENAPI_PUBLIC` is true; Render production sets false.
- **Evidence:** `hrms_backend/src/plugins/auth.ts` lines 46–54; `render.yaml` lines 34–35.
- **Intent/oracle:** Contradicts the historical default to keep existing public behavior; deployed setting remains unverified.
- **Risk/questions:** R-15, DEC-SRE-01.

### BR-TENANT-024 — Production mocks/seeds are guarded, but empty-company isolation is incomplete

- **Classification:** `NEEDS_BUSINESS_CONFIRMATION`
- **Implemented behavior:** Production client mock fallback is disabled, Render does not enable automatic seed, and worker sets `seedIfEmpty=false`. Core and Attendance are company-scoped, but older global modules/reports can still select unrelated records.
- **Evidence:** `hrms-client/src/shared/api/config.ts`; `hrms_backend/src/workers/run-outbox-worker.ts` lines 26–59; `src/modules/reports/service.ts` lines 371–379 and 522–561.
- **Intent/oracle:** Historical requirement is an empty real organization workspace. Source safeguards reduce demo-data risk but do not establish end-to-end tenant isolation.
- **Risk/questions:** R-01, R-02, DEC-PO-01/DEC-ARCH-01.

### BR-CLIENT-025 — Desktop and responsive mobile web are in scope; exact support is TBD

- **Classification:** `NEEDS_BUSINESS_CONFIRMATION`
- **Implemented behavior:** Responsive UI and Playwright specs cover many desktop/mobile attendance and critical routes. Native mobile is not claimed shipped; backend offline/mobile-ready contracts exist.
- **Evidence:** `hrms-client/e2e/mobile-responsive/mobile-responsive.spec.ts`; `attendance-mobile-responsive.spec.ts`; `docs/release/sprint-15-attendance-release-notes.md`.
- **Intent/oracle:** Historical comment prioritizes both desktop and mobile screen sizes but provides no browser/device/accessibility matrix.
- **Risk/questions:** R-12, R-15, DEC-QA-01.

## Cross-cutting invariants requiring owner approval

- Tenant A activity must not change or disclose Tenant B data: `TBD — DEC-PO-01/DEC-ARCH-01`.
- Auditor must be read-only or have explicitly bounded write/verify privileges: `TBD — DEC-SEC-01`.
- Financial self-processing and duplicate settlement are prohibited; exact backup/emergency rules: `TBD — DEC-FIN-01`.
- Attendance evidence that enters payroll and handling of post-lock corrections: `TBD — DEC-HR-01`.
- Deactivated/terminated users' existing sessions and roles must behave according to an approved revocation rule: `TBD — DEC-SEC-01/DEC-ARCH-01`.
- External object/database partial states must have an approved compensation/reconciliation rule: `TBD — DEC-ARCH-01/DEC-SRE-01`.
- Outbox delivery is documented as at least once; consumer deduplication and DLQ replay are `TBD — DEC-ARCH-01/DEC-SRE-01`.

No entry above is an execution result or release acceptance decision.
