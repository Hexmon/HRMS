# Sprint 25 Business-Rule Gaps And Recommended Resolutions

Date: 2026-11-10. Owner: **Anurag Kumar**. Branch: `sprint-25/saas-s25-001`. Source baseline: `324eefdc` (runtime source unchanged from that revision during this review). Review artifact: **BR-S25-001**. Scope: seven selected gaps plus **17 additional source-backed gaps or policy questions**, 24 cards in total. These are finite source-review results, not an exhaustive assurance claim, reproduced application defects, or completed fixes.

## Read This Before Implementation

Use [owner decisions](owner-decisions.md) for approved intent; DEC-021–029 below were explicitly answered during this review. Each card separates observed implementation from target behavior and unresolved policy. **Approved direction does not mean implemented or runtime verified.** Other recommendations are `NEEDS_BUSINESS_CONFIRMATION`; code facts are `IMPLEMENTED_RULE` evidence, not an acceptance oracle by themselves. Preserve all original 35 TEN cards and their confidence/evidence. Cards 001–007 refine existing work rather than add duplicate implementations; 008–024 are new business-rule backlog references.

Historical `qa/BUSINESS_RULES_CONFIRMED.md`, `qa/BUSINESS_LOGIC_QUESTIONS.md` and October discovery artifacts remain historical. BLQ-009's broad holiday behavior does not override DEC-008; BLQ-008's read-only preview does not establish live accrual math; BLQ-011 does not define aggregate approval authority; deletion guidance does not authorize removing immutable payroll/audit history. Resolve conflicts through a dated owner decision, not a rewritten historical answer.

Enforce rules across **middleware/current actor -> resource authorization -> service policy/state machine -> repository/SQL transaction -> audit/outbox -> consumer/read model -> UI**. A role or company check at middleware alone cannot validate dates, amounts, lifecycle or ownership of related objects. Database constraints alone cannot choose business policy. Denied or failed writes must not leave domain, audit, outbox or object-storage success artifacts.

## Review Index

| ID | Topic | Priority | Workstream | Current evidence | Existing work / authority |
| --- | --- | --- | --- | --- | --- |
| BIZ-S25-001 | Lock submitted timesheets and approve corrections | P1 | W08 | Approved-rule implementation gap | TS-INT-008 / TEN-S25-026; DEC-009, DEC-021 |
| BIZ-S25-002 | Use effective employee office calendars | P1 | W08 | Approved-rule implementation gap | SAAS-CAL-009 / TEN-S25-025; DEC-008 |
| BIZ-S25-003 | Resolve genuine worked-time and leave conflicts before payroll | P1 | W08 | Approved-rule implementation gap | LV-INT-015 / TEN-S25-027; DEC-010 refined by DEC-022 |
| BIZ-S25-004 | Define notification delivery and recipient coverage | P1 | W10 | Coverage and product-contract gap | NOTIF-COV-021 / WORKER-REL-024; NEEDS_BUSINESS_CONFIRMATION: DEC-BQ05 |
| BIZ-S25-005 | Prove stale-session denial across replicas and tabs | P1 | W05 | Verification gap and source-supported race/scale risk | AUTH-OBS-003 / AUTH-REV-025 / TEN-S25-019; Current authorization invariant; consistency/outage policy pending DEC-BQ06 |
| BIZ-S25-006 | Upload leave evidence before claiming it is attached | P1 | W06/W08 | Source-confirmed UI/API mismatch | LV-UX-010 (existing finding outside original 35); Recommended evidence-integrity requirement; required categories pending DEC-Q05 |
| BIZ-S25-007 | Recover interrupted company onboarding | P1 | W04/W06 | Source-supported failure risk; no browser reproduction | AUTH-OBS-002 / MEDIA-CONS-026; Recommended recoverable setup; bootstrap Admin exception pending DEC-BQ13 |
| BIZ-S25-008 | Validate total daily timesheet hours, not only each segment | P1 | W08 | Source-confirmed missing aggregate guard | New BIZ-S25-008; related TS-INT-008; NEEDS_BUSINESS_CONFIRMATION: DEC-BQ02 |
| BIZ-S25-009 | Make configured timesheet routing and billable review effective | P1 | W05/W08 | Approved-rule implementation gap | New BIZ-S25-009; related SAAS-CTRL-019; DEC-028 |
| BIZ-S25-010 | Validate project eligibility before accepting timesheet work | P1 | W07/W08 | Source-confirmed validation gap; target policy proposed | New BIZ-S25-010; related SAAS-PROJ-016; NEEDS_BUSINESS_CONFIRMATION: DEC-BQ02/08 |
| BIZ-S25-011 | Prevent overlapping submission cycles and repair resubmission | P1 | W08 | Source-confirmed service/schema mismatch | New BIZ-S25-011; related TS-INT-008; DEC-009, DEC-027; cycle boundaries pending DEC-BQ02 |
| BIZ-S25-012 | Split leave debits across leave years and version the ledger | P1 | W08 | Source-confirmed calculation mismatch plus undecided entitlement policy | New BIZ-S25-012; related SAAS-CAL-009; DEC-023 |
| BIZ-S25-013 | Represent half-day leave and WFH in attendance correctly | P1 | W08 | Source-confirmed loss of duration detail at projection boundary | New BIZ-S25-013; related LV-INT-015; DEC-008/022; half-day definitions pending DEC-BQ03 |
| BIZ-S25-014 | Support leave returns, approved cancellation and reversals | P1 | W08 | Approved-rule implementation gap | New BIZ-S25-014; related LV-INT-015; DEC-027 |
| BIZ-S25-015 | Keep every approval request routable after staffing changes | P1 | W04/W05/W08 | Source-confirmed routing gap; lifecycle matrix incomplete | New BIZ-S25-015; related SAAS-CTRL-019; DEC-012/028 for their domains; leave fallback pending DEC-BQ04 |
| BIZ-S25-016 | Reconcile expenses with actual disbursement and adjustments | P0 | W06 | Approved-rule implementation gap | New BIZ-S25-016; related SAAS-FIN-012; DEC-024 |
| BIZ-S25-017 | Make asset fulfillment create the real assignment | P1 | W07 | Approved-rule implementation gap | New BIZ-S25-017; related SAAS-ASSET-017; DEC-025 |
| BIZ-S25-018 | Separate asset custody, maintenance and financial recovery | P1 | W07 | Approved-rule implementation gap | New BIZ-S25-018; related SAAS-ASSET-017; DEC-025 |
| BIZ-S25-019 | Apply the same helpdesk priority rules through every endpoint | P1 | W07 | Approved-rule implementation gap | New BIZ-S25-019; related SAAS-HD-018; DEC-026 |
| BIZ-S25-020 | Define helpdesk SLA clocks, holds and reopen behavior | P1 | W07 | Implemented behavior needing business confirmation | New BIZ-S25-020; related SAAS-HD-018; NEEDS_BUSINESS_CONFIRMATION: DEC-BQ11 |
| BIZ-S25-021 | Require evidence before completing EMS checklists | P1 | W04 | Approved-rule implementation gap | New BIZ-S25-021; related SAAS-EMP-004; DEC-007, DEC-029 |
| BIZ-S25-022 | Bind employee policy acknowledgement to a published version | P1 | W04 | Approved-rule implementation gap | New BIZ-S25-022; DEC-029 |
| BIZ-S25-023 | Calculate project capacity from dates and scheduled hours | P1 | W07/W09 | Source-confirmed calculation/validation gap; policy details proposed | New BIZ-S25-023; related SAAS-CAL-009; DEC-008; over-allocation authority pending DEC-BQ08 |
| BIZ-S25-024 | Validate real business dates and probation extension chronology | P1 | W04/W08 | Source-confirmed schema/chronology gap; API persistence untested | New BIZ-S25-024; Recommended boundary invariant; probation chronology pending DEC-BQ12 |

