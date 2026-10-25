# Authentication and Authorization Security Remediation QA Summary

Date: 2026-10-25

Project: Hawkaii HRMS

Branch: `sprint-23/auth-s23-019`

Baseline: `30783aa5ccaef41900195e1902f9dcb9f92d4270` (`origin/release-01`)

Release disposition: **NOT READY**

## Scope and evidence boundary

This run audited the repository's real authentication, session, onboarding, tenant-context, role, document-policy, browser-session, database-persistence, and deployment-template paths. It implemented isolated P0/P1 corrections where the current model supported a complete fail-closed change, added regression coverage, and exercised the application through backend and real Chromium user journeys.

Evidence was produced against local source, a local Postgres 16/PostGIS container, local Valkey, mock object storage, Fastify injection, and Chromium. Fresh disposable databases were used for the final focused integration and browser runs. No Render, Vercel, Neon, Upstash, Cloudflare, production secret, hosted data, or hosted deployment was modified.

The required source-derived security documents are:

- `docs/security/AUTH_SECURITY_AUDIT.md`
- `docs/security/AUTH_ROUTE_SECURITY_MATRIX.md`
- `docs/security/AUTH_EDGE_CASE_MATRIX.md`
- `docs/security/AUTH_REMEDIATION_PLAN.md`

## Security corrections verified

| Finding | Implemented invariant | Executed evidence | Residual limitation |
|---|---|---|---|
| AUTH-P0-001 | Employee-code login is rejected in QA/production at the service layer; email/password remains valid | T22 focused tests passed | Hosted Render environment still needs verification |
| AUTH-P0-002 | A pending company reservation cannot be reused by a differently bound normalized founder email in one process | T15 denial and valid-owner path passed | Durable multi-instance bootstrap ownership remains open |
| AUTH-P0-003 | Protected routes reject inactive users and inactive/missing company context; lifecycle and role changes revoke sessions | T06/T07/T09 focused and full suites passed | Process snapshots remain unsafe across multiple API instances |
| AUTH-P0-004 | Auditor document access is read/audit-only | T21 mutation denial and authorized read passed | Documents still lack authoritative tenant ownership |
| AUTH-P1-006 | General self role/lifecycle mutation is denied and role/status changes revoke sessions | T04/T09 and lifecycle cases passed | Roles remain global rather than membership scoped |
| AUTH-P1-008 | Unsafe cookie-authenticated requests require an allowlisted Origin; Bearer clients remain supported | T24 malicious, missing, trusted, and Bearer cases passed | Hosted origins and multipart behavior still need deployment evidence |
| AUTH-P1-009 | Browser bearer state is memory-only and legacy session storage is removed | Chromium proved no Web Storage bearer, HttpOnly cookie, JS invisibility, and refresh recovery | Hosted cookie/CORS settings and human UAT remain |
| AUTH-P1-018 | Generic profile updates cannot replace an established login email; a narrow pre-credential correction remains allowed | T31 red-before-green, denial, and valid correction passed | Purpose-built verified email-change flow remains absent |
| AUTH-P2-016 | Auth/onboarding responses are explicitly non-cacheable | Focused header assertion and contract suite passed | CDN/edge behavior remains hosted evidence |
| AUTH-P3-017 | Ad-hoc auth token logging was removed | Static inspection and backend lint passed | Comprehensive security-event telemetry remains open |

## Additional defects found by full-user execution

The broader verification found two persistence defects outside the narrow auth implementation. Both corrections preserve database integrity rather than weakening its triggers.

1. `helpdesk.ticket_events` is immutable, but the full snapshot flush used `ON CONFLICT DO UPDATE`. Any later full flush could attempt to rewrite historical events. The flush now inserts unseen events only with `ON CONFLICT (id) DO NOTHING`.
2. Repeated full flushes attempted to reinsert the same immutable attendance policy version. PostgreSQL's no-overlap trigger correctly rejected the row before `ON CONFLICT` resolution, producing a 500 during later report exports. The version publisher now performs an existence-filtered insert, and a focused integration assertion proves repeated flush is a no-op with exactly one version row.

Test fixtures were also corrected without weakening production constraints:

- attendance's wall-clock fixture now permits Sunday rather than depending on the day the suite runs;
- reports no longer create orphaned asset/helpdesk audit rows that integrity triggers correctly reject;
- cross-company report tests use a real active company context;
- outbox immutability is asserted as a database rejection instead of mutating historical identity fields.

## Executed verification

