# Personas, contexts and critical journeys

## Persona inventory

| Persona / role | Source-visible capabilities | Sensitive boundaries / unresolved intent | Evidence |
|---|---|---|---|
| Employee | Self-service profile, attendance, leave, expenses, timesheets, helpdesk, assigned assets/documents/navigation | Company membership, active employment, own-object access, offline device, post-deactivation access | `hrms_backend/src/shared/constants.ts:1-12`; `hrms_backend/src/auth/index.ts:211-225` |
| Reviewer / Manager | Expense manager queue/action, employee/team reporting and approvals in selected modules | Product historically asks to remove Reviewer terminology; assignment and company scope must be explicit | `hrms_backend/src/modules/expenses/policy.ts:21-31`; `hrms_backend/src/modules/platform/service.ts:180-197` |
| HR Manager | Employee lifecycle, leave/attendance/EMS management and HR reporting | Sensitive-field approval, company isolation, payroll correction and deactivation/session semantics | module policy/routes under `hrms_backend/src/modules/core`, `ems`, `leave`, `attendance`, `reports` |
| Finance Manager | Finance expense queue/approval/payment/settlement and financial reports/config read | Separation of duties, backups, amount authority, tenant/report scope | `hrms_backend/src/modules/expenses/policy.ts:33-42`; `hrms_backend/src/modules/platform/policy.ts:1-18` |
| Admin | Company/admin configuration, broad module management and reports | Admin is not automatically approved as manager/finance; tenant versus super-tenant scope | `hrms_backend/src/modules/admin`; `hrms_backend/src/auth/index.ts:211-225` |
| Auditor | Audit/report/document access; document module policy also permits mutations | Historical description says read-only, but document write/delete/verify is source-visible; company scope pending | `hrms_backend/src/auth/index.ts:224`; `hrms_backend/src/modules/documents/policy.ts:9-29` |
| Director | Backend role exists; not a mandatory expense v1 approval stage | Product placement and frontend persona/navigation remain unclear | `hrms_backend/src/shared/constants.ts:1-12`; `hrms_backend/src/modules/expenses/service.ts` |
| Helpdesk Agent | Ticket triage/assignment/state actions and helpdesk reporting | Company scope, SLA/escalation/reopen matrix, sensitive attachments | `hrms_backend/src/modules/helpdesk/policy.ts`; `hrms_backend/src/modules/helpdesk/service.ts` |
| Asset Manager | Asset inventory/assignment/recovery/settlement | Company scope, public QR disclosure, deduction/accounting authority | `hrms_backend/src/modules/assets/policy.ts`; `hrms_backend/src/modules/assets/service.ts:388-485` |
| Platform / operations operator | Deploys API/client/worker, configures PostgreSQL/Valkey/storage/email, handles retries/backups | Not an application role; privileged operational access/segregation and runbooks are outside source | `render.yaml`; `.github/workflows/branch-ci-cd.yml`; `hrms-client/vercel.json` |
| Anonymous visitor | Login/signup/reset/verification entry, health/public asset QR, conditionally docs/OpenAPI | Rate limits, data minimization, token scanning, production route exposure | `hrms_backend/src/plugins/auth.ts:29-57`; `hrms_backend/src/modules/assets/routes.ts:120-140` |

Frontend labels and backend roles are not assumed equivalent. BLQ-001 remains unresolved and `Reviewer` is retained in this inventory because current backend source uses it.

## Operating contexts