## Rule Cards

All cards belong to Sprint 25 / Anurag Kumar. Priority is provisional risk ordering. Implementation status is **Open**; product authority is stated separately. Unit and boundary cases are **proposed, Not run**. No estimate or actual implementation date is invented.

### BIZ-S25-001 — Lock submitted timesheets and approve corrections

- Finding: **Approved-rule implementation gap**. Rule authority: DEC-009, DEC-021. Mapping: TS-INT-008 / TEN-S25-026; SAAS-S25-W08.
- Current source: `hrms_backend/src/modules/timesheets/service.ts` — createSegment, submit, presentSubmission; `hrms_backend/src/modules/timesheets/repository.ts` — addSegment. createSegment validates hours but not submission status; addSegment overwrites the matching employee/date/project/task/billable row. Submission total_hours is captured separately from live detail.
- Recommended resolution / approved target where cited: Reject direct changes to submitted/approved segments. Corrections create a proposed new revision; the original approver approves, and Finance must also approve when payroll/billing is locked. Retain the old revision and use an auditable adjustment instead of silently rewriting a locked period.
- Unit input -> expected output: Submitted/approved segment edit -> conflict and unchanged rows/totals; approved correction -> new revision with old revision retained; locked correction without Finance decision -> blocked.
- Integration/browser/failure cases: Race submit versus edit, two correction decisions, approver removal, stale browser tab and reporting against both revisions.
- Decision boundary: DEC-Q10 is partly resolved by DEC-021; unavailable-original-approver delegation and posting to a locked period remain DEC-BQ04.

### BIZ-S25-002 — Use effective employee office calendars

- Finding: **Approved-rule implementation gap**. Rule authority: DEC-008. Mapping: SAAS-CAL-009 / TEN-S25-025; SAAS-S25-W08.
- Current source: `hrms_backend/src/modules/leave-wfh/service.ts` — activeCompany, workingWeek, holidayDates, requestDurationDays; `hrms_backend/src/modules/timesheets/service.ts` — activeCompany, holidayDates. The selected helpers choose the first active company and a broad holiday list, rather than the employee's office effective on the work date.
- Recommended resolution / approved target where cited: Resolve office, timezone, working week and effective policy for each work date. Preserve the version used at approval; calendar edits must not silently recalculate historical approved records.
- Unit input -> expected output: Same date at two offices with different holidays -> different valid duration/expected hours; office change inside range -> split by effective date; no assigned calendar -> explicit exception.
- Integration/browser/failure cases: Two-company calendar isolation, cross-midnight shift, office transfer, holiday edit after approval and payroll reconciliation.
- Decision boundary: DEC-Q11: office-change effective date and missing-office fallback need HR confirmation.

### BIZ-S25-003 — Resolve genuine worked-time and leave conflicts before payroll

- Finding: **Approved-rule implementation gap**. Rule authority: DEC-010 refined by DEC-022. Mapping: LV-INT-015 / TEN-S25-027; SAAS-S25-W08.
- Current source: `hrms_backend/src/modules/leave-wfh/service.ts` — decideLeaveRequest, decideWfhRequest, applyAttendanceStatus; `hrms_backend/src/modules/attendance/payroll-period-service.ts` — payroll period locking. Leave/WFH approval writes a day classification while preserving punches; that path does not create the required HR conflict resolution.
- Recommended resolution / approved target where cited: Normal approved WFH with valid punches is remote work. Genuine incompatible leave/work or WFH/location evidence enters assigned-HR review with reason and evidence; the affected payroll day cannot finalize until resolved. Preserve actual punches.
- Unit input -> expected output: Valid approved WFH plus valid work -> normal remote day; overlapping full-day leave plus work -> unresolved conflict; unresolved genuine conflict -> payroll finalization denied.
- Integration/browser/failure cases: Approval/punch race, late offline punch, half-day leave, rejected resolution, historical employer ownership and post-lock correction.
- Decision boundary: DEC-Q09 partly resolved; exact permitted dispositions and WFH evidence-conflict definitions remain DEC-BQ01.

### BIZ-S25-004 — Define notification delivery and recipient coverage

