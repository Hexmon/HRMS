# Sprint 25 SaaS Remediation Delivery Backlog

Date: 2026-11-10. Owner for the epic, every workstream, every finding and QA/tooling work: **Anurag Kumar**. Epic: **SAAS-TEN-EPIC-001**. Sprint: **25 Nov07–Nov13**. Baseline: **92756681**, branch **sprint-25/saas-s25-001**.

The owner approved the hybrid structure and explicitly allocated all 35 supplied findings to Sprint 25. Scheduling does not establish completion or sufficient capacity. All estimates below are provisional complexity estimates using the live Story Point Rules (1, 2, 3, 5, 8, 13); split a finding into independently deliverable children when it cannot fit at or below 13. Parent epic/workstreams have no additive estimate. Some findings share the same canonical remediation (notably MEDIA-CONS-026 and the transaction foundation); remove overlapping effort during refinement rather than treating their rough sum as an approved commitment. Keep actual start/end dates empty until execution/completion. Historical discovery rows retain their evidence and dates. No application implementation, test execution, PR submission or deployment is authorized by this planning update.

## Navigation And Traceability

Keep the original ranked entries in [implementation backlog](implementation-backlog.md) and their IDs. The TEN IDs are stable Sprint 25 finding references, not duplicate implementations. 35 findings map to ten workstreams; Original 1–15 refer to the user's original list and Additional 1–20 refer to the attached follow-up list. Every finding remains explicitly visible in Sprint 25.

| Finding | User source | Existing/new discovery ID | Workstream | Scope |
| --- | --- | --- | --- | --- |
| TEN-S25-001 | Original 1 | ARCH-STATE-014 | SAAS-S25-W01 | Replace stale whole-domain writes |
| TEN-S25-002 | Original 2 | SAAS-ID-001 | SAAS-S25-W03 | Separate person, company account and employment |
| TEN-S25-003 | Original 3 | SAAS-EMP-004 | SAAS-S25-W04 | Gate activation on verified required documents |
| TEN-S25-004 | Original 4 | SAAS-EMP-005 | SAAS-S25-W03 | Issue stable company-scoped employee codes |
| TEN-S25-005 | Original 5 | SAAS-CTRL-019 | SAAS-S25-W05 | Isolate effective company Admin settings |
| TEN-S25-006 | Original 6 | SAAS-DOC-011 | SAAS-S25-W06 | Enforce document company and purpose authorization |
| TEN-S25-007 | Original 7 | SAAS-FIN-012 | SAAS-S25-W06 | Scope expense reads and attachment relationships |
| TEN-S25-008 | Original 8 | SAAS-RPT-013 | SAAS-S25-W09 | Isolate reports and neutralize every CSV producer |
| TEN-S25-009 | Original 9 | SAAS-PROJ-016 | SAAS-S25-W07 | Persist project ownership and ID-based associations |
| TEN-S25-010 | Original 10 | SAAS-ASSET-017 | SAAS-S25-W07 | Scope the complete asset lifecycle |
| TEN-S25-011 | Original 11 | ASSET-QR-022 | SAAS-S25-W07 | Rotate and revoke public asset QR capabilities |
| TEN-S25-012 | Original 12 | SAAS-HD-018 | SAAS-S25-W07 | Scope helpdesk tickets, categories and linked objects |
| TEN-S25-013 | Original 13 | SAAS-DASH-020 | SAAS-S25-W09 | Keep historical dashboard totals with their owner |
| TEN-S25-014 | Original 14 | SAAS-LVW-006 | SAAS-S25-W08 | Persist leave and WFH company ownership |
| TEN-S25-015 | Original 15 | SAAS-TS-007 | SAAS-S25-W08 | Scope timesheet submissions and Admin decisions |
| TEN-S25-016 | Additional 1 | SAAS-AUTHZ-029 | SAAS-S25-W02 | Authorize resources after middleware tenant resolution |
| TEN-S25-017 | Additional 2 | SAAS-RLS-030 | SAAS-S25-W02 | Expand and verify PostgreSQL tenant RLS |
| TEN-S25-018 | Additional 3 | ARCH-ROLLBACK-031 | SAAS-S25-W01 | Prevent ghost state after failed database commits |
| TEN-S25-019 | Additional 4 | AUTH-REV-025 | SAAS-S25-W05 | Make session revocation bounded and race safe |
| TEN-S25-020 | Additional 5 | DOC-URL-027 | SAAS-S25-W06 | Enforce protected document URL lifetime |
| TEN-S25-021 | Additional 6 | MEDIA-CONS-026 | SAAS-S25-W06 | Recover uploads when metadata commit fails |
| TEN-S25-022 | Additional 7 | MEDIA-CONS-026 | SAAS-S25-W06 | Make document deletion recoverable |
| TEN-S25-023 | Additional 8 | WORKER-REL-024 | SAAS-S25-W10 | Deduplicate outbox delivery and recover replay |
| TEN-S25-024 | Additional 9 | SAAS-CODE-032 | SAAS-S25-W09 | Scope asset, project and expense number sequences |
| TEN-S25-025 | Additional 10 | SAAS-CAL-009 | SAAS-S25-W08 | Use effective employee office calendars |
| TEN-S25-026 | Additional 11 | TS-INT-008 | SAAS-S25-W08 | Lock submitted timesheets and approve corrections |
| TEN-S25-027 | Additional 12 | LV-INT-015 | SAAS-S25-W08 | Resolve leave, WFH and recorded-work overlaps |
| TEN-S25-028 | Additional 13 | RATE-ABUSE-028 | SAAS-S25-W05 | Bound distributed authentication and QR abuse |
| TEN-S25-029 | Additional 14 | PERF-HYD-023 | SAAS-S25-W10 | Bound per-company resource use and SQL reads |
| TEN-S25-030 | Additional 15 | SAAS-ASYNC-033 | SAAS-S25-W10 | Audit tenant context in cache, browser and jobs |
| TEN-S25-031 | Additional 16 | SAAS-SUPPORT-034 | SAAS-S25-W05 | Separate platform-support access from company roles |
| TEN-S25-032 | Additional 17 | SAAS-LIFECYCLE-035 | SAAS-S25-W10 | Define company suspension, retention and offboarding |
| TEN-S25-033 | Additional 18 | SAAS-HISTORY-036 | SAAS-S25-W03 | Disclose authorized employment summaries only |
| TEN-S25-034 | Additional 19 | SAAS-EXTERNAL-037 | SAAS-S25-W03 | Track verification for employers outside Hawkaii |
| TEN-S25-035 | Additional 20 | SAAS-TRANSFER-038 | SAAS-S25-W03 | Resolve unavailable or refusing previous HR |