| Context | Variants that materially change behavior |
|---|---|
| Tenant/company | selected active company; second company; empty company; inactive company; missing/stale preference; attempted foreign object |
| Employment/account | invited/unverified; active; probation; notice/offboarding; inactive; deleted; login disabled; role changed while session active |
| Authentication | anonymous; cookie; bearer; both credentials; stale credential; expired/revoked session; Valkey unavailable |
| Client | Vercel SSR direct URL; hydrated client navigation; desktop; mobile viewport; offline/PWA; multi-tab; slow/flapping network |
| Time | company versus user timezone; cross-midnight shift; weekend/off-day; holiday/optional holiday; month/year/leap/DST boundary; locked payroll |
| Approval | requester only eligible actor; primary; backup; combined roles; actor becomes inactive; simultaneous decisions; stale version |
| Storage/delivery | Cloudinary/DB success/failure combinations; email send/disable/provider error; outbox duplicate/retry/dead-letter; worker restart/backlog |
| Data sensitivity | ordinary profile; legal/verified/finance document; precise coordinates; payroll snapshot; generated export; audit/security log |

## Ten critical vertical-slice journeys

### J-01 — Account signup, verification, password setup/reset and login

- Actors/contexts: anonymous applicant/employee; email recipient; active/deactivated user; cookie and bearer client.
- Entry surfaces: client signup/login/verify/reset routes → `/api/v1/auth/*`.
- Core chain: UI validation → Fastify auth route → `AuthService` token/password/session rule → actor/user store persistence → email event/provider → Valkey session → `/auth/me` navigation response.
- Evidence: `hrms_backend/src/modules/auth/routes.ts:18-170`; `hrms_backend/src/modules/auth/service.ts:147-520`; `hrms_backend/src/auth/index.ts:84-136`; `hrms-client/src/routes/verify-email.tsx:62-108,251-260`.
- Critical forks: duplicate signup; expired/replayed/wrong-purpose token; email disabled/provider failure; scanner opens link; reset revokes sessions; deactivated versus login-disabled user; stale cookie/bearer.
- Incomplete trace: effective production email provider/config and hosted cookie/origin behavior are unavailable. Risks: R-03, R-07, R-12.

### J-02 — Auditor and document upload/read/verify/delete/attachment

- Actors/contexts: Employee/HR/Admin/Auditor; own/another user's or company's record; verified/legal/finance document.
- Entry: EMS Documents UI → document routes → document policy → validation/storage → metadata/links/outbox/audit → download/delete response.
- Evidence: `hrms-client/src/routes/_app/ems.documents.tsx:149-175,362-392`; `hrms_backend/src/modules/documents/policy.ts:9-29`; `hrms_backend/src/modules/documents/service.ts:86-197,294-320,376-407`; `hrms_backend/src/modules/expenses/service.ts:1589-1622`.
- Critical forks: Auditor mutation; foreign object ID; duplicate checksum; storage/DB partial failure; delete linked document; legal hold; expense attachment without ticket access.
- Incomplete trace: formal record-class retention and intended Auditor/company scope. Risks: R-01, R-05, R-06, R-14.

### J-03 — Public asset QR scan, assignment, recovery and settlement

- Actors/contexts: anonymous scanner; Employee; Asset Manager/Admin; lost/revoked/assigned asset.
- Entry: public scan route → rate limit/auth exemption → hash lookup → minimal response; authenticated recovery routes → asset policy/service → ticket/asset event persistence.
- Evidence: `hrms_backend/src/plugins/auth.ts:29-57`; `hrms_backend/src/modules/assets/routes.ts:120-140,287-297`; `hrms_backend/src/modules/assets/service.ts:388-485`; `hrms_backend/src/plugins/rate-limit.ts:99-101`.
- Critical forks: guessed/duplicate hash, different company, inactive asset, excessive scans, recovery as deduction/waived/lost-damaged, settlement amount, missing acknowledgement/payroll posting.
- Incomplete trace: asset company ownership and deduction handoff. Risks: R-01, R-14; BLQ-022.

### J-04 — HR/employee lifecycle and privilege change

- Actors/contexts: HR Manager/Admin creates/onboards/transfers/edits/deactivates; employee has live sessions and owned workflows.
- Entry: EMS/Admin UI → core/EMS route/policy → employee/user/employment rules → PostgreSQL flush → notifications/audit/navigation/session consequences.
- Evidence: `hrms_backend/src/modules/core/service.ts:522-587`; `hrms_backend/src/modules/ems/service.ts`; `hrms_backend/src/platform/company-membership-context.ts:30-107`; `hrms_backend/src/plugins/auth.ts:60-83`.
- Critical forks: duplicate identity; no company preference; manager/department/role change; probation; offboarding; deactivate versus disable-login; active cookie/bearer; cross-company record.
- Incomplete trace: owner-approved lifecycle state machine and whether HR automation always invokes credential revocation. Risks: R-01, R-04, R-07.

