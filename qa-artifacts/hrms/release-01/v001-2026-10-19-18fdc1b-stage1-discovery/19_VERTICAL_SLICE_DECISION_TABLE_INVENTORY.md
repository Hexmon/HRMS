# Vertical-slice and decision-table inventory

## Purpose

This is a Stage 1 model of decisions, states and candidate combinations. It is not a set of executable cases and does not invent expected results. A row marked **source-defined** describes an observable code branch; **owner decision** means the final oracle is pending; **deployment proof** means source cannot answer it.

## VS-01 — Authentication lifecycle

**Slice:** browser route → auth API → token/session rule → core/auth persistence → email/Valkey → navigation response.  
**Evidence:** `hrms_backend/src/modules/auth/routes.ts:18-127`; `hrms_backend/src/modules/auth/service.ts:147-520,628-800`; `hrms_backend/src/auth/index.ts:84-136`.

| Dimension | Candidate values | Oracle status |
|---|---|---|
| User state | new, pending verification, verified/no password, active, inactive/deleted, login disabled | Source-defined in parts; lifecycle meaning pending |
| Token | valid, expired, replayed, wrong purpose, replaced by resend | Source-defined |
| Credential | cookie, bearer, both same, both different/stale, none | Source-defined in backend contracts |
| Email | send succeeds, disabled, provider timeout/error, bounce | Deployment proof / operations decision |
| Client | explicit hosted confirmation, development convenience, scanner fetch | BLQ-016 / Security decision |
| Session transition | login, reset, logout, role change, deactivate, disable login | Deactivation revocation is owner decision |

State inventory: `pending verification → verified/password setup → active session → expired/revoked`; alternate reset/resend paths. Missing decision: exact offboarding/session transition and real delivery acceptance.

## VS-02 — Document lifecycle and ownership

**Slice:** Documents UI/API → auth/document policy → validation → storage write/delete → SQL/hydrated metadata/link/outbox → download/audit response.  
**Evidence:** `hrms_backend/src/modules/documents/routes.ts:14-109`; `hrms_backend/src/modules/documents/policy.ts:9-29`; `hrms_backend/src/modules/documents/service.ts:86-436`.

| Dimension | Candidate values | Oracle status |
|---|---|---|
| Actor | Employee, HR, Admin, Auditor, Finance/Manager through expense | Auditor mutation is owner decision |
| Ownership | own, reportee, same company other user, other company, no company key | Product/Security decision plus engineering verification |
| Class/state | ordinary, verified, legal, finance, linked EMS letter/policy, deleted | Retention/legal-hold decision |
| Action | list, metadata, download, upload, verify, attach, delete, access log | Source-defined policy; intended policy pending |
| Failure point | validation, object upload, DB insert, link/outbox, object delete, DB delete | Engineering/recovery decision |
| Retry | same object/key/checksum, new key, duplicate delete | Unknown provider/reconciliation behavior |

State inventory: `created → uploaded/metadata → optionally verified/linked → downloaded/audited → hard deleted`. Missing decision: company ownership, Auditor rights, protected record classes and split-brain reconciliation.

## VS-03 — Public asset QR and recovery

**Slice:** anonymous scan or authenticated recovery → auth/rate-limit → asset policy/state → hydrated persistence/events → asset/report response.  
**Evidence:** `hrms_backend/src/modules/assets/routes.ts:131-156,277-297`; `hrms_backend/src/modules/assets/service.ts:365-485`.

| Dimension | Candidate values | Oracle status |
|---|---|---|
| Scan identity | valid hash, unknown, repeated, guessed, collision/foreign company | Response branch source-defined; privacy/tenant oracle pending |
| Asset state | available, assigned, returned, lost, inactive/deleted | Source-defined in parts |
| Public fields | code/type/name/status/assignment status | Source fact; approval pending Security |
| Recovery actor | Asset Manager/Admin, Employee, unrelated privileged role | Policy source-defined; company scope pending |
| Settlement | recovered, deduction, waived, lost/damaged; zero/nonzero amount | Source-defined state; accounting intent pending |
| Downstream | event only, acknowledgement, payroll/finance posting | BLQ-022 says latter are future/historical only |

State inventory: assignment/acknowledgement → return or employee termination → recovery ticket → settlement. Missing decision: public contract, tenant key and financial consequence.

## VS-04 — Employee lifecycle

**Slice:** Admin/EMS UI/API → core/EMS policy → identity/employment/profile rule → hydrated persistence → session/assets/notifications/audit → directory response.  
**Evidence:** `hrms_backend/src/modules/core/service.ts:287-656`; `hrms_backend/src/modules/ems/service.ts:82-532`.

| Dimension | Candidate values | Oracle status |
|---|---|---|
| Actor | Admin, HR, Manager, self, Auditor | Source policy plus BLQ-017 |
| Employee state | invite/pending, active, probation, transferred, inactive/deactivated, deleted/offboarded | Full product state machine pending |
| Mutation | identity/contact, department/manager, role, profile field, login, employment | BLQ-021 field matrix pending |
| Company | actor company, target company, attempted foreign target, empty company | DEC-PO-01 |
| Concurrency | current version, stale version, two API writers | Source OCC in parts; DEC-ARCH-01 |
| Live side effects | session remains/revoked, asset recovery, pending approvals, reports | DEC-SEC-01 and lifecycle orchestration verification |