- Finding: **Coverage and product-contract gap**. Rule authority: NEEDS_BUSINESS_CONFIRMATION: DEC-BQ05. Mapping: NOTIF-COV-021 / WORKER-REL-024; SAAS-S25-W10.
- Current source: `hrms_backend/src/modules/expenses/service.ts` — addNotification and call sites; `hrms_backend/src/modules/notifications/service.ts` — list, markRead; `hrms_backend/src/workers/cloudflare-worker.ts` — queue business-event branch. Expense paths explicitly create notification rows. Static search found no equivalent domain producer for other modules; the Cloudflare business-event branch logs the event and acknowledges it. A transport event is not a delivered notification.
- Recommended resolution / approved target where cited: Approve an event -> eligible recipient -> channel -> action-link matrix. Create deduplicated in-app notifications from committed events; treat email/provider delivery separately, with retry and visible failure. Recheck current access when opening a notification.
- Unit input -> expected output: One configured event -> expected recipients only; replay same event ID -> one notification per recipient/channel; denied or rolled-back mutation -> no notification.
- Integration/browser/failure cases: Manager replacement, employee exit, delivery outage, missing recipient, dead-letter replay, notification tenant isolation and readable/actionable browser result.
- Decision boundary: DEC-BQ05 owns required events/channels, mandatory versus optional delivery and target delivery time. No all-module notification PASS is claimed.

### BIZ-S25-005 — Prove stale-session denial across replicas and tabs

- Finding: **Verification gap and source-supported race/scale risk**. Rule authority: Current authorization invariant; consistency/outage policy pending DEC-BQ06. Mapping: AUTH-OBS-003 / AUTH-REV-025 / TEN-S25-019; SAAS-S25-W05.
- Current source: `hrms_backend/src/auth/index.ts` — ValkeySessionStore.revokeUser; `hrms_backend/src/plugins/auth.ts` — session and active actor checks; `hrms_backend/src/modules/core/service.ts` — role/deactivation session revocation. Revocation logic exists, but it scans sessions and actors are hydrated in each API process. This review has not reproduced an unauthorized stale session.
- Recommended resolution / approved target where cited: Use a bounded per-user revocation generation or indexed sessions and current server-side authority. Specify when revocation becomes effective and the unavailable-session-store response. UI tabs clear sensitive cached state on invalid-session response.
- Unit input -> expected output: Old session generation after role/password/status change -> denied; new authorized login -> allowed; failed authority lookup -> documented safe response.
- Integration/browser/failure cases: Two API instances, concurrent login/revocation, multi-tab/back button, permission removal during upload/download and Valkey failure/recovery.
- Decision boundary: DEC-BQ06: recommend next protected request denied after successful revocation; final consistency/outage policy still needs approval.

### BIZ-S25-006 — Upload leave evidence before claiming it is attached

- Finding: **Source-confirmed UI/API mismatch**. Rule authority: Recommended evidence-integrity requirement; required categories pending DEC-Q05. Mapping: LV-UX-010 (existing finding outside original 35); SAAS-S25-W06 / SAAS-S25-W08.
- Current source: `hrms-client/src/routes/_app/leave-wfh.apply-leave.tsx` — onSubmit, document_ids: []; `hrms_backend/src/modules/leave-wfh/service.ts` — createLeaveRequest; `hrms_backend/src/modules/documents/service.ts` — upload. The leave form displays the selected filename but sends an empty document_ids array. File selection alone does not persist evidence.
- Recommended resolution / approved target where cited: Upload through the document boundary, link only committed authorized document IDs, and show progress/failure/retry. Do not claim an attachment was saved if upload failed; required-evidence policy blocks submission until successful.
- Unit input -> expected output: Successful upload -> submitted payload contains the returned ID; upload failure -> no false attachment success; removed/replaced selection -> correct final IDs only.
- Integration/browser/failure cases: Browser file selection, offline upload, oversize/type rejection, refresh, duplicate retry, cross-company ID substitution and orphan cleanup.
- Decision boundary: DEC-BQ07: which leave types/durations require which proof, submission versus later evidence deadline and approver for exceptions?

### BIZ-S25-007 — Recover interrupted company onboarding

- Finding: **Source-supported failure risk; no browser reproduction**. Rule authority: Recommended recoverable setup; bootstrap Admin exception pending DEC-BQ13. Mapping: AUTH-OBS-002 / MEDIA-CONS-026; SAAS-S25-W04 / SAAS-S25-W06.
- Current source: `hrms-client/src/lib/auth.tsx` — completeCompanySetup:814-857; `hrms_backend/src/modules/auth/service.ts` — uploadCompanyLogo, bootstrapCompany. The client uploads a logo, bootstraps the company, clears the token and then fetches the session in separate operations. Backend completed-state guards exist; duplicate company creation is not established by this review.
- Recommended resolution / approved target where cited: Keep private draft uploads and a recoverable setup state; commit company/master data/token use atomically in PostgreSQL. Idempotent bootstrap replay returns the authorized existing result. Reconcile object storage separately; session-fetch failure after successful bootstrap must resume the completed setup.
- Unit input -> expected output: Same setup command replay -> same company/admin result; invalid token -> no changes; logo failure -> recoverable draft; completed bootstrap plus session-fetch failure -> resumable success state.
- Integration/browser/failure cases: Interrupt each request boundary, double-click, response loss after commit, expired token, repeated logo replacement and object/DB failure.
- Decision boundary: DEC-BQ13: how may a founding Admin complete HR verification when no independent HR exists yet? Never invent an activation bypass.

### BIZ-S25-008 — Validate total daily timesheet hours, not only each segment

