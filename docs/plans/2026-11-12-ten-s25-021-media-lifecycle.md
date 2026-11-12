# TEN-S25-021 Durable Media Lifecycle

## Objective And Success Criteria

- Objective: replace response-flush-owned media writes with a durable, tenant-scoped prepare/upload/finalize protocol that recovers safely from provider, process and database failures.
- User/business outcome: company logos, profile photos and generic documents become visible only after a committed finalize; replacement never removes the current image first; retries cannot create duplicate current records.
- Observable success criteria: PostgreSQL owns immutable document tenancy and lifecycle state; upload intents survive restart; same-key retries are idempotent while changed payloads conflict before provider I/O; one concurrent replacement wins; reconciliation is bounded and lease-safe; no physical delete occurs in this task.

## Scope

- In scope: append-only document lifecycle and upload-intent schema; deterministic opaque object/document IDs; PostgreSQL transaction-owned prepare/finalize commands; R2 PUT ambiguity recovery via HEAD; company-logo, profile-photo and the closed identity/address/education/experience proof paths; bounded queue/cron reconciliation; API/OpenAPI/frontend changes required for stable idempotency and expected-version behavior; tests and operational docs.
- Out of scope: expense receipt upload (must remain `409` until the owner/status matrix is approved); physical purge/retention/legal-hold policy (TEN-S25-022); hosted probes, deployment, release merge and tracker mutation.
- Affected roles, tenants, modules and environments: authenticated document writers, company Admin logo management, employees updating their own photo, all tenant-owned document readers; isolated local/unit/disposable PostgreSQL only.

## Evidence And Decisions

- Current implementation evidence: generic upload performs object PUT before in-memory metadata/outbox mutation; generic delete removes object bytes before PostgreSQL metadata; company logo/profile replacements can delete prior media before durable publication; response/onSend flush cannot atomically coordinate object storage and Neon. See `docs/discovery/r2-document-storage-remediation-2026-11-10.md` and `docs/plans/2026-11-12-r2-private-storage-cutover.md`.
- Approved requirements/decisions: immutable company ownership; lifecycle states `staged`, `active`, `replaced`, `tombstoned`, `quarantined`; ambiguous ownership quarantines; staged/quarantined data never renders; no provider URL leakage; no physical deletion in TEN-S25-021; bounded Queue/Cron work using PostgreSQL leases and `SKIP LOCKED`.
- Unknowns requiring an owner: permanent purge/retention/legal-hold policy, the expense receipt uploader/status matrix, and the durable assigned-HR relationship required before DEC-011 can grant a specific HR user raw-proof access. None is invented here; raw proof access fails closed to employee self and company Admin until assigned HR exists.
- Assumptions explicitly accepted for this task: retaining staged/replaced/tombstoned/quarantined bytes is the fail-closed default; fixed opaque keys are safe to HEAD after ambiguous PUT; current authorization remains the oracle and is re-evaluated at finalize.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Complete | 1. Map current write/read paths, PostgreSQL persistence, migrations and worker scheduling. | Existing implementation was preserved in `14634c61476ec97e1d81ed55ca7f9beaea9b4d30`, then merged without history rewriting onto exact parent `4e2bf2cf2bd58f10c16aec98befbfbbdba922b85` in `37e57fbf3e3f92bfcb0ac33cbe8d96dd98282237`. |
| Implemented; review pending | 2. Add append-only lifecycle/upload-intent migration and matching schema/types. | Migration `0071` activates only company-logo, current-profile-photo and expense rows whose tenant ownership is mechanically established. Legacy EMS employee proofs remain quarantined because a current company preference cannot prove original-company ownership after transfer. The migration matches the Drizzle table, check, FK, unique and partial-index declarations. No cross-schema FK; disposable PostgreSQL migration evidence is still required. |
| Implemented; review pending | 3. Implement transaction-owned prepare/finalize/remove commands and storage ambiguity handling. | Intent commits before PUT; finalize owns publication/audit/outbox. Review added API lease ownership/CAS, stable client fingerprint parity, authority-row locks, same-key definite-PUT retry and size/checksum byte verification. Executable PostgreSQL concurrency proof remains pending. |
| Implemented; review pending | 4. Cut over company logo, profile photo and employee proof routes/contracts. | The real EMS upload/replacement route now uses durable intents and server-owned proof purposes. Raw default proof access is employee/Admin only until assigned HR exists. Unsupported project/helpdesk upload and legacy-download controls plus proof removal are disabled instead of presenting backend-rejected actions. Expense upload remains 409. |
| Implemented; review pending | 5. Add bounded lease-based media reconciliation and Cloudflare Queue/Cron dispatch. | Selection respects live leases; confirmed objects are never terminalized only for age/attempt count; transient release preserves `object_confirmed`. PostgreSQL duplicate-worker proof remains pending. No purge is implemented. |
| In progress | 6. Add focused unit, disposable PostgreSQL, restart/two-instance/provider/concurrency tests. | The current frontend unit suite passes 18 files/110 tests; focused backend migration/fail-closed tests pass 2 files/5 tests. PostgreSQL regressions cover actual EMS cutover, role-definition denial, live terminal lease, raw proof matrix, purpose downgrade, retry, corrupt bytes and concurrent-read auditing in source, but Docker/PostgreSQL is absent so those integration cases remain Not Tested. |
| In progress | 7. Update OpenAPI/frontend/runbook/rollback docs and run verification gates. | Exact-parent reconciliation is complete. Backend/frontend typechecks, backend lint (513 files), frontend lint (0 errors/44 existing warnings), API-doc verification and diff-check pass. First exact-head independent QA/security reviews found material gaps; those source findings have been remediated and fresh exact-head review remains pending. Full changed coverage remains. |

