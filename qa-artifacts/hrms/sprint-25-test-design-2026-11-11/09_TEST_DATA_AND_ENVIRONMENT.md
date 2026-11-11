# Synthetic Fixtures And Execution Setup

Create isolated companies A/B with distinct employees, assigned Managers, HR, Finance, Auditor, Admin, Asset Manager and Helpdesk identities. Add unrelated same-company resources, stable original-company history after transfer, current/stale row/auth versions and pending/active/suspended/terminated/deleted accounts. Backend privilege is assigned-role union, not UI role mode.

Set a fixed clock and explicit office calendar/policy in test fixtures. These fixture values do not approve business entitlements. Use configured L boundaries and real invalid calendar dates. Money examples are synthetic arithmetic checks, not tax/salary policy. Providers use approved test accounts/stubs as appropriate; mock acceptance is not delivered email. Real credentials stay in secret stores and are never placed in the workbook.

Backend current scripts: pnpm test:unit, test:contracts, test:integration, test:e2e. Frontend has Playwright but no inspected unit runner; QA-S25-003 must supply unit/component and changed-line instrumentation. Do not invent frontend unit/coverage commands. Exact environment/BUILD_SHA and authorized disposable DB must be recorded before tests.