## Workstreams And Integration Order

| ID | Scope | Finding numbers | Prerequisite workstreams | Integration boundary |
| --- | --- | --- | --- | --- |
| SAAS-S25-W01 | Persistence and multi-server transactions | 1,18 | None | Establish targeted transactional writers and rollback semantics before migrating dependent domains. |
| SAAS-S25-W02 | Tenant middleware, authorization and RLS | 16,17 | 01 | Trusted actor -> service resource policy -> company-scoped repository -> transaction-local RLS. |
| SAAS-S25-W03 | Person, employment, codes and verification | 2,4,33,34,35 | 02 | Separate identity and employer records; make unresolved proof/transfer/disclosure rules explicit. |
| SAAS-S25-W04 | Required-document employee onboarding | 3 | 02,03,06 | Join applicable document policy to every activation/login-enablement path. |
| SAAS-S25-W05 | Company settings, sessions and support | 5,19,28,31 | 02,03 | Isolate effective settings and current authorization; define abuse/support authority. |
| SAAS-S25-W06 | Documents, expenses and storage consistency | 6,7,20,21,22 | 01,02 | Scope objects and parent links, protect bytes, reconcile upload/delete failures. |
| SAAS-S25-W07 | Projects, assets, QR and helpdesk | 9,10,11,12 | 01,02,03,06 | Capture permanent ownership and validate every lifecycle action and linked ID. |
| SAAS-S25-W08 | Leave, WFH, timesheets and calendars | 14,15,25,26,27 | 01,02,03 | Enforce historical ownership, office calculations, submission locks and review workflows. |
| SAAS-S25-W09 | Reports, dashboards, exports and numbering | 8,13,24 | 02,06,07,08 | Query captured ownership, protect exported content and preserve scoped identifier joins. |
| SAAS-S25-W10 | Workers, caches, capacity and lifecycle | 23,29,30,32 | 01,02 | Bound jobs/resources, dedupe side effects, separate suspension/retention/purge. |

The graph describes integration order, not an instruction to postpone every useful investigation. Establish ownership/backfill and transaction interfaces first; product decisions and failing reproductions can be refined in parallel. Never roll a new transactional table back to an old whole-domain writer. Worker authorization uses explicit service authority and captured historical company ownership, including auto-closing inactive/soft-deleted employees' old shifts. Tenant, role and resource authorization must hold at middleware, service/policy, repository, SQL and RLS boundaries; frontend guards are presentation only.

## Required Ticket Readiness And Test Structure

Before coding, attach the affected actor/role/company, actual route + method, schema fields and migration, service/policy symbol, repository transaction, source SHA, current versus intended behavior, reproduction or proposed reproducer, source confidence and decision IDs. Identify inputs, expected outputs/errors, state transitions, external effects, forbidden side effects, dependency IDs and rollback. Refer to [owner decisions](owner-decisions.md), [rule traceability](saas-rule-traceability.md), [review inventory](backend-saas-review-inventory.md), and [test/QA completion policy](../agent/test-and-qa-completion.md). Missing policy means Needs decision; source clues are not approved expected behavior.

Backend unit tests belong under the relevant module's existing test directory with the .unit.test.ts suffix; use .integration.test.ts for disposable PostgreSQL/Valkey, .contract.test.ts for HTTP/schema compatibility and .e2e.test.ts for API journeys as selected by the current Vitest configuration. Test domain decisions separately from repository transactions. Share synthetic fixtures through existing testing helpers, avoid one giant QA script, freeze clocks for date/TTL cases and use barriers rather than sleep-based races. Two-company fixtures must use independent users and roles; preference reassignment alone does not prove an approved transfer.

Frontend pure logic/API adapter unit tests and component tests must exercise input/output, visible validation, loading/error/stale states and query invalidation. Keep browser journeys in the existing Playwright E2E layout. The current frontend has no unit-test command, and no changed-line coverage enforcement was found in the inspected package configuration: QA-S25-003 below is a prerequisite, not a claim that coverage already runs.

For all applicable cards, QA must cover valid, invalid, missing, boundary, unauthorized, wrong-company and related-ID inputs; stale roles/accounts/tabs; double submission; state transitions; duplicates/reordering; storage/DB/Redis failures; audit/outbox absence on denial; mobile/keyboard and network recovery. Broader security/load scenarios require the authorized isolated environment. Apply [QA completion](../../.agents/skills/qa-completion-gate/SKILL.md); an unexecuted test remains Not run. Exhaustive coverage of every possible input is not provable; list the reviewed partitions, invariants, properties and remaining gaps.

Workstream browser outcomes: identity/onboarding (Employee + HR + Admin, pending proof, transfer and stale-session login); settings/support (independent A/C Admin and denied employee); finance/files (Employee + assigned/unassigned HR + Finance + Auditor + Admin, upload/download/retry); projects/assets/helpdesk (Manager + Asset Manager + agent + requester, linked-ID denials); leave/timesheets (Employee + Manager + HR, calendar/submit/correction/overlap); reports (authorized HR/Finance/Auditor, totals and safe downloads); operations (user-visible failure/recovery without false success).

## Finding Cards

### TEN-S25-001 — Replace stale whole-domain writes

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W01. Priority: P0. Draft estimate: 13 SP. Status: Planned. Canonical discovery ID: ARCH-STATE-014.
- Evidence: Reproduced in prior isolated PostgreSQL test; mechanism remains in source. Start at `hrms_backend/src/platform/postgres-data-store.ts`, `hrms_backend/src/app.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Replace authoritative arrays/domain flushes with company-scoped SQL transactions; assignment, audit and outbox commit together. Prevent mixed-version legacy writers.
- Unit input/output contract: Available asset and matching version -> one assignment; stale version -> conflict with no side effects.
- Integration/failure acceptance: Two API instances: A assigns an asset, B creates another; assignment survives. Concurrent same-asset decisions yield one winner.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: None for the demonstrated defect; backfill ownership must be resolved.

### TEN-S25-002 — Separate person, company account and employment

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W03. Priority: P0. Draft estimate: 13 SP. Status: Needs decision. Canonical discovery ID: SAAS-ID-001.
- Evidence: Code-confirmed model gap; identity assurance unresolved. Start at `hrms_backend/src/db/schema.ts`, `hrms_backend/src/platform/company-membership-context.ts`, `hrms_backend/src/modules/auth/service.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Separate employer login, employment dates/status and restricted verified person link. Preserve original-company records and authorized role grants.
- Unit input/output contract: New employer email without verified person evidence -> no automatic person merge; ended employment -> no active employer session.
- Integration/failure acceptance: Sequential A-to-C employment preserves A history; duplicate activation and concurrent transfer cannot create conflicting verified associations.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: DEC-Q01/04: identity assurance and duplicate-person handling.