- Finding: **Source-confirmed missing aggregate guard**. Rule authority: NEEDS_BUSINESS_CONFIRMATION: DEC-BQ02. Mapping: New BIZ-S25-008; related TS-INT-008; SAAS-S25-W08.
- Current source: `hrms_backend/src/modules/timesheets/service.ts` — createSegment:110-124; `hrms_backend/src/modules/timesheets/repository.ts` — addSegment. Each segment is checked against 24 hours independently. No daily aggregate check appears in the selected write path; two different project/task segments can each pass while totaling more than a day.
- Recommended resolution / approved target where cited: Apply a company-defined daily maximum to the aggregate after replacing the current segment, with a separate overtime policy. Validate hours against date/shift semantics; do not assume scheduled 8 hours equals an absolute maximum or ignore timezone changes.
- Unit input -> expected output: Existing 16 hours plus different 16-hour segment -> rejected under a 24-hour cap; replacing 16 with 8 -> recomputed correctly; exact cap and decimal boundary -> defined outcome.
- Integration/browser/failure cases: Concurrent inserts to different projects must not bypass the aggregate cap; overnight work and rounding require explicit policy.
- Decision boundary: DEC-BQ02 owns daily cap, overtime approval, future/backdated work and relation to attendance; a 24-hour nominal cap is a recommendation, not an approved payroll rule.

### BIZ-S25-009 — Make configured timesheet routing and billable review effective

- Finding: **Approved-rule implementation gap**. Rule authority: DEC-028. Mapping: New BIZ-S25-009; related SAAS-CTRL-019; SAAS-S25-W05 / SAAS-S25-W08.
- Current source: `hrms_backend/src/shared/schemas.ts` — workflowDefinitionSchema:838-846; `hrms_backend/src/modules/timesheets/service.ts` — submit:133-168, decide. The schema accepts ltree_manager/project_manager/hr_manager and require_billable_review. submit always resolves the immediate manager and snapshots the flags without making them determine the route or a distinct billable-review stage.
- Recommended resolution / approved target where cited: Resolve the configured strategy and independent eligible approver. Persist the actual required stages and version; enforce separate billable review when enabled. Block submission when required routing is missing, with an actionable setup error.
- Unit input -> expected output: Each configured strategy -> its expected eligible approver; billable-review flag -> extra required decision; missing independent approver -> blocked without submission/event.
- Integration/browser/failure cases: Multiple project managers, mixed billable projects, manager removed mid-cycle, workflow changed after submission and stale decisions.
- Decision boundary: DEC-BQ04: multi-project manager selection, billable reviewer authority and audited delegation need explicit detail; DEC-028 approves enforcement, not those unchosen identities.

### BIZ-S25-010 — Validate project eligibility before accepting timesheet work

- Finding: **Source-confirmed validation gap; target policy proposed**. Rule authority: NEEDS_BUSINESS_CONFIRMATION: DEC-BQ02/08. Mapping: New BIZ-S25-010; related SAAS-PROJ-016; SAAS-S25-W07 / SAAS-S25-W08.
- Current source: `hrms_backend/src/modules/timesheets/service.ts` — createSegment; `hrms_backend/src/shared/schemas.ts` — workSegmentSchema; `hrms_backend/src/modules/projects/service.ts` — project members and allocations. createSegment stores optional free-text project_code/task_code without resolving a project, date-effective membership, project lifecycle or billable eligibility.
- Recommended resolution / approved target where cited: Use an immutable company-owned project ID and validate date-effective membership/status. Provide an explicit authorized non-project/admin-work category; never silently attribute unknown codes. Define late entry for completed projects.
- Unit input -> expected output: Unknown/other-company project -> denied; active eligible membership -> accepted; unassigned billable work -> blocked or explicit approved exception; non-project category -> defined allowed result.
- Integration/browser/failure cases: Project archive during save, member transfer/end date, project code rename and historical corrections.
- Decision boundary: DEC-BQ02/08: future/backdated entry, permitted project statuses, task catalog and exception authority remain open.

### BIZ-S25-011 — Prevent overlapping submission cycles and repair resubmission

- Finding: **Source-confirmed service/schema mismatch**. Rule authority: DEC-009, DEC-027; cycle boundaries pending DEC-BQ02. Mapping: New BIZ-S25-011; related TS-INT-008; SAAS-S25-W08.
- Current source: `hrms_backend/src/modules/timesheets/service.ts` — submit, segmentsForSubmission; `hrms_backend/src/modules/timesheets/repository.ts` — addSubmission; `hrms_backend/src/modules/timesheets/state-machine.ts` — Returned transitions; `hrms_backend/src/db/schema.ts` — timesheetSubmissions:2330-2350; `hrms_backend/src/modules/timesheets/routes.ts` — submission routes. submit generates a new UUID and has no overlapping-cycle guard. SQL uniqueness protects an identical employee/start/end tuple, not different overlapping ranges. Returned -> submitted is allowed in the state table, but the traced submit route creates a new record instead of versioning that submission.
- Recommended resolution / approved target where cited: Enforce canonical cycle boundaries and no double-counting segments in concurrent active/approved cycles. Use idempotency for retries and resubmit the same returned request with preserved revision history.
- Unit input -> expected output: Same command retry -> same result; intersecting nonidentical cycle -> rejected; returned correction -> same request ID with new revision; stale revision -> conflict.
- Integration/browser/failure cases: Real SQL unique-conflict translation, overlapping ranges, two instances, response loss and approve versus resubmit.
- Decision boundary: DEC-BQ02 owns cycle start/day/span and exception periods; identical duplicate persistence is constrained, so do not label duplicate durable rows as reproduced.

### BIZ-S25-012 — Split leave debits across leave years and version the ledger

- Finding: **Source-confirmed calculation mismatch plus undecided entitlement policy**. Rule authority: DEC-023. Mapping: New BIZ-S25-012; related SAAS-CAL-009; SAAS-S25-W08.
- Current source: `hrms_backend/src/modules/leave-wfh/service.ts` — dateRangeForYear, leaveBalancesForUser:148-181, assertLeaveBalanceAvailable; `hrms_backend/src/modules/leave-wfh/repository.ts` — listLeaveRequests, overlaps. Balance queries select requests overlapping the calendar year, then sum the entire request.duration. A two-working-day request split across New Year can count two days in each year's view; submission checks only the start-year balance. accruals is always an empty array in this path.
- Recommended resolution / approved target where cited: Maintain per-work-date reservation/debit/reversal entries under a versioned company leave policy; split each debit by its policy leave year. HR must choose leave-year dates, accrual, carry-forward, expiry, probation and negative-balance rules before implementation.
- Unit input -> expected output: One eligible day in each of two policy years -> one debit per year; pending reservation then cancellation -> exact release; policy change -> historical entries unchanged.
- Integration/browser/failure cases: Concurrent last-balance requests, rounding, calendar correction, transfer, backdated approval and year rollover.
- Decision boundary: DEC-023 explicitly leaves numerical amounts and dates pending HR; financial fiscal year does not automatically establish leave year.