State inventory: `created/pending → activated/onboarding/probation → active/transferred/role changed → deactivated/offboarding`; login enablement is a separate axis. Missing decision: transition ownership/effective dates and session/downstream guarantees.

## VS-05 — Expense approval and settlement

**Slice:** requester UI/API → actor/assignment policy → routing/state rule → hydrated persistence → documents/outbox → queues/reports.  
**Evidence:** `hrms_backend/src/modules/expenses/policy.ts:5-42`; `hrms_backend/src/modules/expenses/service.ts:241-581,1214-1622`.

| Dimension | Candidate values | Oracle status |
|---|---|---|
| People | requester; assigned primary/backup manager; primary/backup finance; Admin; combined roles | DEC-FIN-01 |
| Configuration | all eligible, primary inactive, backup missing/inactive, requester only eligible | Source validation in parts; exception behavior pending |
| Ticket state | draft, submitted, manager rejected/verified, finance rejected/approved, payment released, bills pending, settled/withdrawn | Source-defined |
| Action timing | correct order, duplicate, concurrent approve/reject, stale version | Source-defined branch candidates; runtime concurrency unverified |
| Amount | requested/approved/paid/billed/settled same or different; precision/currency boundary | Finance authority pending |
| Document | none/required/verified; own/foreign ticket; same/other company | Source checks plus R-05 gap |

State inventory follows Requester → Manager/Reviewer → Finance → Payment → Settlement; Director is not a mandatory source transition. Missing decision: four-eyes invariant, routing exception, amount/document authority and company scope.

## VS-06 — Leave/WFH and holidays

**Slice:** employee request → auth/company/manager policy → duration/balance/calendar rule → hydrated persistence/attendance side effect → calendar/report/export.  
**Evidence:** `hrms_backend/src/modules/leave-wfh/service.ts:141-679`; `hrms_backend/src/modules/reports/service.ts:522-565`.

| Dimension | Candidate values | Oracle status |
|---|---|---|
| Request | leave type or WFH; full/half day; one/multiple day; overlap | Source-defined in parts |
| Balance rule | accrual, carry, encashment, probation, zero/negative | BLQ-008 / HR decision |
| Calendar | company A/B, region All/specific, optional/mandatory, weekend/off-day, leap/year boundary | DEC-HR-01 |
| Actor | requester, assigned manager, HR monitor, unrelated manager | Source visibility plus tenant policy pending |
| Decision | approve, reject, cancel; simultaneous/stale | Source-defined state; concurrency unverified |
| Side effect | attendance status, balance, notification, report/export | Source-visible; cross-process atomicity unverified |

State inventory: `submitted → approved/rejected → optionally cancelled` plus WFH parallel. Missing decision: all calculation formulas and region/optional/company calendar precedence.

## VS-07 — Attendance/offline/regularization/payroll

**Slice:** web/mobile action → membership/device/geo/policy → direct SQL transaction/locks → session/day/outbox → worker/report/payroll snapshot.  
**Evidence:** `hrms_backend/src/modules/attendance/command-service.ts:647-1330,1742-2310`; `hrms_backend/src/modules/attendance/offline-sync-service.ts:59-257`; `hrms_backend/src/modules/attendance/payroll-period-service.ts:96-485`.

| Dimension | Candidate values | Oracle status |
|---|---|---|
| Command | check-in, break start/end, check-out, auto-checkout, historical correction | Source-defined |
| Idempotency | new key, same key/same body, same key/changed body, duplicate offline ID/sequence | Source-defined |
| Device/network | registered/revoked, valid/invalid signature, online/offline, reordered/replayed backlog | Source-defined in parts; client behavior unknown |
| Geo | inside/outside, stale/accurate, missing, mocked/integrity signal, fallback | Source-defined policy; organization thresholds may vary |
| Time | normal day, off-day/holiday, midnight, DST, client/server skew | Midnight/payroll oracle pending DEC-HR-01 |
| Payroll | open period, locking/locked/unlocked, correction before/after lock, pending adjustment | Source representation; adjustment application policy pending |

State inventory: `closed → open session → break/open → checked out/auto-closed`; correction request `pending → approved/rejected`; payroll `open → locked snapshot → optional unlocked`, with separate pending adjustments. Missing decision: canonical day and adjustment resolution.

## VS-08 — Cross-module reports and exports

**Slice:** Reports UI/API → role/row policy → domain aggregation → serialization/storage/metadata → download/list/detail.  
**Evidence:** `hrms_backend/src/modules/reports/service.ts:91-1059`; `hrms_backend/src/platform/generated-exports.ts:33-204`.