### TEN-S25-003 — Gate activation on verified required documents

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W04. Priority: P1. Draft estimate: 8 SP. Status: Needs decision. Canonical discovery ID: SAAS-EMP-004.
- Evidence: Code-confirmed implementation-versus-approved-rule gap. Start at `hrms_backend/src/modules/core/service.ts`, `hrms_backend/src/modules/auth/service.ts`, `hrms_backend/src/modules/ems/service.ts`, `hrms_backend/src/modules/documents/service.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Evaluate versioned company proof requirements at activation, password setup and login enablement; bind approval to the current file version.
- Unit input/output contract: Missing, rejected or replaced proof -> activation denied; all applicable verified proofs -> allowed; unauthorized not-applicable waiver -> denied.
- Integration/failure acceptance: Concurrent proof replacement/activation cannot bypass gate; another company cannot satisfy requirements with its documents.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: DEC-Q05: accepted proofs, not-applicable authority, onboarding-only access and policy effective dates.

### TEN-S25-004 — Issue stable company-scoped employee codes

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W03. Priority: P1. Draft estimate: 5 SP. Status: Needs decision. Canonical discovery ID: SAAS-EMP-005.
- Evidence: Code-confirmed global employee-code uniqueness. Start at `hrms_backend/src/db/schema.ts`, `hrms_backend/src/modules/core/service.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Use internal IDs plus company-prefixed readable alphanumeric codes and atomic tenant counters. Preserve imported codes and history.
- Unit input/output contract: Same local code in A/C -> permitted within separate companies; duplicate within A -> rejected; sensitive attributes never enter code.
- Integration/failure acceptance: Parallel employee creation yields unique codes without MAX/count races; migration preserves old references.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Choose final prefix/sequence/check-character and rehire semantics; proposed HXM-E-00001A is illustrative.

### TEN-S25-005 — Isolate effective company Admin settings

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W05. Priority: P0. Draft estimate: 13 SP. Status: Planned. Canonical discovery ID: SAAS-CTRL-019.
- Evidence: Shared security-setting mutation reproduced in synthetic in-memory probe. Start at `hrms_backend/src/modules/admin/repository.ts`, `hrms_backend/src/modules/platform/service.ts`, `hrms_backend/src/platform/email/email-delivery-service.ts`, `hrms_backend/src/db/schema.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Separate company overrides, versioned platform defaults and non-weakening security floor; verify actual auth/email/workflow consumers.
- Unit input/output contract: A override -> A effective value only; absent override -> intended default; weaker security override -> rejected.
- Integration/failure acceptance: Independent A/B Admins change settings concurrently; A login/templates/approvers remain scoped and audit records capture effective version.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Do not infer live workflow delivery from saved settings; confirm intended event consumers.

### TEN-S25-006 — Enforce document company and purpose authorization

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W06. Priority: P0. Draft estimate: 8 SP. Status: Planned. Canonical discovery ID: SAAS-DOC-011.
- Evidence: Code-confirmed missing company and assigned-HR document checks. Start at `hrms_backend/src/modules/documents/policy.ts`, `hrms_backend/src/modules/documents/service.ts`, `hrms_backend/src/db/schema.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Persist immutable company/object ownership and enforce raw-proof access for employee, assigned HR and own company Admin. Scope metadata, versions, links and bytes.
- Unit input/output contract: B Admin or unassigned HR + A proof -> deny; allowed own-company viewer -> permit and audit.
- Integration/failure acceptance: Try every document route with another-company document and parent IDs; transfer does not reassign old files.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: DEC-Q03/05: historical retention/viewers after employment ends.
- Storage refinement 2026-11-10: [R2 review M01/M02/M12](r2-document-storage-remediation-2026-11-10.md) adds every wrapper/project-list/metadata/version/audit/byte route to the company/purpose matrix. Verify both ends of links; follow DEC-011 for raw proofs and preserve original company ownership.

### TEN-S25-007 — Scope expense reads and attachment relationships

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W06. Priority: P0. Draft estimate: 8 SP. Status: Planned. Canonical discovery ID: SAAS-FIN-012.
- Evidence: Code-confirmed ticket and document authorization omissions. Start at `hrms_backend/src/modules/expenses/policy.ts`, `hrms_backend/src/modules/expenses/service.ts`, `hrms_backend/src/modules/expenses/repository.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Capture ticket company; validate requester, independent approvers, project and document relationships within the same transaction.
- Unit input/output contract: B role reading A ticket -> deny; same-company ticket + foreign document -> deny with no relation/outbox.
- Integration/failure acceptance: Exercise detail/list/approval/payment/attachment paths; concurrent attach and delete cannot leave a mismatched or orphan relation.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Preserve DEC-012 independent approver block; no implicit approver fallback.
- Storage refinement 2026-11-10: authorize the expense target and document version before upload/linking. Coordinate the omitted expense document write set with TEN-S25-021; require restart/two-instance receipt durability, not only an in-memory 200 response. See the [R2 review](r2-document-storage-remediation-2026-11-10.md).

### TEN-S25-008 — Isolate reports and neutralize every CSV producer

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W09. Priority: P0. Draft estimate: 8 SP. Status: Planned. Canonical discovery ID: SAAS-RPT-013.
- Evidence: Code-confirmed report scope and browser CSV risk; exploit not executed. Start at `hrms_backend/src/modules/reports/service.ts`, `hrms_backend/src/platform/generated-exports.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Move report queries and export ownership to persisted company scope; inventory client CSV producers including team-utilization. Bound ranges and neutralize formulas.
- Unit input/output contract: Foreign-company rows -> excluded; formula-leading and control-character fields -> inert exported text; huge range -> rejected or queued.
- Integration/failure acceptance: A/B report totals reconcile with SQL and downloaded bytes before/after transfer; open synthetic exports in supported spreadsheet engine.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Agree export limits and supported spreadsheet programs; central audit already has scoping and must not regress.

