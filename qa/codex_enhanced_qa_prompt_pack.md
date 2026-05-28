# Enhanced Codex QA Prompt Pack — Hawkaii HRMS Enterprise/Product-Grade Testing Sheet

Use these prompts in order. They are designed for Codex, not Claude.

The workflow is intentionally business-aware and code-aware:

1. Analyze the codebase.
2. Ask/record business logic.
3. Implement required `need action` items.
4. Generate internal QA test sheet.
5. Generate client/UAT test sheet.
6. Generate professional `.docx` and `.xlsx` QA artifacts.
7. After the test sheet is generated, create the future-scope roadmap and next implementation prompt.

This format follows enterprise test-management patterns: test plans/suites/cases, step-level expected results, actual results, pass/fail/block statuses, requirement/business-rule traceability, test data, defect linkage, risk/priority, and sign-off.

---

## Output folder standard

All generated QA artifacts must live under:

```text
qa/
```

Recommended final output tree:

```text
qa/
  CODEBASE_TESTING_ANALYSIS.md
  BUSINESS_LOGIC_QUESTIONS.md
  BUSINESS_RULES_CONFIRMED.md
  NEED_ACTION_IMPLEMENTATION_PLAN.md
  IMPLEMENTATION_CHANGELOG.md
  IMPLEMENTATION_VERIFICATION_REPORT.md
  TESTING_CHECKLIST_INTERNAL.md
  TESTING_CHECKLIST_CLIENT.md
  TESTING_TEST_CASES.xlsx
  TESTING_CHECKLIST_CLIENT.docx
  TEST_EXECUTION_SUMMARY.md
  TRACEABILITY_MATRIX.md
  FUTURE_SCOPE_AFTER_TEST_SHEET.md
  FUTURE_IMPLEMENTATION_PROMPT.md
  scripts/
    generate_qa_artifacts.py
```

---

# Prompt 1 — Repository Discovery + Business Logic Questions

Paste this first.

```text
You are acting as a Senior QA Engineer, Business Analyst, Staff Engineer, and Release Readiness Owner.

Goal:
Understand this repository deeply before generating or modifying any final testing checklist.

Important constraints:
- Do not modify application source code in this phase.
- Do not generate the final testing checklist in this phase.
- Only create files inside `/qa`.
- Separate code-proven facts from inferred product behavior.
- If business logic is unclear, ask a question instead of assuming silently.
- Backend APIs and backend permissions are the source of truth.
- Frontend route guards are UX only and must be cross-checked against backend permissions.

Read the entire repository carefully, including:
- README and product documentation
- package/config/build files
- routes/pages/screens
- UI components
- API clients/controllers/services
- database models/schemas/migrations/seeds
- validation logic
- auth/session/JWT/cookie logic
- state management
- role/permission logic
- workflow/state-machine logic
- payment/expense/finance logic
- attendance/leave/timesheet logic
- document/media/storage logic
- notification/email/webhook logic
- reports/exports
- tests/e2e specs if they exist

Create:

qa/CODEBASE_TESTING_ANALYSIS.md

The file must include:

1. Product Summary
- What this app does
- Main modules
- Main user roles/personas
- Main business goals
- Code evidence

2. Feature / Screen / API Map
For each feature:
- Feature name
- User goal
- Frontend routes/screens/components
- Backend routes/services/state machines
- APIs used
- Data/state dependencies
- Business rules proven from code
- Edge cases proven from code
- Missing/unclear business rules
- Risk level: High / Medium / Low

3. Role and Permission Matrix
For each role:
- What they can do
- What they cannot do
- Backend permission evidence
- Frontend route evidence
- Mismatch between frontend and backend
- Security/negative test implications

4. Business Entity and Status Map
For each entity:
- Fields that matter for testing
- Status values
- Allowed transitions
- Blocked transitions
- Terminal states
- Version/concurrency rules
- Audit/document/report dependencies

5. Workflow Matrix
Include workflows for:
- Auth/session/onboarding
- Employee/EMS
- Attendance
- Leave/WFH
- Timesheets
- Expenses
- Projects/utilization
- Documents/media
- Assets
- Helpdesk
- Notifications
- Reports/exports
- Admin settings

6. Risk Register
Include:
- Revenue/payment risk
- Auth/session risk
- Data loss risk
- Permission/security risk
- Client UAT risk
- Performance risk
- Mobile/platform risk
- External API/storage/email risk
- Data integrity risk
- Compliance/audit risk

7. Clarifying Questions
Create:

qa/BUSINESS_LOGIC_QUESTIONS.md

Use this exact format:

QID:
Area:
Priority: P0 / P1 / P2
Question:
Why this matters:
Default assumption if unanswered:
Potential test cases affected:
Potential implementation impact:

Only ask questions that will improve business-related test cases or prevent bad implementation assumptions.

Stop after creating the analysis and questions.
```

