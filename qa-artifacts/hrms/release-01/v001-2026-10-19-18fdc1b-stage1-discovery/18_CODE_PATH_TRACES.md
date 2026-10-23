# Critical code-path traces

## Reading convention

Each trace follows UI/API → authentication/company membership → rule/policy → persistence boundary → external/worker/event side effects → report/response. “Gap” means the source trace stops or the intended behavior is unapproved; it is not a runtime failure assertion.

## TRACE-J01 — Authentication lifecycle

1. **UI/API entry:** signup, verification, resend, set-password, reset request/confirm, login/logout, `/me`, preference, and bootstrap routes are registered in `registerAuthRoutes` (`hrms_backend/src/modules/auth/routes.ts:18-127`).
2. **Public/auth boundary:** `authPlugin` allowlists the token-entry routes, otherwise validates bearer/cookie session and attaches the actor (`hrms_backend/src/plugins/auth.ts:29-83`).
3. **Business rules:** `AuthService.signup` creates pending identity/token and email delivery request; `verifyEmail`, `setPassword`, `requestPasswordReset`, and `confirmPasswordReset` enforce purpose/state/expiry; `login` validates credentials and issues session; `logout` revokes (`hrms_backend/src/modules/auth/service.ts:147-520,796-800`).
4. **Authorization context:** `sessionContext` derives roles, permissions, navigation and company preference (`hrms_backend/src/modules/auth/service.ts:628-795,1269-1377`).
5. **Persistence:** Auth/core changes are hydrated-domain mutations flushed by `app.ts` `onSend`; session data is Valkey-backed in hosted mode (`hrms_backend/src/app.ts:104-133`; `hrms_backend/src/auth/index.ts:84-136`).
6. **External side effect:** email delivery is invoked through the email adapter; committed Render declaration uses disabled mode (`render.yaml:70-72`).
7. **Response:** login sets browser cookie and returns user/context; `/me` returns current navigation; development-only token conveniences are environment-gated.
8. **Safeguards:** purpose/expiry/hash handling, password policy, session TTL/revoke, hosted dependency fail-closed, token/log redaction.
9. **Gaps / candidates:** live email config/provider; scanner-safe hosted confirmation; reset/deactivation revocation; multi-instance hydrated state; cookie origin/SameSite. Risks R-03, R-04, R-07, R-12.

## TRACE-J02 — Documents and Auditor mutation

1. **UI/API entry:** EMS Documents route presents deletion confirmation (`hrms-client/src/routes/_app/ems.documents.tsx:149-175,362-392`); backend routes expose upload, expense upload, list, metadata, download, delete, verify and access log (`hrms_backend/src/modules/documents/routes.ts:14-109`).
2. **Auth/membership:** generic auth resolves actor. Document routes do not visibly establish a company context before service calls.
3. **Policy:** `requireDocumentRead/Write/Delete/Verify` allows Admin or Auditor for broad operations (`hrms_backend/src/modules/documents/policy.ts:9-29`).
4. **Rules:** `DocumentService.upload` validates upload policy/content metadata, creates object key/checksum and associations; `metadata/download*`, `delete`, `verify`, `list`, `accessLog` implement lifecycle (`hrms_backend/src/modules/documents/service.ts:63-197,237-436`).
5. **Persistence/external ordering:** upload writes external object before adding document/link/outbox data. Delete calls object removal before in-memory/SQL-related deletion; SQL helper encloses metadata operations in a transaction (`hrms_backend/src/modules/documents/service.ts:139-197,294-320,376-407`).
6. **Cross-module association:** the expense upload route delegates to document service then `ExpenseService.attachVerifiedDocument`; that method checks document state, but an explicit ticket-read/company check is not evident within the method (`hrms_backend/src/modules/expenses/service.ts:1589-1622`).
7. **Response/report:** metadata/download URL/content is returned; access logs and outbox events can feed audit/reporting.
8. **Safeguards:** authenticated roles, file policy/checksum, confirmation UI, access logs, production real-storage guard, SQL transaction for metadata.
9. **Gaps / candidates:** intended Auditor write authority, object/company ownership, legal/finance retention, storage/DB split-brain/reconciliation, foreign expense attachment. Risks R-01, R-05, R-06, R-14.

## TRACE-J03 — Public asset QR and recovery