### TEN-S25-009 — Persist project ownership and ID-based associations

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W07. Priority: P0. Draft estimate: 8 SP. Status: Planned. Canonical discovery ID: SAAS-PROJ-016.
- Evidence: Cross-company project detail reproduced in synthetic in-memory probe. Start at `hrms_backend/src/modules/projects/service.ts`, `hrms_backend/src/modules/projects/repository.ts`, `hrms_backend/src/db/schema.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Persist original owner independently of manager/members; scope members, allocations/milestones; replace text-code joins with project IDs.
- Unit input/output contract: Moving manager -> unchanged owner; foreign member/project combination -> denied.
- Integration/failure acceptance: Equal project codes in A/C never combine hours; A retains historical project after manager transfer.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Ambiguous project-to-company and segment-to-project backfill needs review.

### TEN-S25-010 — Scope the complete asset lifecycle

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W07. Priority: P0. Draft estimate: 8 SP. Status: Planned. Canonical discovery ID: SAAS-ASSET-017.
- Evidence: Cross-company assigned asset visibility reproduced in memory; writes untested. Start at `hrms_backend/src/modules/assets/service.ts`, `hrms_backend/src/modules/assets/repository.ts`, `hrms_backend/src/db/schema.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Capture owner and enforce all inventory/request/assignment/return/maintenance/recovery/license actions; separate custody from ownership.
- Unit input/output contract: B Asset Manager + A asset -> deny; A asset + B assignee -> deny; unassigned A asset remains A-owned.
- Integration/failure acceptance: Two-company lifecycle and transfer/soft-delete fixtures reconcile asset, assignment, recovery, audit and outbox.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Any actual intercompany asset sale/transfer needs an explicit separate workflow.

### TEN-S25-011 — Rotate and revoke public asset QR capabilities

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W07. Priority: P1. Draft estimate: 5 SP. Status: Needs decision. Canonical discovery ID: ASSET-QR-022.
- Evidence: Code-confirmed public field/hash response; rotation workflow absent. Start at `hrms_backend/src/modules/assets/routes.ts`, `hrms_backend/src/modules/assets/service.ts`, `hrms_backend/src/platform/data-store.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Preserve approved public name/type/code/status/assignment flag; introduce token rotation/revocation and stop unnecessary hash echo. Bound public access.
- Unit input/output contract: Active capability -> approved fields only; revoked/unknown token -> no asset detail; employee identity/cost never included.
- Integration/failure acceptance: Rotate a printed QR, verify old URL/cache denial and new URL success; test enumeration and retry throttling.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: DEC-Q13: rotation authority and response/hash compatibility.

### TEN-S25-012 — Scope helpdesk tickets, categories and linked objects

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W07. Priority: P0. Draft estimate: 8 SP. Status: Planned. Canonical discovery ID: SAAS-HD-018.
- Evidence: Cross-company ticket detail reproduced in synthetic in-memory probe. Start at `hrms_backend/src/modules/helpdesk/policy.ts`, `hrms_backend/src/modules/helpdesk/service.ts`, `hrms_backend/src/db/schema.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Capture ticket/category/SLA company; validate assignee, internal-note access and linked project/asset/document before mutation.
- Unit input/output contract: B Admin + A ticket -> deny; same-company ticket + foreign category/asset -> deny; requester cannot read internal notes.
- Integration/failure acceptance: List/detail/comment/resolve/SLA/attachment matrix across A/C; history remains with original company after requester transfer.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Define migration for shared legacy categories and SLA defaults.

### TEN-S25-013 — Keep historical dashboard totals with their owner

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W09. Priority: P1. Draft estimate: 5 SP. Status: Planned. Canonical discovery ID: SAAS-DASH-020.
- Evidence: Code-confirmed mutable-association aggregation. Start at `hrms_backend/src/modules/dashboard/service.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Aggregate captured owner company and distinguish current headcount from historical activity; remove stale feature-unavailable labels where APIs exist.
- Unit input/output contract: Employee transfer -> current headcount may change but old expenses/events remain A totals; unassigned assets remain counted.
- Integration/failure acceptance: A/C dashboard source rows and totals reconcile before/after transfer and role changes.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Define historical versus current metrics explicitly before changing formulas.

### TEN-S25-014 — Persist leave and WFH company ownership

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W08. Priority: P0. Draft estimate: 8 SP. Status: Planned. Canonical discovery ID: SAAS-LVW-006.
- Evidence: Code-confirmed employee/request resource-scope gap. Start at `hrms_backend/src/modules/leave-wfh/policy.ts`, `hrms_backend/src/modules/leave-wfh/service.ts`, `hrms_backend/src/modules/leave-wfh/repository.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Capture company/employment on requests and balances; verify target employee, approver, queues, cancellations and attachment parents.
- Unit input/output contract: Actor A + employee/request C -> denied; valid self/authorized A action -> expected transition only.
- Integration/failure acceptance: Two-company ID and list/export/approval tests include ended/soft-deleted employee history.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Historical retention follows DEC-004; precise retention remains pending.

### TEN-S25-015 — Scope timesheet submissions and Admin decisions

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W08. Priority: P0. Draft estimate: 8 SP. Status: Planned. Canonical discovery ID: SAAS-TS-007.
- Evidence: Code-confirmed global privileged reads and submission scope omissions. Start at `hrms_backend/src/modules/timesheets/service.ts`, `hrms_backend/src/modules/timesheets/policy.ts`, `hrms_backend/src/modules/timesheets/repository.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Persist owner and employment; scope segments, approvals, workflow selection and all privileged read/export paths.
- Unit input/output contract: B Admin + A submission -> denied; same-company authorized approver -> valid transition only.
- Integration/failure acceptance: A/C direct-ID/list/approve/export matrix retains original employment ownership through transfer.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Coordinate with office calendar and submission-lock stories.

### TEN-S25-016 — Authorize resources after middleware tenant resolution

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W02. Priority: P0. Draft estimate: 8 SP. Status: Planned. Canonical discovery ID: SAAS-AUTHZ-029.
- Evidence: Code-confirmed architectural boundary; individual routes not fully audited. Start at `hrms_backend/src/plugins/auth.ts`, `hrms_backend/src/platform/company-membership-context.ts`, `hrms_backend/src/app.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Create trusted immutable actor context; classify tenant/public/platform routes; enforce action/resource/related-ID policies in services and scoped repositories.
- Unit input/output contract: Spoofed company/role/owner or absent context -> denied; own-company unauthorized relationship -> denied too.
- Integration/failure acceptance: Inventory every operation and compare allowed/denied route matrix; direct service/job calls must not bypass resource checks.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Public QR/bootstrap and platform operations require explicit separate authority.

