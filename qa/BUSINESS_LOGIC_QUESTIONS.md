# Business Logic Questions

QID: BLQ-001
Area: Roles and personas
Priority: P0
Question: Should the final product expose `Auditor`, `Director`, and `Helpdesk Agent` as first-class frontend roles, or should they continue mapping into existing frontend personas?
Why this matters: Backend roles and frontend roles do not match exactly. This affects navigation, route access, dashboard expectations, and role-based test cases.
Default assumption if unanswered: Treat backend roles as source of truth for permissions and treat frontend role mappings as UX aliases only.
need action : need to fix this as source should be backend and revamn from froitnedn to make exact with backend (imp: remvoe revinwer thigns if exist and whole reviewr  as manager )

QID: BLQ-002
Area: Expense approval routing
Priority: P0
Question: If a requester is the only manager, only finance manager, or the Admin, who must verify and approve that request?
Why this matters: Backend blocks self-processing for manager, finance, payment, and settlement actions. Without a backup route, some tickets can become unapprovable.
Default assumption if unanswered: Require a configured backup approver; if no valid backup exists, ticket should move to a routing-exception state or be blocked from submission.
need action : mendati this also theri shoude be min 2 manager, only finance manager, and for admin it should follow the procee of having an manager then finance manegr and also admin cannont do manager work or finance manager work 

QID: BLQ-003
Area: Expense workflow
Priority: P0
Question: Is `Director` approval still part of the live expense workflow, or is the active flow strictly Employee -> Manager/Reviewer -> Finance -> Payment -> Settlement?
Why this matters: Backend has a `Director` role, while docs repeatedly say to preserve Manager -> Finance vocabulary and not reintroduce legacy director queues.
Default assumption if unanswered: Do not test Director as a separate mandatory expense approval stage; test it as a manager-equivalent role only.
need action : not the v1 feature of expecn should be employee -> manager -> finance manager as we previlsy decide thatwe shoue have manager but wil devleoping we didnt find it good other then then this remove that 

QID: BLQ-004
Area: Admin workflow configuration
Priority: P0
Question: Which Admin workflow settings must actively change runtime approval routing today, and which are configuration-only for now?
Why this matters: Admin workflows persist, but task-sheet notes say runtime approval engines are not fully changed by that slice.
Default assumption if unanswered: Test that settings save correctly, but do not assume they alter live workflow behavior unless code explicitly uses them.
need action : check the actul code flow and test this feature end to end from frontend testing as well 

QID: BLQ-005
Area: Attendance policy
Priority: P0
Question: How should off-day punches be treated when Admin allows them: overtime, regular attendance, exception, comp-off credit, or only visible worked time?
Why this matters: Admin can configure off-day punch behavior, but payroll/attendance meaning is a business decision.
Default assumption if unanswered: Treat allowed off-day punches as attendance records with worked time only, not automatic comp-off/payroll credit.
need action : as it treted as suppoer any empy unabel to compete hourse in week days then can do in off days or if incase it compets then those shows to the over time accoriding to that employes repots can be preapred for proepmtion or other things but this can be done in future but make sure to take that data and show it to somewher to the empoayy and the manager and other uper level roles in the deprtments   

QID: BLQ-006
Area: Attendance shifts and working hours
Priority: P0
Question: What is the authoritative source for employee target hours: company working day config, shift master data, attendance policy, timesheet policy, or user-specific assignment?
Why this matters: Dashboard, attendance, timesheets, late/absent history, and missing submission logic all depend on expected hours.
Default assumption if unanswered: Use Admin attendance policy and company working days as default, with shift-specific override only when code explicitly supports it.
ans : admin can configure it default ans is the correct ans  

QID: BLQ-007
Area: Midnight and timezone attendance
Priority: P1
Question: How should punch sessions crossing midnight be assigned to work dates?
Why this matters: Backend computes date/timezone-sensitive daily records, and night shift/24-hour punch windows can cross calendar days.
Default assumption if unanswered: Assign the session to the work date of check-in in the user's timezone.
ans: go with default 