1. **UI/API entry:** `POST /assets/scan/:qr_hash` is registered at `hrms_backend/src/modules/assets/routes.ts:131-134`; recovery queue and settlement at `:277-297`.
2. **Auth boundary:** the scan path is an auth exception; public rate-limit grouping includes asset scan (`hrms_backend/src/plugins/auth.ts:29-57`; `hrms_backend/src/plugins/rate-limit.ts:99-101`). Recovery remains authenticated.
3. **Rules/policy:** `AssetService.scan` matches a QR hash and returns a limited projection—hash/code/type/name/status/assignment status (`hrms_backend/src/modules/assets/service.ts:476-485`). `settleRecovery` checks asset authority/state and records recovered/deduction/waived/lost-damaged result (`:388-439`).
4. **Persistence:** Assets use hydrated store/repository and generic domain flush after the response path.
5. **Side effects:** assignment/recovery append asset events; `consumeEmployeeTerminated` can create recovery tickets (`hrms_backend/src/modules/assets/service.ts:552-644`).
6. **Report/response:** scan returns minimal public data; authenticated reports aggregate asset inventory/recovery in `ReportService.assetsSummary` (`hrms_backend/src/modules/reports/service.ts:676-740`).
7. **Safeguards:** limited public fields, public rate limiting, status/version checks for authenticated lifecycle.
8. **Gaps / candidates:** QR entropy/guessability, tenant ownership, cache/data minimization, settlement acknowledgement and finance/payroll handoff. Risks R-01, R-14; BLQ-022.

## TRACE-J04 — HR / employee lifecycle

1. **UI/API entry:** Core user routes cover directory/create/update/activate/deactivate/login enable-disable/role replacement/audit/import/export (`hrms_backend/src/modules/core/routes.ts:110-283`); EMS adds self profile/change requests/checklists/probation/letters/policies/documents (`hrms_backend/src/modules/ems/service.ts:82-532`).
2. **Auth/membership:** generic auth resolves actor; company membership helper validates preference/company/role and optionally active employment (`hrms_backend/src/platform/company-membership-context.ts:30-107`). Adoption varies by service path.
3. **Rules/policy:** `CoreService.createUser/updateUser/activateUser/deactivateUser/disableLogin/replaceRoles` enforces privileged actor, not-self constraints, version and audit (`hrms_backend/src/modules/core/service.ts:287-393,502-656,1519-1564`). EMS routes separate direct profile edits and approval requests.
4. **Persistence:** Core/EMS mutate hydrated store and are flushed to PostgreSQL by selected domain after the request.
5. **Session/event effects:** `disableLogin` calls session-store revocation, while `deactivateUser` does not visibly do so (`hrms_backend/src/modules/core/service.ts:522-587`). Actor authentication checks deletion but not every inactive-employment state (`hrms_backend/src/plugins/auth.ts:60-83`). Asset employee-termination consumption exists as an event-style method, but full orchestration is not shown by one transaction.
6. **Report/response:** directory/detail/audit/export/report paths project user state; `ReportService.hrEmployees` enumerates store users (`hrms_backend/src/modules/reports/service.ts:371-401`).
7. **Safeguards:** expected versions, restricted lifecycle/role methods, audit records, explicit disable-login revocation, active employment in selected membership contexts.
8. **Gaps / candidates:** lifecycle state-machine oracle, company isolation, role/deactivation propagation across process snapshots, session invalidation, downstream asset/workflow ownership. Risks R-01, R-04, R-07.

## TRACE-J05 — Expense approval through settlement

1. **UI/API entry:** routes expose create/submit/withdraw/clarify; manager and finance queues/actions; payment, bills, document verify, settlement, timeline/audit and backups (`hrms_backend/src/modules/expenses/routes.ts:90-282`).
2. **Auth/membership:** actor is authenticated; `ExpenseService` looks up ticket/assigned actors. Expense records inspected are not consistently company-keyed.
3. **Routing:** `resolveRoute` selects manager, finance and backup configuration, and submit establishes route/state (`hrms_backend/src/modules/expenses/service.ts:241-581`). `FinanceGovernanceService` validates configured primary/backups are active with required roles (`hrms_backend/src/modules/platform/service.ts:170-282`).
4. **Policy:** `requireNotRequester`, assigned manager and finance checks separate requester, manager and finance lanes (`hrms_backend/src/modules/expenses/policy.ts:5-42`).
5. **State machine:** `managerVerify`, `financeApprove`, `releasePayment`, `submitBills`, `settle` check current state/version and append timeline/audit/outbox (`hrms_backend/src/modules/expenses/service.ts:1214-1437`).
6. **Persistence:** state is mutated in hydrated store, then expense/platform/document domains are flushed transactionally per domain. This does not make the whole external/document workflow one distributed transaction.
7. **Storage/events:** verified documents can attach; outbox/timeline events record transitions. Payment/accounting provider integration is not evident in the traced method.
8. **Report/response:** manager/finance queues, details, history, register/payment/audit reports use current ticket/payment collections (`hrms_backend/src/modules/reports/service.ts:91-370`).
9. **Safeguards:** self-processing denial, assigned actor checks, backups, versions/states, money normalization, audit/timeline.
10. **Gaps / candidates:** minimum distinct people, combined roles/Admin, no-backup exception, company ownership, concurrent stale writes, document ownership, approved-versus-paid-versus-settled amounts. Risks R-01, R-04, R-08.