---

# Prompt 2 — Business Answers + Need-Action Implementation

Paste the dedicated prompt from:

```text
codex_prompt_2_business_answers_action_plan.md
```

That prompt does three things:

1. Converts all business answers into confirmed rules.
2. Creates a staged implementation plan for every `need action`.
3. Implements and verifies required product changes before final QA sheet generation.

Do not generate the final checklist until Prompt 2 is complete.

---

# Prompt 3 — Generate Internal Enterprise QA Test Sheet

Paste this after Prompt 2 implementation and verification are complete.

```text
You are acting as a Senior QA Lead for a large product-based company preparing a release-grade manual QA package.

Use these sources:
- qa/CODEBASE_TESTING_ANALYSIS.md
- qa/BUSINESS_RULES_CONFIRMED.md
- qa/NEED_ACTION_IMPLEMENTATION_PLAN.md
- qa/IMPLEMENTATION_CHANGELOG.md
- qa/IMPLEMENTATION_VERIFICATION_REPORT.md
- The current source codebase after implemented changes

Goal:
Generate an internal QA test sheet that is detailed enough for engineering QA, regression testing, release sign-off, and client UAT preparation.

Create:

qa/TESTING_CHECKLIST_INTERNAL.md
qa/TRACEABILITY_MATRIX.md
qa/TEST_EXECUTION_SUMMARY.md

Important:
- Do not expose fake/mocked assumptions as real behavior.
- Test the implemented business logic, not the old assumptions.
- Backend permission checks are authoritative.
- Include negative tests for every sensitive backend permission rule.
- Prioritize P0 business-critical flows first.
- Include tests for both desktop and mobile responsive screens where applicable.
- Include empty workspace/new company bootstrap tests.
- Include real Cloudinary/UAT persistence tests.
- Include API failure/loading/empty/offline behavior where relevant.
- Include role-based access and self-processing prevention tests.

Use this internal test case format:

Test Case ID:
Suite:
Feature:
Business Flow:
Priority: P0 / P1 / P2
Risk: Critical / High / Medium / Low
Type:
- Happy Path
- Negative
- Edge Case
- Business Rule
- Permission/Security
- API Failure
- UI State
- Data Integrity
- Performance
- Mobile/Responsive
- Regression

Requirement / Business Rule ID:
Persona / Role:
Environment:
Preconditions:
Test Data:
Screen / Route:
API / Service:
Steps:
Expected Result:
Actual Result:
Status: Not Run / Pass / Fail / Blocked / Retest
Defect ID:
Evidence Link:
Owner:
Notes:

Mandatory coverage sections:

1. Release Readiness Summary
- Total test cases
- P0/P1/P2 count
- Critical risk areas
- Required environment/configuration
- What must pass before client delivery

2. Role and Permission Coverage
- Employee
- Manager
- Finance Manager
- Admin
- Auditor
- Asset Manager
- HR Manager
- Any remaining supported backend role
- Forbidden route/API tests
- Self-processing prevention tests

3. Auth, Session, Onboarding
- Signup
- Email verification
- QA/production verification confirmation page
- Login/logout
- Password reset
- 401 session clearing
- New company bootstrap
- Empty real data after bootstrap

4. Employees/Core
- CRUD
- role assignment
- manager assignment
- department/cost-center autofill
- profile photo
- import/export if implemented
- inactive/suspended/terminated states

5. EMS
- profile direct edits
- profile change requests
- document upload/delete
- HR queues
- policies/letters/acknowledgements

6. Attendance
- punch in/break/out
- target hours
- off-day work deficit coverage
- overtime/extra hours visibility
- manager/admin visibility
- timezone/midnight crossing
- regularization and self-approval blocking

7. Leave/WFH/Holidays
- balances and read-only admin calculation view
- apply/cancel/approve/return/reject
- global holidays
- optional holiday behavior
- negative balance behavior

8. Timesheets
- work segment creation
- cycle submission
- under/over expected hours warning
- approval/return/reject
- missing submissions
- project/time analytics

9. Expenses/Finance
- employee/admin/manager/finance-manager created expense routing
- Manager -> Finance Manager flow
- no Reviewer wording
- no Director approval stage
- Admin cannot approve/verify/pay/settle
- self-processing blocked
- routing exception / blocked submission when approver missing
- required docs
- payment release
- settlement
- stale version/concurrency
- audit/timeline

10. Projects/Utilization
- project CRUD
- allocation <=100%
- over-allocation warning
- over-allocation approval flow
- pending/rejected/approved effects
- utilization reports

11. Documents/Media
- upload policy
- real Cloudinary persistence
- delete warning
- full storage + DB deletion
- no download after delete
- classification access
- unauthorized access denied

12. Assets
- inventory
- assignment/return
- recovery settlement current behavior
- license lifecycle if present
- future payroll deduction not tested now

13. Helpdesk
- ticket creation
- queue management
- comments/internal notes
- assignment/status/priority
- SLA values from API only
- user-scoped access

14. Notifications
- list
- unread count
- mark one read
- mark all read
- generated events currently supported
- no cross-user leakage

15. Reports/Exports
- role-scoped reports
- page size caps
- on-demand export
- download handoff
- XLSX/CSV/JSON if implemented
- scheduled export future scope only

16. Admin Settings
- company profile
- master data
- role/RBAC UI
- backend hard-coded sensitive policies remain authoritative
- workflow settings save/reload
- runtime-active vs config-only workflow matrix
- attendance policy
- leave calculation read-only view
- notification channel settings

17. Mobile/Responsive
- login
- dashboard
- attendance punch
- leave request
- expense request
- helpdesk ticket
- core navigation
- dense tables desktop-first notes

18. Performance/Scale Smoke
- dashboard load
- reports with pagination
- exports
- document upload/download
- large table page size cap
- no page_size over backend limits

19. Data Integrity and Audit
- no duplicate employee code/email
- no duplicate payment reference
- stale version conflict
- audit event/timeline creation
- deleted document disappears
- empty workspace has no fake data

20. Open Assumptions and Future Scope
- Only include items not part of this release.
- Do not mix future test cases into release sign-off.

Traceability Matrix requirements:
Create `qa/TRACEABILITY_MATRIX.md` with columns:
- Business Rule ID
- Requirement / Feature
- Risk
- Role
- Screen/API
- Test Case IDs
- Status
- Notes

Execution Summary requirements:
Create `qa/TEST_EXECUTION_SUMMARY.md` with:
- Release/build info placeholders
- Environment checklist
- P0/P1/P2 counts
- Not-run/blocker summary
- Sign-off readiness criteria
```