### TEN-S25-017 — Expand and verify PostgreSQL tenant RLS

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W02. Priority: P0. Draft estimate: 8 SP. Status: Planned. Canonical discovery ID: SAAS-RLS-030.
- Evidence: Limited RLS present for registered devices; broader table coverage gap. Start at `hrms_backend/src/db/schema.ts`, `hrms_backend/src/db/migrations/0058_registered_devices_rls.sql`, `hrms_backend/src/platform/postgres-data-store.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Classify tenant tables, add owner constraints and transaction-local company context; use non-owner/non-BYPASSRLS runtime roles and tested USING/WITH CHECK policies.
- Unit input/output contract: Missing/mismatched tenant context -> deny; foreign insert or ownership change -> deny; global reference data explicitly classified.
- Integration/failure acceptance: Real PostgreSQL with runtime credentials: A -> reused pooled connection -> C -> missing context cannot leak rows; test jobs, views and migrations.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: No cross-schema foreign keys; backfill ownership before enforcing non-null/RLS.

### TEN-S25-018 — Prevent ghost state after failed database commits

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W01. Priority: P0. Draft estimate: 5 SP. Status: Planned. Canonical discovery ID: ARCH-ROLLBACK-031.
- Evidence: Source-supported memory-before-commit risk; failure not reproduced. Start at `hrms_backend/src/app.ts`, `hrms_backend/src/platform/postgres-data-store.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Remove pre-commit authoritative memory mutations; isolate transaction results and propagate failure without changing reads or audit/outbox.
- Unit input/output contract: Commit rejects -> operation fails and cached published state remains unchanged; retry -> one durable result.
- Integration/failure acceptance: Inject DB/constraint/commit failure then read from same and second API; business, audit and outbox state agree.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Shares transaction foundation with ARCH-STATE-014; avoid duplicating implementation effort.

### TEN-S25-019 — Make session revocation bounded and race safe

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W05. Priority: P1. Draft estimate: 8 SP. Status: Planned. Canonical discovery ID: AUTH-REV-025.
- Evidence: KEYS scan is code-confirmed; stale-session race remains untested. Start at `hrms_backend/src/auth/index.ts`, `hrms_backend/src/plugins/auth.ts`, `hrms_backend/src/modules/core/service.ts`, `hrms_backend/src/modules/auth/service.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Replace global scans with indexed/versioned revocation and committed authorization state; bind sessions to employer/role versions.
- Unit input/output contract: Role removal/reset/deactivation -> old token denied on next protected request; concurrent new session cannot inherit revoked authority.
- Integration/failure acceptance: Two API instances and concurrent login/revocation; Valkey outage/recovery and increasing session counts.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Specify consistency and outage response; source mechanism does not prove a successful exploit.

### TEN-S25-020 — Enforce protected document URL lifetime

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W06. Priority: P0. Draft estimate: 5 SP. Status: Needs decision. Canonical discovery ID: DOC-URL-027.
- Evidence: Code-confirmed expiry mismatch; actual Cloudinary exposure unverified. Start at `hrms_backend/src/modules/documents/service.ts`, `hrms_backend/src/platform/object-storage.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Replace plain proof URLs with authenticated streaming or demonstrably expiring private delivery; govern caches, redaction and link revocation.
- Unit input/output contract: Expired/unauthorized viewer -> no bytes; declared lifetime agrees with enforced access behavior.
- Integration/failure acceptance: Authorized isolated provider fixture: copied URL before/after expiry and permission removal; no production proof used.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Choose immediate revocation gateway versus bounded signed-link window; do not promise immediate revocation from expiry alone.
- Storage refinement 2026-11-10: private R2 authenticated streaming is proposed for proofs; exclude provider URLs from metadata/logo/photo DTOs, enforce private no-store responses, and implement real streaming reads. Optional presigned delivery requires an accepted revocation window. Actual provider access/expiry testing remains pending.

### TEN-S25-021 — Recover uploads when metadata commit fails

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W06. Priority: P1. Draft estimate: 5 SP. Status: Planned. Canonical discovery ID: MEDIA-CONS-026.
- Evidence: Code-confirmed upload-before-metadata ordering; orphan failure unexecuted. Start at `hrms_backend/src/modules/documents/service.ts`, `hrms_backend/src/platform/object-storage.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Stage uploads, commit owned metadata and attachment relation, finalize safely; durably schedule cleanup for abandoned objects.
- Unit input/output contract: Object success + metadata/attachment failure -> no published live document; retried key -> one logical upload.
- Integration/failure acceptance: Inject upload success/DB failure and cleanup retry/crash; reconcile objects against metadata without deleting another company files.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Retention/cleanup timing requires approved policy; share media state machine with deletion.
- Storage refinement 2026-11-10: exact SQL write sets must include receipt metadata, Admin logo documents, core/attendance/leave export documents and both old/new EMS proof states. Add durable request idempotency, immutable replacement pointer swaps, uncertain-PUT reconciliation and cleanup/finalize fencing. Coordinate TEN-S25-001 transaction foundations; do not duplicate estimates. See [M03/M04/M05/M11](r2-document-storage-remediation-2026-11-10.md).

### TEN-S25-022 — Make document deletion recoverable

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W06. Priority: P1. Draft estimate: 5 SP. Status: Planned. Canonical discovery ID: MEDIA-CONS-026.
- Evidence: Code-confirmed delete-before-database ordering; broken-reference failure unexecuted. Start at `hrms_backend/src/modules/documents/service.ts`, `hrms_backend/src/platform/object-storage.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Commit tombstone, audit and purge intent before idempotent byte removal; respect retention/legal holds and avoid resurrecting deleted metadata.
- Unit input/output contract: Failed byte purge -> retryable tombstone; active legal hold -> no physical deletion; repeated purge -> safe.
- Integration/failure acceptance: Object success/SQL failure, SQL success/outbox failure, restart and legacy-writer tests leave consistent recoverable state.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Deletion authority, hold rules and retention; shares one media implementation with previous card.
- Storage refinement 2026-11-10: preserve linked evidence/history instead of hard-delete unlinking; distinguish missing object from provider failure, stop swallowed delete failures, and verify duplicate purge/crash/late-PUT/replace races with explicit bounded media-job handlers. No permanent purge until retention/hold authority is resolved.

