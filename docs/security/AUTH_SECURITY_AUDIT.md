# Hawkaii HRMS Authentication and Authorization Security Audit

## Current Source Follow-up — 2026-11-10

The [36-finding authentication review and Sprint 25 plan](../discovery/authentication-remediation-2026-11-10.md) at source `87618f88` supplements this dated audit. It does not close runtime tasks. Eight distinct synthetic in-memory/Fastify behaviors were reproduced; no hosted exploit, PostgreSQL/Redis race or full browser assurance was established. [Exact evidence boundary](../../qa-artifacts/hrms/auth-review-2026-11-10/verification.md).

The earlier AUTH-P0-002 containment applies to the tested signup branch only: resend's unchecked company binding still allowed foreign pending-company bootstrap in a local service probe (AUTH-RV-01). Setup after actual core termination reactivated the synthetic employee (RV-02); a previously issued reset restored a credential after Admin disabled login (RV-03); unauthenticated pending-signup retry installed its chosen password after simulated owner verification (RV-04). These are open implementation issues, not cleared by the historical T15 test. The production successor handoff remains absent (RV-05).

Planning owner: Anurag Kumar, Sprint 25. New AUTH-S25-001–007 and QA-AUTH-S25-001 supplement existing TEN/BIZ tasks; no behavior is marked Done by this documentation. Approved policy refinements DEC-030–032 preserve assigned-role union and defer MFA; use the current proposal rather than treating union or absent MFA alone as an unapproved launch defect.


## Audit scope and evidence boundary

- Audit branch: `sprint-23/auth-s23-019`
- Baseline commit: `30783aa5ccaef41900195e1902f9dcb9f92d4270` (`origin/release-01`)
- Audit date: 2026-10-25
- Evidence: repository source, migrations, tests, frontend API client, and deployment templates. No hosted Render, Vercel, Neon, Upstash, or Cloudflare service was modified or penetration-tested.
- Status vocabulary: **Confirmed** means the behavior follows directly from inspected code or a repository test. **Architecture gap** means required capability is absent. **Unverified** means runtime/deployment evidence is still required.
- Line references in the initial findings point to the baseline above. Remediation status is updated after code changes; symbols are included because later edits can move lines.

## Remediation progress on this branch

The baseline findings remain below as the historical exploit evidence. The following status was verified locally on 2026-10-25; no hosted service was changed or tested.

| Finding | Branch status | Implemented evidence | Residual risk |
|---|---|---|---|
| AUTH-P0-001 | Remediated in code | `AuthService.login` rejects employee-code login in `qa|production`; T22 passed and production-mode email/password remained valid locally | Render environment values still require hosted verification |
| AUTH-P0-002 | Contained for one process | Pending company tokens bind the reservation to the normalized founder email; T15 passed | Cross-process signup/flush races remain under AUTH-P0-005; durable bootstrap principal is still required |
| AUTH-P0-003 | Contained for current store/session authority | Global hook rejects inactive users and inactive/missing company context; role/status mutations revoke all target sessions; T06/T07/T09 passed | Per-process PostgreSQL snapshots can still diverge across API instances |
| AUTH-P0-004 | Partially remediated | Auditor is read/audit-only in document policy; T21 passed | Documents still have no authoritative `company_id`; cross-tenant document isolation remains a release blocker |
| AUTH-P1-006 | Partially remediated | Self role mutation is rejected and role replacement revokes sessions; T04/T09 passed | Roles remain global and complete separation-of-duties policy is not implemented |
| AUTH-P1-008 | Remediated in code | Unsafe cookie-authenticated requests require a configured trusted Origin; malicious/trusted T24 cases and auth contracts passed | Hosted Vercel/Render origin configuration and multipart browser flow remain unverified |
| AUTH-P1-009 | Mitigated | Browser access token is memory-only and the legacy `sessionStorage` value is removed; a real Chromium login/refresh test proved the HttpOnly cookie restores the session without Web Storage | Backend still returns a bearer token for API compatibility; hosted cookie/origin configuration and human UAT remain |
| AUTH-P1-018 | Remediated in branch | Direct email replacement is denied after verification, credential creation, or active identity-token issuance; T31 denial and pre-credential correction tests passed | A complete verified email-change workflow is not implemented |
| AUTH-P1-019 | Open confirmed gap | Production suppresses raw successor capabilities, but password setup and company bootstrap still require those capabilities and no secure handoff replaces them | Hosted signup/onboarding cannot complete; local development persists the bootstrap capability in Web Storage |
| AUTH-P2-016 | Remediated in code | Auth/onboarding responses set `Cache-Control: no-store, private, max-age=0` and `Pragma: no-cache`; focused test passed | CDN/edge behavior needs hosted verification |
| AUTH-P3-017 | Remediated in code | Ad-hoc verification resend `console.log` calls removed; backend lint passed | Structured security event coverage remains incomplete under AUTH-P2-015 |