## Test Design And Shared Tracker

- Work-date sprint and task/artifact IDs: Sprint 25, TEN-S25-021, 2026-11-12.
- Cases discussed during refinement: S25-040-U/P/N/F cover successful durable publication, duplicate/lost-response retry, tenant/authorization denial and provider/database/restart/concurrency failures. Changed payload for one idempotency key must return conflict without provider access. Removal is logical only. Generic PostgreSQL delete fails closed pending TEN-S25-022.
- Full case-body location in shared workbook and exact task-to-case links (not just titles or repository links): repository source `qa-artifacts/hrms/sprint-25-test-design-2026-11-11/05_TEST_CASES.csv`; shared workbook rows 96-99 were read back on 2026-11-12. The malformed unit case ID was corrected to `S25-040-U`; all four cases remain truthfully Not Tested overall.
- For each distinct case: tests will identify actor/company/parent/version/idempotency key, expected durable intent/document/pointer/audit/outbox state and forbidden provider-delete/URL/data leakage effects.
- Applicable unit/component/integration/browser cases and changed decision branches: storage adapter unit; service/route component; disposable PostgreSQL transaction/restart/two-instance/concurrency; frontend interaction where contract changes. Browser/provider-hosted validation is Not run unless an isolated local seam exists.
- After implementation: actual commands/results and artifacts will be recorded below; independent QA remains required before merge/release.
- Missing sheet/tooling/oracle/reviewer: purge policy, expense upload permissions and assigned-HR relationship remain owner-blocked. Tracker updates are owned by the coordinating task and must remain evidence-based.

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Pending | Migration apply/backfill/rollback-readiness on disposable PostgreSQL | isolated Docker database |
| Pending | Prepare commits before PUT; A/B, stale-role and purpose-downgrade denial makes no intent/provider call | unit + PostgreSQL integration |
| Pending | PUT reject/ambiguous timeout+HEAD/rollback-after-PUT/restart reconciliation | fake provider + PostgreSQL integration |
| Pending | Same key retry, changed payload conflict, simultaneous replacement | unit + two app/store instances |
| Pending | Role/company/version change before finalize fails closed or serializes through authority locks | PostgreSQL integration |
| Pending | Existing image remains until finalize; second instance sees finalized only | API integration |
| Pending | Logical remove and generic delete never call provider delete | unit + PostgreSQL integration |
| Pending | Duplicate bounded reconcile and lease recovery | worker integration |
| Partial pass | Repository changed/full verification gates | Backend/frontend typechecks passed; backend lint passed for 513 files; frontend lint passed with 0 errors and 44 existing warnings; generated API docs and diff-check passed; focused backend tests 18/18 and frontend tests 31/31. Full post-review unit, PostgreSQL integration and changed-coverage gates remain pending. |

## Risks, Compatibility And Recovery

- Tenant/security risks: incorrect ownership backfill or stale authorization could expose cross-tenant media. Mitigation: immutable company ID, tenant predicates at prepare/finalize/read, authorization revalidation, ambiguous quarantine.
- Data/migration risks: historical rows lack direct company ownership. Only mechanically unambiguous relationships become active; all others quarantine and require review.
- API/deployment compatibility: clients need stable idempotency keys and expected versions for replacements. Compatibility behavior and generated contracts must ship with backend changes.
- Observability: safe intent state, attempts, lease/expiry and provider evidence; no raw provider URL, credentials or sensitive error body.
- Rollback or recovery: migration is additive; rollback deployment stops new prepares while preserving rows/bytes. Do not down-migrate or physically delete lifecycle evidence. Reconciler can resume committed intents after code recovery.

## Handoff

- Files/artifacts: this plan plus implementation/tests/runbook to be listed at completion.
- Commands and results: `pnpm typecheck` passed in both packages; backend `pnpm lint` and `pnpm api:docs:verify` passed; frontend `pnpm lint` passed with 44 existing warnings; focused migration/worker unit tests passed 6/6 using a synthetic non-secret test URL; frontend stable-media-command/private-download tests passed 31/31. An explicit integration attempt reached test setup but PostgreSQL refused `127.0.0.1:5432`; its 14 cases are not counted as product failures. Docker inspection failed because `/home/hexmon/.docker/desktop/docker.sock` is absent, so PostgreSQL integration remains Not Tested.
- Remaining blockers or human actions: owner decisions for TEN-S25-022 purge, expense upload and durable assigned-HR relation; disposable PostgreSQL/Queue/provider/browser execution; repeat independent exact-head review after corrections.
- Commit/PR/deployment references: local branch `sprint-25/ten-s25-021-media-lifecycle`; preservation commit `14634c61476ec97e1d81ed55ca7f9beaea9b4d30`; parent reconciliation merge `37e57fbf3e3f92bfcb0ac33cbe8d96dd98282237`; review correction commit pending. No push/PR/deployment yet.