### BIZ-S25-013 — Represent half-day leave and WFH in attendance correctly

- Finding: **Source-confirmed loss of duration detail at projection boundary**. Rule authority: DEC-008/022; half-day definitions pending DEC-BQ03. Mapping: New BIZ-S25-013; related LV-INT-015; SAAS-S25-W08.
- Current source: `hrms_backend/src/modules/leave-wfh/service.ts` — requestDurationDays, assertNoOverlap, decideLeaveRequest, decideWfhRequest, applyAttendanceStatus; `hrms_backend/src/modules/leave-wfh/repository.ts` — activeRequestsForUser. Requests can carry half_day and duration 0.5, but approval passes dates/status only into the day projection. The overlap check is whole-date based and cannot distinguish two different half-day slots.
- Recommended resolution / approved target where cited: Preserve approved fraction and shift-relative interval/slot in the attendance/payroll input. Define which combinations of work, leave and WFH cover nonoverlapping time; detect only real conflicts under DEC-022.
- Unit input -> expected output: Approved 0.5 leave -> 0.5 approved absence coverage, not full-day coverage; same slot twice -> conflict; complementary slots -> approved-policy result.
- Integration/browser/failure cases: Night shifts, part-time schedules, half leave plus work, half WFH plus office work, DST and changed shift assignment.
- Decision boundary: DEC-BQ03: first/second shift half versus fixed AM/PM, minimum interval and complementary leave/WFH rules need HR approval.

### BIZ-S25-014 — Support leave returns, approved cancellation and reversals

- Finding: **Approved-rule implementation gap**. Rule authority: DEC-027. Mapping: New BIZ-S25-014; related LV-INT-015; SAAS-S25-W08.
- Current source: `hrms_backend/src/modules/leave-wfh/routes.ts` — create, decision and leave cancel routes; `hrms_backend/src/modules/leave-wfh/service.ts` — decideLeaveRequest, cancelLeaveRequest, decideWfhRequest. Returned requests lose their approver and the traced routes contain no edit/resubmit command. Leave cancellation accepts pending or returned states only; no approved-cancellation reversal or WFH cancel command is exposed here.
- Recommended resolution / approved target where cited: Version and resubmit the same returned request. Add approval-driven cancellation/amendment of approved leave; reverse only that request's ledger/attendance effects without deleting punches or another request's coverage. Keep locked-period adjustments auditable.
- Unit input -> expected output: Returned correction -> same request history and pending eligible approver; approved cancellation without approval -> blocked; approved reversal -> one exact ledger reversal.
- Integration/browser/failure cases: Approve/cancel race, already-locked payroll, overlapping replacement request, duplicate reversal and WFH withdrawal policy.
- Decision boundary: DEC-027 approves leave/timesheet returns and approved leave cancellation; WFH withdrawal, deadlines and cancellation approver identity remain DEC-BQ03/04.

### BIZ-S25-015 — Keep every approval request routable after staffing changes

- Finding: **Source-confirmed routing gap; lifecycle matrix incomplete**. Rule authority: DEC-012/028 for their domains; leave fallback pending DEC-BQ04. Mapping: New BIZ-S25-015; related SAAS-CTRL-019; SAAS-S25-W04 / SAAS-S25-W05 / SAAS-S25-W08.
- Current source: `hrms_backend/src/modules/leave-wfh/service.ts` — createLeaveRequest, createWfhRequest, adminFallback:740-741; `hrms_backend/src/modules/core/service.ts` — resolveImmediateManager; `hrms_backend/src/modules/timesheets/service.ts` — submit. Leave/WFH chooses an immediate manager or the first active global Admin; if neither exists it still creates pending_manager with no approver. Privileged HR/Admin can decide, so this is not proof the request is permanently unapprovable. A durable reassignment lifecycle has not been established.
- Recommended resolution / approved target where cited: Resolve a same-company independent eligible route before submission, or expose a visible routing exception. Configure and audit delegation/reassignment when approvers leave; revalidate authority at decision time without silently changing approved history.
- Unit input -> expected output: No valid route -> explicit blocked/exception result; requester selected as approver -> rejected; approver removed -> visible reassignment need, not silent completion.
- Integration/browser/failure cases: Manager exit/leave/role removal, Admin request, all approvers inactive, cycle in hierarchy and stale queued decision.
- Decision boundary: DEC-BQ04 owns leave fallback, no-independent-approver exceptions, delegation actor and timeout; do not transplant expense rules without approval.

### BIZ-S25-016 — Reconcile expenses with actual disbursement and adjustments

- Finding: **Approved-rule implementation gap**. Rule authority: DEC-024. Mapping: New BIZ-S25-016; related SAAS-FIN-012; SAAS-S25-W06.
- Current source: `hrms_backend/src/modules/expenses/service.ts` — releasePayment:1330-1381, settle:1417-1475; `hrms_backend/src/shared/schemas.ts` — moneySchema, paymentReleaseSchema, settlementSchema. releasePayment records the submitted amount without a positive/ceiling check in this path. settle subtracts advance_amount or estimated_amount rather than recorded paid_amount. The shared decimal schema permits a minus sign. These are application records; no bank transfer was exercised.
- Recommended resolution / approved target where cited: Use a disbursement/adjustment ledger. Compare verified actual expense with net money actually paid, record extra payment/refund separately, and close only at zero remaining balance. Validate positive disbursements, nonnegative actuals, approved caps and deliberate reversal types.
- Unit input -> expected output: Estimate 14000, actual paid 10000, verified expense 12000 -> payable 2000; refund/extra payment -> updated net balance; negative ordinary payment -> validation failure; repeated settlement -> no duplicate ledger action.
- Integration/browser/failure cases: Partial/multiple payments, duplicate bank reference, concurrent settlement, receipt replacement, currency rounding and failed commit.
- Decision boundary: DEC-024 fixes the reconciliation invariant; currency, payment caps, receipt/tax policy and authority to release over-budget adjustments remain DEC-BQ09.