Executed verification: focused auth security tests **16/16 passed** (including a red-before-green reproduction for T31); full backend unit suite **551/551 passed**; full backend integration suite **347/347 passed**; backend contract suite **27/27 passed**; backend API production-flow E2E **1/1 passed**; focused attendance-policy replay regression **4/4 passed**; and real Chromium production smoke **7/7 passed**. Backend typecheck/build/lint and frontend typecheck/build/lint passed; frontend lint retained 43 pre-existing Fast Refresh warnings and zero errors. API documentation generation/verification, consumer handoff, quality, implementation, scalability, and cross-schema-FK gates also passed. Hosted configuration, load/soak, independent penetration testing, and human role UAT were not executed.

## Current implementation

The backend is a Fastify/TypeScript modular application. It loads PostgreSQL data into a process-wide in-memory `DataStore`, applies most service mutations to that snapshot, and flushes selected arrays to PostgreSQL in an `onSend` hook. Browser and API authentication use the same HMAC-SHA256 JWT. A login creates a server-side session record in Valkey keyed by JWT `jti`; each protected request requires both a valid JWT and an unrevoked Valkey record.

Authorization remains distributed across module services and policy helpers. The branch-level auth hook now requires an active user and active assigned company for protected tenant routes, except the narrowly scoped pending-bootstrap `/auth/me` recovery path. A user's roles are still global on `core.users`/`core.user_roles`. The record named `platform.user_session_preferences` is also used as the only user-to-company assignment, with one row per user. It is not a membership table and cannot represent one global user in multiple companies. Most database tables still do not use RLS.

The browser sends cookies with `credentials: "include"`. This branch keeps the returned session bearer token only in JavaScript memory for compatibility and removes the legacy session-token `sessionStorage` value; reload restoration relies on the HttpOnly session cookie. Hosted secure cookies use `SameSite=None; Secure`, and unsafe cookie-authenticated requests now require a trusted Origin. Signup creates a pending user/company, email verification and password setup tokens, then a company-bootstrap capability token. The production handoff of the successor password-setup/bootstrap capabilities is missing, while the local-development client stores the bootstrap capability in both session and local Web Storage. Company bootstrap activates the company and still adds the global `Admin` role.

## Finding register

### AUTH-P0-001 — Passwordless employee-code login is exposed in hosted environments

- Severity/status: **P0 / Confirmed at baseline / Remediated in branch; hosted verification pending**
- Components: login request validation and authentication service
- Evidence: `hrms_backend/src/modules/auth/schemas.ts:3-26` accepts `employee_code`; `hrms_backend/src/modules/auth/service.ts:147-160,766-772` authenticates an active user by employee code alone; `hrms_backend/src/modules/auth/routes.ts:48-66` has no `APP_ENV` gate.
- Root cause: a development convenience credential is part of the public production schema and service contract.
- Exploit: an attacker who knows or guesses an active employee code submits `{ "employee_code": "..." }` and receives a valid JWT/session without a password.
- Impact: complete account takeover, including privileged accounts whose employee code is known.
- Correction: reject employee-code authentication unless the trusted server configuration is explicitly `local` or `development`; do not rely on frontend hiding.
- Regression: T22; production and QA reject it, local development permits it, normal email/password login remains valid.

### AUTH-P0-002 — A different email can claim an existing pending company slug

- Severity/status: **P0 / Confirmed at baseline / Single-process containment implemented; distributed fix open**
- Components: signup and founder bootstrap
- Evidence: `hrms_backend/src/modules/auth/service.ts:183-194,254-294` rejects only an already-active company, reuses any pending `existingCompany`, then binds a newly created user's verification token to it. Ownership is inferred only from tokens after signup.
- Root cause: pending slug reservation has no durable owner/membership and signup does not verify that the pending company belongs to the same identity.
- Exploit: after a legitimate founder reserves a slug but before bootstrap, another email signs up with that slug, verifies, and uses its bootstrap token. The bootstrap path grants `Admin` at `service.ts:502-565`.
- Impact: unauthorized company ownership and global Admin assignment.
- Correction: fail closed when any pending company is already bound to another identity; longer term store a transactional bootstrap principal/membership.
- Regression: competing email rejected; same pending founder can safely retry; unrelated slug still succeeds; T15/T16.

