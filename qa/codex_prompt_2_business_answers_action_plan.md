# CODEX PROMPT 2 — Business Answers + Need-Action Implementation Plan

Paste this into Codex after it has already created:

- `qa/CODEBASE_TESTING_ANALYSIS.md`
- `qa/BUSINESS_LOGIC_QUESTIONS.md`

This prompt converts the business answers into confirmed rules, creates a staged plan for every `need action`, implements required product/code changes, verifies them, and prepares the repo for final QA sheet generation.

---

## Prompt to paste into Codex

You are acting as a Senior Product QA Lead, Business Analyst, Staff Engineer, and Release Readiness Owner for Hawkaii HRMS.

I have reviewed `qa/BUSINESS_LOGIC_QUESTIONS.md`. Below are my final business answers and action decisions.

Your job now:

1. Read:
   - `qa/CODEBASE_TESTING_ANALYSIS.md`
   - `qa/BUSINESS_LOGIC_QUESTIONS.md`
   - The entire source codebase
2. Convert my answers into confirmed business rules.
3. For every item marked `IMPLEMENT NOW`, create a staged implementation plan and implement the required change.
4. For every item marked `TEST NOW`, make sure the final test sheet later contains strong tests for that rule.
5. For every item marked `FUTURE AFTER TEST SHEET`, do not implement it now. Capture it in a future backlog that will be generated after the final test sheet is complete.
6. Update documentation in `/qa`.
7. Run the relevant tests/build/typecheck/lint commands that exist in this repo.
8. Do not generate the final testing checklist yet. That will be the next prompt.

Important engineering constraints:

- Backend rules are authoritative.
- Frontend route guards are UX only and must not replace backend permission checks.
- Do not silently assume unclear business rules.
- Do not remove working source code without understanding downstream references.
- Prefer small, safe, reviewable changes.
- Do not modify unrelated features.
- If a requested change conflicts with existing schema/data constraints, document the conflict, implement the safest compatible version, and include the gap in `qa/IMPLEMENTATION_CHANGELOG.md`.
- Do not expose internal code references in client-facing artifacts.
- All P0 business decisions must be reflected in code, docs, and later test cases.

Create or update these files:

- `qa/BUSINESS_RULES_CONFIRMED.md`
- `qa/NEED_ACTION_IMPLEMENTATION_PLAN.md`
- `qa/IMPLEMENTATION_CHANGELOG.md`
- `qa/IMPLEMENTATION_VERIFICATION_REPORT.md`
- `qa/FUTURE_SCOPE_AFTER_TEST_SHEET.md`

---

# Confirmed Business Answers and Actions

## BLQ-001 — Roles and personas

Status: IMPLEMENT NOW  
Priority: P0

Business rule:

- Backend role model must be the source of truth.
- Frontend roles/personas must be revamped to match backend roles instead of maintaining separate conflicting role names.
- Remove `Reviewer` as a business-facing role.
- Replace Reviewer terminology with `Manager`.
- If backend currently uses `Reviewer`, migrate it carefully to `Manager` in constants, mappings, labels, docs, seeds, tests, and frontend route logic.
- `Manager` is the business role for manager approvals and team/hierarchy views.
- Do not silently map unrelated roles into `manager` unless the backend role model explicitly supports it.
- If `Director` remains in backend, it must not be treated as a mandatory expense approval stage in v1.

Implementation plan required:

Stage 1 — Audit:
- Find all occurrences of `Reviewer`, `reviewer`, `employee_reviewer_mappings`, and frontend local role aliases such as `manager`, `project_manager`, `helpdesk_agent`, `main_admin`, `hr_admin`, `asset_admin`.
- Identify role values used in DB schema, seed data, API responses, frontend route guards, sidebar, dashboard rendering, mocks, tests, and documentation.

Stage 2 — Normalize:
- Introduce or confirm backend `Manager` role.
- Replace business-facing `Reviewer` labels with `Manager`.
- Keep database/table names unchanged only if changing them is too risky; in that case document the technical legacy name but expose `Manager` everywhere in product/API-facing behavior.
- Make frontend role keys match backend roles as much as possible.
- Remove contradictory frontend-only personas unless they are real backend roles.

Stage 3 — Verify:
- Login as each role.
- Verify sidebar, dashboard, route access, and API permission behavior.
- Add/adjust tests for role mapping and forbidden routes.