### BIZ-S25-017 — Make asset fulfillment create the real assignment

- Finding: **Approved-rule implementation gap**. Rule authority: DEC-025. Mapping: New BIZ-S25-017; related SAAS-ASSET-017; SAAS-S25-W07.
- Current source: `hrms_backend/src/modules/assets/service.ts` — decideRequest:182-219, assign. decideRequest can set fulfilled without asset_id; with an asset ID it looks up the asset but does not invoke assign or create custody/assignment evidence.
- Recommended resolution / approved target where cited: Fulfillment atomically validates an available compatible asset and assigns it to the requester with one active assignment, audit and event. Approval may reserve an asset only under an explicit reservation policy; it must not claim delivery.
- Unit input -> expected output: Fulfilled without asset -> rejected; valid fulfillment -> requester custody plus active assignment; incompatible/unavailable asset -> no request or custody changes.
- Integration/browser/failure cases: Two requests race for one asset, requester leaves before delivery, repeated fulfillment and SQL failure.
- Decision boundary: DEC-025 approves real assignment; request-type compatibility, reservations, delivery acknowledgement and substitute asset acceptance remain DEC-BQ10.

### BIZ-S25-018 — Separate asset custody, maintenance and financial recovery

- Finding: **Approved-rule implementation gap**. Rule authority: DEC-025. Mapping: New BIZ-S25-018; related SAAS-ASSET-017; SAAS-S25-W07.
- Current source: `hrms_backend/src/modules/assets/service.ts` — createMaintenance:269-305, settleRecovery:388-433, returnAsset. Maintenance directly sets the asset in maintenance or in stock without reconciling an existing active assignment. Recovery outcomes other than lost_damaged set Returned and end an active assignment, including deduction or waived.
- Recommended resolution / approved target where cited: Model physical custody separately from maintenance/financial disposition. Maintenance retains tracked custody or an explicit transfer to a vendor. Deduction/waiver does not prove return; require physical receipt before marking returned/in stock. Do not implement automatic payroll deduction.
- Unit input -> expected output: Waived recovery with no receipt -> financial closure but not physical return; maintenance on assigned asset -> custody retained/explicitly transferred; return receipt -> consistent assignment and inventory.
- Integration/browser/failure cases: Several maintenance records, cancelled maintenance, lost asset after waiver, delayed return after settlement, two custodians and old recovery ticket after reassignment.
- Decision boundary: DEC-BQ10: receipt authority, condition/damage assessment, maintenance reservations and Finance/payroll integration need detail.

### BIZ-S25-019 — Apply the same helpdesk priority rules through every endpoint

- Finding: **Approved-rule implementation gap**. Rule authority: DEC-026. Mapping: New BIZ-S25-019; related SAAS-HD-018; SAAS-S25-W07.
- Current source: `hrms_backend/src/modules/helpdesk/service.ts` — updateTicket:193-216, changePriority:295-310; `hrms_backend/src/shared/schemas.ts` — helpdeskTicketUpdateSchema:756-765. The dedicated priority command requires a managing actor and a reason to escalate to Urgent; general update allows the requester to set priority without those checks or the same escalation side effects.
- Recommended resolution / approved target where cited: Route every post-creation priority change through one shared domain policy and transition function. Only an authorized agent/manager may change it, and Urgent escalation always requires a reason.
- Unit input -> expected output: Requester PATCH priority -> denied; agent Urgent without reason -> rejected through all paths; valid Urgent -> consistent status/escalation/audit.
- Integration/browser/failure cases: PATCH versus dedicated endpoint parity, closed/resolved tickets, downgrade after escalation and stale concurrent edits.
- Decision boundary: DEC-026 is approved. Creation-time requester priority and behavior of a later downgrade remain DEC-BQ11.

### BIZ-S25-020 — Define helpdesk SLA clocks, holds and reopen behavior

- Finding: **Implemented behavior needing business confirmation**. Rule authority: NEEDS_BUSINESS_CONFIRMATION: DEC-BQ11. Mapping: New BIZ-S25-020; related SAAS-HD-018; SAAS-S25-W07.
- Current source: `hrms_backend/src/modules/helpdesk/service.ts` — SLA_MATRIX, addComment, setStatus, reopen, computeSla:522-545. Due dates use elapsed hours from original created_at and current priority; OnHold does not pause this formula. Reopen clears resolved_at but retains created_at; a non-requester public comment starts first-response completion, whereas an internal note does not.
- Recommended resolution / approved target where cited: Approve 24x7 versus office-hours SLA, holidays, hold reasons, qualifying response, escalation effective date and reopen cycles. Store a policy/version and elapsed-clock history rather than rewriting prior achieved/breached results after priority changes.
- Unit input -> expected output: Hold/reopen/priority change -> outcome from an approved fixed-clock table; internal note -> no public response completion; authorized public response -> defined completion.
- Integration/browser/failure cases: Office holiday, night shift, priority change after breach, repeated reopen, unassigned ticket and time-zone transition.
- Decision boundary: DEC-BQ11 owns actual SLA hours and clock rules. Current elapsed-time behavior is not inherently wrong until the contract is chosen.

### BIZ-S25-021 — Require evidence before completing EMS checklists

- Finding: **Approved-rule implementation gap**. Rule authority: DEC-007, DEC-029. Mapping: New BIZ-S25-021; related SAAS-EMP-004; SAAS-S25-W04.
- Current source: `hrms_backend/src/modules/ems/service.ts` — updateAdminChecklist:311-341; `hrms_backend/src/shared/schemas.ts` — emsAdminChecklistUpdateSchema:120-126. An explicit status completed is accepted even if checklist booleans remain false; values are manually merged. The completion path does not verify required proof/asset/finance outcomes.
- Recommended resolution / approved target where cited: Version required checklist items and evidence owners. Completion requires verified applicable evidence; manual administrative items remain distinguishable. Exit progress must not fabricate asset return, final settlement or session revocation.
- Unit input -> expected output: Required false/unverified item plus status completed -> rejected; approved not-applicable item -> explicit allowed outcome; all required evidence current -> completion with immutable evidence references.
- Integration/browser/failure cases: Proof replacement after checkoff, company adds requirement, exit with open assets/expenses, concurrent completion and deactivation.
- Decision boundary: DEC-029 approves the completion gate; effective-policy changes, not-applicable authority and first-Admin bootstrap evidence remain DEC-Q05/DEC-BQ13.