---

# Prompt 4 — Generate Client/UAT-Friendly Checklist

Paste this after internal checklist generation.

```text
You are acting as a Senior UAT Lead preparing a client-ready QA checklist.

Read:

- qa/TESTING_CHECKLIST_INTERNAL.md
- qa/TRACEABILITY_MATRIX.md
- qa/BUSINESS_RULES_CONFIRMED.md

Create:

qa/TESTING_CHECKLIST_CLIENT.md

Rules:
- Remove internal code file paths, component names, implementation notes, and developer-only comments.
- Keep business-friendly wording.
- Keep test case IDs and priority.
- Keep enough detail for a client/tester to execute.
- Keep expected results clear and measurable.
- Do not include future-scope items as release test cases.
- Include a separate “Future Scope / Not Included in This Release” section at the end.
- Use clean professional language.

Client document structure:

1. Title
- Product name
- QA/UAT Checklist
- Build Version
- Environment
- Date

2. Tester Details
- Tester Name
- Role
- Device/OS
- Browser
- Test Start Date
- Test End Date

3. Release Scope
- Modules covered
- Roles covered
- Critical business flows
- Out-of-scope/future items

4. How to Use This Checklist
- Pass
- Fail
- Blocked
- Actual Result
- Evidence
- Defect ID

5. Summary Table
Columns:
- Section
- Total Test Cases
- P0
- P1
- P2
- Required for Sign-off
- Status

6. Test Cases by Business Flow
For each test case include:
- Test Case ID
- Priority
- Business Flow
- User Role
- Preconditions
- Steps
- Expected Result
- Pass checkbox
- Fail checkbox
- Blocked checkbox
- Actual Result
- Defect ID
- Notes

7. UAT Sign-off
- Tester Name
- Client Representative
- Overall Status
- Open Blockers
- Signature
- Date
- Comments
```