### J-05 — Expense Manager and Finance separated approval, backup, payment and settlement

- Actors/contexts: Employee requester; assigned Manager/Reviewer; primary/backup Finance; Admin/combined role.
- Entry: expense UI/API → auth/policy/finance-governance → ticket state transition/version → hydrated persistence/outbox/document association → queues/reports/response.
- Evidence: `hrms_backend/src/modules/expenses/policy.ts:5-42`; `hrms_backend/src/modules/platform/service.ts:170-282`; `hrms_backend/src/modules/expenses/service.ts:341-581,1214-1437,1589-1622`.
- Critical forks: self action; no backup; combined roles; actor deactivates; concurrent approve/reject; changed amount/currency; duplicate payment; foreign attachment/company; reject/resubmit.
- Incomplete trace: minimum distinct humans, exception routing and accounting/payment integration. Risks: R-01, R-04, R-08.

### J-06 — Leave/WFH request, company holiday and balance

- Actors/contexts: Employee; manager/HR; two companies; region/optional holiday; limited balance.
- Entry: leave UI/API → company context/policy → request/duration/balance/holiday rule → hydrated persistence/outbox/notification → calendar/report response.
- Evidence: `hrms_backend/src/modules/leave-wfh/service.ts:427-447,549-581`; `hrms_backend/src/shared/schemas.ts:536-572`; `hrms_backend/src/modules/leave-wfh/routes.ts`.
- Critical forks: half day, weekend/off-day, regional/optional holiday, year boundary, overlap, cancel/reject, negative/insufficient balance, simultaneous approvals, company calendar conflict.
- Incomplete trace: accrual/carry/encashment/probation/negative-balance formulas and WFH-specific policy depth. Risks: R-01, R-09.

### J-07 — Attendance online/offline, geo/device, regularization and payroll lock

- Actors/contexts: Employee/device; Manager/HR; Payroll; online/offline; night shift/timezone; revoked device.
- Entry: client punch/offline queue → attendance route/idempotency → company membership/device/geo/policy → PostgreSQL transaction/locks → session/day/project/outbox → worker/report/payroll snapshot.
- Evidence: `hrms_backend/src/modules/attendance/routes.ts:343-430`; `hrms_backend/src/modules/attendance/command-service.ts:760-930,1157-1219,2166-2210`; `hrms_backend/src/modules/attendance/offline-sync-service.ts:59-257`; `hrms_backend/src/modules/attendance/payroll-period-service.ts:96-322,412-485`.
- Critical forks: same key/same or changed body; imprecise/stale/mocked location; device revoke; queue reorder/replay; cross-midnight/break; off-day/holiday; regularization; auto-punchout; payroll lock then correction.
- Incomplete trace: canonical work date and how pending post-lock adjustments resolve. Risks: R-10, R-11, R-13.

### J-08 — Cross-module reporting and export

- Actors/contexts: Employee/Manager/HR/Finance/Admin/Auditor; company A/B; CSV/XLSX/PDF/generated document.
- Entry: Reports UI/API → report policy/row visibility → cross-module aggregation → export serialization/object upload/document metadata → download response.
- Evidence: `hrms_backend/src/modules/reports/service.ts:371-379,522-561,795-885,1057-1059`; `hrms_backend/src/platform/generated-exports.ts:48-114`.
- Critical forks: privileged global view, foreign company filter/object, revoked role, empty tenant, formula payload, very large export, storage/DB failure, direct generated-file access/retention.
- Incomplete trace: intended privileged company scope and external object/download ACL. Risks: R-01, R-02, R-06, R-14.

