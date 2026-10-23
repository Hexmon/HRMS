# Coverage gaps and assurance assessment

## Evidence status

No tests, services, packages, probes, load, deployments, or external integrations were executed during this discovery. A test source proves only that an assertion was authored; a historical QA record proves only what that record said at its date. Neither is current release-01 execution evidence.

Static inventory at `18fdc1b`:

- 98 backend files matching the repository's test-file patterns.
- 20 Playwright spec files in the client test inventory.
- Backend test-file distribution observed: Attendance 41; Platform 14; Admin 10; Auth 5; Workers 3; Reports 2; Projects 2; root/shared 7; and one or two files each for Assets, Core, Dashboard, Documents, EMS, Expenses, Health, Helpdesk, Leave, Notifications, Timesheets.
- OpenAPI mirrors: 240 paths / 281 operations, identical across the three inspected copies.
- Migrations: 63 numbered files through `0063`.

Counts are not a coverage percentage. A dense module can still miss a release-critical boundary; a sparse module may rely on higher-level coverage.

## Assurance matrix

| Area | Existing automated source | Existing manual / historical evidence | Missing coverage | Unknown coverage | Required business or engineering decision |
|---|---|---|---|---|---|
| Multi-company isolation | Membership context unit source; Attendance/device cross-company and RLS integration source; isolated Projects assertion | Prior QA sheets mention tenant/RBAC checks | End-to-end two-company object/action/export matrix in legacy modules | Production data topology and super-tenant grants | DEC-PO-01 and Architect enforcement strategy |
| Role changes / privilege revocation | Auth/session contracts; admin security source | Historical RBAC cases | Active session after role removal, deactivation, termination and company change across every route | Offboarding orchestration and session TTL/topology | DEC-SEC-01 |
| Concurrent requests / stale writes | Strong Attendance locks/idempotency tests; selected OCC checks | No current multi-instance record located | Hydrated-domain two-writer lost-update/stale-snapshot tests; concurrent expense/leave/project transitions | Actual API instance/autoscale/rolling-deploy overlap | DEC-ARCH-01 |
| Database + storage partial failure | Ordinary document/storage validation source | No fault-injection evidence located | Every upload/delete/export split-brain point; retry/reconciliation/orphan cleanup | Cloudinary idempotency/lifecycle and alerting | Reconciliation owner and retention policy |
| Duplicate request / event delivery | Attendance idempotency/offline/worker sources; outbox worker unit source | Attendance ADR documents at-least-once | Crash after XADD; downstream consumer dedupe; dead-letter replay; non-Attendance request idempotency | Consumers outside repository, stream retention | DEC-SRE-01 |
| Employee lifecycle / account deactivation | Core/EMS/auth sources cover standard mutations/session basics | Historical EMS/offboarding checklist | Full lifecycle state transition, rollback, scheduled effective dates, access after each state | HR operational sequence | DEC-SEC-01; field matrix BLQ-021 |
| Financial / approval integrity | Expense happy path, validation, finance backup/missing config source | Historical finance sheets | Combined roles, staffing invariant, concurrent transitions, amount/payment/settlement mismatch, attachment ownership | Real finance assignments and accounting handoff | DEC-FIN-01 |
| Leave balances / holiday boundaries | Standard leave integration source | Historical leave checklist | Accrual/carry/encashment/probation/negative balance; company/region/optional holiday; year/leap/timezone/concurrency | Approved policy formulas | DEC-HR-01; BLQ-008/009 |
| Attendance midnight / payroll lock | Extensive command/offline/policy/worker/payroll source; cross-midnight shift resolver | ADRs and attendance QA notes | End-to-end night session across projections/outbox/report; DST; next-day regularization; adjustment resolution/application | Company zones and payroll downstream | DEC-HR-01 |
| Offline synchronization / replay | Offline command integration and device-signature sources | Mobile KT document | Real client queue persistence; multi-tab/restart; huge/out-of-order backlog; policy/role change while offline | Supported mobile/PWA clients and offline SLO | BLQ-025 / DEC-QA-01 |
| Device registration / revocation | Platform registration, lifecycle, RLS and signature tests | Some device QA cases | Revocation during open/offline session; reinstall/key rotation; lost device; concurrent sequence; OS permission UX | MDM/device-attestation expectations | Security/QA support matrix |
| Background-worker recovery | Strong auto-punchout unit/integration source; outbox error-path source | No operations evidence | Shared-task starvation, process death, catch-up/backlog, horizontal workers, retention delays | Render supervision/health/alerting/SLO | DEC-SRE-01 |
| Authentication / session expiry | Auth service/unit/contracts; token flows and cookie/bearer paths | Historical auth checklist | Real provider email; hosted scanner flow; expiry at boundary; Valkey eviction/reconnect; session revoke at scale | Effective email/Valkey config and origin/cookie values | DEC-SRE-01 and DEC-SEC-01 |
| Reports / export authorization | Two reports test files; export/source contracts; CSV formula sanitation | Historical reporting checklist | Every report/format/role/company; generated-file direct access; field parity; large export; revoked role | Cross-company privileged policy and storage ACL | DEC-PO-01, DEC-SEC-01 |
| Deployment / rollback | Workflow/build/render/vercel declarations; versioned migrations | Old release schedules/signoff prose | Immutable artifact identity, actual promotion, failed migration, backward compatibility, rollback/restore rehearsal, config parity | External Render/Vercel/GitHub settings and backups | DEC-SRE-01 / DEC-QA-01 |
| Accessibility | No dedicated axe/accessibility suite found | No current audit located | Keyboard, screen reader, focus, contrast, error announcement, zoom/reflow over all ten journeys | Target standard and assistive-tech/browser matrix | Product and QA Lead |
| Browser compatibility | Playwright specs and responsive source | No signed support matrix | Named browser/version/mobile viewport, permissions, downloads/uploads, offline/SSR differences | Product-supported clients | BLQ-025 / DEC-QA-01 |
| Data privacy / retention / logs | Coordinate purge, exact-coordinate permission/audit, logger redaction, document audit | No approved data schedule located | Retention/legal hold/DSAR/backups/exports/object versions; log negative cases; audit immutability | Jurisdiction/contracts, provider retention | DEC-SEC-01 |

