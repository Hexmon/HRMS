# Authentication-Sensitive Route Security Matrix

## Enforcement model at the audited baseline

Unless explicitly listed as public, every `/api/v1/**` route passes `src/plugins/auth.ts`: a JWT is selected from Bearer first and cookie second, its HMAC/expiry are verified, and its `jti` must exist and be unrevoked in the session store. At baseline the hook does **not** require active employment, active company, membership, CSRF proof, or MFA. Those controls exist only where a downstream service explicitly applies them.

Legend: `Y` enforced, `N` absent, `Partial` distributed/service-specific, `Cap` a hashed capability token rather than a session, `N/A` not applicable. The matrix distinguishes repository coverage from the executed evidence summarized in the branch overlay and QA artifact.

## Branch enforcement overlay (2026-10-25)

This overlay supersedes the baseline statements where they differ:

- Every protected route now rejects non-active users. All protected tenant routes except the narrowly scoped pending-bootstrap `GET /api/v1/auth/me` path also require an active assigned company and valid active role.
- Unsafe requests authenticated from the session cookie require an `Origin` matching `FRONTEND_URL` or `CORS_ALLOWED_ORIGINS`; Bearer-authenticated API calls do not require browser CSRF proof.
- Employee-code login is accepted only in trusted `local|development` configuration. QA and production reject it in the service layer.
- Role replacement, deactivation, and non-active status patch revoke all target sessions. General self role mutation is rejected.
- Document Auditor access is read/audit-only. Document rows still lack tenant ownership, so cross-company document isolation is not closed.
- Auth and onboarding responses are explicitly non-cacheable, and the web client no longer persists bearer credentials in Web Storage.
- Hosted signup remains incomplete: production correctly suppresses raw successor tokens, but password setup/company bootstrap still require them and the local client persists the bootstrap capability in Web Storage.
- Executed evidence: focused auth security 16/16, full backend unit 551/551, full backend integration 347/347, contracts 27/27, backend API production-flow E2E 1/1, focused attendance-policy replay regression 4/4, and real Chromium production smoke 7/7 all passed. This does not replace hosted, multi-instance, penetration, or human UAT evidence.

## Public identity and bootstrap routes

| Route | Authentication/session | Membership/tenant | Permission/ownership | MFA | Current enforcement | Missing controls | Tests |
|---|---|---|---|---|---|---|---|
| `POST /api/v1/auth/signup` | Public | N | Pending slug only | N | Strict body, global email/slug checks, rate limit | Pending-company owner check; multi-membership; invitation use; transactional uniqueness | Happy path/resend present; takeover absent |
| `POST /api/v1/auth/verify-email` | Cap (`email_verification`) | Token carries company | Token user/email | N | Hash, purpose, expiry, status | Atomic consume; distributed replay protection; production successor-capability handoff | Expired/revoked/reuse present; concurrency absent |
| `POST /api/v1/auth/email-verifications/resend` | Public | Optional slug, not membership | Email enumeration masking | N | Cooldown/hour/day in snapshot | Distributed/account+IP limit; pending-company ownership | Unit coverage present |
| `POST /api/v1/auth/set-password` | Cap (`password_setup`) | Token carries company | Token user | N | Password policy, token purpose/expiry | Production cannot obtain successor token after verification; atomic consume; compromised-token/session audit | Basic local flow present |
| `POST /api/v1/auth/password-reset/request` | Public | Arbitrary slug or last company | Existing active user hidden | N | Generic response and resend limits | Authoritative membership-derived company; distributed abuse control | Enumeration/rate tests present |
| `POST /api/v1/auth/password-reset/confirm` | Cap (`password_reset`) | Token metadata only | Token user | N | Password policy and session revocation | Atomic consume/change/revoke transaction | Reuse/session test present |
| `POST /api/v1/auth/login` | Public | N at login | Email+password **or employee code alone** | N | Active status for both branches, JWT+Valkey session | Hosted dev-bypass gate; account throttle; audit; no-store | Password tests present; T22 absent |
| `POST /api/v1/auth/logout` | Optional Bearer/cookie | N | Revokes supplied valid JTIs | N | Idempotent; clears cookie | Cookie CSRF/origin control | Bearer/cookie tests present |
| `POST /api/v1/onboarding/company-logo` | Cap (`company_bootstrap`) | Token company | Token user, pending company | N | Purpose/expiry/status and company pending check | Atomic state/consume; CSRF irrelevant without cookie; tenant-tagged document | Basic upload path present |
| `POST /api/v1/onboarding/company-bootstrap` | Cap (`company_bootstrap`) | Token company | Token user becomes global Admin | N | Pending check and token status | No secure production capability handoff; bootstrap-principal record; atomic consume; tenant-scoped role; idempotency | Duplicate sequential local test present; concurrent/hosted absent |
| `POST /api/v1/webhooks/resend` | Provider signature | N/A | Timestamp/signature/dedupe | N/A | Dedicated webhook verification | Hosted key/config verification | Unit tests present |
| `GET/POST /api/v1/assets/scan/:qr_hash` | Public by global hook | No session | QR hash capability/service checks | N | Public scan exception | Enumeration/privacy review; method path consistency | Module tests only |

