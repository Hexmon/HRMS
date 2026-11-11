# Employee Lifecycle And Document Gate: Current Source Trace

Snapshot: 2026-11-09, `af89c6a` plus dirty worktree. Classification: source investigation with one focused unit execution, no browser journey. Selected skills: `hrms-codebase-discovery` for vertical trace, `qa-master-checklist` for business rule and oracle questions, `security-review` for access/session implications.

## Trace ELJ-01 — HR Creates And Activates An Employee

| Link | Current source | Gap or limit |
| --- | --- | --- |
| UI to API | `hrms-client/src/routes/_app/employees.tsx` uses `src/lib/employees-store.tsx`; API mode calls adapters in `src/domains/core/api.ts`. The adapter exposes create, activate/deactivate, login enable/disable and role replacement. | Browser states and actual role journey not executed. |
| Validation and authorization | `hrms_backend/src/modules/core/routes.ts` parses create/status/role requests and requires an actor. `service.ts:createUser` requires a people manager, checks globally unique employee code/email, active-company department/designation/manager, and assignable roles. | Need exact role matrix and bad-input/duplicate race checks. |
| Ownership and storage | `service.ts:createUser` adds a global `core.users` row and assigns company by creating/updating `platform.user_session_preferences`. `schema.ts` has no `company_id` in `core.users`; `employee_code` and email have global unique indexes. `visibleUsersFor` derives company visibility through the current preference. | Current preference is not a durable employment-history table. Global employee-code uniqueness is a SaaS scaling conflict if different companies use the same code. |
| Side effects | Create, status and role changes append `core.user.*` outbox events in `service.ts` via `events.ts`; `app.ts` selects a `core` persistence flush after successful core mutations. | Event consumer and historical tenant identity need deeper trace; append is not proof of delivered notification. |
| Activation/login | `service.ts:activateUser` checks role, same-company target and expected version, then sets employment active and emits an event. `enableLogin` queues password setup separately. `deactivateUser`, `disableLogin` and `replaceRoles` revoke user sessions; protected requests check current session/user/company in `plugins/auth.ts`. | No document-verification gate is called by `activateUser`; `enableLogin` can issue setup independently. Actual login still requires an active account. Stale-tab UX remains untested. |
| Documents/EMS | `src/modules/ems/routes.ts` supports employee document upload and admin onboarding checklist. `EmsService.updateAdminChecklist` stores a freeform boolean map and may mark it completed. `DocumentService.verify` records verifier/time in document metadata. | No company-configurable required-document catalog or enforced link from verified document set to activation is established by these paths. |

## Owner Rule EL-001 And Acceptance Oracle

The product owner decided on 2026-11-09 that HR verifies required employee documents before activation and login. The default categories are **identity proof, address proof, education proof, and previous-experience proof if applicable**. A company Admin may add requirements for that company. Raw files are visible only to the employee, assigned HR and company Admin (DEC-011). This is target intent, not current behavior.

Proposed acceptance examples, pending field/role details:

1. A new employee missing any applicable required category remains pending, and activation/login returns a precise server-side block.
2. HR verifies each submitted document; replacing a verified document returns that requirement to pending until the replacement is verified.
3. Company A's extra requirement does not apply to company B; changing a company's template is versioned so existing employees have a defined effective policy.
4. An applicant with no previous experience may mark that category not applicable through an approved HR decision; a free-text self-declaration alone should not silently waive it.
5. A document ID belonging to another employee/company cannot satisfy a requirement; approval and activation races must serialize against the same required set.

These are **candidate acceptance tests**, not approved exceptions or executed outcomes. Policy versioning, evidence retention, HR override and exact document types remain open.

## Source-Backed Concerns And Tests

- `EL-GAP-01` (**confirmed implementation-vs-intent gap**): activation and login enable do not inspect EMS checklist or document verification. This follows directly from the cited service methods and new owner rule; runtime failure reproduction is still pending.
- `EL-GAP-02` (**target design conflict**): global employee-code uniqueness and company association via mutable session preference do not model independent company employee codes or historical transfers. Need a migration design after one-person/one-active-company verification policy is approved.
- `EL-GAP-03` (**investigation**): frontend non-API CSV export quotes fields but does not visibly neutralize leading spreadsheet formulas in `employees.tsx`; backend-generated export path must be traced before claiming whole-product exposure. Test with synthetic values only.
- Existing `core.unit.test.ts` includes active-company list/create, cross-company master-data denial, last-admin recovery and export/import scope scenarios. Executed 2026-11-09: 1 unit file, 14/14 tests passed. This does not test the new document gate.

## Open Decisions

See `owner-decisions.md`: accepted identity-proof formats, how HR marks previous experience not applicable, document retention and visibility, policy effective date/versioning, and what happens to a valid transfer when old HR is unavailable. No exception has been approved.
