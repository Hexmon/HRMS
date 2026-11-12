# TEN-S25-021 Durable Media Lifecycle

## Objective And Success Criteria

- Objective: replace response-flush-owned media writes with a durable, tenant-scoped prepare/upload/finalize protocol that recovers safely from provider, process and database failures.
- User/business outcome: company logos, profile photos and generic documents become visible only after a committed finalize; replacement never removes the current image first; retries cannot create duplicate current records.
- Observable success criteria: PostgreSQL owns immutable document tenancy and lifecycle state; upload intents survive restart; same-key retries are idempotent while changed payloads conflict before provider I/O; one concurrent replacement wins; reconciliation is bounded and lease-safe; no physical delete occurs in this task.

## Scope

- In scope: append-only document lifecycle and upload-intent schema; deterministic opaque object/document IDs; PostgreSQL transaction-owned prepare/finalize commands; R2 PUT ambiguity recovery via HEAD; active company-logo, profile-photo and generic-document paths; bounded queue/cron reconciliation; API/OpenAPI/frontend changes required for stable idempotency and expected-version behavior; tests and operational docs.
- Out of scope: expense receipt upload (must remain `409` until the owner/status matrix is approved); physical purge/retention/legal-hold policy (TEN-S25-022); hosted probes, deployment, release merge and tracker mutation.
- Affected roles, tenants, modules and environments: authenticated document writers, company Admin logo management, employees updating their own photo, all tenant-owned document readers; isolated local/unit/disposable PostgreSQL only.

## Evidence And Decisions

- Current implementation evidence: generic upload performs object PUT before in-memory metadata/outbox mutation; generic delete removes object bytes before PostgreSQL metadata; company logo/profile replacements can delete prior media before durable publication; response/onSend flush cannot atomically coordinate object storage and Neon. See `docs/discovery/r2-document-storage-remediation-2026-11-10.md` and `docs/plans/2026-11-12-r2-private-storage-cutover.md`.
- Approved requirements/decisions: immutable company ownership; lifecycle states `staged`, `active`, `replaced`, `tombstoned`, `quarantined`; ambiguous ownership quarantines; staged/quarantined data never renders; no provider URL leakage; no physical deletion in TEN-S25-021; bounded Queue/Cron work using PostgreSQL leases and `SKIP LOCKED`.
- Unknowns requiring an owner: permanent purge/retention/legal-hold policy and the expense receipt uploader/status matrix. Neither is invented here.
- Assumptions explicitly accepted for this task: retaining staged/replaced/tombstoned/quarantined bytes is the fail-closed default; fixed opaque keys are safe to HEAD after ambiguous PUT; current authorization remains the oracle and is re-evaluated at finalize.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Complete | 1. Map current write/read paths, PostgreSQL persistence, migrations and worker scheduling. | Existing implementation was preserved from exact old parent `19fe3220389ac034c33a866af5879027fd1bb882`; exact current parent is `4e2bf2cf2bd58f10c16aec98befbfbbdba922b85` and reconciliation remains pending. |
| Implemented; review pending | 2. Add append-only lifecycle/upload-intent migration and matching schema/types. | Migration `0071` and matching schema/types exist. No cross-schema FK; ambiguous legacy ownership quarantines. Disposable PostgreSQL migration evidence is still required. |
| Implemented; review pending | 3. Implement transaction-owned prepare/finalize/remove commands and storage ambiguity handling. | Intent commits before PUT; finalize owns publication/audit/outbox. Provider/SQL failure semantics require independent review and executable integration proof. |
| Implemented; review pending | 4. Cut over company logo, profile photo and generic document routes/contracts. | Backend/frontend typechecks and generated API verification pass. Existing media should remain current until finalize; expense upload remains 409. |
| Implemented; review pending | 5. Add bounded lease-based media reconciliation and Cloudflare Queue/Cron dispatch. | Unit coverage exists; boundedness, delayed retry and duplicate-worker behavior require deeper review/integration. No purge is implemented. |
| In progress | 6. Add focused unit, disposable PostgreSQL, restart/two-instance/provider/concurrency tests. | Focused migration/worker unit tests pass 6/6. Docker Desktop socket is absent, so PostgreSQL, restart/two-instance and concurrency cases remain Not Tested. |
| In progress | 7. Update OpenAPI/frontend/runbook/rollback docs and run verification gates. | Backend/frontend typechecks, backend lint (513 files), frontend lint (0 errors/44 existing warnings), API-doc verification and diff-check pass. Exact-parent reconciliation, full coverage and independent QA remain. |