### BIZ-S25-022 — Bind employee policy acknowledgement to a published version

- Finding: **Approved-rule implementation gap**. Rule authority: DEC-029. Mapping: New BIZ-S25-022; SAAS-S25-W04.
- Current source: `hrms_backend/src/modules/ems/service.ts` — acknowledgePolicy:426-449, updatePolicy:452-471; `hrms_backend/src/modules/ems/repository.ts` — listPolicies, acknowledgementFor:288-307; `hrms_backend/src/db/schema.ts` — emsPolicyAcknowledgements:2704-2717. Acknowledgements are keyed by policy_id plus employee, not the published content/version. Updating the same policy row can leave the prior acknowledgement attached to changed text; active policy listing does not itself enforce effective_from <= today.
- Recommended resolution / approved target where cited: Publish immutable versions with content/document identity and effective date. A material new version requires a new acknowledgement, while retaining the old version's proof. Distinguish informational preview from an effective mandatory policy.
- Unit input -> expected output: Acknowledge v1 then publish materially changed v2 -> v2 pending and v1 retained; replay same acknowledgement -> idempotent/defined conflict; future version -> not yet an effective obligation.
- Integration/browser/failure cases: Publish versus acknowledge race, edited document bytes, retroactive correction, employee transfer and historical audit.
- Decision boundary: DEC-029 approves separate acknowledgement for material changes; materiality, publication authority and acknowledgement deadline remain DEC-BQ12.

### BIZ-S25-023 — Calculate project capacity from dates and scheduled hours

- Finding: **Source-confirmed calculation/validation gap; policy details proposed**. Rule authority: DEC-008; over-allocation authority pending DEC-BQ08. Mapping: New BIZ-S25-023; related SAAS-CAL-009; SAAS-S25-W07 / SAAS-S25-W09.
- Current source: `hrms_backend/src/modules/projects/service.ts` — assertOverAllocationAcknowledged:89-103, addAllocation, teamUtilizationSummary:481-535, capacityWarnings:769-778. Acknowledgement checks the input allocation alone; two 60% assignments do not trigger that >100 input guard. capacityWarnings sums all active memberships without date filtering. Utilization uses 40 available hours per employee regardless of selected range/calendar and labels all selected work segments submitted_hours.
- Recommended resolution / approved target where cited: Compute daily/date-weighted total allocation across overlapping assignments and office/shift capacity over the requested interval. Define over-allocation approval and employee acceptance; distinguish draft, submitted and approved work in reports.
- Unit input -> expected output: Overlapping 60% plus 60% -> capacity exception under approved policy; nonoverlapping 60% rows -> no false overload; six 8-hour working days -> 48 scheduled hours before other policy deductions.
- Integration/browser/failure cases: Partial week/month, leave, office transfer, allocation revision history, inactive projects and unsubmitted/billable segments.
- Decision boundary: DEC-BQ08: warn versus block versus approve, employee acceptance, part-time/leave capacity and denominator definition remain unapproved.

### BIZ-S25-024 — Validate real business dates and probation extension chronology

- Finding: **Source-confirmed schema/chronology gap; API persistence untested**. Rule authority: Recommended boundary invariant; probation chronology pending DEC-BQ12. Mapping: New BIZ-S25-024; SAAS-S25-W04 / SAAS-S25-W08.
- Current source: `hrms_backend/src/shared/schemas.ts` — isoDateSchema:36, emsProbationDecisionSchema:130-140; `hrms_backend/src/modules/ems/service.ts` — decideProbation:356-379. The shared date schema validates the YYYY-MM-DD shape, not the actual calendar date. Probation extension requires a date to exist, but the selected decision path does not compare it with the prior end date or decision date. PostgreSQL may reject invalid dates later; successful durable invalid dates are not claimed.
- Recommended resolution / approved target where cited: Parse real dates once at boundaries and apply field-specific order/effective-date rules. Define probation extension minimum date and authority; do not let time-zone conversion normalize an impossible date into another day.
- Unit input -> expected output: 2026-02-31 -> boundary validation error; leap-day valid/invalid years -> correct results; extension before current end -> approved-policy rejection; exact date boundary -> explicit result.
- Integration/browser/failure cases: DB error translation, leap years, company time zone around midnight, backdated authorized HR corrections and repeated extensions.
- Decision boundary: DEC-BQ12: probation extension dates, notice/deadline/maximum duration and exception authority need HR confirmation.

## Decisions Still Required

These questions remain open even when part of a card is approved. Anurag Kumar owns follow-up and implementation tracking; named business roles supply policy authority, not a different task assignee.