QID: BLQ-008
Area: Leave policy
Priority: P0
Question: What are the leave accrual, carry-forward, encashment, probation eligibility, and negative-balance rules?
Why this matters: Leave balance display and approval tests require expected calculations, not just UI/API availability.
Default assumption if unanswered: Validate request lifecycle and displayed balances from API, but do not assert accrual math beyond code-provided values.
need action : do research on this and implimnt the heigh pase enviroment of working should be going on but make sure do no change any frature just make sure you implimnt this do a proepr requried expected calcuations and that caclusin is only visible to the amdin in admin setting that cannot be modifiable in this stage can be done in future 

QID: BLQ-009
Area: Holidays and regions
Priority: P1
Question: Are holidays global, regional, location-based, or employee-specific? How do optional holidays affect attendance and leave balance?
Why this matters: Attendance status, leave duration, and calendar tests need region/location expectations.
Default assumption if unanswered: Treat `region = All` holidays as global and optional holidays as display-only unless code applies them.
ans: go with default 

QID: BLQ-010
Area: Timesheets
Priority: P0
Question: Can employees submit fewer or more hours than expected, and should approval block, warn, or allow under/over-submitted cycles?
Why this matters: Missing submissions and productivity metrics depend on expected-vs-submitted rules.
Default assumption if unanswered: Allow submission if backend accepts it; report under/over submission as warning/analytics only.
ans : take referance from QID: BLQ-005 

QID: BLQ-011
Area: Projects and utilization
Priority: P1
Question: Should allocation over 100 percent be blocked at save time, allowed with overload warnings, or allowed only for specific roles?
Why this matters: Utilization and project staffing tests need to know whether over-allocation is invalid or just a risk state.
Default assumption if unanswered: Treat over-allocation as reportable warning unless backend validation blocks it.
need action : show wraning but can assing if the user are accpeting it so need a request and approval flow in simple terms but with some authoirty 

QID: BLQ-012
Area: Cost center
Priority: P1
Question: When should cost center become mandatory, and for which entities: project, expense, department, employee, or finance report only?
Why this matters: Cost center is currently optional, but finance/reporting may later require it.
Default assumption if unanswered: Keep cost center optional and test only that null/empty values do not break workflows.
need action : as this are option but it shoue get auto fill accoridng to the department 

QID: BLQ-013
Area: Documents and deletion
Priority: P0
Question: Should document deletion be permanent from storage, soft-delete only, or blocked for verified/legal/finance documents?
Why this matters: Current backend removes storage object and soft-deletes metadata. Compliance may require retention.
Default assumption if unanswered: Test current behavior: authorized delete removes object and marks metadata deleted.
need action : make sure to current give warning whill deleting and delete it coepltey from storeage as well as from db 

QID: BLQ-014
Area: Document retention and audit
Priority: P1
Question: How long should document access logs, email event payloads, and generated exports be retained?
Why this matters: Retention affects cleanup jobs, QA data assertions, and compliance testing.
Default assumption if unanswered: Do not test automatic retention cleanup; only test records are created.
ans : contine with default 

QID: BLQ-015
Area: Cloudinary storage
Priority: P0
Question: For demo/UAT, should `CLOUDINARY_MOCK_UPLOADS=true` be acceptable, or must every UAT use real Cloudinary persistence?
Why this matters: Mock uploads are process-memory and can lose files after restart, which impacts upload/download test reliability.
Default assumption if unanswered: Local demo may use mock; production/UAT release tests require real Cloudinary with mock disabled.
ans :use real coundinary 

QID: BLQ-016
Area: Email verification
Priority: P1
Question: Should email verification auto-submit when the link opens, or should the user confirm on a page first to avoid security scanners verifying accounts?
Why this matters: Current frontend auto-verifies token links, which can be triggered by email scanners.
Default assumption if unanswered: Keep current auto-verification behavior but include scanner risk in release notes.
need action : it shouedl be theri till the node env is dev or devleopmnt for qa and productrion it shoudl be blocked 