Deliverable:
- Role matrix in `qa/BUSINESS_RULES_CONFIRMED.md`
- Change list in `qa/IMPLEMENTATION_CHANGELOG.md`

---

## BLQ-002 — Expense approval routing

Status: IMPLEMENT NOW  
Priority: P0

Business rule:

- Expense workflow must not allow self-processing.
- Admin cannot perform Manager work or Finance Manager work.
- Admin-created expenses must follow the same workflow as everyone else:
  `Requester -> Manager -> Finance Manager -> Payment/Settlement`
- Minimum production-ready routing:
  - At least 2 active Managers should exist so manager routing does not get stuck.
  - Finance action must always route to a non-requester Finance Manager or valid configured backup.
  - If no valid non-self approver exists, submission must be blocked or moved to a clear routing-exception state.
- Admin may configure, audit, and view, but must not bypass manager/finance workflow decisions.

Implementation plan required:

Stage 1 — Audit:
- Find expense policy methods that allow Admin override for manager verification, finance approval, payment, settlement, or routing.
- Find backup approver logic and any manager/finance assignment code.
- Identify whether org readiness checks exist.

Stage 2 — Implement:
- Remove Admin override from expense approval/payment/settlement actions unless the actor is explicitly the assigned Manager or assigned Finance Manager and is not the requester.
- Add routing validation before submission:
  - Manager approver must exist and must not be requester.
  - Finance approver must exist and must not be requester.
  - If not, block submission with a clear business error or move to `Finance Routing Exception` / routing exception state if already supported.
- Add or update readiness validation/warning for minimum 2 Managers and non-self Finance Manager routing.

Stage 3 — Verify:
- Employee expense -> Manager verification -> Finance approval -> payment -> settlement.
- Admin-created expense still requires Manager and Finance Manager.
- Manager-created expense routes to another Manager.
- Finance Manager-created expense routes to Manager, then another Finance Manager or backup.
- Admin cannot approve/verify/pay/settle by acting as Manager/Finance Manager.

Deliverable:
- Routing decision table in `qa/BUSINESS_RULES_CONFIRMED.md`
- Test notes for later QA sheet.

---

## BLQ-003 — Expense workflow

Status: IMPLEMENT NOW  
Priority: P0

Business rule:

- Expense v1 workflow is:
  `Employee/Requester -> Manager -> Finance Manager -> Payment -> Settlement`
- `Director` is not part of the mandatory v1 expense approval chain.
- Remove Director approval queue/stage from expense v1 if it exists.
- If Director remains as a role for reports/read-only leadership, keep it separate from expense workflow.

Implementation plan required:

Stage 1 — Audit:
- Search expense state machine, route names, docs, UI labels, queues, workflow config, tests, and reports for Director approval logic.

Stage 2 — Implement:
- Remove Director as an expense approval stage.
- Ensure all business-facing language says Manager, not Reviewer or Director, for the first approval step.
- Ensure state machine and UI match the v1 flow.

Stage 3 — Verify:
- No Director queue appears in expense UI/API.
- Expense cannot require Director approval before finance.
- Manager and Finance Manager workflow works end to end.

---

## BLQ-004 — Admin workflow configuration

Status: IMPLEMENT NOW  
Priority: P0

Business rule:

- Check the actual code flow.
- Admin workflow settings must be tested end to end from the frontend.
- Do not assume saved workflow settings affect runtime unless the runtime code actually uses them.
- If settings are currently configuration-only, document them as configuration-only.
- If settings are wired to runtime behavior, create tests proving the runtime effect.

Implementation plan required:

Stage 1 — Audit:
- Trace Admin workflow setting screens, API routes, persistence tables, services, and any runtime workflow readers.
- For each workflow setting, classify it as:
  - Runtime-active
  - Configuration-only
  - Partially wired
  - Dead/unreachable

Stage 2 — Implement/fix:
- Fix broken frontend save/read flows.
- Ensure settings persist and reload correctly.
- If an intended runtime-active setting is partially wired, complete the wiring only if safe and localized.
- If not safe, document as future scope instead of pretending it works.

Stage 3 — Verify:
- Frontend E2E or manual flow: open Admin Settings -> change workflow setting -> save -> refresh -> verify persistence.
- Runtime test only for settings actually used by runtime code.