## TRACE-J06 — Leave, WFH, holidays and balances

1. **UI/API entry:** routes cover personal/HR balances, leave create/list/manager decision/cancel, WFH equivalents, HR monitor/export, holiday list/update (`hrms_backend/src/modules/leave-wfh/routes.ts:35-189`).
2. **Auth/membership:** authenticated actor reaches service. `requireCompanyId` and active employee checks exist; holiday list/upsert resolves actor company (`hrms_backend/src/modules/leave-wfh/service.ts:427-456,716-739`).
3. **Rules:** `createLeaveRequest` validates dates/overlap/duration/balance; manager decision/cancel changes state and applies attendance status; WFH parallels the lifecycle (`hrms_backend/src/modules/leave-wfh/service.ts:189-397,579-679`).
4. **Calculation:** `leaveEntitlements`, `activeCompany`, `workingWeek`, `holidayDates`, and `requestDurationDays` supply the calculation (`hrms_backend/src/modules/leave-wfh/service.ts:549-598`). `activeCompany`/holiday collection are broad enough to raise multi-company/region questions; optional/region fields are not visibly used in `holidayDates`.
5. **Persistence:** repository mutates hydrated collections; generic onSend flush persists leave/attendance-related domains. The service's attendance status application is not a cross-process distributed transaction.
6. **Events/reports:** request lifecycle adds events/notifications; `createExportJob` and `ReportService.leaveWfhSummary` project balances/holidays (`hrms_backend/src/modules/leave-wfh/service.ts:462-547`; `hrms_backend/src/modules/reports/service.ts:522-565`).
7. **Safeguards:** overlap/balance/date validation, active-user/company helpers, decision state checks.
8. **Gaps / candidates:** approved accrual/carry/encashment/probation/negative-balance formula; company/region/optional holiday; concurrent approval; attendance consistency. Risks R-01, R-09.

## TRACE-J07 — Attendance, offline sync, regularization and payroll

1. **UI/API entry:** online punch, offline sync, readings/calendars, regularization, geo fallback, payroll period and site/geofence routes are registered in `hrms_backend/src/modules/attendance/routes.ts:343-915`.
2. **Auth/company/device:** route requires actor; command/offline services resolve company membership and validate registered device/sequence/signature/policy/geo evidence. Transaction-local tenant setting is defined in `hrms_backend/src/platform/tenant-db-context.ts:1-34`.
3. **Online idempotency:** route requires header/body identity agreement (`hrms_backend/src/modules/attendance/routes.ts:343-398`); `AttendanceCommandService.execute` checks replay/conflict, locks state/session, validates transition/policy/geo, inserts punch, updates session/state/day, writes outbox, and commits (`hrms_backend/src/modules/attendance/command-service.ts:647-1330`).
4. **Offline:** `AttendanceOfflineSyncService.syncBatch` validates batch/device/company/sequence and records inbox/result/warnings; accepted offline evidence is distinguished from immediate payroll eligibility (`hrms_backend/src/modules/attendance/offline-sync-service.ts:59-257,539-853`).
5. **Regularization:** `executeHistoricalCorrection` and `decideRegularization` validate normalized items/work dates, update authoritative day projection and create payroll adjustment when locked (`hrms_backend/src/modules/attendance/command-service.ts:1742-2310`; `hrms_backend/src/modules/attendance/payroll-period-service.ts:412-485`).
6. **Payroll:** `AttendancePayrollPeriodService.createPeriod/lockPeriod/unlockPeriod/summary` uses company context, SQL transaction/advisory locks, snapshots and separate adjustment presentation (`hrms_backend/src/modules/attendance/payroll-period-service.ts:96-400`).
7. **Worker/events:** transaction writes outbox; auto-punchout uses the same direct command principles; outbox worker publishes downstream.
8. **Response/report:** command returns accepted/replay/conflict details; calendar/team/report/payroll summary read projections and snapshots.
9. **Safeguards:** strongest-in-repo SQL transactionality, locks, idempotency, company/device/geo checks, RLS for registered devices, immutable snapshots, exact-coordinate audit/purge.
10. **Gaps / candidates:** consistent session work date across midnight, DST, next-day regularization, offline boundary changes, adjustment lifecycle, deployed devices/geo. Risks R-10, R-11, R-13.

## TRACE-J08 — Reports and generated exports