### TEN-S25-023 — Deduplicate outbox delivery and recover replay

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W10. Priority: P1. Draft estimate: 8 SP. Status: Planned. Canonical discovery ID: WORKER-REL-024.
- Evidence: Code-confirmed queue-send-before-published-commit ordering; duplicate side effect not reproduced. Start at `hrms_backend/src/workers/cloudflare-jobs.ts`, `hrms_backend/src/workers/cloudflare-worker.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Preserve immutable event identity; add durable consumer dedupe, retry budget, DLQ/replay authority and reconciliation before real business side effects.
- Unit input/output contract: Duplicate event ID -> one logical side effect; unpublished event visibility -> retry, not successful acknowledgement; poison event -> bounded failure.
- Integration/failure acceptance: Force send success/DB commit failure and replay/reorder through actual queue integration; audit inbox/outbox and recovery agree.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Confirm actual consumers; current business-event handler logs only, and no external Redis Streams consumer was reported.

### TEN-S25-024 — Scope asset, project and expense number sequences

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W09. Priority: P1. Draft estimate: 5 SP. Status: Planned. Canonical discovery ID: SAAS-CODE-032.
- Evidence: Code-confirmed additional global unique indexes. Start at `hrms_backend/src/db/schema.ts`, `hrms_backend/src/modules/assets/service.ts`, `hrms_backend/src/modules/projects/service.ts`, `hrms_backend/src/modules/expenses/service.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Inventory business codes, use tenant uniqueness and atomic allocation; retain global opaque IDs and migrate code-based joins.
- Unit input/output contract: Same display code in A/C -> allowed; duplicate in A -> rejected; ambiguous code-only lookup -> denied.
- Integration/failure acceptance: Concurrent creates/imports and same-code report joins do not collide or mix companies.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Coordinate code policy with employee codes; scoped namespaces are distinct from identity.

### TEN-S25-025 — Use effective employee office calendars

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W08. Priority: P1. Draft estimate: 8 SP. Status: Needs decision. Canonical discovery ID: SAAS-CAL-009.
- Evidence: Code-confirmed first-active-company/broad-holiday calculations. Start at `hrms_backend/src/modules/leave-wfh/service.ts`, `hrms_backend/src/modules/timesheets/service.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Resolve employment office at the relevant date and version working days, holidays and entitlements; capture calculation provenance.
- Unit input/output contract: Different A/C office holidays -> different correct durations; later policy edit -> historical calculation unchanged.
- Integration/failure acceptance: Multi-office and office-change date ranges, half days and calendar boundaries; reconcile leave balance and timesheet expected hours.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: DEC-Q11: effective office assignment and split-range handling.

### TEN-S25-026 — Lock submitted timesheets and approve corrections

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W08. Priority: P1. Draft estimate: 8 SP. Status: Needs decision. Canonical discovery ID: TS-INT-008.
- Evidence: Code-confirmed segment upsert without submission-state lock. Start at `hrms_backend/src/modules/timesheets/service.ts`, `hrms_backend/src/modules/timesheets/repository.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Enforce server-side submission lock and immutable approved snapshot; corrections require owned approval/version and audit.
- Unit input/output contract: Edit submitted/approved segment -> denied or explicit correction request; approved correction -> new auditable version.
- Integration/failure acceptance: Concurrent edit/submit/approve cannot produce changed approved totals; stale browser/API both rejected.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: DEC-Q10: correction approver and payroll/billing period treatment.

### TEN-S25-027 — Resolve leave, WFH and recorded-work overlaps

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W08. Priority: P1. Draft estimate: 8 SP. Status: Needs decision. Canonical discovery ID: LV-INT-015.
- Evidence: Approved review requirement; full conflict disposition is a design gap. Start at `hrms_backend/src/modules/leave-wfh/service.ts`, `hrms_backend/src/modules/attendance/payroll-period-service.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Create a durable conflict and HR resolution record before final payroll disposition; preserve punch evidence and idempotency.
- Unit input/output contract: Worked day + overlapping approved leave/WFH -> review conflict; unauthorized resolver -> denied; replay -> one conflict.
- Integration/failure acceptance: Late/duplicate approvals and concurrent payroll lock follow approved policy without double counting.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: DEC-Q09: authorized resolver, allowed outcomes and payroll lock behavior.

### TEN-S25-028 — Bound distributed authentication and QR abuse

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W05. Priority: P1. Draft estimate: 5 SP. Status: Needs decision. Canonical discovery ID: RATE-ABUSE-028.
- Evidence: Source-supported account/IP/proxy/atomic-counter risks; evasion untested. Start at `hrms_backend/src/plugins/rate-limit.ts`, `hrms_backend/src/app.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Use atomic shared counters and layered endpoint/account/company/IP/global budgets; validate actual trusted proxy hops and outage semantics.
- Unit input/output contract: Distributed IPs for one account -> aggregate limit; forged forwarding chain -> ignored/rejected; other company unaffected.
- Integration/failure acceptance: Two replicas share counters; test threshold boundaries, TTL, Valkey errors and recovery with synthetic traffic only.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Approve budgets/false-positive policy and trusted proxy topology; no arbitrary production limits.

### TEN-S25-029 — Bound per-company resource use and SQL reads

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W10. Priority: P1. Draft estimate: 13 SP. Status: Needs decision. Canonical discovery ID: PERF-HYD-023.
- Evidence: Code-confirmed hydration mechanism; capacity/SLO unmeasured. Start at `hrms_backend/src/platform/postgres-data-store.ts`, `hrms_backend/src/modules/reports/service.ts`, `hrms_backend/src/workers/cloudflare-jobs.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Replace hydration/slicing with indexed company SQL, bounded pages and asynchronous exports; budget API/worker pools and fair tenant work.
- Unit input/output contract: Oversized range/job -> bounded/rejected; cursor cannot cross tenant; retry preserves limits.
- Integration/failure acceptance: Synthetic volume and noisy-neighbor scenarios measure memory/latency/pool/queue lag; attendance still meets approved target during another company export.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Owner sets retention, service objectives, quotas and representative workload before capacity acceptance.

### TEN-S25-030 — Audit tenant context in cache, browser and jobs

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W10. Priority: P1. Draft estimate: 8 SP. Status: Planned. Canonical discovery ID: SAAS-ASYNC-033.
- Evidence: Review gap; no blanket cache/queue leak claim. Start at `hrms_backend/src/workers/cloudflare-worker.ts`, `hrms_backend/src/workers/cloudflare-jobs.ts`, `hrms_backend/src/platform/valkey-client.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Catalogue cache/query/session/export/notification/job scopes; propagate verified captured ownership and reauthorize side effects, never infer from current employee company.
- Unit input/output contract: Same resource/filter under A/C -> distinct protected result; forged payload -> denied; late A job after employee transfer -> remains A-owned.
- Integration/failure acceptance: Logout/login and role change clear sensitive browser state; duplicate/reordered jobs target only authorized tenant recipients.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Global cron/service jobs need explicit bounded authority; no forced end-user session for historical payroll closure.