| Dimension | Candidate values | Oracle status |
|---|---|---|
| Actor | Employee, Manager, HR, Finance, Admin, Auditor, unrelated role | Source-defined role branches; company scope pending |
| Tenant/filter | selected company A/B, no filter, forged foreign filter, empty tenant | DEC-PO-01 |
| Report | expense, HR, attendance, leave/WFH, project, timesheet, asset, helpdesk, audit | Source inventory |
| Format | API page, CSV, XLSX, generated document/download | Source-defined; parity/retention pending |
| Data | normal, sensitive, formula prefix, Unicode, empty, large | Formula safeguard source-defined; size/SLO unknown |
| Failure | render, object upload, metadata persistence, download authorization, deletion/expiry | Recovery/privacy policy pending |

State inventory: `request → aggregate → render → object/metadata created → listed/downloaded → retained/deleted`. Missing decision: privileged cross-company scope, retention/expiry, direct download ACL, size/parity requirements.

## VS-09 — Outbox and worker recovery

**Slice:** domain SQL outbox → worker claim → Valkey stream append → SQL processed/retry/dead-letter → consumer dedupe/side effect; shared with purge/auto-punchout.  
**Evidence:** `hrms_backend/src/workers/outbox-worker.ts:56-160`; `hrms_backend/src/workers/run-outbox-worker.ts:119-171`; `docs/architecture/adr/attendance/05-attendance-outbox-event-contract.md`.

| Dimension | Candidate values | Oracle status |
|---|---|---|
| Outbox row | pending, claimed/locked, processed, retry scheduled, dead-letter | Source-defined |
| Failure point | before claim, before XADD, after XADD/before mark, before commit, after commit | At-least-once implication; deployment test required |
| Valkey | connected, timeout, disconnect, restart, eviction/trim | Client response source-defined in part; service guarantees unknown |
| Consumer | first delivery, duplicate, crash before/after side effect, replay | ADR requires dedupe; implementation external/unknown |
| Worker load | normal, outbox backlog, purge slow, auto-punchout slow, process restart, two workers | SRE topology/SLO pending |
| Recovery | retry below threshold, threshold reached, alert, operator replay | Retry/DL state source-defined; runbook unknown |

State inventory: `pending → processed` or `pending → retry... → dead-letter`; event delivery is at-least-once. Missing decision/proof: consumer ledger, stream durability, DLQ replay and worker fairness.

## VS-10 — Authenticated SSR and promotion

**Slice:** direct URL/client navigation → Vercel SSR/rewrite → protected shell/session/API → role page; commit → CI → migration/deploy/smoke/rollback.  
**Evidence:** `hrms-client/src/routes/_app.tsx:23-45`; `hrms-client/src/shared/api/client.ts`; `hrms-client/src/shared/api/session.ts`; `hrms-client/scripts/build-vercel.mjs:1-39`; `.github/workflows/branch-ci-cd.yml:5-18,160-181`; `render.yaml`; `hrms-client/vercel.json`.

| Dimension | Candidate values | Oracle status |
|---|---|---|
| Navigation | client link, direct deep link, refresh, back/forward, unknown route | Local source/spec exists; hosted proof missing |
| Auth | valid/expired/stale cookie, bearer, no credential, role changed | Backend branches source-defined; SSR forwarding unknown |
| Origin | same origin, split web/API, cookie domain/SameSite/CORS variants | Deployment proof |
| Render | server shell, hydration, redirect, slow session, API unavailable | Intended SSR contract pending Architect |
| Branch/artifact | release-01, dev, qa, main; expected/wrong commit | Workflow source; promotion mapping external |
| Migration/recovery | compatible migration, failure, partially applied, rollback, backup restore | Platform runbook/evidence required |

State inventory: request can resolve authenticated page, unauthenticated redirect or error/404; promotion moves immutable commit/config/schema through environments. Missing proof: hosted direct links, exact artifact identity, rollback/restore and release-branch gate.

## Cross-slice decision coverage map

| Pending decision | Slices affected | Candidate inventory effect |
|---|---|---|
| DEC-PO-01 tenant/privileged scope | VS-02–VS-08 | Determines allowed/denied company/object rows and empty-tenant result |
| DEC-ARCH-01 writer topology | VS-01, VS-04–VS-06, VS-08 | Determines concurrency, stale-read and restart combinations |
| DEC-HR-01 date/holiday/payroll policy | VS-06, VS-07, VS-08 | Determines duration, projection and correction expected values |
| DEC-FIN-01 expense governance | VS-02, VS-05, VS-08 | Determines actor/state/amount/document approval branches |
| DEC-SEC-01 Auditor/QR/retention/revocation | VS-01–VS-04, VS-08 | Determines access, deletion, session and retention oracles |
| DEC-SRE-01 deployment/runbook | VS-01, VS-02, VS-07, VS-09, VS-10 | Determines provider/failure/recovery and release-environment coverage |
| DEC-QA-01 environment/support matrix | all | Determines representative devices, browsers, data volumes and evidence |

## Stage boundary

These tables deliberately stop before assigning final preconditions, steps, expected results, owners or execution status. Those are Stage 2 outputs only after G1 decisions and environment evidence are available.
