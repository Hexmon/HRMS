# Authentication and Authorization Remediation Plan

## Safety and sequencing principles

1. Preserve the baseline and existing uncommitted architecture artifacts; do not commit automatically.
2. Add a failing regression before each behavioral fix where the current design is executable in memory.
3. Keep hosted environments untouched. Database migrations are authored and validated locally but not applied to Neon without explicit authorization, backup, and rollback approval.
4. Close direct authentication bypasses and stale-principal access before expanding multi-company features.
5. PostgreSQL must become the transaction/concurrency authority for security state. Redis is session/revocation state, not a source of tenant roles.
6. Do not add company switching until company-scoped membership and role assignments exist.

## Phase 0 — Immediate containment (this branch, no migration)

### Phase 0 execution status (2026-10-25)

| Item | Status | Evidence / limitation |
|---|---|---|
| R0.1 | Implemented and locally verified | QA employee-code denial and password-login success passed |
| R0.2 | Implemented and locally verified | Inactive user/company denial passed; pending-bootstrap `/auth/me` remains the explicit exception |
| R0.3 | Implemented and locally verified | Role/deactivation session revocation and self-role denial passed; multi-instance authority remains Phase 1/2 |
| R0.4 | Containment implemented | Different-email takeover test passed; durable/concurrent ownership remains Phase 2 |
| R0.5 | Partial | Auditor mutation denial passed; tenant-owned documents remain Phase 2 and release-blocking |
| R0.6 | Implemented and locally verified | Malicious/trusted Origin cases passed; hosted and multipart browser verification pending |
| R0.7 | Implemented with compatibility residual | Web Storage persistence removed and auth responses are non-cacheable; bearer response/in-memory use retained for API compatibility |
| R0.8 | Implemented | Ad-hoc logs removed; lint passed |
| R0.9 | Implemented containment | Direct email replacement is denied for established identities; pre-credential unverified corrections remain allowed. A complete verified email-change capability is Phase 3 work |
| R0.10 | Open confirmed gap | Production successor-capability handoff for password setup/company bootstrap is absent; do not solve this by exposing raw tokens to browser storage |

Verification completed: backend focused security 16/16, full unit 551/551, full integration 347/347, contracts 27/27, backend API production-flow E2E 1/1, focused attendance-policy replay regression 4/4, and real Chromium production smoke 7/7; backend typecheck/build/lint; frontend typecheck/build/lint (43 pre-existing warnings, zero errors); API docs/consumer and quality/implementation/scalability/cross-schema-FK gates. Hosted configuration, load/soak, independent penetration, and human role UAT remain pending.

### R0.1 Gate the employee-code development login

- Finding: AUTH-P0-001
- Change: pass trusted `APP_ENV` into `AuthService` or reject the branch in the route/service unless `local|development`; keep email/password unchanged.
- Dependencies: none.
- Compatibility: local demos/tests that use employee codes must set an explicit local/development app environment. QA/production behavior intentionally changes.
- Rollback: revert the gate only in an isolated local environment; never enable in hosted QA/production.
- Tests: T22 plus email/password authorized and invalid credential paths.

### R0.2 Enforce principal lifecycle in the global auth hook

- Findings: AUTH-P0-003, AUTH-P1-006
- Change: reject non-active users after JWT/session lookup. For protected tenant routes, require a valid active company assignment; explicitly exempt only the bootstrap/session-recovery route(s) needed before company activation.
- Dependencies: preserve `/auth/me` pending-bootstrap behavior.
- Compatibility: stale sessions for inactive users/companies begin failing immediately, which is intended.
- Rollback: not recommended; if a legitimate recovery workflow breaks, add a narrowly scoped recovery route rather than weakening the hook.
- Tests: T01/T06/T07 and pending-founder `/auth/me`.

### R0.3 Revoke sessions on role and lifecycle changes and block self role mutation