### AUTH-P0-003 — Suspended/deactivated users retain valid sessions on routes without membership checks

- Severity/status: **P0 / Confirmed at baseline / Single-process containment implemented; distributed fix open**
- Components: authentication hook and account lifecycle
- Evidence: `hrms_backend/src/plugins/auth.ts:69-83` verifies JWT, Valkey session, and non-deleted user but not `employment_status` or company state. `hrms_backend/src/modules/core/service.ts:335-390,522-557` can change employment status without revoking sessions. Modules such as documents authorize directly from `request.actor`.
- Root cause: identity lifecycle validity is optional at service call sites rather than a global authentication invariant.
- Exploit: a suspended privileged user reuses an existing token against a protected route that does not call `resolveActiveCompanyMembershipContext`.
- Impact: post-termination access, data disclosure, and mutations.
- Correction: fail closed in the auth hook for all non-active users; require active company context for protected tenant routes; revoke sessions on lifecycle changes.
- Regression: T06, T07, stale token denied immediately after status change.

### AUTH-P0-004 — Document authorization is not tenant-scoped and Auditor is treated as a writer

- Severity/status: **P0 / Confirmed at baseline / Partially remediated; tenant ownership remains open**
- Components: documents schema, service, and policy
- Evidence: `hrms_backend/src/db/migrations/0001_initial.sql:398-419` and `src/db/schema.ts:2050-2076` have no `company_id` on document metadata. `hrms_backend/src/modules/documents/policy.ts:9-29` returns true for Admin or Auditor for every permission. `service.ts:294-319,409-449` uses that decision for delete, verify, list, and audit.
- Root cause: the resource lacks authoritative tenant ownership, and the role shortcut ignores the requested action.
- Exploit: an Auditor can delete or verify any document ID; Admin/Auditor can enumerate and read documents from every company in the shared store.
- Impact: cross-tenant disclosure/destruction and violation of Auditor read-only separation.
- Correction: immediately make Auditor read/audit-only. Add immutable `company_id`, backfill safely, enforce company equality in every document operation and DB query, then add composite integrity/RLS where appropriate.
- Regression: T02/T03/T21/T25 for document list, metadata, content, download URL, verify, delete, and access log.

### AUTH-P0-005 — Process snapshots permit stale authorization and duplicate token use in a multi-instance deployment

- Severity/status: **P0 / Confirmed design defect; multi-instance exploitability depends on hosted scale**
- Components: PostgreSQL adapter, auth token lifecycle, role/session lifecycle
- Evidence: `hrms_backend/src/platform/postgres-data-store.ts:411-448` loads PostgreSQL into an application-wide snapshot at startup. Auth operations mutate arrays and `app.ts:104-130` flushes after handler success. Token updates use unconditional `ON CONFLICT (id) DO UPDATE` at `postgres-data-store.ts:817-870`; role writes delete/reinsert at `2763-2818`. No request-time refresh or row lock exists.
- Root cause: PostgreSQL is treated as persistence behind mutable per-process state instead of the concurrency authority.
- Exploit/failure: two Render instances can each accept the same active token, or one can authenticate/authorize using a role, password, company, or account state changed by another instance.
- Impact: token replay, stale privilege use, inconsistent ownership, lost updates, and security-state corruption.
- Correction: move auth commands and authorization reads to transactional PostgreSQL repositories using conditional updates/row locks; use session revocation/auth versioning for immediate distributed invalidation. Do not scale API instances above one before this is complete.
- Regression: T09/T13/T16/T28 using two independent app processes against one isolated database.

### AUTH-P1-006 — Role replacement does not invalidate sessions and self-role mutation weakens separation of duties