---

# Prompt 5 — Generate Professional DOCX + XLSX QA Artifacts

Paste this after client checklist generation.

```text
You are acting as a Senior QA Documentation Owner for an enterprise product release.

Read:

- qa/TESTING_CHECKLIST_INTERNAL.md
- qa/TESTING_CHECKLIST_CLIENT.md
- qa/TRACEABILITY_MATRIX.md
- qa/TEST_EXECUTION_SUMMARY.md
- qa/BUSINESS_RULES_CONFIRMED.md

Goal:
Generate professional client-ready and QA-execution-ready artifacts.

Create:

1. qa/TESTING_CHECKLIST_CLIENT.docx
2. qa/TESTING_TEST_CASES.xlsx
3. qa/scripts/generate_qa_artifacts.py

If a required library is unavailable, create the script anyway and document the exact command needed to run it. Prefer Python with `python-docx` and `openpyxl` if available. Do not modify application source code just to generate these artifacts.

DOCX requirements:

- Professional title page
- Product name: Hawkaii HRMS
- Document type: Client UAT / Manual Testing Checklist
- Build Version field
- Environment field
- Tester details
- Version history table
- Release scope
- Out-of-scope/future scope
- Executive QA summary
- Section summary table
- Grouped test cases by business flow
- Clear Pass / Fail / Blocked fields
- Actual Result field
- Defect ID field
- Evidence field
- Notes field
- Sign-off page
- Page numbers if supported
- Clean headings and tables
- No source-code paths in client-facing document

XLSX requirements:

Create a workbook named:

qa/TESTING_TEST_CASES.xlsx

Use a product-grade QA execution structure with these sheets:

Sheet 1: Run_Control
Columns/fields:
- Product
- Release / Build Version
- Environment
- Test Cycle
- Tester
- Start Date
- End Date
- Device/OS
- Browser
- API Base URL
- Cloudinary Mode
- Notes
- Overall Status

Sheet 2: Execution_Summary
Columns:
- Module / Suite
- Total Cases
- P0
- P1
- P2
- Not Run
- Passed
- Failed
- Blocked
- Retest
- Pass %
- Blocking Defects
- Sign-off Required
- Owner

Sheet 3: Test_Cases
One row per test case.
Columns:
- Test Case ID
- Suite
- Feature
- Business Flow
- Requirement / Business Rule ID
- Priority
- Risk
- Type
- Persona / Role
- Platform: Desktop / Mobile / API / Cross-platform
- Preconditions
- Test Data
- Step Summary
- Expected Result
- Status: Not Run / Pass / Fail / Blocked / Retest
- Actual Result
- Defect ID
- Evidence Link
- Owner
- Last Run Date
- Notes
- Automation Candidate: Yes / No / Later

Sheet 4: Test_Steps
One row per test step.
Columns:
- Test Case ID
- Step No
- Action
- Expected Result
- Actual Result
- Step Status
- Evidence Link
- Notes

Sheet 5: Traceability_Matrix
Columns:
- Business Rule ID
- Requirement / Feature
- Risk
- Role
- Screen / Route
- API / Service
- Test Case IDs
- Current Coverage
- Gap / Notes

Sheet 6: Test_Data
Columns:
- Data ID
- Persona / Role
- Scenario
- Required Data
- Source
- Environment
- Reset Needed
- Notes

Sheet 7: Defect_Log
Columns:
- Defect ID
- Test Case ID
- Severity
- Priority
- Module
- Summary
- Steps to Reproduce
- Expected
- Actual
- Owner
- Status
- Evidence Link
- Retest Result

Sheet 8: Risk_Register
Columns:
- Risk ID
- Area
- Risk Description
- Business Impact
- Likelihood
- Severity
- Mitigation
- Related Test Case IDs
- Owner
- Status

Sheet 9: Assumptions_Open_Questions
Columns:
- ID
- Area
- Assumption / Question
- Impact
- Decision Needed By
- Owner
- Status
- Notes

Sheet 10: Future_Backlog
Columns:
- Backlog ID
- Source BLQ
- Future Item
- Business Value
- Recommended Stage
- Suggested Tests
- Owner
- Priority
- Notes

Formatting requirements:
- Freeze header row on each sheet.
- Add filters to all tabular sheets.
- Bold headers.
- Use readable column widths.
- Wrap text for long fields.
- Add dropdown/data validation where feasible for Status, Priority, Risk, Type, Platform, Automation Candidate.
- Keep the workbook execution-friendly, not decorative.
- Do not merge too many cells because testers need filtering/sorting.
- Keep every test case traceable to a business rule or feature.

After generation:
- Validate that `.docx` and `.xlsx` files exist.
- Open or inspect workbook/doc structure if possible.
- Update `qa/TEST_EXECUTION_SUMMARY.md` with generated artifact paths.
```

