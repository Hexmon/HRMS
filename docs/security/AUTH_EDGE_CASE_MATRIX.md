# Authentication and Authorization Edge-Case Matrix

## Status rules

- **Covered and passing** is used only after a named test is executed successfully during this audit.
- **Covered, not executed** means repository test code exists but this audit has not yet run it.
- **Covered and failing** means a reproducible test was executed and exposed the defect.
- **Not tested** means the behavior exists but no adequate test was found.
- **Not implemented** means the product capability does not exist.
- **Not verified** means hosted/runtime or human evidence is required.

The execution status below is the initial audit state and will be updated as remediation tests run.

## Executed remediation evidence (2026-10-25)

| ID/case | Executed oracle | Result |
|---|---|---|
| T01 | Auth guard contract subset rejects unauthenticated/invalid/stale credentials | **Covered and passing** in executed auth contract subset |
| T04 | HR user cannot add a privileged role to itself | **Covered and passing** |
| T06 | Suspended user cannot employee-code login; issued session is denied; admin deactivation revokes sessions | **Covered and passing** |
| T07 | Inactive assigned company blocks a protected document route | **Covered and passing** |
| T09 | Role replacement revokes the target user's existing session | **Covered and passing in one app/store**; multi-instance case remains unsafe/unverified |
| T15 | Different email cannot claim an existing pending company slug | **Covered and passing in one app/store**; concurrent multi-instance case remains open |
| T21 | Auditor can read/audit a document but cannot write/verify it | **Covered and passing at policy level**; tenant isolation remains open |
| T22 | Hosted QA rejects employee-code login while email/password still succeeds | **Covered and passing** |
| T24 | Untrusted Origin is rejected and trusted Origin succeeds for cookie-authenticated mutation | **Covered and passing**; multipart/hosted browser cases remain |
| Cache control | Auth login response includes `no-store` and `Pragma: no-cache` | **Covered and passing** |
| Browser token persistence | Frontend uses a memory-only access token, removes legacy storage, receives an HttpOnly session cookie, and restores the session after refresh | **Covered and passing in real Chromium locally**; hosted cookie configuration and human UAT remain |
| T31 | HR cannot replace a verified privileged account email and then use recovery; unverified pre-credential typo correction remains allowed | **Covered and passing** after an executed red-before-green reproduction |
| Hosted signup handoff | Production signup reaches password setup and bootstrap without exposing successor capabilities to JSON or Web Storage | **Confirmed failing by code trace; not safely implemented** |

The focused file executed **16/16 passing**. The full backend unit suite executed **551/551 passing**, the full backend integration suite **347/347 passing**, the contract suite **27/27 passing**, backend API production-flow E2E **1/1 passing**, the focused attendance-policy replay regression **4/4 passing**, and real Chromium production smoke **7/7 passing**. These counts overlap and must not be added as unique security cases. Hosted, load/soak, independent penetration, and human role UAT were not performed.

## Required T01–T30 scenarios