Deliverable:
- `qa/ADMIN_WORKFLOW_RUNTIME_MATRIX.md` if helpful.
- Include findings in `qa/BUSINESS_RULES_CONFIRMED.md`.

---

## BLQ-005 — Attendance off-day punches

Status: IMPLEMENT NOW FOR DATA CAPTURE AND VISIBILITY; FUTURE AFTER TEST SHEET FOR PAYROLL/COMP-OFF/PROMOTION AUTOMATION  
Priority: P0

Business rule:

- If an employee cannot complete required weekly hours on weekdays, allowed off-day work can help cover the weekly deficit.
- If required hours are already completed, extra off-day work should be shown as overtime/extra effort.
- This data must be visible to:
  - Employee
  - Manager
  - HR/Admin
  - Higher department-level roles with access
- Do not implement payroll credit, comp-off credit, or promotion automation in this stage.
- Store/calculate enough data now so those future workflows can use it.

Implementation plan required:

Stage 1 — Audit:
- Trace attendance daily records, weekly/monthly summaries, dashboard attendance cards, manager/team summary, reports, and exports.

Stage 2 — Implement:
- Add or confirm derived metrics:
  - Required weekly hours
  - Weekday completed hours
  - Off-day worked hours
  - Weekly deficit covered by off-day work
  - Overtime/extra hours after target completion
- Show these metrics in appropriate employee and manager/admin views.
- Ensure role scoping uses existing attendance permissions.

Stage 3 — Verify:
- Employee below weekly target works off-day -> deficit coverage shown.
- Employee already meets weekly target works off-day -> overtime/extra effort shown.
- Manager/team view shows aggregate visibility.
- No automatic payroll/comp-off mutation occurs.

Future after test sheet:
- Comp-off policy.
- Payroll adjustment.
- Promotion/performance scoring linkage.

---

## BLQ-006 — Attendance shifts and working hours

Status: TEST NOW  
Priority: P0

Confirmed answer:

- Admin attendance policy and company working days are the default authoritative source for target hours.
- Shift-specific override applies only if code explicitly supports it.

Expected tests later:
- Admin changes target hours/working days.
- Employee dashboard/attendance/timesheet expectations reflect backend-supported values.
- If shift override is unsupported, it must not be tested as active behavior.

---

## BLQ-007 — Midnight and timezone attendance

Status: TEST NOW  
Priority: P1

Confirmed answer:

- Use default behavior: assign punch sessions crossing midnight to the work date of check-in in the user's timezone.

Expected tests later:
- Late-night check-in crossing midnight.
- User timezone behavior.
- Daily/weekly totals remain consistent.

---

## BLQ-008 — Leave policy calculations

Status: IMPLEMENT NOW AS READ-ONLY ADMIN CALCULATION VIEW; FUTURE AFTER TEST SHEET FOR EDITABLE POLICY CONFIGURATION  
Priority: P0

Business rule:

- Implement proper expected leave calculations for a high-pace working environment.
- Do not add a fully editable leave policy feature in this stage.
- Calculations must be visible only to Admin in Admin Settings.
- These calculations should be read-only for now.
- The goal is to make expected balances/test expectations clear without changing existing feature scope.

Default v1 calculation policy to implement unless existing code already defines a stronger policy:

- Earned/Paid Leave:
  - Annual entitlement: 15 days/year.
  - Monthly accrual: 1.25 days/month.
  - Carry-forward allowed up to 30 days.
- Sick Leave:
  - Annual entitlement: 6 days/year.
  - Monthly accrual: 0.5 days/month.
  - Carry-forward: 0 days unless code already supports it.
- Casual Leave:
  - Annual entitlement: 7 days/year.
  - Monthly accrual: 7/12 days/month.
  - Carry-forward: 0 days unless code already supports it.
- Negative leave:
  - Not allowed by default.
- Probation:
  - Accrue normally if code supports accrual, but eligibility for paid leave approval should be clearly displayed according to existing employment/probation status logic.
  - If probation status is not represented in code, do not invent a new workflow; show the limitation in Admin Settings and docs.
- Encashment:
  - Calculation preview only.
  - No payroll or payout workflow in this stage.

Implementation plan required:

Stage 1 — Audit:
- Trace current leave balance, leave types, leave policy, admin policy, and HR monitor code.
- Identify whether balances are derived, stored, or both.