### TEN-S25-031 — Separate platform-support access from company roles

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W05. Priority: P1. Draft estimate: 8 SP. Status: Needs decision. Canonical discovery ID: SAAS-SUPPORT-034.
- Evidence: Design and review gap; no existing support bypass exploit claimed. Start at `hrms_backend/src/plugins/auth.ts`, `hrms_backend/src/modules/admin/service.ts`, `hrms_backend/src/modules/platform/service.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Define separate support identities, approved tenant scope, time limit, purpose and audit; company Admin never obtains platform support authority.
- Unit input/output contract: Company Admin calling support operation -> denied; expired or wrong-tenant support grant -> denied and audited.
- Integration/failure acceptance: Time expiry/revocation across replicas and attempted support access to raw proofs; verify no generic Admin bypass.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Product/security owner must decide consent, approver, allowed actions and emergency procedure.

### TEN-S25-032 — Define company suspension, retention and offboarding

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W10. Priority: P1. Draft estimate: 8 SP. Status: Needs decision. Canonical discovery ID: SAAS-LIFECYCLE-035.
- Evidence: Design gap; no retention duration inferred. Start at `hrms_backend/src/modules/auth/service.ts`, `hrms_backend/src/modules/platform/service.ts`, `hrms_backend/src/modules/documents/service.ts`, `hrms_backend/src/workers/cloudflare-jobs.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Separate suspension, closure, retained historical evidence, lawful holds, export and purge; assign durable cleanup/recovery and disable ordinary access.
- Unit input/output contract: Suspended tenant -> ordinary access denied; held record -> purge denied; past employee session -> denied without deleting payroll history.
- Integration/failure acceptance: Suspend during jobs/export, restore and legal-hold/purge races; reconcile retained audit, files, backups and queued actions.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Approve retention schedules, legal review, backup handling and restoration objectives; no automatic permanent deletion.

### TEN-S25-033 — Disclose authorized employment summaries only

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W03. Priority: P1. Draft estimate: 8 SP. Status: Needs decision. Canonical discovery ID: SAAS-HISTORY-036.
- Evidence: Owner-approved direction; implementation absent. Start at `hrms_backend/src/modules/auth/service.ts`, `hrms_backend/src/modules/ems/service.ts`, `hrms_backend/src/modules/documents/policy.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Add explicit C request/A disclosure workflow for employer, designation, employment dates, source, verification date and dispute status; restrict recipients, purpose and audit.
- Unit input/output contract: C request without valid grant -> denied; valid grant -> only selected summary fields; raw payroll/proofs/appraisals excluded.
- Integration/failure acceptance: Revoke/expire/dispute summary disclosure and retry requests without opening A ordinary resource APIs; A historical ownership unchanged.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Identity proof, request/disclosure authority, purpose, validity and dispute handling remain open. No paid feature/tier logic.

### TEN-S25-034 — Track verification for employers outside Hawkaii

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W03. Priority: P1. Draft estimate: 5 SP. Status: Needs decision. Canonical discovery ID: SAAS-EXTERNAL-037.
- Evidence: Design gap; noncustomer records cannot be assumed present. Start at `hrms_backend/src/modules/ems/service.ts`, `hrms_backend/src/modules/documents/service.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Represent employee-declared, independently verified, disputed and unverified history with source/date and authorized verification; no fabricated platform evidence.
- Unit input/output contract: Noncustomer B with no platform data -> unverified/declared, never false employment; names alone -> no verified result.
- Integration/failure acceptance: Upload synthetic external evidence, verify, dispute and correct with separate roles; audit origin and prevent cross-company raw evidence access.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: Agree acceptable sources, authorized verifier and evidence retention.

### TEN-S25-035 — Resolve unavailable or refusing previous HR

- Sprint / owner / workstream: 25 / Anurag Kumar / SAAS-S25-W03. Priority: P1. Draft estimate: 8 SP. Status: Needs decision. Canonical discovery ID: SAAS-TRANSFER-038.
- Evidence: Owner explicitly deferred exception authority. Start at `hrms_backend/src/platform/company-membership-context.ts`, `hrms_backend/src/modules/auth/service.ts`, `hrms_backend/src/modules/ems/service.ts`. Recheck the revision and generated route prefixes at implementation intake.
- Implementation scope: Design dispute/exception state machine for closed, noncustomer, unreachable or refusing employers; preserve standard old/new HR approval until a replacement policy is approved.
- Unit input/output contract: Normal transfer lacks either approval -> pending; exceptional case -> owned review, no invented automatic override; retries are idempotent.
- Integration/failure acceptance: Concurrent approval/dispute, effective-date boundary and old-session revocation preserve original-company records and approved active-employment invariant.
- UI/QA: apply the workstream role journey and completion gate below; link concrete tests and evidence to this ID. Tests are proposed, not executed.
- Decision/dependency: DEC-Q02: exception authority, evidence, timeframes and appeal; implementation blocked on that policy.

## QA And Planning Work

| ID | Owner | Sprint | Work and acceptance | Estimate/status |
| --- | --- | --- | --- | --- |
| SAAS-S25-PLAN-001 | Anurag Kumar | 25 | Reconcile 35 findings, ten workstreams and existing IDs; publish actionable cards and live sheet rows without duplicate discovery effort. | 13 SP; planning completed 2026-11-10 with documentation/sheet validation only. |
| QA-S25-PLAN-002 | Anurag Kumar | 25 | Review source-confidence labels, decisions and input/output/failure test oracles; record missing independent execution evidence. | 8 SP provisional; Planned. |
| QA-S25-003 | Anurag Kumar | 25 | Configure frontend unit/component test runner and backend/frontend coverage reporting with base/head changed-line mapping, including new files. CI fails for uncovered changed executable lines or missing meaningful assertions. Demonstrate the gate failing on a real uncovered branch and passing after a behavioral test; document generated/non-executable exclusions, no coverage-ignore gaming. | 8 SP provisional; Planned; tooling not installed in this task. |