| ID | Scenario and security oracle | Initial evidence/status | Finding/dependency |
|---|---|---|---|
| T01 | No credential cannot access any protected API; response is 401 without sensitive detail | Partial contract coverage; **covered subset passed** | Global auth hook |
| T02 | Company A cannot read Company B employee/document/business records, including direct IDs, list filters, exports, and caches | Core/reports partial; document boundary **not tested and known unsafe** | AUTH-P0-004, P1-010 |
| T03 | Company A cannot modify/delete Company B resources | Core partial; documents **not tested and known unsafe for global roles** | AUTH-P0-004 |
| T04 | Employee/HR/Admin cannot grant itself new authority through general role endpoints | Employee blocked by role gate; HR/Admin self mutation **not tested and unsafe** | AUTH-P1-006 |
| T05 | Unauthorized and cross-tenant role assignment fails without changing target/audit state | Core partial; cross-tenant target test exists indirectly | AUTH-P1-006, P1-010 |
| T06 | Suspended/deactivated membership or user immediately loses all API access, including existing sessions | **Not tested; known unsafe** on routes without context | AUTH-P0-003 |
| T07 | Suspended company blocks every protected tenant operation while preserving recovery/admin control policy | Auth session-context unit only; global route behavior **not tested** | AUTH-P0-003 |
| T08 | Successful password reset invalidates every prior session; failure leaves password/session state consistent | Existing integration coverage **passed** | Atomicity still open |
| T09 | Role removal invalidates stale sessions/authorization in every app instance | **Not tested; not implemented** | AUTH-P0-005, P1-006 |
| T10 | Company switch selects only an active membership and never carries roles from another company | **Not implemented** | AUTH-P1-010/011 |
| T11 | Expired verification/setup/reset/bootstrap tokens fail without state change | Verification/reset covered subset **passed** | Bootstrap/setup breadth incomplete |
| T12 | Used token replay fails without repeating related changes | Sequential reset/bootstrap covered subset **passed** | AUTH-P1-007 |
| T13 | Two concurrent consumers cannot both succeed, including across app instances | **Not tested; design is unsafe** | AUTH-P0-005, P1-007 |
| T14 | Existing global user can create/join another company without duplicating identity | **Not implemented; current signup rejects** | AUTH-P1-010 |
| T15 | A different identity cannot bootstrap another founder's pending company | **Not tested; known unsafe** | AUTH-P0-002 |
| T16 | Concurrent onboarding yields exactly one active company owner and one consistent master-data set | Sequential duplicate only; **not tested across instances** | AUTH-P0-005, P1-007 |
| T17 | Invitation acceptance cannot alter intended company/email | **Not implemented** | AUTH-P1-010 |
| T18 | Invitation acceptance cannot add roles beyond immutable inviter-approved tenant roles | **Not implemented** | AUTH-P1-010 |
| T19 | Expired/revoked/already-used invitations fail without membership changes | **Not implemented** | AUTH-P1-010 |
| T20 | Finance/requester/approver cannot self-approve or collapse prohibited approval stages | Existing expense covered subset **passed** | Role self-assignment still weakens SoD |
| T21 | Auditor can read authorized evidence but cannot create/update/delete/verify business resources | **Not tested; known unsafe for documents** | AUTH-P0-004 |
| T22 | QA/production authentication cannot use employee-code/mock/dev-token bypasses | Dev-token production test exists; employee-code **known unsafe** | AUTH-P0-001 |
| T23 | Redis timeout/unavailability rejects access and cannot create a session or bypass revocation | Startup requires Redis; request failure likely fails closed; **not executed** | Need fault-injection test |
| T24 | Malicious/missing cross-site origin cannot perform cookie-authenticated unsafe request; trusted origin and bearer client work | **Not implemented** | AUTH-P1-008 |
| T25 | Cross-tenant database references and queries are rejected by application and DB constraints | Attendance/device partial; most domains **not tested/no RLS** | AUTH-P0-004, P1-010 |
| T26 | Logs, errors, OpenAPI examples, audit events, and provider records never expose raw passwords/tokens/cookies | Logger/webhook tests partial; ad-hoc console output exists | AUTH-P3-017 |
| T27 | Privileged company switching/operations require fresh MFA assurance and cannot reuse lower assurance | **Not implemented** | AUTH-P2-014 |
| T28 | Duplicate, reordered, timed-out, and retried auth requests cannot corrupt identity/company/token state | Rate-limit/sequential replay partial; **multi-instance not tested** | AUTH-P0-005, P1-007 |
| T29 | Background jobs re-resolve authorized tenant/system context and cannot reuse revoked human authority | Attendance worker company context has targeted tests; auth-driven imports/exports **not verified** | Worker-specific review required |
| T30 | Cache/session/outbox keys include user/tenant scope and never return another principal's data | Session keyed by JTI; rate keys scoped; domain cache audit **not tested** | AUTH-P2-013 plus full cache inventory |

## Additional identity and lifecycle cases

| Case | Expected result | Status |
|---|---|---|
| Same email with different case | One normalized identity; no duplicate | Existing covered subset passed |
| Concurrent same-email signup | Exactly one identity and one intended company binding | Not tested; DB unique may make one flush fail after in-memory side effects |
| Concurrent same-slug signup by different emails | One reserved owner; loser receives conflict without token | Not tested; known unsafe (AUTH-P0-002) |
| Pending founder retries same signup | Resend policy applies and ownership remains unchanged | Partial covered subset passed |
| Verified active user repeats signup | Generic/safe conflict; no new verification token | Existing covered subset passed |
| Suspended verified user repeats signup | No verification resend/reactivation | Existing unit test passed |
| Email is changed by HR/Admin | Established identities require a separately verified change; pre-credential typo correction is allowed without leaving active tokens | Direct established-account change now denied and tested; complete verified-change flow not implemented |
| Soft-deleted user presents a valid JWT | 401 | Hook enforces; not executed |
| Terminated user presents a valid JWT | 401 on every route | Known unsafe at baseline |
| Active user has no company assignment | Fail closed with company-context error; no arbitrary fallback | Auth/core paths tested; other modules not fully traced |
| Active preference points to deleted/inactive company | All tenant operations fail closed | Auth session unit only |
| Active role removed while tab is open | Session revoked, UI clears, server denies stale request | Not implemented |
| Password reset provider fails after token creation | Response remains generic; token/retry state has approved behavior | Provider failure test exists; transaction semantics not verified |
| Redis becomes unavailable during login | No usable JWT should be returned; no hidden local fallback | Likely by call order; fault test not run |
| Redis becomes unavailable during authorization | Request fails closed; no actor attached | Likely; fault test not run |
| Browser sends stale bearer plus valid cookie | Explicit bearer wins and fails; no confused-deputy fallback | Contract coverage passed |
| Browser has cookie but no JS token after refresh | `/auth/me` restores session | Current client supports cookie but still stores token; test needed after fix |
| Production verification requires password setup | Successor capability is delivered through a secure, resumable server-bound handoff | Not implemented; production suppresses the only token currently consumed by the UI |
| Production verified founder starts company setup | Authenticated founder resumes only its pending company without a JS-readable bootstrap capability | Not implemented; local/dev Web Storage token is the current UI contract |
| Back button/stale tab submits after logout | Server rejects; UI removes optimistic state and redirects | Not verified; browser run covered login refresh, not stale-tab/logout behavior |
| Double-click bootstrap/reset/role change | One authoritative transition; second deterministic conflict/replay response | Sequential token cases only; concurrency unsafe |
| Extremely large pagination/export range | Bounded by schemas and worker quota; no cross-tenant spill | Not verified across all exports |
| Spreadsheet formula in exported identity fields | CSV/XLSX escapes `=`, `+`, `-`, `@`, tabs/CR | Not verified across exports |
| Malicious HTML/script in names/company fields | Stored as text; never interpreted in UI/email/export | Schema length limits exist; end-to-end XSS not verified |
| Multipart disguised type/oversize/decompression bomb | Server validates bytes/type/size and processing timeout before storage | Partial upload controls; adversarial corpus not run |