Stage 2 — Implement:
- Add a read-only Admin Settings panel/card/page showing calculation rules and sample derived values.
- Add helper/service functions for deterministic expected calculation if missing.
- Do not expose edit controls yet.
- Do not break current leave request lifecycle.

Stage 3 — Verify:
- Admin can view calculation policy.
- Non-admin cannot access it.
- Leave balance tests can assert expected values where source data is controlled.
- Existing leave request lifecycle still works.

Future after test sheet:
- Editable leave policy configuration.
- Leave encashment workflow.
- Carry-forward scheduler.
- Probation-specific policy engine.

---

## BLQ-009 — Holidays and regions

Status: TEST NOW  
Priority: P1

Confirmed answer:

- Use default behavior.
- `region = All` holidays are global.
- Optional holidays are display-only unless code applies them.

Expected tests later:
- Global holiday affects calendar/attendance where code supports it.
- Optional holiday is not assumed to deduct leave unless code proves it.

---

## BLQ-010 — Timesheets under/over hours

Status: TEST NOW, LINKED TO BLQ-005  
Priority: P0

Confirmed answer:

- Use BLQ-005 attendance/off-day logic as reference.
- Allow submission if backend accepts it.
- Under/over submitted cycles should be visible as warnings/analytics unless backend validation blocks them.
- Off-day/overtime data should support reporting but not payroll/comp-off automation now.

Expected tests later:
- Under target hours warning.
- Over target hours/overtime warning.
- Off-day work reflected in timesheet/attendance analytics if code supports linking.

---

## BLQ-011 — Project allocation over 100%

Status: IMPLEMENT NOW  
Priority: P1

Business rule:

- Allocation over 100% should show a clear warning.
- The allocation may be submitted only if the user accepts/acknowledges the warning.
- It must require a simple approval flow with authority.
- Until approved, over-allocation should not silently become active capacity.

Recommended v1 approval rule:
- Project Manager or authorized allocator can request over-allocation.
- HR Manager or Admin can approve/reject over-allocation.
- If the requester is Admin, require HR Manager approval where feasible; if not feasible, require explicit audit trail and warning acknowledgement.
- Approved over-allocation becomes active.
- Rejected over-allocation remains inactive or reverts to previous allocation.

Implementation plan required:

Stage 1 — Audit:
- Trace project allocation create/update UI/API/backend validation/utilization reports.
- Check existing workflow/request infrastructure that can be reused.

Stage 2 — Implement:
- Show warning in frontend when allocation pushes employee over 100%.
- Add acknowledgement before request/save.
- Add simple approval status or request workflow.
- Make utilization reports distinguish pending vs approved over-allocation.
- Do not block normal <=100% allocation.

Stage 3 — Verify:
- <=100% allocation saves normally.
- >100% allocation creates warning and approval path.
- Unauthorized users cannot approve.
- Approved over-allocation affects utilization.
- Pending/rejected over-allocation does not silently count as active.

---

## BLQ-012 — Cost center autofill

Status: IMPLEMENT NOW  
Priority: P1

Business rule:

- Cost center remains optional.
- When department has a default cost center, related forms should auto-fill the cost center from the selected department.
- If no department/default exists, leave cost center empty; do not block the workflow.
- User may override only if existing permissions/UI already support manual cost-center entry.

Implementation plan required:

Stage 1 — Audit:
- Find department model/master data fields.
- Find project, expense, employee, and finance-report cost-center fields.
- Determine whether department default cost center exists.

Stage 2 — Implement:
- If department has a cost-center field, wire autofill.
- If not, add the safest minimal master-data attribute only if consistent with existing schema patterns.
- Apply autofill to expense/project/employee forms where cost center is present.
- Keep backend tolerant of null cost center.

Stage 3 — Verify:
- Selecting department with default cost center fills field.
- Department without cost center leaves field blank.
- Empty cost center does not break existing workflows.

---

## BLQ-013 — Document deletion

Status: IMPLEMENT NOW  
Priority: P0

Business rule:

- Show a clear warning before deleting a document.
- Authorized deletion should remove the file completely from storage and remove the document record from DB.
- Current stage does not use soft-delete for the deleted document record.
- Keep an audit event if the platform supports audit logging, but do not keep the document metadata row as an active/soft-deleted document.

