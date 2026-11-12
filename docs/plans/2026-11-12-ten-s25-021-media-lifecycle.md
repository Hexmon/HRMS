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
- Unknowns requiring an owner: permanent purge/retention/legal-hold policy, the expense receipt uploader/status matrix, and the durable assigned-HR relationship required before DEC-011 can grant a specific HR user proof access. None is invented here; proof metadata, lists and raw bytes fail closed to employee self and company Admin until assigned HR exists.
- Assumptions explicitly accepted for this task: retaining staged/replaced/tombstoned/quarantined bytes is the fail-closed default; fixed opaque keys are safe to HEAD after ambiguous PUT; current authorization remains the oracle and is re-evaluated at finalize.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Complete | 1. Map current write/read paths, PostgreSQL persistence, migrations and worker scheduling. | Existing implementation was preserved in `14634c61476ec97e1d81ed55ca7f9beaea9b4d30`, then merged without history rewriting onto exact parent `4e2bf2cf2bd58f10c16aec98befbfbbdba922b85` in `37e57fbf3e3f92bfcb0ac33cbe8d96dd98282237`. |
| Implemented; upgrade-fixture evidence pending | 2. Add append-only lifecycle/upload-intent migration and matching schema/types. | Migration `0071` activates only company-logo, current-profile-photo and expense rows whose tenant ownership is mechanically established. Legacy EMS employee proofs remain quarantined because a current company preference cannot prove original-company ownership after transfer. The complete migration bundle applied in disposable PostgreSQL and its constraints were exercised, but a pre-0071 legacy-row upgrade/backfill fixture is still required. |
| Implemented and independently reviewed | 3. Implement transaction-owned prepare/finalize/remove commands and storage ambiguity handling. | Intent commits before PUT; finalize owns publication/audit/outbox. Review added API lease ownership/CAS, stable client fingerprint parity, authority-row locks, same-key definite-PUT retry and size/checksum byte verification. Exact-head QA and security reviews found no P0-P3 source defects after corrections. |
| Implemented; browser evidence pending | 4. Cut over company logo, profile photo and employee proof routes/contracts. | The real EMS upload/replacement route now uses durable intents and server-owned proof purposes. Proof metadata, employee lists and raw bytes are limited to employee self/Admin until assigned HR exists; unassigned HR, Auditor, Finance, Director, Asset Manager and hierarchy-only access fail closed. Unsupported project/helpdesk upload and legacy-download controls plus proof removal are disabled instead of presenting backend-rejected actions. Expense upload remains 409. Real browser journeys remain Not Tested. |
| Implemented and PostgreSQL-tested; hosted evidence pending | 5. Add bounded lease-based media reconciliation and Cloudflare Queue/Cron dispatch. | Selection respects live leases; confirmed objects are never terminalized only for age/attempt count; transient release preserves `object_confirmed`; expired ownerless intents bypass future backoff without stealing a live lease. Disposable PostgreSQL media integration passes 16/16. Real R2/Queue/Cron and two-instance hosted recovery remain Not Tested. |
| Partial pass | 6. Add focused unit, disposable PostgreSQL, restart/two-instance/provider/concurrency tests. | Exact source/test head `37fb54b3eba0c7593b6bfb881527ce8808f2af6c`: backend full unit 686/686 and frontend full unit 120/120 pass. The earlier disposable PostgreSQL media integration 16/16 evidence was not rerun at this head because this worktree has no disposable database environment. Browser, real provider, hosted Queue/Cron, soak and human-role UAT remain Not Tested. |
| Hold | 7. Update OpenAPI/frontend/runbook/rollback docs and run verification gates. | At exact source/test head `37fb54b3`, typecheck/lint/diff checks and two independent reviews pass with no P0-P3 after closing the legacy/memory proof-read bypass, self-verification, foreign-Admin scope and generated-proof precedence findings. Trusted changed coverage still fails at 404/1653 executable lines and 68/261 branches with seven unmeasured paths/deletions/config modes. The feature remains draft/HOLD. |
| Implemented and independently reviewed | 8. Generate the environment-specific Worker media bucket binding safely. | Independent config review found `MEDIA_BUCKET` would retain a tracked placeholder. The generator now requires and validates the selected GitHub environment's `R2_BUCKET_NAME`, requires exactly one named Hyperdrive and media binding, enforces the 3-63 character boundary, preserves other environments and fails closed for unsafe input. The obsolete unsafe generator was removed. Six focused tests pass with 100% statements/branches for both new deployment modules; backend typecheck/lint pass. Hosted bucket existence is still an owner/cloud gate. |
| In progress | 9. Close trusted unit-level coverage gaps without weakening the gate. | Added defensive storage metadata, exact Cloudflare media dispatch, transaction-owned route, frontend API command-contract, pure lifecycle-policy and proof-access regressions. At `37fb54b3`, trusted coverage is 404/1653 lines and 68/261 branches, up from 242/1597 and 20/238. The remaining structural work is concentrated in lifecycle/reconciliation orchestration and UI/route journeys; integration evidence is retained separately and is not misreported as unit coverage. |

## Test Design And Shared Tracker