- Severity/status: **P1 / Confirmed at baseline / Partially remediated; scoped roles and full SoD remain open**
- Components: employee role management
- Evidence: `hrms_backend/src/modules/core/service.ts:610-637` replaces roles without `sessionStore.revokeUser`. `requireCanAssignRoles` at `1546-1554` permits HR Manager to assign itself any non-Admin role and permits Admin to add conflicting roles to itself.
- Root cause: role mutation and session/auth-assurance lifecycle are disconnected; no self-service separation rule exists.
- Exploit: HR self-assigns Finance Manager/Auditor or a stale session continues after a privilege downgrade (especially across process snapshots).
- Impact: privilege escalation and approval/audit separation failure.
- Correction: block self role changes through the general endpoint and revoke all target sessions after any role replacement; design company-scoped assignments and SoD rules.
- Regression: T04/T05/T09/T20/T21.

### AUTH-P1-007 — One-time token consumption is not an atomic database transition

- Severity/status: **P1 / Confirmed / Open**
- Components: email verification, password setup/reset, company bootstrap
- Evidence: `hrms_backend/src/modules/auth/service.ts:297-355,396-417,478-565,979-997` reads and mutates an in-memory token. PostgreSQL persistence later performs an unconditional upsert, not `UPDATE ... WHERE status='active' ... RETURNING`.
- Root cause: validation, consumption, and related security state changes are outside a database transaction/lock.
- Failure: concurrent processes can both observe active and both return success; partial flush/provider failures can leave related state inconsistent.
- Impact: replayed reset/bootstrap actions and inconsistent ownership/security state.
- Correction: transactional token-consumption repository with purpose, hash, expiry, user, and company predicates plus affected-row assertion; perform related credential/bootstrap state in the same transaction.
- Regression: T11/T12/T13/T16/T28.

### AUTH-P1-008 — `SameSite=None` cookie mutations have no CSRF/origin enforcement

- Severity/status: **P1 / Confirmed at baseline / Mitigated in branch**
- Components: cookie settings, auth hook, multipart mutations
- Evidence: `hrms_backend/src/modules/auth/routes.ts:52-58,84-89,160-162` uses `SameSite=None` when secure. `hrms_backend/src/plugins/auth.ts` has no CSRF/origin check. `app.ts:607-629` configures CORS, which does not itself reject simple cross-site form submissions. Multiple protected upload routes accept multipart form data.
- Root cause: credentialed cross-origin cookies were enabled without a server-side anti-CSRF control.
- Exploit: a malicious site submits a simple cross-origin, cookie-authenticated multipart or no-body state-changing request.
- Impact: forced logout and potentially unauthorized file/profile mutations.
- Correction: for cookie-authenticated unsafe methods require a trusted `Origin` matching the explicit allowlist (or a robust CSRF token); bearer-only clients remain supported.
- Regression: T24 for allowed origin, malicious origin, missing browser origin, bearer API client, and multipart mutation.

### AUTH-P1-009 — Browser JavaScript persists the bearer token

- Severity/status: **P1 / Confirmed at baseline / Mitigated in branch**
- Components: frontend session client
- Evidence: `hrms-client/src/shared/api/session.ts:1-38` stores the access token in `sessionStorage`; `src/lib/auth.tsx:450-457` persists the login response; `src/shared/api/client.ts:46-60` sends both bearer token and cookie.
- Root cause: two browser credential mechanisms are used simultaneously.
- Exploit: any same-origin script injection or compromised dependency can read and exfiltrate the bearer token, bypassing HttpOnly cookie protection.
- Impact: session theft until expiry/revocation.
- Correction: browser uses only the HttpOnly cookie; keep bearer support for non-browser clients but do not persist it in web storage.
- Regression: frontend test verifies login/session restoration without Web Storage token and API requests use credentials.

### AUTH-P1-010 — Multi-company memberships and invitations are not implemented

- Severity/status: **P1 / Architecture gap**
- Components: identity model, signup, session preference
- Evidence: `platform.user_session_preferences` has unique `user_id` (`src/db/schema.ts:227-245`); `company-membership-context.ts:30-108` explicitly resolves one assigned company. `signupSchema` accepts `invite_token` (`auth/schemas.ts:36-47`) but `AuthService.signup` never consumes it. Active existing users are rejected at `auth/service.ts:195-203`.
- Root cause: a UI preference row is being used as membership/authorization state.
- Impact: expected B2B requirement “one identity, multiple companies” cannot be expressed; secure invitation acceptance, membership suspension, and tenant-scoped roles are absent.
- Correction: introduce `company_memberships` and `membership_role_assignments`, invite records, explicit active membership selection, lifecycle status/version, and audit trails.
- Regression: T10/T14/T17/T18/T19/T25/T27.