Implementation plan required:

Stage 1 — Audit:
- Trace document delete API, storage delete, DB metadata delete/soft-delete, linked document tables, access logs, expense/EMS/project/helpdesk attachments.
- Identify foreign key constraints and references.

Stage 2 — Implement:
- Frontend delete confirmation modal with strong warning.
- Backend hard-delete behavior:
  - Delete storage object.
  - Remove link records.
  - Remove document metadata record.
  - Record audit event before deletion if supported.
- If hard-delete is blocked by unavoidable FK constraints, implement safe cleanup and document exact remaining references in changelog.

Stage 3 — Verify:
- Authorized user sees warning and can delete.
- Unauthorized user cannot delete.
- File cannot be downloaded after delete.
- DB record no longer appears in document lists.
- Linked module no longer shows deleted document.

---

## BLQ-014 — Document retention and audit

Status: TEST NOW  
Priority: P1

Confirmed answer:

- Continue with default behavior.
- Do not test automatic retention cleanup now.
- Test only that records/events are created where code supports them.

---

## BLQ-015 — Cloudinary storage

Status: TEST NOW  
Priority: P0

Confirmed answer:

- UAT/production must use real Cloudinary.
- Mock Cloudinary is acceptable only for local development/demo when explicitly enabled.
- Release testing must verify `CLOUDINARY_MOCK_UPLOADS=false` or equivalent real persistence mode.

Expected tests later:
- Upload survives backend restart.
- Download works with real Cloudinary.
- Mock mode is not allowed in UAT/production config.

---

## BLQ-016 — Email verification auto-submit

Status: IMPLEMENT NOW  
Priority: P1

Business rule:

- Auto-submit email verification is allowed only in development/dev environment.
- In QA and production, opening a verification link must not automatically verify the account.
- QA/production should show a confirmation page/button before verification is submitted.
- The goal is to avoid email security scanners accidentally verifying accounts.

Implementation plan required:

Stage 1 — Audit:
- Trace verify-email frontend route and backend verification API.
- Identify environment variables used by frontend and backend.

Stage 2 — Implement:
- Dev/development: existing auto-submit may remain.
- QA/production: block auto-submit and require explicit user confirmation.
- Make button text and page copy clear.
- Ensure invalid/expired/used token states still work.

Stage 3 — Verify:
- Dev auto-submit works if enabled.
- QA/production link opens confirmation page but does not call verify API until button click.
- Scanner-like GET/page-load does not verify account.

---

## BLQ-017 — Admin RBAC

Status: TEST NOW  
Priority: P0

Confirmed answer:

- Backend hard-coded policies are authoritative for sensitive workflows.
- RBAC UI controls visible configuration but cannot bypass sensitive backend rules.

Expected tests later:
- Admin can save RBAC configuration.
- Custom RBAC cannot bypass expense self-processing, document classification, finance approval, or admin-only security settings.

---

## BLQ-018 — Helpdesk SLA

Status: TEST NOW  
Priority: P1

Confirmed answer:

- Use default behavior.
- Test API-returned SLA values only.
- Do not assert custom business thresholds unless code/config explicitly defines them.

---

## BLQ-019 — Notifications

Status: TEST NOW; FUTURE AFTER TEST SHEET FOR FULL EVENT-CHANNEL MATRIX  
Priority: P1

Business rule:

- Test the basic notification feed/read/unread behavior now.
- Only test notification events currently generated by code.
- Full in-app/email/push business event matrix is future scope.

Implementation plan required:

Stage 1 — Audit:
- Identify notification endpoints and current event producers.

Stage 2 — Implement only if basic behavior is broken:
- Notification list.
- Unread count.
- Mark one as read.
- Mark all as read.
- User-scoped visibility.

Stage 3 — Verify:
- Notification list is user-scoped.
- Read/unread count updates.
- No cross-user leakage.

Future after test sheet:
- Complete event-to-channel matrix.
- Email/push provider-backed notification delivery.
- Admin channel policy enforcement by event type.

---

## BLQ-020 — Reports and exports

Status: TEST NOW  
Priority: P1

Confirmed answer:

- Use default behavior.
- Test on-demand exports and download handoff only.
- Scheduled exports, export retention cleanup, and strict XLSX field parity are future/hardening unless code already supports them.

---

