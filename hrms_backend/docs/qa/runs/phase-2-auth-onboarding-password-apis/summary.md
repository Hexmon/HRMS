# Phase 2 Auth Onboarding And Password APIs QA Summary

Date: 2026-05-14
Project: HRMS-Server
Domain: Auth

## Scope

Implemented 8 new public/protected auth and onboarding APIs from the frontend backend completion backlog. The generated OpenAPI/frontend contract now exposes 76 operations, up from 68.

Implemented endpoints:

- POST /api/v1/auth/signup
- POST /api/v1/auth/verify-email
- POST /api/v1/auth/email-verifications/resend
- POST /api/v1/auth/set-password
- POST /api/v1/auth/password-reset/request
- POST /api/v1/auth/password-reset/confirm
- POST /api/v1/onboarding/company-bootstrap
- PATCH /api/v1/auth/session/preference

## Behavior Added

- Signup creates a pending identity and hashed email-verification token; verified duplicate emails and bootstrapped company slugs return 409.
- Email verification consumes one-time tokens, supports password-required and no-password setup paths, and issues bootstrap/setup next-step tokens for Local/QA automation.
- Resend verification and password-reset request use enumeration-safe accepted responses.
- Set-password and reset-confirm require strong password confirmation and reject token reuse with 409.
- Password reset replaces the active password hash and revokes existing sessions through the session store.
- Company bootstrap completes first company settings and promotes the bootstrap user to Admin using a one-time bootstrap token.
- Session preference persists active role, company, landing page, locale, and timezone; unassigned role selection returns 403.
- Added persistent PostgreSQL tables for company profiles, hashed auth tokens, and session preferences with no cross-schema SQL foreign keys.
- Updated migration execution to apply all sorted SQL migration files.

## Manual/Integration Evidence

Targeted real-infra integration covered:

- Signup without password -> verify email -> set password -> login -> company bootstrap -> Admin role session preference.
- Wrong verification email rejected, reused verification token rejected, duplicate company and duplicate verified email rejected.
- Unknown password-reset request returns accepted enumeration-safe response.
- Existing password reset returns a token in Local/QA, confirms password, revokes existing session, rejects old password, accepts new password, and rejects reused reset token.

## Verification Commands

- pnpm lint: passed
- pnpm typecheck: passed
- npx vitest run --project integration src/modules/auth/__tests__/auth-onboarding.integration.test.ts: passed
- npx vitest run --project contracts src/__tests__/contracts.contract.test.ts: passed
- pnpm api:docs:generate: passed, generated 76 operations
- pnpm api:docs:verify: passed
- pnpm api:consumer:verify: passed
- HRMS_ENV_FILE=.env.qa pnpm db:migrate: passed
- HRMS_ENV_FILE=.env.qa pnpm db:verify:no-cross-schema-fks: passed
- pnpm test: passed
- pnpm build: passed

## Notes

Local/QA token echo fields are placed under dev_only for automation. Production omits those fields. Generated OpenAPI remains the source of truth for frontend integration; remaining backlog count is now 138 planned APIs.