- Finding: AUTH-P1-006
- Change: make role replacement/status changes await `sessionStore.revokeUser`; block target==actor for general role replacement. Preserve last-admin recovery guard.
- Dependencies: scalable Redis user-session index (R1.1) can follow; correctness first.
- Compatibility: changed user must sign in again; API response should report revocation count.
- Rollback: session revocation is one-way but safe; rollback only changes future behavior.
- Tests: T04/T05/T06/T09/T20.

### R0.4 Reserve a pending company for its original identity

- Finding: AUTH-P0-002
- Change: before reusing a pending company, inspect its durable bootstrap/verification binding and reject a different email/user. Keep same-founder retries subject to resend limits.
- Dependencies: no schema change for immediate containment; durable bootstrap principal in Phase 2 replaces this token-derived check.
- Compatibility: users can no longer “join” by choosing an existing pending slug; invitations are not implemented, so this is correct fail-closed behavior.
- Rollback: release the pending company through an explicit admin recovery tool, not an open signup fallback.
- Tests: T15, same-founder retry, unrelated slug.

### R0.5 Restore Auditor read-only behavior

- Finding: AUTH-P0-004
- Change: `canAccessDocument` may grant Auditor only `read|audit`, never `write|verify`; add route-level integration tests.
- Dependencies: none for action control. Tenant isolation remains open until Phase 2.
- Compatibility: any existing Auditor document upload/delete/verify workflow is intentionally removed.
- Tests: T21 authorized read/audit and denied upload/delete/verify.

### R0.6 Add cookie-origin CSRF enforcement

- Finding: AUTH-P1-008
- Change: retain auth source on the request. On unsafe cookie-authenticated requests require `Origin` to equal one of the configured frontend/CORS origins. Bearer clients without cookies remain supported. Add explicit trusted-origin config validation in hosted environments.
- Dependencies: frontend sends normal browser Origin automatically; no secret token needed for this deployment shape.
- Compatibility: non-browser clients using only cookies and no Origin must migrate to Bearer. Same-origin/local behavior requires configured frontend origin.
- Rollback: use a temporary narrowly scoped origin allowlist entry, not disabling the control.
- Tests: T24 including multipart and logout.

### R0.7 Remove browser bearer-token persistence and prevent auth response caching

- Findings: AUTH-P1-009, AUTH-P2-016
- Change: frontend relies on HttpOnly cookie and never stores/accesses login bearer token; backend retains bearer response for mobile/CLI compatibility. Add `Cache-Control: no-store, private` to auth/bootstrap/recovery responses.
- Dependencies: correct `COOKIE_SECURE`, origin allowlist, and HTTPS in hosted deployments.
- Compatibility: cross-origin cookie login must be validated in Vercel+Render before release.
- Rollback: in-memory bearer only is safer than Web Storage; do not restore persistent token storage.
- Tests: frontend API/session tests and response-header contracts.

### R0.8 Remove unstructured auth logging

- Finding: AUTH-P3-017
- Change: remove `console.log` calls; security telemetry must use redacted structured logger later.
- Tests: T26 static/logger coverage.

### R0.9 Fail closed on established-account email replacement

- Finding: AUTH-P1-018.
- Change: permit a generic profile-route email correction only before verification and only when no credential or active identity token exists. Established accounts require a future purpose-bound, old/new-address verified email-change workflow.
- Compatibility: HR can still correct a newly created, login-disabled employee typo. Existing users cannot have their login identifier silently replaced through profile edit.
- Rollback: do not reopen direct verified-email replacement; add an explicit recovery workflow if business operations require it.
- Tests: T31 privileged-target denial plus unverified/pre-credential correction success.

### R0.10 Replace development token echo with a secure hosted signup handoff