### AUTH-P1-011 — Company bootstrap grants a global Admin role

- Severity/status: **P1 / Confirmed architecture defect**
- Components: bootstrap and role model
- Evidence: `hrms_backend/src/modules/auth/service.ts:502-551` adds `Roles.Admin` directly to global `user.roles`; authorization helpers such as `src/auth/index.ts:229-237` treat Admin as universal.
- Root cause: roles have no membership/company scope.
- Impact: adding legitimate multi-company switching later would make one company's founder an Admin in every membership unless the model is corrected first.
- Correction: bootstrap creates an active owner membership and a tenant-scoped role assignment atomically; it must not add global Admin.
- Regression: T05/T10/T14/T15/T18.

### AUTH-P1-018 — Direct verified-account email replacement enables recovery-based account takeover

- Severity/status: **P1 / Confirmed at baseline / Remediated in branch; verified-change workflow missing**
- Components: employee profile update and password recovery
- Evidence: baseline `hrms_backend/src/modules/core/service.ts` accepted `input.email` for any same-company target after only a duplicate check; HR Manager can call the generic employee update route. Password reset resolves users by the newly stored email.
- Root cause: a login identifier was treated as ordinary HR profile data instead of verified identity state.
- Exploit: an HR actor replaces a Finance, Auditor, or Admin email with an address it controls, requests a reset, and takes over that account. T31 reproduced the first transition as an unexpected HTTP 200 before the fix.
- Impact: cross-role privilege escalation, financial/audit separation bypass, and privileged account takeover.
- Correction implemented: an email can be corrected through the generic route only before verification and before any credential or active identity token exists. Established identities fail closed pending a purpose-built verified email-change flow. The outbox event records that an allowed pre-credential correction occurred without logging the address.
- Regression: T31 verifies privileged-target denial and an authorized pre-credential/unverified correction happy path.

### AUTH-P1-019 — Hosted signup cannot securely hand off password-setup and company-bootstrap capabilities

- Severity/status: **P1 / Confirmed / Open**
- Components: verification/login responses, onboarding routes, and frontend auth state
- Evidence: `hrms_backend/src/modules/auth/service.ts:353-372` creates password-setup and company-bootstrap tokens but exposes them only through `devOnly`; `service.ts:1475-1484` removes every `dev_only` token when `NODE_ENV=production`. The onboarding schemas/routes at `src/modules/auth/schemas.ts:76-93` and `routes.ts:109-125` still require the raw bootstrap token. `hrms-client/src/lib/auth.tsx:197-222` persists that capability in both `sessionStorage` and `localStorage` when it is available, and `auth.tsx:816-844` refuses setup when it is absent.
- Root cause: the lifecycle creates a successor capability but has no production delivery mechanism or server-bound transition. Development token echo was used as the frontend integration contract.
- Failure: a production user verifies an email. A no-password signup cannot obtain the generated password-setup token; a password signup can log in but cannot obtain the generated company-bootstrap token. The setup wizard therefore cannot complete.
- Impact: hosted signup/company onboarding is unavailable. Re-enabling raw token echo would also expose a company-ownership capability to browser JavaScript and persistent storage.
- Correction: use short-lived, purpose-bound HttpOnly handoff cookies or a session-bound server transition; require trusted Origin for cookie-backed mutations; consume the capability atomically; remove bootstrap capability persistence from Web Storage. Preserve explicit bearer/capability support only for non-browser clients under a documented secure exchange.
- Regression: production-mode signup with and without an initial password completes through a real browser without any raw setup/bootstrap token in Web Storage or JSON; refresh/interruption resumes safely; malicious Origin, replay, and cross-user/company use fail.

### AUTH-P2-012 — Password-reset tenant metadata can use an unrelated company

- Severity/status: **P2 / Confirmed**
- Components: password reset request/email branding
- Evidence: `hrms_backend/src/modules/auth/service.ts:446-467` uses `companyProfiles.at(-1)` when no slug is supplied, without proving user membership.
- Root cause: fallback company selection is unrelated to the target identity.
- Impact: cross-tenant branding/metadata disclosure and wrong tenant binding on recovery tokens.
- Correction: derive company only from an authorized active membership or omit tenant branding; never choose an arbitrary company.
- Regression: password reset for each tenant never references another tenant.