1. **UI/API entry:** report routes cover expense, HR, attendance, leave/WFH, projects, timesheets, assets, helpdesk, audit, export list/detail/create (`hrms_backend/src/modules/reports/routes.ts:75-191`).
2. **Auth/policy:** authenticated actor enters `ReportService`; each method performs role/row decisions, with `canSeeExport` allowing Admin/Auditor broadly (`hrms_backend/src/modules/reports/service.ts:1057-1059`).
3. **Aggregation:** `hrEmployees`, `attendanceSummary`, `leaveWfhSummary`, module summaries and `auditReport` read multiple hydrated collections (`hrms_backend/src/modules/reports/service.ts:371-849`). Some collections are global or privileged filtering is broad.
4. **Export rules:** `createExport` chooses report, rows and format; serialization includes formula neutralization (`hrms_backend/src/modules/reports/service.ts:850-885`; `hrms_backend/src/platform/generated-exports.ts:158-204`).
5. **Persistence/storage:** `createGeneratedExportDocument` renders bytes, uploads object, then adds document/export metadata (`hrms_backend/src/platform/generated-exports.ts:33-132`).
6. **Response:** create returns generated/queued result; list/detail returns export metadata; document subsystem handles retrieval.
7. **Safeguards:** role gates, selected row helper, filters/page limits, formula neutralization, metadata/document audit, real-storage guard.
8. **Gaps / candidates:** company scope for every dataset/privileged role, direct download authorization, partial storage/DB failure, parity/large exports, retention/legal hold. Risks R-01, R-02, R-06, R-14.

## TRACE-J09 — Outbox, Valkey and shared worker

1. **Event creation:** domain transactions append stable-ID outbox rows; Attendance writes them inside the same SQL command transaction.
2. **Worker claim/publish:** `OutboxWorker.publishPending` opens SQL transaction, selects/locks pending rows, publishes through `ValkeyOutboxPublisher.publish`, marks processed, then commits; errors roll back and schedule retry/dead-letter (`hrms_backend/src/workers/outbox-worker.ts:24-47,56-160`).
3. **Transport:** Valkey client supports redis/rediss, lazy connection, command timeout, bounded retries and reconnect delay (`hrms_backend/src/platform/valkey-client.ts:5-50`).
4. **Consumer contract:** Attendance ADR `docs/architecture/adr/attendance/05-attendance-outbox-event-contract.md` declares at-least-once and consumer dedupe by consumer name/event ID. A consumer implementation was not found in this repository.
5. **Combined scheduling:** `tick` runs outbox publication, coordinate purge and auto-punchout in one process (`hrms_backend/src/workers/run-outbox-worker.ts:119-171`).
6. **Safeguards:** SQL row locks, stable IDs, retries, dead-letter status, per-task error catches, attendance command idempotency.
7. **Gaps / candidates:** crash after stream append/before commit, consumer dedupe, DLQ alert/replay, stream persistence/trim, shared-task starvation, worker supervision. Risks R-11, R-13.

## TRACE-J10 — Vercel SSR deep link and release path

1. **Build/host entry:** TanStack Start client is built by `hrms-client/scripts/build-vercel.mjs`; Vercel consumes committed `hrms-client/vercel.json` routing/output.
2. **Smoke:** build script smoke starts/requests `/login` only (`hrms-client/scripts/build-vercel.mjs:1-39`).
3. **Protected route:** `_app` shell resolves session and performs redirect from a React effect (`hrms-client/src/routes/_app.tsx:23-45`).
4. **API credentials:** shared API wrapper supplies browser credentials and browser-only bearer behavior; server-side auth forwarding is not evident in the inspected helpers (`hrms-client/src/shared/api/client.ts`; `hrms-client/src/shared/api/session.ts`).
5. **Backend session:** Fastify accepts cookie/bearer and derives navigation/context; hosted session store is Valkey.
6. **CI/promotion:** branch workflow includes release branches in CI, but deploy mapping accepts only configured dev/qa/main choices and rejects others (`.github/workflows/branch-ci-cd.yml:5-18,160-181`). Render API pre-deploy performs production migrations; worker is separately deployed (`render.yaml`).
7. **Safeguards:** fail-closed unsupported branch, versioned migrations, production mock/seed controls, local/client E2E source, backend cookie/bearer contracts.
8. **Gaps / candidates:** actual Vercel protected deep link/refresh/hydration; cookie/API origin; release-01 artifact identity; migration compatibility; rollback/restore; authenticated smoke. Risks R-12, R-15.

## Trace completeness conclusion

All ten critical journeys have source paths from entry to response/side effect. None is fully closed with deployment evidence. J-02, J-06, J-08, J-09 and J-10 have the largest gaps at tenant ownership, business oracle, external storage/consumer, and hosted-deployment boundaries. Those gaps are explicitly carried into the risk register and candidate coverage inventory.