## Protected identity, company, role, and security administration

| Route/family | Session | Active user/company | Tenant control | Permission/ownership | MFA | Key gap | Tests |
|---|---:|---:|---:|---|---:|---|---|
| `GET /api/v1/auth/me` | Y | Service: Y; bootstrap exception | One preference or pending token | Self | N | creates a fresh bootstrap token on reads; no atomic DB state | Integration/unit |
| `PATCH /api/v1/auth/session/preference` | Y | Service: Y/Y | Cannot change company; selected role must be global user role | Self | N | no real multi-company switch/membership; no step-up | Unit/integration |
| `GET /api/v1/core/master-data/org-selectors` | Y | Service: Y/Y | Active preference | Visible users/master data | N | global role model | Core tests |
| `GET/POST /api/v1/core/users` | Y | Service: Y/Y | User assignment row | Read hierarchy; Admin/HR writes | N | snapshot staleness; account lifecycle session linkage | Core tests |
| `GET/PATCH /api/v1/core/users/:id` | Y | Global hook + service: Y/Y | Target must share company | Self/hierarchy/Admin/HR | N | Established-account email change now fails closed; verified email-change workflow remains absent | Focused T31 + core tests |
| `POST /api/v1/core/users/:id/activate` | Y | Actor Y/Y | Target same company | Admin/HR, OCC | N | no security-event assurance | Partial |
| `POST /api/v1/core/users/:id/deactivate` | Y | Actor Y/Y | Target same company | Admin/HR, no self, last-admin guard | N | baseline does not revoke sessions | Partial |
| `POST /api/v1/core/users/:id/login/enable` | Y | Actor Y/Y | Target same company | Admin/HR, no self, OCC | N | password-setup consume non-atomic | Partial |
| `POST /api/v1/core/users/:id/login/disable` | Y | Actor Y/Y | Target same company | Admin/HR, no self, last-admin guard | N | revokes via Redis `KEYS`; persistence/sessions not atomic | Integration |
| `PUT /api/v1/core/users/:id/roles` | Y | Actor Y/Y | Target same company | Admin; HR for any non-Admin role | N | self escalation/SoD; no session revocation; global roles | Partial |
| `GET /api/v1/core/users/:id/roles/history` | Y | Service Y/Y | Target same company | Self/Admin/HR/Auditor | N | audit source is outbox snapshot, not immutable auth ledger | Partial |
| `GET /api/v1/core/users/:id/audit` | Y | Service Y/Y | Target same company | Self/Admin/HR/Auditor | N | same as above | Partial |
| `POST/GET /api/v1/core/users/imports[/:job_id]` | Y | Service Y/Y | Company ID embedded in job payload | Admin/HR | N | worker authorization/time-of-use must be verified | Partial |
| `POST /api/v1/core/users/exports` | Y | Service Y/Y | Filters checked against company | Admin/HR/Auditor | N | CSV formula sanitization and worker TOCTOU require evidence | Partial |
| `GET /api/v1/core/users/:id/subtree` | Y | Service Y/Y | Target same company | Self/hierarchy/Admin/HR/Auditor | N | snapshot staleness | Core tests |
| `GET/PUT /api/v1/admin/company-profile` and `POST .../logo` | Y | Service Y/Y | Active company resolved | Admin writes | N | no step-up; multipart CSRF at baseline | Admin tests |
| `/api/v1/admin/master-data/**` | Y | Service Y/Y | IDs checked against active company | Admin/HR writes | N | global/snapshot role state | Admin company-scope tests |
| `/api/v1/admin/rbac/**` | Y | Service Y/Y | Settings are largely global role keys | Admin | N | RBAC definitions are not tenant-scoped; no step-up | Admin tests |
| `/api/v1/admin/workflows/**`, `/policies/**`, `/email-templates/**`, `/notification-channels/**` | Y | Service Y/Y | Active company where model supports it | Admin | N | some configuration stores remain global | Admin tests |
| `GET /api/v1/admin/audit-log` | Y | Service Y/Y | Active company filters | Admin/Auditor read | N | completeness depends on event provenance | Admin tests |
| `GET/PUT /api/v1/admin/security-settings` | Y | Service Y/Y | Current model has one global settings record | Admin | N | settings not tenant-scoped; MFA forced false; no step-up | Admin tests |
| `/api/v1/platform/devices/**` | Y | Service Y/Y | Active company + device owner | Self; Admin/HR lifecycle | N | session/device assurance not tied to login; only area with RLS | Extensive device tests |
| `GET/PUT /api/v1/platform/finance-governance` | Y | Service Y/Y | Company membership checks on selected users | Admin write | N | no step-up/SoD assurance version | Platform tests |