| Layer | Result | Notes |
|---|---:|---|
| Focused auth security unit | **16/16 passed** | Covers T04, T06, T07, T09, T15, T21, T22, T24, T31, deactivation revocation, and no-store headers |
| Full backend unit | **551/551 passed** | 46 files |
| Full backend integration | **347/347 passed** | 53 files; final full run completed before the ancillary attendance replay guard, which was then verified by the focused database run |
| Focused admin-policy integration after replay fix | **4/4 passed** | Repeated full flush resolves successfully and retains one immutable policy-version row |
| Backend contract | **27/27 passed** | Generated API contract and security behavior |
| Backend production-flow API E2E | **1/1 passed** | Employee, manager, admin, attendance, leave, expenses, projects, helpdesk, notifications, and reports |
| Real Chromium production smoke | **7/7 passed** | Login/session refresh, employee modules, HR/Admin routes, projects/utilization, helpdesk mutation, mobile navigation, and all report exports/downloads |
| Backend typecheck/build/lint | **Passed** | Lint passed for 478 files |
| Frontend typecheck/build/lint | **Passed** | Lint: 0 errors and 43 pre-existing Fast Refresh warnings |
| API docs generate/verify and consumer handoff | **Passed** | 281 operations |
| Quality, implementation, scalability | **Passed** | Repository verification scripts |
| Cross-schema FK verification | **Passed** | Isolated local test database |

The final Chromium run used `127.0.0.1` consistently for frontend and API. A mixed `localhost`/`127.0.0.1` attempt was intentionally not accepted as cookie evidence because Chromium treats those as different sites for `SameSite=Lax` local cookies. Under the valid same-site topology, the complete suite passed in one run.

## Failed-then-fixed evidence

- T31 first reproduced established-account email replacement as an unexpected HTTP 200. After the correction, established identities are denied while the narrow unverified/pre-credential correction path succeeds.
- The initial full integration run produced 18 failures across 6 files. Investigation separated one real immutable-helpdesk-flush defect from invalid fixtures and a day-dependent fixture. The final full run passed 347/347.
- The first broad browser run passed six journeys and failed the report journey when the second generic report export returned 500. The cause was repeated publication of an existing attendance policy version. After the idempotent-write correction and focused regression, the final browser run passed 7/7.
- Two focused test invocations failed before product assertions because the requested env file was absent and then a remote test hostname was temporarily unresolved. Final focused evidence used a fresh local database and passed; these are harness/preflight failures, not application passes or failures.

## T01-T30 evidence limits

The executed suites provide passing evidence for covered subsets of T01, T02, T03, T04, T05, T06, T07, T08, T09, T10, T11, T12, T15, T20, T21, T22, T24, T25, T26, T28, T29, and T30. The exact scenario-by-scenario status and limitations are maintained in `docs/security/AUTH_EDGE_CASE_MATRIX.md`.

The following must not be inferred as passed:

- T13 and T16 across two independent API instances;
- T14 and T17-T19 because real multi-company membership/invitations do not exist;
- T23 with injected Redis outages/timeouts;
- T27 because MFA and step-up assurance are not implemented;
- complete BOLA/IDOR coverage over every module and resource;
- hosted multi-instance, queue, edge, proxy, and cache behavior.

## Unexecuted assurance

- Render/Vercel/Neon/Upstash/Cloudflare hosted configuration and adversarial testing;
- production-size load, stress, soak, failover, and recovery;
- distributed session/token/role races using two API processes;
- malicious upload/decompression, full CSV formula-injection, and every free-text injection path;
- full accessibility, browser-compatibility, low-network, stale-tab, double-click, back-button, and offline behavior;
- independent penetration testing;
- human UAT by actual Employee, Manager, HR, Finance, Auditor, and Admin users in at least two companies.

`pnpm verify:regression` was not run because it overwrites tracked historical QA artifacts. Its relevant unit, contract, integration, E2E, build, lint, typecheck, docs, and static verification constituents were executed directly. `pnpm verify:business` was not rerun because it duplicates the already completed full unit and integration suites.

## Open release blockers

1. AUTH-P0-004: documents have no authoritative tenant owner.
2. AUTH-P0-005/AUTH-P1-007: authorization snapshots and one-time token transitions are not safe across multiple API instances.
3. AUTH-P1-010/AUTH-P1-011: memberships, invitations, tenant-scoped roles, and legitimate multi-company switching are absent; bootstrap still grants global Admin.
4. AUTH-P1-019: hosted signup cannot securely hand off password-setup/company-bootstrap capabilities. Raw-token echo or Web Storage is not an acceptable production workaround.
5. MFA/step-up is absent for privileged actions.
6. Hosted configuration, independent penetration testing, and human multi-role UAT have not been validated.

## Production readiness

**NOT READY.** Local containment and regression coverage materially reduce direct authentication and browser-session risk, but the remaining tenant-ownership, distributed consistency, membership/role-model, hosted onboarding, and privileged-assurance gaps are release blockers.

No commit was created. The external tracker path required by repository instructions (`/Users/anuragkumar/Desktop/Tasks/HRMS.xlsx`) is not available on this Linux host, so no tracker row was changed.