QID: BLQ-017
Area: Admin RBAC
Priority: P0
Question: Should custom RBAC roles fully control backend permissions, or are hard-coded backend role policies authoritative for sensitive workflows?
Why this matters: Admin UI can configure roles/permissions, but backend policy files still enforce role-specific rules.
Default assumption if unanswered: Backend hard-coded policies are authoritative; RBAC UI controls visible configuration but cannot bypass sensitive backend rules.
ans : go with default one 

QID: BLQ-018
Area: Helpdesk
Priority: P1
Question: What are SLA thresholds, escalation owners, and category-specific closure/reopen rules?
Why this matters: Helpdesk SLA reports and escalation tests need expected timing and ownership.
Default assumption if unanswered: Use API-returned SLA values without asserting business thresholds.
ans : go with default one 

QID: BLQ-019
Area: Notifications
Priority: P1
Question: Which business events must create in-app notifications, emails, or push notifications?
Why this matters: Admin notification channel settings exist, but a complete event-to-channel matrix is not fully evident.
Default assumption if unanswered: Test notification feed/read state only for events currently generated by code.
need action : test this basic but need to do this in future 
QID: BLQ-020
Area: Reports and exports
Priority: P1
Question: Are scheduled exports, export retention cleanup, and XLSX field parity required for go-live?
Why this matters: Reports/export APIs exist, but scheduling/retention appears hardening/future scope.
Default assumption if unanswered: Test on-demand exports and download handoff only.
ans : go with default 

QID: BLQ-021
Area: EMS
Priority: P1
Question: Which EMS profile fields require HR approval versus direct employee edit?
Why this matters: EMS profile and profile-change request tests need an approved field-level matrix.
Default assumption if unanswered: Treat backend accepted direct edits as allowed and backend rejected fields as requiring change request.
ans : go with default 

QID: BLQ-022
Area: Asset recovery
Priority: P1
Question: Does asset recovery deduction require finance approval, employee acknowledgement, or payroll integration?
Why this matters: Current recovery settlement can mark deduction/waived/lost_damaged, but payroll/accounting workflow is unclear.
Default assumption if unanswered: Test Asset Manager/Admin recovery settlement only, not payroll deduction.
ans : go as it is now but need to do it in future  

QID: BLQ-023
Area: Production docs exposure
Priority: P2
Question: Should `/docs` and `/api/v1/openapi.json` remain public in production?
Why this matters: Auth allowlist currently permits these routes, which may be acceptable for API products or risky for private enterprise deployments.
Default assumption if unanswered: Keep current behavior but flag as security review item.
ans : go with default  

QID: BLQ-024
Area: Empty workspace behavior
Priority: P0
Question: After a new company bootstrap, should dashboards and module pages show zero/empty real organization data only, or is seeded demo data ever allowed?
Why this matters: User-reported UAT risk: dashboard/EMS showing unrelated seeded/random data after setup.
Default assumption if unanswered: Production/API mode must show only real company-scoped backend data and no seed/demo data.
need action :show zero/empty real org data only  

QID: BLQ-025
Area: Mobile support
Priority: P2
Question: Which routes are P0 mobile-supported workflows: attendance punch only, all employee self-service, or full admin/finance operations?
Why this matters: Test coverage depth and responsive layout expectations depend on supported mobile scope.
Default assumption if unanswered: Prioritize mobile tests for login, dashboard, attendance punch, leave/expense request creation, and helpdesk ticket creation.
ans : prioprtise desktop app but mean will mobile screen also both the type of screen are priporty 

therare some all the questin accoring to the action ther are some flage "need action" and "ans" for all need action you need to make a plan with can be multipe stages and need to fix or impltioment that as it is also ans have the business logic simily create a file for prompt 2 to give in the codex after all the resposenes
also enahnce all the other proemts for more related and to the points in testing sheet also for lawst proemn for genteing doc also generte xlxx document refer big tech prodiuct base compaones what they prefer the formte of testing sheet and trate this as the big product so make to perform as the senioer and experinced one 
also all the furure things shoude be done just after  the test sheet genretedtion done 