### AUTH-P2-013 — Session revocation scans the entire Redis keyspace

- Severity/status: **P2 / Confirmed reliability/security defect**
- Components: Valkey session store
- Evidence: `hrms_backend/src/auth/index.ts:84-135`, especially `KEYS` at line 113.
- Root cause: sessions have no per-user Redis index.
- Failure: password reset/login disable can block or time out Redis as session count grows; partial scans/revocations weaken incident response.
- Correction: maintain a TTL-bounded set of JTIs per user and revoke via that index; avoid `KEYS`.
- Regression: user revocation touches only indexed sessions and handles missing/expired keys.

### AUTH-P2-014 — MFA and step-up assurance are absent

- Severity/status: **P2 / Architecture gap**
- Evidence: only an `mfa_enabled` setting exists and is forced false (`src/platform/postgres-data-store.ts:3040-3055`, `src/modules/admin/schemas.ts:75-88`); there is no enrollment, challenge, assurance claim, recovery, or privileged-operation check.
- Impact: no phishing-resistant/second-factor protection for company Admin, HR, Finance, or tenant switching.
- Correction: implement enrollment/challenge/recovery and server-side assurance checks before enabling the setting.
- Regression: T27 plus enrollment, recovery, downgrade, and replay cases.

### AUTH-P2-015 — Password expiry, login attempt policy, and auth audit are incomplete

- Severity/status: **P2 / Confirmed partial implementation**
- Evidence: `password_expiry_days` exists but credentials contain no rotation timestamp enforcement; rate limiting is per IP or authenticated user (`plugins/rate-limit.ts:20-55`) with no account lockout; `modules/auth/events.ts` is empty and login/token state changes do not emit a security audit event.
- Impact: distributed password guessing is not bounded by account, configured expiry is misleading, and incident reconstruction is incomplete.
- Correction: add account+IP throttling/lockout policy, credential rotation metadata, and redacted append-only security events.
- Regression: repeated/distributed attempts, lockout recovery, audit redaction, T26.

### AUTH-P2-016 — Authentication responses are cacheable unless infrastructure overrides them

- Severity/status: **P2 / Confirmed at baseline / Remediated in code; edge behavior unverified**
- Evidence: auth routes return tokens/context and `security-headers.ts:3-15` does not set `Cache-Control: no-store`.
- Impact: browser, proxy, or misconfigured edge caches may retain token-bearing responses.
- Correction: set `Cache-Control: no-store, private` and legacy `Pragma: no-cache` on auth/recovery/bootstrap responses.
- Regression: response-header contract tests.

### AUTH-P3-017 — Verification resend uses ad-hoc console logging

- Severity/status: **P3 / Confirmed at baseline / Remediated in branch**
- Evidence: `hrms_backend/src/modules/auth/service.ts:1099-1110` logs control flow and rate-limit result directly.
- Impact: noisy, unstructured production output; current values do not contain raw tokens but bypass logger governance.
- Correction: remove the statements or use structured, redacted observability.
- Regression: T26 static/logger test.

## Controls already present

- Passwords are stored as salted scrypt hashes and compared with `timingSafeEqual` (`src/auth/index.ts:34-50`).
- JWT signatures and expiry are checked, and protected requests require a server-side session record (`src/plugins/auth.ts:60-83`).
- Verification/reset/bootstrap tokens use 32 cryptographically random bytes and store SHA-256 hashes (`auth/service.ts:905-935,1440-1445`).
- Password-reset and verification responses are enumeration-resistant, and resend throttles exist.
- Production configuration rejects placeholder JWT/Cloudinary values and disables mock uploads.
- CORS in production reflects only configured origins; logger redaction covers common credentials and location evidence.
- Core employee read/write paths contain explicit current-company checks and optimistic version checks.
- Expense approval helpers prohibit requester self-processing on guarded workflow actions.
- Only registered-device tables currently have forced PostgreSQL RLS. This is evidence of one defense-in-depth control, not proof of system-wide tenant isolation.

## Production readiness

**NOT READY.** The branch contains local containment for the hosted employee-code bypass, pending-company takeover, inactive-principal access, Auditor mutation, CSRF, and verified-email replacement. Release blockers remain: documents have no authoritative tenant owner, multi-instance authorization/token state is not transactional, roles and memberships are not company-scoped, hosted signup capability handoff is incomplete, and hosted configuration plus independent penetration testing remain unverified.
