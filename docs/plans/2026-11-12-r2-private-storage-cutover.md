# R2-S25-001 Private Object Storage Cutover

## Objective And Success Criteria

- Objective: replace active Cloudinary runtime/configuration coupling with a private Cloudflare R2-compatible storage adapter while preserving the backend as the authorization and byte-delivery authority.
- User/business outcome: protected HRMS files are stored under opaque private object keys; no provider credential or persistent public provider URL is returned to clients.
- Observable success criteria: production startup requires environment-scoped R2 credentials and a private bucket; real put/get/stat/delete operations are bounded and distinguish missing objects from provider failures; metadata and API/UI contracts contain provider-neutral fields; Cloudinary is absent from active runtime, example environment files and product copy; local memory storage remains deterministic for tests; generated contracts and consumers pass.

## Scope

- In scope: `ObjectStoragePort`, the production R2/S3-compatible adapter, startup/readiness configuration, provider-neutral upload metadata and policy DTOs, authenticated content delivery, environment examples/runbooks, frontend upload-policy consumers, focused adapter/contract/security tests.
- Out of scope: hosted bucket provisioning/deployment, public delivery, direct browser PUT, malware-scanner selection, image derivative/face-crop replacement, durable upload intents and purge lifecycle, historical customer-object migration, production execution. Those remain R2-S25-002/003 and TEN-S25-021/022 slices.
- Affected roles, tenants, modules and environments: all document consumers; Employee, assigned HR, Admin, Finance/Manager where separately authorized, and Auditor metadata-only paths; development/QA/production configuration. The adapter never decides role or tenant access.

## Evidence And Decisions

- Current implementation evidence: `platform/object-storage.ts` signs Cloudinary uploads, emits/stores public URLs, cannot read real Cloudinary bytes, silently accepts unsuccessful deletes, and has no application deadline. `postgres-data-store.ts` always constructs it. Cloudinary names also leak through config, OpenAPI, frontend DTOs and product copy.
- Approved requirements/decisions: owner direction recorded in `docs/discovery/r2-document-storage-remediation-2026-11-10.md` is complete Cloudinary removal before launch; sensitive files use private R2 and authenticated backend delivery; DEC-011/052/053 remain the document/receipt authorization source.
- Unknowns requiring an owner: malware scanner, image/face-crop derivative provider, permanent retention/hold duration, and whether any future non-sensitive class may use short presigned delivery. None is inferred in this slice.
- Assumptions explicitly accepted for this task: use the R2 S3 API with environment-specific bucket credentials; private API streaming is the only enabled delivery path; memory storage is test/local only; no existing customer objects need migration because the product has not launched.

## Implementation Steps

| Status | Step | Evidence/notes |
| --- | --- | --- |
| Complete | Trace and test the current storage/config/DTO/UI consumers on exact stacked base `0b37042d`. | PR #124 is the prerequisite because it supplies receipt authority and the reconciled migration chain. Generic PostgreSQL document rows have no immutable company owner, so unsafe generic routes now fail closed. |
| Complete | Add a bounded R2 adapter with injected-client unit seams and strict private configuration. | PUT/GET/HEAD/DELETE; exact-body length validation; 404 is missing, other failures are sanitized errors; no bucket listing or public URL. |
| Complete | Replace active Cloudinary configuration and provider-specific DTO/product fields. | Generated OpenAPI/frontend contracts are provider-neutral. Current runtime/config/runbooks no longer require Cloudinary; dated historical evidence remains unchanged. |
| Complete | Exercise memory and S3-compatible behavior, denial/no-provider-I/O paths, startup guards and consumer compatibility. | Disposable MinIO proves shared S3-compatible exact-byte behavior. PostgreSQL/Valkey tests use loopback disposable containers only. |
| In progress | Run exact-head verification, changed coverage and independent security/QA review; commit/push a draft PR only if evidence is truthful. | Initial independent review rejected `df86ac6d`; fixes now cover tenant-authorized logo/profile delivery, EMS DTO redaction, safe verification artifacts, hard worker startup failure, disposable integration fencing, absolute operation deadlines and object-size caps. Exact-head full gate and rereview remain. |

## Test Design And Shared Tracker