- Work-date sprint and task/artifact IDs: Sprint 25, TEN-S25-021, 2026-11-12.
- Cases discussed during refinement: S25-040-U/P/N/F cover successful durable publication, duplicate/lost-response retry, tenant/authorization denial and provider/database/restart/concurrency failures. Changed payload for one idempotency key must return conflict without provider access. Removal is logical only. Generic PostgreSQL delete fails closed pending TEN-S25-022.
- Full case-body location in shared workbook and exact task-to-case links (not just titles or repository links): repository source `qa-artifacts/hrms/sprint-25-test-design-2026-11-11/05_TEST_CASES.csv`; the original shared workbook rows 96-99 plus follow-up rows 484-488 were read back on 2026-11-12. Follow-up case `S25-040-C1` records exact bucket-binding generation and placeholder rejection. Execution status remains tied to an exact committed head.
- For each distinct case: tests will identify actor/company/parent/version/idempotency key, expected durable intent/document/pointer/audit/outbox state and forbidden provider-delete/URL/data leakage effects.
- Applicable unit/component/integration/browser cases and changed decision branches: storage adapter unit; service/route component; disposable PostgreSQL transaction/restart/two-instance/concurrency; frontend interaction where contract changes. Browser/provider-hosted validation is Not run unless an isolated local seam exists.
- After implementation: actual commands/results and artifacts will be recorded below; independent QA remains required before merge/release.
- Missing sheet/tooling/oracle/reviewer: purge policy, expense upload permissions and assigned-HR relationship remain owner-blocked. Tracker updates are owned by the coordinating task and must remain evidence-based.

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Partial pass | Migration apply/schema/constraints on disposable PostgreSQL | complete bundle and 16-case media integration pass; representative pre-0071 legacy upgrade/backfill fixture still pending |
| Pending | Prepare commits before PUT; A/B, stale-role and purpose-downgrade denial makes no intent/provider call | unit + PostgreSQL integration |
| Pass locally | PUT reject/ambiguous timeout+HEAD/rollback-after-PUT/restart reconciliation | disposable PostgreSQL plus synthetic object provider; real R2 remains Not Tested |
| Pass locally | Same key retry, changed payload conflict, simultaneous replacement | disposable PostgreSQL/two service instances |
| Pass locally | Role/company/version change before finalize fails closed or serializes through authority locks | disposable PostgreSQL integration |
| Pass locally | Existing image remains until finalize; second instance sees finalized only | API integration |
| Pass locally | Logical remove and generic delete never call provider delete | unit + PostgreSQL integration |
| Pass locally | Duplicate bounded reconcile, live-lease protection and expired ownerless intent recovery | worker/PostgreSQL integration |
| Pass locally | Environment-specific media bucket config generation rejects placeholders and cross-environment mutation | `pnpm verify:cloudflare-config`, 6/6; focused V8 coverage 40/40 statements and 36/36 branches across generator/CLI; hosted bucket binding remains Not Tested |
| Failed | Trusted changed executable coverage | exact source/test head `37fb54b3eba0c7593b6bfb881527ce8808f2af6c`: 404/1653 lines, 68/261 branches, seven unmeasured paths/deletions/config modes |
| Pass for proof-policy/review slice | Exact-head independent review | independent security/code review and independent QA both pass `37fb54b3` with no P0-P3. They verified all four proof types, same-company Admin, foreign/missing-company Admin, self-verification denial, stale durable authority and generated-proof precedence across metadata/list/content/verify/audit/delete. |
| Partial pass | Repository verification gates | exact `37fb54b3` backend 686/686 and frontend 120/120; focused backend proof/media slice 53/53; backend typecheck/lint/diff pass. Prior PostgreSQL media 16/16 was not rerun after the proof-policy change; browser/hosted/human gates pending. |

## Risks, Compatibility And Recovery

- Tenant/security risks: incorrect ownership backfill or stale authorization could expose cross-tenant media. Mitigation: immutable company ID, tenant predicates at prepare/finalize/read, authorization revalidation, ambiguous quarantine.
- Data/migration risks: historical rows lack direct company ownership. Only mechanically unambiguous relationships become active; all others quarantine and require review.
- API/deployment compatibility: clients need stable idempotency keys and expected versions for replacements. Compatibility behavior and generated contracts must ship with backend changes.
- Observability: safe intent state, attempts, lease/expiry and provider evidence; no raw provider URL, credentials or sensitive error body.
- Rollback or recovery: migration is additive; rollback deployment stops new prepares while preserving rows/bytes. Do not down-migrate or physically delete lifecycle evidence. Reconciler can resume committed intents after code recovery.

## Handoff

- Files/artifacts: this plan plus implementation/tests/runbook to be listed at completion.
- Commands and results: exact source/test head `37fb54b3eba0c7593b6bfb881527ce8808f2af6c` passed backend 686/686 and frontend 120/120 in the immutable coverage run; trusted coverage remained failed at 404/1653 lines, 68/261 branches and seven unmeasured paths. The focused proof/media slice passed 53/53 plus backend typecheck/lint/diff checks. Independent security/code review and independent QA both passed the exact head with no P0-P3. Earlier disposable PostgreSQL media 16/16 evidence remains historical and was not rerun after this correction.
- Remaining blockers or human actions: trusted coverage remediation/disposition; representative pre-0071 migration-upgrade fixture; real R2 and Cloudflare Queue/Cron binding/recovery; browser E2E; human UAT; owner decisions for TEN-S25-022 purge, expense upload and durable assigned-HR relation. GitHub environment variable `R2_BUCKET_NAME` must be set to the matching existing private bucket before any hosted inactive deployment.
- Commit/PR/deployment references: branch `sprint-25/ten-s25-021-media-lifecycle`; exact independently reviewed source/test head `37fb54b3eba0c7593b6bfb881527ce8808f2af6c`; draft PR #127 stacked on draft PR #125. No release merge or hosted deployment occurred.