---

# Prompt 6 — Future Scope After Test Sheet Generation

Run this only after the DOCX and XLSX are generated.

```text
You are acting as a Product QA Lead and Delivery Planner.

Read:

- qa/FUTURE_SCOPE_AFTER_TEST_SHEET.md
- qa/TESTING_CHECKLIST_INTERNAL.md
- qa/TESTING_TEST_CASES.xlsx if readable
- qa/BUSINESS_RULES_CONFIRMED.md
- qa/IMPLEMENTATION_CHANGELOG.md

Goal:
Now that the release QA sheet has been generated, convert all future-scope items into a clear next-stage implementation and testing plan.

Create:

qa/FUTURE_IMPLEMENTATION_PROMPT.md
qa/FUTURE_ROADMAP_AND_TEST_BACKLOG.md

Rules:
- Do not modify application source code in this prompt.
- Do not mix future backlog into current release sign-off.
- Each future item must have business value, implementation scope, dependencies, risks, and test coverage.
- Create a Codex-ready prompt that can be used later to implement the future work.

Include these known future areas if present:

1. Attendance off-day work
- Comp-off policy
- Payroll credit
- Promotion/performance scoring linkage

2. Leave policy
- Editable leave policy configuration
- Carry-forward scheduler
- Encashment workflow
- Probation-specific policy engine

3. Notifications
- Full event-to-channel matrix
- Email/push provider-backed delivery
- Admin notification policy enforcement

4. Asset recovery
- Employee acknowledgement/dispute
- Finance approval
- Payroll/accounting deduction integration

5. Reports/exports
- Scheduled exports
- Retention cleanup
- Strict XLSX field parity
- Export governance

For every future item, use this format:

Future ID:
Source BLQ:
Business Value:
Current Release Behavior:
Future Target Behavior:
Implementation Stages:
Data/Schema Impact:
API Impact:
Frontend Impact:
Permission/Security Impact:
Reports/Exports Impact:
Test Coverage Needed:
Risks:
Suggested Priority:
```

---

# Optional AGENTS.md Addition

Add this to `AGENTS.md` if you want Codex to remember the QA workflow in future sessions.

```text
# QA Checklist Generation Rules

When generating QA artifacts for this repo:

1. Analyze code and business rules before generating tests.
2. Backend roles and permissions are the source of truth.
3. Separate internal QA artifacts from client/UAT artifacts.
4. Do not expose code paths in client-facing docs.
5. Every test case must map to a feature, role/persona, business rule, risk, and expected result.
6. P0 tests must cover auth, permissions, expense routing, self-processing prevention, data integrity, empty workspace behavior, real storage persistence, document deletion, attendance target/off-day behavior, and release-critical flows.
7. Generate both `.docx` and `.xlsx` final artifacts.
8. Future-scope items must be documented after test sheet generation, not mixed into current release sign-off.
```