- Finding: AUTH-P1-019.
- Change: bind password-setup and bootstrap continuation to short-lived, purpose-specific HttpOnly cookies or an authenticated server-side pending session. Unsafe cookie-backed transitions require a trusted Origin. Remove bootstrap capability persistence from frontend Web Storage and never return raw successor tokens in production JSON.
- Dependencies: choose the cross-origin cookie domain/SameSite strategy for Vercel-to-Render, then validate it in the hosted development environment. Atomic token consumption remains R2.1.
- Compatibility: local test automation may keep an explicit non-browser development hook, but the normal browser flow must exercise the secure handoff. Existing API clients need a documented secure capability exchange if they perform onboarding.
- Rollback: do not restore production `dev_only` token echo. A failed rollout should disable new signup while preserving existing login/recovery.
- Tests: production-mode real-browser signup with and without an initial password, refresh/resume, missing/expired/replayed handoff, malicious Origin, and another user/company attempting to reuse the handoff.

## Phase 1 — Session and distributed authorization correctness

### R1.1 Redis user-session index

- Finding: AUTH-P2-013
- Change: on session create, add JTI to `hrms:user-sessions:{userId}` with bounded TTL; revoke by members using pipelined reads/updates and remove expired members. Never call `KEYS`.
- Migration: no data migration required, but old sessions lack the index. Choose one: revoke all sessions during deployment (preferred security posture) or temporarily use a bounded `SCAN` compatibility path.
- Rollback: dual-read old/new index during one TTL window.
- Tests: multiple users, expired keys, partial key loss, Redis error, high session count.

### R1.2 Security/auth version and immediate revocation

- Findings: AUTH-P0-005, AUTH-P1-006
- Change: add monotonic `auth_version` to identity/membership; put it in session/JWT and compare against authoritative DB or a write-through Redis version on each request. Role/status/password changes increment it transactionally and revoke indexed sessions.
- Migration: additive non-null version with default/backfill; deploy read-compatible code before enforcing.
- Rollback: retain the column; temporarily stop enforcement only under incident process.
- Tests: T06/T07/T09 across two API instances.

### R1.3 Account-aware authentication throttling and audit events

- Finding: AUTH-P2-015
- Change: combine normalized account hash, IP prefix, and route/purpose buckets; record success/failure/lock/recovery events without secrets. Define approved lockout/recovery policy with product/security owner.
- Migration: security event table or existing immutable audit/outbox extension.
- Compatibility: avoid permanent denial-of-service via attacker-triggered lockout; response stays enumeration-safe.
- Tests: distributed attempts, spoofed forwarded headers, unlock, event redaction.

## Phase 2 — Transactional identity, bootstrap, memberships, and documents

### R2.1 Transactional one-time token repository

- Findings: AUTH-P0-005, AUTH-P1-007
- Change: consume with one PostgreSQL transaction and a conditional statement such as `UPDATE ... SET status='used' ... WHERE token_hash=? AND token_type=? AND status='active' AND expires_at>now() RETURNING ...`; perform credential/user/bootstrap changes in that same transaction.
- Migration: add/check token status/purpose constraints and indexes; optionally add attempt/consumption metadata.
- Compatibility: app handlers become async DB commands; no process snapshot is authoritative.
- Rollback: old code may read rows but must not run concurrently with new semantics; use a coordinated deploy.
- Tests: T11–T13/T16/T28 with two processes and injected commit failures.

### R2.2 Real company memberships and scoped role assignments

- Findings: AUTH-P1-010, AUTH-P1-011
- Tables: `company_memberships(id,user_id,company_id,status,version,...)`, `membership_role_assignments(membership_id,role_key,status,effective_*,...)`, optional tenant role definitions.
- Constraints: unique active identity/company membership; composite tenant references; status/effective checks; immutable audit events. `user_session_preferences` references active membership instead of acting as membership.
- Backfill: derive one membership from each non-null preference; map global roles to that membership; reconcile ambiguous/null rows before enforcing constraints.
- Compatibility: dual-read old/new representation during rollout; no company switching until every authorization path uses scoped assignments.
- Rollback: additive tables remain; feature flag selection while preserving writes to both during transition.
- Tests: T02–T07/T09/T10/T14/T25 across every module.