## Test-source depth by critical journey

| Journey | Source depth | Strongest evidence | Material gap |
|---|---|---|---|
| J-01 Authentication lifecycle | Medium | Auth/service/unit/contracts | Real delivery and lifecycle revocation |
| J-02 Auditor/document lifecycle | Low | One documents integration source and policy | Tenant/object/role matrix and partial failures |
| J-03 Public asset QR/recovery | Low | One assets integration source | Anonymous privacy/abuse and finance/payroll handoff |
| J-04 HR/employee lifecycle | Low–medium | EMS/Core/Admin integration source | Company isolation, effective transitions, session consequences |
| J-05 Expense approval/settlement | Medium | Standard/backup expense integration source | Governance combinations/concurrency/ownership |
| J-06 Leave/WFH/holiday/balance | Low | One leave integration source | Formula/company/region/time boundaries |
| J-07 Attendance/offline/regularization/payroll | High relative source depth | 41 Attendance files plus workers/device tests | Cross-boundary integrated oracle and hosted/mobile behavior |
| J-08 Reports/export | Low | Two report files, serializer safeguards | Tenant/role/download/scale/retention |
| J-09 Outbox/Valkey/shared worker | Medium | Worker tests and Attendance ADR | Consumer/DLQ/real reconnect/starvation |
| J-10 Vercel SSR/deep links/release | Low | Client specs and login build smoke | Hosted protected deep link and promotion/rollback |

## Historical manual evidence treatment

- `qa/QA_SHEET_VALIDATION_LOG.md` validates workbook structure, not product behavior at this commit.
- `qa/QA_TIMELINE_VALIDATION_LOG.md` records no completed release execution entries.
- `qa/RELEASE_SIGNOFF_SUMMARY.md` and related release material are dated planning/history and cannot be applied to `18fdc1b` without an attributable environment, commit, configuration and result bundle.
- Dated architecture/KT documents are useful intent/rationale evidence but do not override current source.

## Assurance limitations by evidence class

1. **Source facts** can establish reachable code, missing checks in a method, constraints, ordering and configuration defaults. They cannot establish deployed exploitability, external settings, data, timing, provider behavior or runtime results.
2. **Automated-test source** can show intended assertions and fixture scope. It cannot establish current success, production parity or coverage of omitted cases.
3. **Historical QA** can expose prior concerns/decisions. Without commit/environment/result provenance it cannot satisfy a release gate.
4. **Documents** can explain rationale and policy. Dated counts and claims must be reconciled with source.
5. **Deployment manifests** show declared defaults. External overrides and actual topology remain unknown.

## Unanswered non-functional requirements

- Availability, recovery time and recovery point objectives for API, PostgreSQL, Valkey, worker, storage and email.
- Maximum employee/company/attendance/outbox/export volumes and acceptable latency/throughput.
- Backlog freshness SLO for outbox, coordinate purge and auto-punchout.
- Supported browsers, operating systems, mobile devices, viewports, assistive technologies and WCAG target.
- Session duration, forced-revocation delay and Valkey durability/eviction limits.
- Backup/restore frequency, restore validation and migration rollback compatibility window.
- Email deliverability, bounce/complaint and provider outage expectations.
- Data retention, deletion, legal hold, audit immutability and log retention by data class/jurisdiction.
- Geolocation accuracy/age/mock-detection policy and acceptable offline synchronization delay.
- Report/export size, generation time, download expiry and field-parity expectations.

## Stage 2 entry evidence still needed

Stage 2 should not start merely because these files exist. It needs owner decisions from `02_BUSINESS_QUESTIONS.md`, a deployment topology/configuration statement, an approved environment and client matrix, and a decision about which unverified P0 hypotheses receive authorized execution first.