## Readiness, PR And Completion

Use the same IDs in the sheet, source tests, evidence and PR. A finding is Done only after its approved acceptance criteria, unit input/output contracts, full changed executable line coverage, branch/failure tests, relevant integration/browser checks and independent QA review all pass for the submitted revision. Required unavailable tooling/environment or unresolved oracle leaves it Needs decision/Blocked/QA pending, never Done. All assignee fields remain Anurag Kumar; reviewer identity is a separate evidence field. Prepare PR evidence with commands, results, base/head, changed-line coverage, test mapping, migration/rollback and sanitized artifacts; create/push/submit a PR only when that action is authorized.

The shared tracker is [Hawkaii HRMS](https://docs.google.com/spreadsheets/d/1dr5qLKxq5IGIZAyIAdMlcDYDfld-LYxfvSHkKw1jBnA/edit). Preserve existing completed discovery rows; add the epic/workstreams/finding rows and tooling as planned scope. Parent rows carry no story points. No false actual finish date or implementation commit is entered.

Saved 2026-11-10: Sprint 25 rows 9–57 (epic 9, workstreams 10–19, findings 20–54, planning/QA/tooling 55–57), all owned by Anurag Kumar. SP Calculation R19:T19 reconciles 343 assigned / 57 completed discovery+planning / 286 pending; the 270 SP of finding estimates remains provisional and may share effort. Existing completed discovery rows 2–8 and unrelated tabs were preserved. See [verification evidence](../../qa-artifacts/hrms/sprint-25-planning-2026-11-10/verification.md). No remediation is marked complete.


## R2 Storage Refinement — 2026-11-10

The owner requested deeper file-storage analysis, complete Cloudinary replacement with Cloudflare R2, and Sprint 25 task refinement assigned to **Anurag Kumar**. The [source-backed review and proposed architecture](r2-document-storage-remediation-2026-11-10.md) defines 12 failure groups, affected features, design alternatives, short SQL transactions, private bytes, immutable versions, durable intents, retry/cleanup fencing, tests and resource measurements. Recommend refactoring the shared document lifecycle and persistence boundary, then adapting consumers; retain the modular monolith. No customer-object transfer/backfill is required prelaunch. This planning change implements no runtime remediation.

| New ID | Owner / role | Priority | Draft SP / status | Distinct deliverable |
| --- | --- | --- | --- | --- |
| R2-S25-001 | Anurag Kumar / Development | P0 | 8 / Planned | Private R2 streaming adapter, real read/stat/delete, bounded provider errors/deadlines, complete active Cloudinary removal from runtime/config/DTOs/UI/contracts/runbooks. |
| R2-S25-002 | Anurag Kumar / Development | P1 | 8 / Planned | Actual-byte type/size/hash validation, quota/concurrency/part/pixel budgets, safe processing/quarantine and explicit logo/photo/face-crop replacement. |
| R2-S25-003 | Anurag Kumar / Development | P1 | 5 / Planned | Durable allowed/denied document-read audit and bounded company-scoped audit queries with safe failure/logging policy. |
| QA-R2-S25-001 | Anurag Kumar / QA | P1 | 8 / Planned | Independent R2/Neon/Redis/two-instance failure and role-browser verification; measured memory/latency/resource use and recovery evidence. Reviewer identity separate from implementation author. |

Existing TEN-S25-006/007/020/021/022 retain their IDs and estimates with the refinements in their cards. Link TEN-S25-001 (SQL/rollback foundation), 009/012/014 (project/helpdesk/leave evidence links), 029 (bounded exports/capacity) and BIZ-S25-007 (bootstrap/logo recovery), rather than creating duplicate feature tasks. New estimates use the live 1/2/3/5/8/13 scale; they are provisional and 29 SP additional draft scope is not an approved capacity forecast. Reconcile shared implementation/QA effort before commitment. Keep implementation dates/commits and application-QA results empty until performed. See the review's acceptance matrix and the test/QA completion contract before Done.

Tracker synchronization and verification evidence are recorded in `qa-artifacts/hrms/r2-storage-review-2026-11-10/verification.md`; consult it for saved rows and actual results.

## Business-Rule Refinement Notes — BR-S25-001

On 2026-11-10 the owner requested additional business/product-rule review. [Business-rule register](business-rule-gaps-2026-11-10.md) refines the seven selected findings and adds 17 cards BIZ-S25-008–024, all retained in Sprint 25 under Anurag Kumar. These supplement the original 35 TEN findings; they do not replace or renumber them. New implementation estimates remain pending refinement, actual implementation dates are empty and all runtime fixes remain open. BR-S25-001 is the source review/documentation task, not an implemented feature.

DEC-021–029 are current approved targets; remaining questions DEC-BQ01–13 are explicit. In particular DEC-022 refines DEC-010: valid WFH punches are normal work, while genuine conflicting evidence requires assigned-HR resolution before the payroll day finalizes. Corrections/cancellations preserve old evidence and do not authorize silent unlocking of payroll periods. Implement after foundations and unresolved policy, using the modular input/output, SQL transaction and browser cases in each card. Pending tracker refinement must not inflate completed feature points.

## Email Automation Extension — 2026-11-11

[Communication delivery backlog](email-automation-sprint-25-backlog.md) reconciles the approved email requirements across all modules. Sixteen existing cards receive acceptance/ownership refinements without extra SP. Rows 91–126 add 34 future delivery/QA cards (217 provisional SP), one completed planning card (8 SP) and one unestimated parent. All assigned to Anurag Kumar. Sprint total 845 SP = 78 completed discovery/planning + 767 pending; not demonstrated one-person capacity. Shared TEN/AUTH/BIZ/R2 foundations are counted once. Payroll spreadsheet details remain explicitly deferred and related implementation is Needs decision. No product fix or passing runtime QA follows from tracker updates.

## Supplied Audit Extension — 2026-11-11

[Finding reconciliation](audit-findings-sprint-25-reconciliation-2026-11-11.md) adds 14 future Development/QA cards (87 provisional SP) and one completed planning row (8 SP), all Anurag Kumar, in tracker rows 127–141. It refines 29 existing cards without additive estimates and raises five boundary priorities. Current sprint snapshot: 940 assigned = 86 completed discovery/planning + 854 pending; no capacity or release promise. The original 35 canonical mappings remain stable and the 30 report items do not each become a duplicate ticket.
