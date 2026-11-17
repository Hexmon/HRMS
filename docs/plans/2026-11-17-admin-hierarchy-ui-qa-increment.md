# Admin Hierarchy UI QA Increment

## Scope

Complete the existing department/designation master-data journey on top of the merged TEN-S25-005 backend foundation. This slice adds the missing hierarchy controls, makes records beyond the first API page reachable, and presents honest pending/conflict/recovery states. The eight extended-master resources remain globally shared in the current backend, so API mode exposes only Departments and Designations; tenant-scoping those other resources is separate work. Broader company settings, RBAC, workflow and security-policy tenancy remain outside this increment.

## User and data path

`Admin/HR -> /admin-settings/master-data -> admin query/mutation hooks -> /api/v1/admin/master-data/{departments|designations} -> admin policy/service -> tenant-scoped PostgreSQL transaction -> refreshed query/UI`

Backend authorization remains authoritative. Parent choices are derived only from bounded authenticated company-scoped department searches. The department response includes the current same-company parent name so an off-page or later-inactive parent remains understandable. An edit omits `parent_department_id` when the parent was not changed, sends `null` only when the user explicitly clears it, and sends a UUID only for an explicit selection.

## Required cases

- QAI-A01: Admin creates and edits department/designation records, reloads, and sees persisted parent/level values; Employee direct writes remain denied by existing backend tests.
- QAI-A02: Parent selection excludes self, descendants and inactive departments; explicit clear sends `null`; untouched edit omits the parent field; stale version preserves the draft and offers a latest-version reload.
- QAI-A03: More than 100 departments/designations remain reachable through bounded API pages; duplicate clicks produce one mutation; network failure keeps the modal/draft available for retry.
- QAI-U01: Controls have labels, keyboard operation and usable narrow/light/dark layouts; mutation controls are disabled while a request is pending.

## Verification

- Focused frontend unit/component tests for server pagination/search, hierarchy candidates, payload semantics, stale/off-page recovery and duplicate save/status prevention.
- Frontend lint, typecheck, unit coverage and contract/route guards.
- Existing backend admin master-data integration and tenant/cycle tests against disposable PostgreSQL.
- Real API-backed Admin/HR browser journey with Company A/B fixtures, mobile/keyboard/theme/network/stale-tab cases.
- Trusted changed-line/branch coverage and independent senior/security/QA review at the final SHA.

## Migration, configuration and rollback

No migration or new environment variable is expected. The API response only gains nullable `parent_department_name`; older clients remain compatible. Rollback is a normal revert of this frontend/response-contract increment; existing stored data is unchanged.

## Local verification evidence

Verified on 2026-11-17 against an isolated local PostGIS 16 database and Valkey instance with synthetic users and data only:

- frontend unit/component: 29/29 passed;
- backend Admin master-data PostgreSQL integration: 23/23 passed, including tenant/role denial, hierarchy cycles, OCC, concurrency, rollback, recovery and transactional outbox cases;
- backend unit: 602/602 passed;
- backend contracts: 27/27 passed;
- generated OpenAPI drift and frontend-consumer compatibility: passed;
- frontend lint: zero errors (43 existing Fast Refresh warnings), typecheck, production API guard, implemented-route guard and route-coverage guard: passed;
- Vercel production build and SSR smoke response: passed;
- real API-backed Chromium journeys: 3/3 passed in the matching Playwright container, covering Admin hierarchy/stale-tab recovery, HR designation levels, Employee UI/API denial, server pagination, refresh/back, duplicate-click prevention, disconnected-request recovery, keyboard theme toggle and mobile layout.

Initial runs that did not reach product assertions are retained as setup evidence: unsupported local email enum values, a non-`_test` disposable database name, missing build/rate-limit test configuration, and incomplete release/QA seed role-catalog/session-preference data were corrected only in the ignored local environment or disposable database. The seed defects are separate follow-up work and are not hidden by this increment.

Still pending at this revision: trusted changed-line/branch coverage on a clean commit, exact-head independent senior/security/QA review, GitHub CI, hosted QA deployment and human QA acceptance. The Sprint 25 Google Sheet is not updated until its connector is installed and accessible.