- Work-date sprint and task/artifact IDs: Sprint 25; R2-S25-001; owner Anurag Kumar; stacked branch `sprint-25/r2-s25-001`.
- Cases discussed during refinement: S25-079-U authorized private put/get/stat/delete with byte/hash/type equality and no URL; S25-079-P restart/second-instance access through shared S3-compatible storage; S25-079-N invalid credentials, timeout, missing object, oversized/invalid metadata and foreign-parent denial with no object call; S25-079-F uncertain provider result, DB failure after PUT and delete failure remain explicit lifecycle blockers rather than false success.
- Full case-body location in shared workbook and exact task-to-case links: existing Sprint 25 rows S25-079-U/P/N/F; repository source bodies are in `qa-artifacts/hrms/sprint-25-test-design-2026-11-11/05_TEST_CASES.csv`. Workbook read/write is pending connector access in this chat; no publication claim will be made.
- Concrete oracle: authorized current policy reaches the adapter and backend streams exact bytes with `no-store`/`nosniff`; unauthorized roles/companies/parents receive the normalized denial before object I/O; HEAD/GET 404 maps to missing; auth/timeout/5xx fails visibly; DELETE 404 is idempotent success while other delete failures remain retryable errors; no response contains bucket, key, endpoint, credential or provider URL.
- Applicable layers: pure adapter unit tests with an injected S3 client; config/contract tests; real disposable S3-compatible integration if a repository-supported container is available; existing document and expense real-PostgreSQL suites; frontend contract/unit checks; rendered browser roles remain required but not claimed from scripts.
- Missing sheet/tooling/oracle/reviewer: sheet connector, hosted R2 credentials, scanner/derivative/retention decisions and human browser/UAT. New cases remain Not Tested until actual execution.

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Passed | Focused R2 adapter/config/contract unit tests | Adapter/config/public-response/fail-closed suites: 26/26; frontend authenticated blob/document suites: 7/7. Changed coverage is pending the clean committed head. |
| Passed | Real S3-compatible put/get/head/delete and failure behavior | Disposable local MinIO integration: 1/1; two adapter instances read exact bytes/content type and verified HEAD/delete/missing behavior. |
| Passed | Document/expense authorization and PostgreSQL integration regressions | Focused document/admin suites passed 26/26 serially against disposable PostgreSQL/Valkey; full unit 613/613 and contracts 27/27 passed. |
| Passed | Hosted-origin logo/profile byte delivery regression | PostgreSQL Admin company-logo and Core profile-photo journeys persist their document links and return exact authenticated image bytes to a current same-company user; focused suites 7/7. Frontend URL normalization rejects foreign origins and uses the authenticated blob client; frontend unit total 78/78. |
| Passed | `./scripts/agent/verify-change.sh` | Exact worktree gate passed: agent checks 29/29, backend lint/typecheck/unit/contracts, 70-migration drift/FK gates, Queue DLQ/replay, frontend lint/typecheck 77/77 tests, production guard, Vercel SSR build/smoke and route/contract guards. Independent exact-head review is pending. |
| Failed gate | Changed executable coverage at initial implementation commit | 268/377 executable lines and 55/81 branches, with 51 deletion/config paths unmeasured. This remains a draft/merge blocker; the threshold was not weakened. Exact corrected-head coverage is pending. |
| Blocked | Hosted R2/Render/Vercel, role-browser and human UAT | Requires owner-managed credentials/environment and human execution. |

## Risks, Compatibility And Recovery

- Tenant/security risks: an adapter must never become an authorization boundary; opaque keys and private bucket settings do not replace parent/company/role checks. Error/log output must not disclose endpoint, bucket, key or credentials.
- Data/migration risks: no customer-object migration is required. Existing metadata with Cloudinary-only URLs is unsupported prelaunch data and must not be silently presented as private R2 content.
- API/deployment compatibility: backend and frontend contract changes ship together. Configure R2 before starting the new binary; old Cloudinary-only binaries cannot read newly stored R2 objects.
- Observability: bounded safe error classes and readiness status without credential/key details; future metrics belong to the lifecycle/operations slice.
- Rollback or recovery: before launch, roll back the entire binary/config set, not only one package. Never point an old Cloudinary binary at R2 metadata. Provider-success/DB-failure reconciliation remains blocked until TEN-S25-021 and prevents production readiness.

## Handoff

- Files/artifacts: this plan, implementation/tests, generated contracts, focused QA evidence and PR description.
- Commands and results: `./scripts/agent/verify-change.sh` passed; focused backend suites 26/26; frontend focused suites 7/7; disposable MinIO integration 1/1; full backend unit 613/613; contracts 27/27; frontend unit 77/77; Vercel SSR smoke HTTP 200; 70 migrations verified.
- Remaining blockers or human actions: hosted private bucket/credentials, environment wiring, browser/UAT, sheet readback, lifecycle/retention/scanner decisions.
- Commit/PR/deployment references: stacked base `0b37042d`; implementation commit `df86ac6d`; corrective commit, push and draft PR pending; no deployment or hosted mutation.