### J-09 — Transactional outbox, Valkey reconnect and combined worker recovery

- Actors/contexts: API transaction; outbox worker; external consumer; SRE; Valkey disconnected/restarted.
- Entry: domain transaction writes outbox → worker locks row → XADD Valkey stream → SQL processed/retry/dead-letter → consumer dedupe/side effect; same process also purges coordinates and auto-punches out.
- Evidence: `hrms_backend/src/workers/outbox-worker.ts:106-160`; `hrms_backend/src/workers/run-outbox-worker.ts:106-171`; `hrms_backend/src/platform/valkey-client.ts:5-50`; `docs/architecture/adr/attendance/05-attendance-outbox-event-contract.md`.
- Critical forks: crash before/after XADD/commit, reconnect, stable event duplicate, retry ceiling, DLQ replay, stream trim, one task hangs, process restart, backlog catch-up.
- Incomplete trace: downstream consumers/dedupe, DLQ tooling, production Valkey/worker SLO and monitoring. Risks: R-11, R-13.

### J-10 — Authenticated Vercel SSR deep link and release promotion

- Actors/contexts: each authenticated role; direct link/refresh/client navigation; expired session; release operator.
- Entry: Vercel rewrite/SSR → TanStack protected shell → session request/cookie → client redirect/navigation/API; CI artifact → branch gate → Render/Vercel deploy/migration/smoke.
- Evidence: `hrms-client/src/routes/_app.tsx:23-45`; `hrms-client/src/shared/api/client.ts`; `hrms-client/src/shared/api/session.ts`; `hrms-client/scripts/build-vercel.mjs:1-39`; `hrms-client/vercel.json`; `.github/workflows/branch-ci-cd.yml:5-18,160-181`; `render.yaml`.
- Critical forks: protected direct URL, refresh, stale/expired cookie, API origin/CORS/SameSite, rewrite 404, hydration difference, wrong commit/config, failed migration, rollback/restore.
- Incomplete trace: actual Vercel/Render/GitHub settings and release-01 promotion route. Risks: R-12, R-15.

## Journey completeness assessment

| Journey | UI/API | Auth/membership | Rule/policy | Persistence transaction | Worker/events/storage | Report/response | Trace status |
|---|---|---|---|---|---|---|---|
| J-01 | Traced | Traced | Traced | Partially traced | Email/Valkey source traced | Traced | Incomplete: deployed provider/cookies |
| J-02 | Traced | Policy traced; tenant uncertain | Traced | SQL portion traced | Storage/outbox traced | Traced | Incomplete: ownership/retention/partial recovery |
| J-03 | Traced | Public/auth paths traced | Traced | Hydrated persistence traced | Events traced | Traced | Incomplete: tenant/payroll handoff |
| J-04 | Traced | Traced | Partially traced | Hydrated persistence traced | Notification/session consequence partial | Traced | Incomplete: approved lifecycle/revocation |
| J-05 | Traced | Traced; tenant uncertain | State machine traced | Hydrated persistence traced | Outbox/docs partial | Queue/report traced | Incomplete: governance/accounting |
| J-06 | Traced | Company writes traced | Calculation gap | Hydrated persistence traced | Notification/outbox partial | Calendar/report partial | Incomplete: formulas/scoping |
| J-07 | Traced | Traced | Traced; date oracle pending | Direct SQL transaction traced | Outbox/worker traced | Projection/payroll traced | Incomplete: boundary semantics/adjustment resolution |
| J-08 | Traced | Role traced; tenant gap | Row/export policy traced | Metadata transaction traced | Storage traced | Traced | Incomplete: tenant/download/retention |
| J-09 | N/A | Operational identity external | Retry/DL policy traced | SQL/Valkey boundary traced | Traced | Consumer response unavailable | Incomplete: consumers/operations |
| J-10 | Traced | Client/server split traced | Branch rules traced | Migration declaration traced | Hosting external | Smoke traced | Incomplete: hosted evidence/rollback |