| Question | Decision authority | Cards | Required answer | Recommendation / already resolved |
| --- | --- | --- | --- | --- |
| DEC-BQ01 | Product/HR/Payroll | BIZ-S25-003/013 | Choose conflict outcomes (retain work, partial leave, cancel leave, unpaid absence, investigation), reviewer delegation and objective WFH/location mismatch rules. | DEC-022 resolves normal WFH and assigned-HR review before payroll finalization; disposition matrix still open. |
| DEC-BQ02 | Product/HR/Engineering | BIZ-S25-008/010/011 | Choose daily aggregate cap, overtime, permitted work dates, canonical cycle boundaries, underfilled submission warnings and approved exceptions. | Recommend date/shift-aware aggregate validation and explicit exceptions; no payroll amount inferred. |
| DEC-BQ03 | HR/Payroll | BIZ-S25-013/014 | Choose shift-relative half-day slots, compatible work/leave/WFH combinations, cancellation deadlines, WFH withdrawal and balance reservation rules. | DEC-027 resolves same-record resubmission and approved leave cancellation; exact windows/slots are open. |
| DEC-BQ04 | HR/Finance/Product | BIZ-S25-001/009/014/015 | Choose delegate authority if original approver leaves, multiple project managers, billable reviewer identity and leave fallback. Define posting of Finance-approved corrections after period lock. | DEC-021/028 establish correction/routing gates; no silent Admin override or automatic period unlock is approved. |
| DEC-BQ05 | Product/HR/Operations | BIZ-S25-004 | Approve event/recipient/channel matrix, delivery targets, mandatory alerts and escalation after failure. | Recommend in-app minimum for actionable approvals and separate email delivery evidence; no numerical SLA selected. |
| DEC-BQ06 | Security/Product/Operations | BIZ-S25-005 | Approve revocation effectiveness and session-store outage behavior across replicas. | Recommend old access denied on the next protected request after successful revocation, with bounded revocation indexing and a documented unavailable-authority response. |
| DEC-BQ07 | HR/Privacy | BIZ-S25-006 | Choose leave proof requirements, accepted types, collection deadline, reviewer and exception/retention rules. | Do not block every leave type or collect additional sensitive evidence by assumption; DEC-Q05 still governs onboarding proofs. |
| DEC-BQ08 | Product/Project Leads/HR | BIZ-S25-010/023 | Choose membership/status eligibility, allocation over 100% warn/block/approve policy, employee acceptance and capacity denominator. | Historical BLQ-011 acknowledges over-allocation but does not clearly establish aggregate approval authority; do not promote it to a current rule. |
| DEC-BQ09 | Finance/Product | BIZ-S25-016 | Choose currency handling, disbursement caps, partial/extra payment approvals, refund proof and receipt/tax requirements. | DEC-024 establishes net-paid reconciliation and zero-balance closure; no money transfer or tax/legal compliance is implied. |
| DEC-BQ10 | Asset Manager/Finance | BIZ-S25-017/018 | Choose asset compatibility/substitution, reservation, physical receipt/condition authority, maintenance custody and delayed recovery workflow. | DEC-025 separates custody and financial outcome; automatic payroll deductions remain outside scope. |
| DEC-BQ11 | Support/Product | BIZ-S25-019/020 | Choose creation-time priority authority, downgrade effects, SLA 24x7/business hours, pause reasons, public-response definition and reopen policy. | DEC-026 resolves post-creation priority authority and Urgent reasons; SLA numbers/clocks remain pending. |
| DEC-BQ12 | HR/Product | BIZ-S25-022/024 | Choose policy-change materiality/publication/acknowledgement deadline and probation extension chronology/authority. | DEC-029 resolves version acknowledgement and evidence completion; do not infer statutory deadlines. |
| DEC-BQ13 | Product/Security/HR | BIZ-S25-007/021 | Define founding-Admin verification and first-HR assignment, changes to requirements after onboarding starts, and approved not-applicable evidence. | DEC-007 blocks activation until verified proofs; resolve bootstrap sequencing without inventing an unverified employee activation bypass. |
## Implementation Order And Modular Verification

1. Resolve blocking policy details and tenant/identity foundations first. Replace stale whole-domain authoritative writes with request-scoped SQL transactions; each business slice must include the middleware/service checks, SQL guarantees and UI behavior together. BIZ cards do not bypass ARCH-STATE-014, ARCH-ROLLBACK-031 or tenant authorization work.
2. Build pure, deterministic policy/calculation units by domain: calendar selection, leave ledger/fraction, workflow routing, timesheet limits/cycle lock, expense reconciliation, asset custody transition, SLA clock and checklist/policy-version rules. Test explicit inputs, outputs, denials and rounding/date boundaries. Keep orchestration and adapters separate; avoid tests that only restate implementation.
3. Add repository integration suites for real transactions, constraints, competing requests, row versions, outbox atomicity and two API instances. Use synthetic companies A/B, offices with different calendars, independent actors, a fixed clock and disposable PostgreSQL/Valkey only. Mocks cannot prove durable consistency or RLS.
4. Verify visible journeys per role with real browser interactions: submit -> return -> resubmit -> approve; selected file -> uploaded/linked file -> authorized read; interruption -> resume; assignment -> maintenance -> return/recovery; bill/payment -> adjustment -> close. Check stale tabs, double clicks, offline/retry, back/refresh, mobile and keyboard. Record what was actually executed.
5. Apply [test/QA completion](../agent/test-and-qa-completion.md). Add meaningful input/output assertions for changed behavior, full changed executable-line coverage and changed decision branches, then actual boundary evidence and independent QA. No code/test is changed in this review; executable coverage is N/A for this documentation diff. Independent review remains pending; self-review is not independent QA.

Current test seams: `hrms_backend/src/modules/{timesheets,leave-wfh,expenses,assets,helpdesk,ems,projects,auth}/__tests__/` (actual existing suites are listed in the dated QA artifact). Proposed unit layout is module-local `__tests__/` with one policy/calculation suite per concern and shared synthetic fixture builders; do not create a single giant end-to-end script. Frontend unit/component tooling prerequisites remain QA-S25-003; do not fabricate a currently available command.

## Limits And Remaining Discovery

Static inspection covered selected service/repository/schema/route paths in leave/WFH, timesheets, expenses, assets, helpdesk, EMS, projects, onboarding, notifications and sessions. Existing tenant and payroll/worker journeys were used as navigation. This review did **not** re-audit every route, every frontend screen, all migration triggers, production configuration, provider delivery, full payroll/billing integrations, browser accessibility, performance, or statutory policy. Exact DB error paths, failure recovery and cross-module concurrency need execution. Source omissions in the named path are not proof of an exploit or of all callers' behavior.

Evidence and proposed-case status: [business-rule QA review](../../qa-artifacts/hrms/business-rules-2026-11-10/verification.md). [Implementation backlog](implementation-backlog.md) and [Sprint 25 delivery backlog](sprint-25-saas-remediation.md) link these cards without closing the original remediations. Updating documents clears ambiguity only where the owner answered; all runtime gaps remain open.
