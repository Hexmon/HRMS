# Identity And Company Journey: Current Source Trace

Snapshot: 2026-11-09, `af89c6a` plus dirty worktree. Classification: **implemented source behavior**, not browser or hosted verification. Selected skills: `hrms-codebase-discovery` for the cross-layer trace, `qa-master-checklist` discover mode for unapproved rules and risk questions, and `security-review` for session/tenant trust boundaries.

## Trace IDJ-01 — New Workspace Signup To First Admin

| Link | Source-backed observation | Remaining evidence |
| --- | --- | --- |
| User action and UI | `hrms-client/src/routes/signup.tsx` calls `useAuth().signup`; `src/lib/auth.tsx` builds name/email and calls `authApi.signup` without a password in API mode. `src/domains/auth/api.ts` sends `POST /api/v1/auth/signup`. | Browser validation and recovery UX untested here. |
| Boundary validation | `hrms_backend/src/modules/auth/routes.ts` parses the request with strict `signupSchema` in `schemas.ts`. `service.ts:signup` normalizes email/slug and checks existing active workspace and email state. | Rate-limit behavior across instances and error UX untraced. |
| Initial state | `service.ts:signup` creates a pending company and user, then sends a verification email. `repository.ts` reads in-memory store collections; `app.ts` selects auth persistence flush on the successful mutation route. | Transaction/ambiguous delivery behavior requires deeper persistence and email inspection. |
| Verification | Frontend verification route uses `useAuth().verifyToken`; the API adapter calls `/api/v1/auth/verify-email`. `service.ts:verifyEmail` consumes the verification token, marks email verified, either installs a password hash from token metadata or issues a password-setup token, and issues a company-bootstrap token. | User-visible mail timing and invalid/expired token behavior require local browser tests. |
| Password and company | `service.ts:setPassword` consumes a setup token and activates the user. `service.ts:bootstrapCompany` consumes a bootstrap token, activates the company, applies master data, grants Admin, and stores a session preference for that company/role. The frontend `completeCompanySetup` sends logo first if present, then bootstrap, reloads `/auth/me`, and clears its query cache. | Interrupted logo/bootstrap sequence and double submission need local journey evidence. |
| Login and visible session | `service.ts:login` creates JWT and session-store record. `routes.ts` sets an HTTP-only cookie and also returns `access_token`. `plugins/auth.ts` checks JWT, session record, active user, and active company context on protected routes. `/auth/me` returns session context; frontend `src/lib/auth.tsx` applies it. | Cookie/bearer preference and cross-tab invalidation need browser checks. |
| Outbox/read model | `auth/events.ts` currently exports an empty object. The read path is `service.ts:sessionContext` using store user/company/preference data. | No auth business event is established by this trace; audit/notification side effects are `UNTRACED`. |

## Current Data And Authorization Facts

- `hrms_backend/src/db/schema.ts` gives `core.users.email` a global unique index and `platform.user_session_preferences.user_id` a unique constraint. A preference contains one `company_id` and one `active_role`. This schema does not represent separate simultaneous company memberships for one identity.
- `hrms_backend/src/platform/company-membership-context.ts` resolves the preference's company, rejects inactive company and unassigned role, and rejects a mismatched requested company. `service.ts:updateSessionPreference` explicitly blocks changing the company through that endpoint. Unit tests in `auth-session-preference.unit.test.ts` cover these cases at the service level.
- `plugins/auth.ts` checks the current user employment state and session-store revocation on protected requests. `service.ts:confirmPasswordReset` calls `sessionStore.revokeUser`; other role/deactivation mutation paths need separate traces before broad stale-session claims.
- The frontend has local mock-auth paths in `src/lib/auth.tsx`; production configuration guards must be inspected before saying a deployed frontend uses only the API. Mock behavior is not the authorization oracle.

## Requirements And Decision Status

| ID | Statement | Status / owner |
| --- | --- | --- |
| ID-01 | One customer tenant has one company with multiple offices. | Approved target direction from owner conversation; data/query implementation not yet assessed. |
| ID-02 | One person belongs to one company at a time; a later employer gives them a new company email. | Latest owner clarification 2026-11-09 supersedes earlier simultaneous-membership direction. Person matching method remains pending. |
| ID-03 | Separate login per company; a person may hold multiple authorized roles in the active company. | Owner answer 2026-11-09. See `owner-decisions.md`. |
| ID-04 | Historical payroll and audit records remain owned by the original company after transfer/removal. | Owner answer 2026-11-09; retention period and cross-domain policy pending. |

## Candidate Gaps And Local Test Charters

These are proposed observations, not confirmed defects or passing tests.

1. **ID-GAP-01, cross-company identity:** New work email per employer means the global unique `users.email` cannot detect whether the same human still has an active account at the former company. A future design must define a privacy-conscious person link, one-active-company invariant, transfer authority, migration and compatibility. No schema change belongs to this discovery goal.
2. **ID-GAP-02, interrupted onboarding:** Logo upload and company bootstrap are separate requests. Inspect whether a successful logo upload followed by lost bootstrap response can be resumed without orphaned documents or duplicate setup. Exercise through browser with a synthetic company and network interruption.
3. **ID-GAP-03, session freshness:** Exercise role removal, password reset, user deactivation and company deactivation in separate browser tabs; compare UI, API denial, session-store state and audit evidence. The current trace only proves the checks cited above.
4. **ID-GAP-04, duplicate human with different emails:** In a local synthetic two-company fixture, attempt new-company signup with a different work email while the original account is active. Current source has no demonstrated stable person verification method; do not claim it enforces the one-person-one-company target.

## Coverage And Next Work

- Executed locally on 2026-11-09: `pnpm exec vitest run --project unit src/modules/auth/__tests__/auth-session-preference.unit.test.ts` (1 file, 12 tests passed) and `HRMS_ENV_FILE=.env.test.example pnpm exec vitest run --project integration src/modules/auth/__tests__/auth-onboarding.integration.test.ts` (1 file, 2 tests passed against isolated Docker PostgreSQL/Valkey). These cover only their assertions; they are not browser evidence.
- Other source tests located: `auth-remediation-security.unit.test.ts` and `auth-security.unit.test.ts`; not executed in this loop.
- Local browser onboarding was **blocked**: the browser tool's origin approval gate rejected access to `http://127.0.0.1:5173` because permission was declined. No alternate browser route was attempted. Backend `/health/ready` and frontend `/signup` returned HTTP 200 before this gate, which proves only HTTP availability.
- `UNTRACED`: exact email delivery failure transaction, outbox/audit evidence, all role mutation revocation paths, and local browser effects.
- Next domain: employee lifecycle and original-company historical ownership, then attendance and leave/timesheets.