## BLQ-021 — EMS profile fields

Status: TEST NOW  
Priority: P1

Confirmed answer:

- Use default behavior.
- Treat backend accepted direct edits as allowed.
- Treat backend rejected fields as requiring profile change request.

---

## BLQ-022 — Asset recovery

Status: TEST NOW; FUTURE AFTER TEST SHEET FOR PAYROLL/FINANCE INTEGRATION  
Priority: P1

Confirmed answer:

- Use current behavior now.
- Test Asset Manager/Admin recovery settlement only.
- Do not test payroll deduction integration now.

Future after test sheet:
- Employee acknowledgement/dispute.
- Finance approval.
- Payroll/accounting deduction integration.

---

## BLQ-023 — Production docs exposure

Status: TEST NOW  
Priority: P2

Confirmed answer:

- Use default behavior.
- Keep `/docs` and `/api/v1/openapi.json` as current behavior.
- Flag as security review item in QA/report.

---

## BLQ-024 — Empty workspace behavior

Status: IMPLEMENT NOW  
Priority: P0

Business rule:

- After new company bootstrap, dashboard and module pages must show zero/empty real organization data only.
- Seeded/demo/random data must never appear in production/API mode after bootstrap.
- Mock fallback must not mask backend empty states in production/API mode.

Implementation plan required:

Stage 1 — Audit:
- Trace bootstrap flow, dashboard API, frontend dashboard components, mocks/fallbacks, EMS/attendance/timesheet pages, and environment flags.

Stage 2 — Implement:
- Ensure production/API mode uses backend empty results only.
- Disable mock/demo data fallback after real bootstrap.
- Add clear empty states for dashboard/module pages.
- Keep demo/mock only in explicit demo/local mode.

Stage 3 — Verify:
- New company bootstrap shows empty dashboard/modules.
- No unrelated/random seeded data appears.
- API failures show error/retry, not fake data, in production/API mode.

---

## BLQ-025 — Mobile support

Status: TEST NOW  
Priority: P2

Confirmed answer:

- Desktop is the primary app experience.
- Mobile screen support is also priority for responsive coverage.
- Test both desktop and mobile responsive screens.
- Prioritize mobile for:
  - Login
  - Dashboard
  - Attendance punch
  - Leave request creation
  - Expense request creation
  - Helpdesk ticket creation
- Dense admin/finance operations can be desktop-first unless already mobile-ready.

---

# Required outputs from this prompt

After implementing the `IMPLEMENT NOW` items, create/update:

## 1. `qa/BUSINESS_RULES_CONFIRMED.md`

Must include:

- Final role model
- Final expense workflow
- Final attendance/off-day rules
- Leave calculation policy
- Cost-center autofill rule
- Document deletion rule
- Email verification environment rule
- Empty workspace rule
- Rules confirmed as default/no-code-change
- Future-scope rules

## 2. `qa/NEED_ACTION_IMPLEMENTATION_PLAN.md`

For each need-action item, include:

- BLQ ID
- Business decision
- Why it matters
- Stage 1: Discovery/Audit
- Stage 2: Implementation
- Stage 3: Verification
- Files likely touched
- Tests required
- Risk level
- Rollback note

## 3. `qa/IMPLEMENTATION_CHANGELOG.md`

Include:

- Source files changed
- What changed
- Why changed
- Business rule covered
- Test coverage added/updated
- Known limitations

## 4. `qa/IMPLEMENTATION_VERIFICATION_REPORT.md`

Include:

- Commands run
- Results
- Failed/skipped commands with reason
- Manual verification still needed
- Screens/APIs verified

## 5. `qa/FUTURE_SCOPE_AFTER_TEST_SHEET.md`

Only list future items. Do not implement them now.

Include:

- BLQ ID
- Future feature
- Why it is future
- Recommended implementation after QA sheet generation
- Suggested test coverage for future release

---

# Required verification before stopping

Run the relevant commands available in the repo, such as:

- backend typecheck/build/test
- frontend typecheck/build/test
- lint if configured
- Playwright/e2e smoke if configured and feasible
- targeted unit/integration tests for changed modules

If a command cannot run due to environment/database/service limitations, document exactly why in `qa/IMPLEMENTATION_VERIFICATION_REPORT.md`.

Stop after implementation and verification. Do not generate the final testing checklist yet.