### R2.3 Restricted founder/bootstrap principal

- Findings: AUTH-P0-002, AUTH-P1-007/011
- Change: create `company_bootstrap_principals` (or pending owner membership) transactionally with company reservation. The capability can only edit its pending company/bootstrap data. Successful bootstrap activates company+owner membership and tenant Admin in one transaction; it never grants global Admin.
- Tests: T14–T16, retry after timeout, provider failure, rollback after master-data conflict.

### R2.4 Secure invitations

- Finding: AUTH-P1-010
- Change: implement hashed, purpose-restricted invitation records bound immutably to company, normalized email, inviter, approved tenant roles, expiry, status/version, and revocation. Revalidate inviter authority at acceptance according to approved policy.
- Tests: T17–T19 plus existing-user/new-user, concurrent accept, inviter removed, email mismatch.

### R2.5 Tenant-owned documents

- Finding: AUTH-P0-004
- Migration: add nullable `company_id`, backfill from the authoritative business object/owner membership, quarantine ambiguous rows, then set non-null and add `(id,company_id)`/lookup indexes and reference triggers. Add RLS only after proving runtime role does not bypass it.
- Code: derive company from authenticated context, not request body; include it on upload/storage key/access log; every lookup must use both document ID and company ID.
- Compatibility: presigned/object keys can remain while metadata backfills; never expose ambiguous legacy documents.
- Rollback: keep column/indexes; disable new reads only through a release rollback, not by removing tenant filters.
- Tests: T02/T03/T21/T25, two-company list/direct-ID/content/delete/verify/access-log.

## Phase 3 — Browser assurance, MFA, and recovery lifecycle

### R3.1 MFA and step-up

- Finding: AUTH-P2-014
- Change: enrollment, verified factor state, recovery codes/admin recovery, assurance level/time in session, and step-up challenges for Admin/RBAC/security settings/finance governance/company switch.
- Migration: factor, recovery, and challenge tables with encrypted secrets and immutable audit.
- Tests: T27, replay/expiry, factor removal, lost device, downgraded role, backup recovery.

### R3.2 Password/email lifecycle

- Findings: AUTH-P2-015 and email-change gap
- Change: credential `changed_at`, policy version, optional history; enforce expiry through a restricted password-change state. Email change becomes verified pending change and increments auth version after success.
- Tests: expiry boundary, reset vs change, email uniqueness race, old/new login, session invalidation.

## Phase 4 — Database and hosted assurance

- Replace broad snapshot authorization with request-scoped repositories and tenant transactions.
- Inventory every tenant table and add company columns/composite integrity where missing; use RLS as defense in depth only after runtime-role tests.
- Run T01–T30 on isolated Neon/Upstash equivalents, two API instances, queue retries, and failure injection.
- Validate Vercel preview origins cannot reach production cookies/API; validate Render proxy/IP behavior and secrets; validate Upstash TLS/ACL/key isolation; validate Cloudflare worker secrets/queue/DLQ permissions.
- Perform ARU-17 hosted configuration assessment, ARU-18 independent penetration test, and ARU-19 human UAT for Employee, Manager, HR, Finance, Auditor, and Admin in at least two companies.

## Implementation order and release gates

| Gate | Required outcome | Rollout blocker |
|---|---|---|
| G-A | R0.1–R0.8 merged with regression tests | Any open direct bypass, stale suspended access, Auditor mutation, or CSRF failure |
| G-B | R1.1–R1.3 verified under Redis failure and two instances | `KEYS` revocation, stale role/account session, missing security telemetry |
| G-C | R2.1–R2.5 migrated/backfilled in isolated DB | Non-atomic token/bootstrap, global roles, no membership, unscoped documents |
| G-D | MFA/lifecycle and hosted evidence | Unverified production configuration or privileged flow without approved assurance |
| G-E | Independent pen test and human role UAT | Open P0/P1 or missing tenant isolation evidence |

Current release disposition: **NOT READY**.