## Test Design And Shared Tracker

- Work-date sprint and task/artifact IDs: Sprint 25, TEN-S25-021, 2026-11-12.
- Cases discussed during refinement: S25-040-U/P/N/F cover successful durable publication, duplicate/lost-response retry, tenant/authorization denial and provider/database/restart/concurrency failures. Changed payload for one idempotency key must return conflict without provider access. Removal is logical only. Generic PostgreSQL delete fails closed pending TEN-S25-022.
- Full case-body location in shared workbook and exact task-to-case links (not just titles or repository links): repository source `qa-artifacts/hrms/sprint-25-test-design-2026-11-11/05_TEST_CASES.csv`; shared workbook rows 96-99 were read back on 2026-11-12. The malformed unit case ID was corrected to `S25-040-U`; all four cases remain truthfully Not Tested overall.
- For each distinct case: tests will identify actor/company/parent/version/idempotency key, expected durable intent/document/pointer/audit/outbox state and forbidden provider-delete/URL/data leakage effects.
- Applicable unit/component/integration/browser cases and changed decision branches: storage adapter unit; service/route component; disposable PostgreSQL transaction/restart/two-instance/concurrency; frontend interaction where contract changes. Browser/provider-hosted validation is Not run unless an isolated local seam exists.
- After implementation: actual commands/results and artifacts will be recorded below; independent QA remains required before merge/release.
- Missing sheet/tooling/oracle/reviewer: purge policy and expense upload permissions remain owner-blocked. Tracker mutation is prohibited for this delegated task.

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Pending | Migration apply/backfill/rollback-readiness on disposable PostgreSQL | isolated Docker database |
| Pending | Prepare commits before PUT; A/B denial makes no intent/provider call | unit + PostgreSQL integration |
| Pending | PUT reject/ambiguous timeout+HEAD/rollback-after-PUT/restart reconciliation | fake provider + PostgreSQL integration |
| Pending | Same key retry, changed payload conflict, simultaneous replacement | unit + two app/store instances |
| Pending | Role/company/version change before finalize fails closed | PostgreSQL integration |
| Pending | Existing image remains until finalize; second instance sees finalized only | API integration |
| Pending | Logical remove and generic delete never call provider delete | unit + PostgreSQL integration |
| Pending | Duplicate bounded reconcile and lease recovery | worker integration |
| Partial pass | Repository changed/full verification gates | Backend/frontend typechecks passed; backend lint passed for 513 files; frontend lint passed with 0 errors and 44 existing warnings; API docs verification and diff-check passed; focused unit tests 6/6. Full/integration/coverage gates remain pending. |

## Risks, Compatibility And Recovery

- Tenant/security risks: incorrect ownership backfill or stale authorization could expose cross-tenant media. Mitigation: immutable company ID, tenant predicates at prepare/finalize/read, authorization revalidation, ambiguous quarantine.
- Data/migration risks: historical rows lack direct company ownership. Only mechanically unambiguous relationships become active; all others quarantine and require review.
- API/deployment compatibility: clients need stable idempotency keys and expected versions for replacements. Compatibility behavior and generated contracts must ship with backend changes.
- Observability: safe intent state, attempts, lease/expiry and provider evidence; no raw provider URL, credentials or sensitive error body.
- Rollback or recovery: migration is additive; rollback deployment stops new prepares while preserving rows/bytes. Do not down-migrate or physically delete lifecycle evidence. Reconciler can resume committed intents after code recovery.

## Handoff

- Files/artifacts: this plan plus implementation/tests/runbook to be listed at completion.
- Commands and results: `pnpm typecheck` passed in both packages; backend `pnpm lint` and `pnpm api:docs:verify` passed; frontend `pnpm lint` passed with 44 existing warnings; focused migration/worker unit tests passed 6/6 using a synthetic non-secret test URL. Initial unit invocation without test environment failed before discovery because `.env.test` was absent; it is not counted as a product failure. Docker inspection failed because `/home/hexmon/.docker/desktop/docker.sock` is absent, so PostgreSQL integration remains Not Tested.
- Remaining blockers or human actions: owner decisions for TEN-S25-022 purge and expense upload; independent review/QA; parent branch reconciliation before PR.
- Commit/PR/deployment references: local branch `sprint-25/ten-s25-021-media-lifecycle`; no push/PR/deployment authorized yet.