## Protected business-route inventory

The following inventory accounts for every protected route family found in `src/modules/*/routes.ts`. Authentication is globally required, but authorization and tenant checks remain service-specific. The family-level rows avoid claiming a permission that differs by action; high-risk exceptions are called out.

| Prefix and exact route patterns | Session | Tenant/membership | Authorization/ownership | Current assessment |
|---|---:|---:|---|---|
| `/api/v1/dashboard/summary` | Y | Explicit active context | Role-aware aggregation | Company context present; snapshot risk remains |
| `/api/v1/documents`, `/documents/upload-policy`, `/documents/:id`, `/documents/:id/content`, `/documents/:id/download-url`, `/documents/:id/verify`, `/documents/:id/access-log`, `/expenses/:id/documents` (POST), `/documents/:id` (DELETE) | Y | **N on document resource** | Classification/owner/global roles | AUTH-P0-004; Auditor writes and cross-tenant Admin/Auditor reads |
| `/api/v1/expenses`, `/expenses/my`, `/expenses/metadata`, `/expenses/dashboard-summary`, `/expenses/:id`, `/expenses/:id/submit`, `/withdraw`, `/clarifications`, `/queue/manager`, `/manager/verify`, `/queue/finance`, `/finance-detail`, `/finance/approve`, `/finance/payment`, `/bills`, `/documents/:documentId/verify`, `/settlement`, `/timeline`, `/audit`, `/manager-backups` GET/POST, `/manager-backups/:id` DELETE | Y | Explicit active context in service; company carried in payload/snapshots | Owner, assigned approver, finance, Admin/Auditor read; self-processing guard | Stronger than most modules; stale global roles/process snapshot remain |
| `/api/v1/reports/expenses/**`, `/hr/employees`, `/attendance/summary`, `/leave-wfh/summary`, `/projects/summary`, `/timesheets/summary`, `/assets/summary`, `/helpdesk/summary`, `/audit`, `/exports`, `/exports/:id` | Y | Active context used for audit/export and selected reports | Role-specific read/export | Current-company audit filtering has tests; each report source still needs T02/T25 evidence |
| `/api/v1/assets/` GET/POST, `/warranty-alerts`, `/:id`, `/:id/assign`, `/:id/return`, `/licenses/activate|validate|revoke`, `/events/employee-terminated`, `/requests`, `/requests/my`, `/requests/queue`, `/requests/:id/decision|cancel`, `/:id/acknowledgements`, `/:id/maintenance`, `/vendors`, `/vendors/:id`, `/recovery-queue`, `/recovery-queue/:id/settlement` | Y except scan | Service role/ownership; many records lack explicit company column | Asset Manager/Admin, owner/queue rules | Requires full BOLA/tenant re-verification; public scan separately listed |
| `/api/v1/attendance/punches`, `/offline-sync`, assisted/historical employee punch commands, `/punches/my`, `/summary/my|team`, `/privacy`, `/calendar/monthly|daily`, `/regularizations/**`, `/geo-fallbacks/**`, `/payroll-periods/**`, `/work-sites/**`, `/geofences/**`, `/geo/simulate`, `/exceptions`, `/exports` | Y | Explicit active company resolver; many transactional repositories set company | Employee, manager, HR/Admin/Auditor by action; device/evidence checks | Best tenant/concurrency coverage; still inherits session/auth-version gap and no MFA |
| `/api/v1/timesheets/work-segments`, `/submissions`, `/submissions/my`, `/queue/approver`, `/projects/summary`, `/missing-submissions`, `/productivity-summary`, `/selectors`, `/submissions/:id`, `/submissions/:id/approve`, `/workflow-definitions` GET/POST | Y | Predominantly user/project inferred; not uniformly explicit | Self, current approver, Admin; HR/Auditor reports | Requires tenant-ID adversarial pass; Admin bypass is global |
| `/api/v1/leave/balances/my`, `/leave/balances/:user_id`, `/leave/requests/**`, `/wfh/requests/**`, `/leave-wfh/hr-monitor`, `/leave-wfh/exports`, `/holidays`, `/holidays/:id` | Y | Mixed active-company preference and global fallback helpers | Self, manager, HR/Admin by action | `leave-wfh/service.ts` contains first-active-company fallbacks; P1 tenant audit required |
| `/api/v1/ems/profile/me`, `/profile-change-requests/**`, `/requests/**`, `/admin/onboarding/**`, `/admin/probation/**`, `/admin/exits/**`, `/letters/**`, `/policies/**`, `/employees/:user_id/documents` | Y | Service-scoped by active company in newer paths; documents inherit P0-004 | Self, HR/Admin, acknowledgement ownership | Employee-document boundary requires T02/T03 after document tenant fix |
| `/api/v1/projects`, `/projects/:id`, `/projects/:id/archive`, `/projects/:id/members`, `/projects/:id/members/:member_id`, `/projects/:id/allocations`, `/projects/:id/milestones`, `/projects/:id/documents`, `/projects/:id/summary`, `/team-utilization/summary` | Y | Mostly user/project relationships; records have no explicit company in baseline schema | Manager/Admin and member visibility | Cross-tenant isolation is indirect and needs P1 remediation/evidence |
| `/api/v1/helpdesk/tickets`, `/tickets/:id`, `/comments`, `/internal-notes`, `/attachments`, `/assign`, `/priority`, `/status`, `/resolve`, `/close`, `/reopen`, `/categories`, `/categories/:id`, `/sla-report` | Y | Category/user inferred; no universal active-company check at hook baseline | Requester, assignee/category role, Admin | Cross-tenant ID and attachment testing required |
| `/api/v1/notifications`, `/notifications/unread-count`, `/notifications/:id/read`, `/notifications/read-all` | Y | Target user identity; company provenance varies by event | Self | Needs tenant-tagged cache/event checks (T29/T30) |
| `/api/v1/locations/*` | Y | Attendance company context | Exact-location permission and audit | Additional authorization exists; inherits stale session/global roles |

## Remaining global gaps affecting protected routes

1. Roles are global, not membership/company scoped (AUTH-P1-010/011).
2. No MFA or step-up claim is available.
3. Authorization reads come from a per-process snapshot (AUTH-P0-005), so the new global user/company checks are not authoritative across instances.
4. Only registered-device tables have forced RLS; route authorization is generally the sole tenant boundary.
5. Document metadata has no tenant owner, despite the Auditor mutation correction.
6. Invitations and legitimate multi-company switching are not implemented.
7. Production signup has no secure successor-capability handoff for password setup/company bootstrap; development Web Storage is not an acceptable production substitute.