## Adversarial real-user baseline (ARU-01–ARU-19)

This register applies the repository's `qa-master-checklist` adversarial baseline to authentication and authorization. “Applicable” does not mean executed.

| ARU | Theme | Applicability and auth-specific evidence target | Status |
|---|---|---|---|
| ARU-01 | BOLA/IDOR | Employee, document, expense, project, helpdesk, asset, report/export IDs across two companies | Applicable; partial; document finding confirmed |
| ARU-02 | Privilege escalation | Every role-management and privileged action; self-assignment and global Admin bypass | Applicable; AUTH-P1-006/011 |
| ARU-03 | Stale sessions | Role removal, password reset, deactivation, company suspension, soft delete | Applicable; reset partial, status unsafe |
| ARU-04 | Auth-token abuse | Login, verification, reset, bootstrap, future invitation repetition/distribution | Applicable; partial; atomicity open |
| ARU-05 | Malicious uploads | Company logo, profile photo, documents, EMS/helpdesk attachments | Applicable; not adversarially executed |
| ARU-06 | CSV/formula injection | User/report/attendance/leave exports and import error echoes | Applicable; not verified |
| ARU-07 | Injection | All identity/company/free-text fields and email templates | Applicable; parameterized DB writes observed, UI/email rendering not fully verified |
| ARU-08 | Rate-limit evasion | Spoofed proxy IP, IPv6 rotation, distributed email/account guessing | Applicable; per-IP baseline insufficient |
| ARU-09 | Mass assignment | Strict auth Zod schemas; inspect remaining mutation DTOs and nested metadata | Applicable; auth schemas mostly strict |
| ARU-10 | Pagination/export abuse | Extreme page/page_size, broad filters, repeated export creation | Applicable; not fully verified |
| ARU-11 | Concurrency races | Signup, token consume, bootstrap, role/status edits, approvals | Applicable; AUTH-P0-005/P1-007 |
| ARU-12 | Offline attendance corruption | Device sequence/signature, out-of-order events, revoked user/device | Applicable to auth boundary; dedicated tests exist, not run here |
| ARU-13 | Browser behavior | Back/refresh/double click/stale tabs/offline/retry/session expiration | Partial: authenticated refresh passed in Chromium; remaining cases pending |
| ARU-14 | Public QR/document access | Asset scan privacy and document download authorization | Applicable; document P0 confirmed |
| ARU-15 | Accessibility/mobile/browser/low network | Login/recovery/onboarding/session-expiry UX | Applicable; human UAT pending |
| ARU-16 | Load/stress/soak/recovery | scrypt CPU, Redis revocation, auth rate keys, DB snapshot convergence | Applicable; targets/SLO TBD, not run |
| ARU-17 | Hosted configuration attacks | Render/Vercel/Neon/Upstash/Cloudflare env, preview origins, leaked dev features | Applicable; hosted evidence unavailable |
| ARU-18 | Independent penetration test | Tenant and identity scope | Required before production; not performed |
| ARU-19 | Human role UAT | Employee, Manager, HR, Finance, Auditor, Admin across two companies | Required before production; not performed |

## Release-blocking oracle

No release should be called ready until all confirmed P0s are closed, T01–T26 applicable automated cases pass in isolated infrastructure, T27 is either implemented or explicitly risk-accepted before privileged multi-company use, and ARU-17–19 have real hosted/security/human evidence.
