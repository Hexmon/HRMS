# Sprint 25 coordinated delivery ledger

## Objective And Success Criteria

- Objective: preserve the exact Sprint 25 release dependency graph, evidence, review state and owner actions while the individual implementation PRs are reconciled into `release-01`.
- User/business outcome: the owner can merge only reviewed, current heads in a safe order without duplicating superseded work or confusing a draft, provider preview or numerical coverage result with release readiness.
- Observable success criteria: every open task PR has an exact head, dependency, current gate, next action and rollback/cutover note; live tracker updates are published or retained here as exact pending changes when the connector is unavailable.

## Scope

- In scope: coordination evidence for PRs #117 through #125, the release merge order, migration/configuration ordering, tracker publication gaps and the next autonomous engineering slice.
- Out of scope: merging, deployment, hosted ruleset changes, production data mutation, human UAT and penetration testing.
- Affected roles, tenants, modules and environments: engineering/QA release coordination for all tenants; isolated local/CI evidence only unless a PR records a narrower hosted preview.

## Evidence And Decisions

- `origin/release-01` is `a08e2ab7722b7aaa94482f5ed5db9f187f87ba71`, the merge result of PR #116.
- PR #120 is the first independent merge candidate. It is a test-only Resend webhook-clock stabilization at `ce4d25a19a58cb673fe7bfd287cd30a4d7220029`; current repository, backend, frontend and Vercel checks pass.
- PR #117 numerically covers 1,334/1,334 changed executable lines and 395/395 changed decision branches at `8c2eb3263a9f4c814bbb34d8e11d57b98e5bacc7`. Its remaining ten workflow/configuration/manifest/lock/shell paths are intentionally fail-closed. An explicit owner bootstrap and organization required-workflow pin are required; no candidate-authored waiver may clear them.
- PR #123 is superseded by PR #124 and is not in the merge path.
- TEN-S25-021 intake proved that approved decisions define historical receipt reads but not receipt upload authority by role and expense status. The current memory implementation is not an approved oracle. Do not enable the PostgreSQL upload route until the owner approves the requester/Manager/Finance/Admin/Auditor and Draft/Pending/Returned/Approved/Processing/Paid/Withdrawn/Rejected/Closed matrix. Permanent orphan deletion remains a separate retention/legal-hold decision under TEN-S25-022; a future safe finalize flow may quarantine bytes without deleting them.
- The shared workbook is anonymously readable, but the Google Drive connector is not installed in this environment. No tracker write is claimed. Exact pending changes are recorded below.
- Unknowns requiring an owner remain in the source decision log. This ledger does not invent retention, scanner, audit-failure, transfer-dispute or payroll-conflict rules.

## Dependency Graph And Execution Ledger

| Position | Task / PR | Exact head | Depends on | Current evidence and blocker | Next action |
| --- | --- | --- | --- | --- | --- |
| 0 | Webhook clock test / [#120](https://github.com/Hexmon/HRMS/pull/120) | `ce4d25a19a58cb673fe7bfd287cd30a4d7220029` | Current `release-01` | Non-draft, clean and green; test-only | Owner merges first; record actual merge SHA |
| 1 | QA-S25-003 / [#117](https://github.com/Hexmon/HRMS/pull/117) | `8c2eb3263a9f4c814bbb34d8e11d57b98e5bacc7` | Current `release-01`; reconcile after #120 because of overlapping auth-test changes | Numeric coverage complete; ten nonnumeric paths intentionally red | Reconcile after #120, rerun exact-head gates, obtain explicit bootstrap approval and pin merged immutable workflow SHA |
| 2 | Asset atomicity / [#118](https://github.com/Hexmon/HRMS/pull/118) | `cdef5d375f265f39dc32bfedd5f3b9b133523ee5` | #117 | Draft; cumulative coverage and hosted/browser gates incomplete | Reconcile to merged #117, isolate task diff, close coverage and QA findings |
| 2a | Discovery inventory / [#119](https://github.com/Hexmon/HRMS/pull/119) | `1562e24c8bb9d49ffdff9c84bdabdf4f93707b20` | #117 | Documentation-only branch; inherits bootstrap history | Reconcile after #117 and verify references; not a runtime prerequisite |
| 3 | Holiday tenant fence / [#122](https://github.com/Hexmon/HRMS/pull/122) | `f76930d9a1149b30b599d0f473938cf7e819c7fb` | #118 | Draft; cumulative coverage and hosted/browser gates incomplete | Reconcile after #118, rerun migration/integration/role cases |
| 4 | Report/export tenancy / [#121](https://github.com/Hexmon/HRMS/pull/121) | `77ce26184af4d3cff8568fe153825ea70cc71e1f` | #122 | Draft; stale integration oracle was corrected to preserve the intentional 409 historical asset-company ownership fence; 585/585 backend unit and 27/27 contract tests passed locally; senior review accepted the exact head; cumulative coverage remains red | Await exact-head CI and final independent QA; reconcile again after #122 |
| 5 | Expense cutover / [#124](https://github.com/Hexmon/HRMS/pull/124) | `7e562e1ab9bc5d94153b8ff4828597cc0dc5196a` | #121 | Draft; both intentional PostgreSQL receipt-tenant filtering and transaction-owned parent-authorization 409 fences now have exact-message, forbidden-mutation and zero-provider-I/O regression assertions; focused senior review and QA accepted the exact head; cumulative coverage and hosted/browser gates remain incomplete | Await exact-head CI; reconcile after #121, then rerun cumulative gates and review |
| retired | Broad expense branch / [#123](https://github.com/Hexmon/HRMS/pull/123) | `c44a01bb3067cac20d513bfcd8105746b25d8ade` | none | Divergent, stale and superseded by #124 | Close as superseded only with owner/lead PR housekeeping; never merge both |
| 6 | R2 private storage / [#125](https://github.com/Hexmon/HRMS/pull/125) | `ea6549c1bedf328ba4475573bb5c9de7090b10d1` | #124 | Draft; repository/frontend/Vercel passed; trusted coverage reported 2,912/8,925 lines, 652/1,552 branches and 85 unmeasured paths; hosted R2, lifecycle and human/browser evidence incomplete | Reconcile after #124, regenerate task-local exact-head reports and complete required hosted/recovery/QA gates |

Executable dependency chain:

```text
#117 QA
  -> #118 asset atomicity
    -> #122 holiday fencing
      -> #121 report/export tenancy
        -> #124 expense cutover
          -> #125 private R2 storage
```

PR #119 branches from #117 and is documentation-only. PR #120 is independent. PR #123 is not an ancestor of #124.

## Migration And Configuration Order

1. Merge PR #120, then reconcile PR #117 and perform its explicit trusted-workflow bootstrap.
2. PR #118: drain old writers, then apply `0065_asset_transaction_fence.sql` and `0066_asset_recovery_assignment_identity.sql`.
3. PR #122: apply `0067_holiday_company_unique_constraint.sql` after its prerequisite is current.
4. PR #121: no numbered migration; merge only after the report/export backend and coverage gates pass at the reconciled head.
5. PR #124: drain old writers, then apply `0068_expense_original_company_owner.sql`, `0069_expense_command_replay.sql` and `0070_expense_reviewer_mapping_owner.sql`.
6. PR #125: no numbered migration. Before hosted verification, provision private environment-separated R2 buckets and supported backend/worker secret stores for `OBJECT_STORAGE_DRIVER`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_REQUEST_TIMEOUT_MS` and `R2_FORCE_PATH_STYLE`. Record only readiness and locations, never values.

These fencing migrations are forward-recovery cutovers. Do not roll back to old writers after writes resume without the task runbook's recovery procedure.

## Test Design And Shared Tracker

- Work-date sprint and task/artifact IDs: Sprint 25 (`2026-11-07` through `2026-11-13`); QA-S25-003, TEN-S25-001/007/008/016 and R2-S25-001 remain the active coordination set.
- Live workbook schema: Task, Project, Owner Name, Role, Domain, Priority, Story Points, Status, Start date, End date, Deliverable, Notes, Remarks, Commit / QA Artifact, Test cases and QA completion gate.
- Live snapshot on 2026-11-12: 140 populated Sprint 25 task rows (81 `Planned`, 48 `Needs decision` and 11 `Completed`) and 482 test-case rows, all marked `Not Tested`.
- Pending row 57 (QA-S25-003): retain the current `Planned` status unless the workbook validation list is inspected and confirms another supported value; add PR #117, exact head `8c2eb3263a9f4c814bbb34d8e11d57b98e5bacc7`, numeric result 1,334/1,334 lines and 395/395 branches, the ten intentional nonnumeric bootstrap blockers and the owner required-workflow action. Keep its four cases `Not Tested` until exact case evidence is published and independently accepted.
- Pending row 79 (R2-S25-001): retain the current `Planned` status unless the workbook validation list is inspected and confirms an exact supported in-progress value; set start date 2026-11-12 and leave end date blank; add PR #125 and exact head `ea6549c1bedf328ba4475573bb5c9de7090b10d1`; record the failed cumulative trusted result 2,912/8,925 lines, 652/1,552 branches and 85 unmeasured paths in Notes/Remarks, Commit / QA Artifact and QA completion gate; name #124, hosted R2, lifecycle and human/browser QA as blockers. Keep S25-079-U/P/N/F `Not Tested`; partial local evidence belongs in Actual Result, not Passed.
- Pending rows 80-82 (R2-S25-002, R2-S25-003, QA-R2-S25-001): retain Planned/Not Tested. Required scanner/crop/limits, durable audit/failure policy, retention and independent QA are unresolved or unexecuted.
- Full case bodies remain in the workbook and repository pending-case artifacts. No case is marked Passed solely from a Vercel preview, unit test count or author review.
- Publication gap: Google Drive plugin `google-drive` is available but not installed. This environment cannot truthfully write or read back the live cells. Install/connect it before publishing these exact changes.

## Verification

| Status | Check or user journey | Environment/evidence |
| --- | --- | --- |
| Passed | Remote release and PR head/dependency inspection | Read-only Git/GitHub inspection on 2026-11-12 |
| Passed | PR #117 numerical changed coverage | Hosted trusted job at exact `8c2eb326`: 1,334/1,334 lines and 395/395 branches |
| Passed | PR #117 bootstrap procedure publication | PR comment records the one-time owner/admin procedure; PR remains draft |
| Partially passed; CI/QA pending | PR #121 backend correction | Correction and handoff pushed at `77ce26184af4d3cff8568fe153825ea70cc71e1f`; focused PostgreSQL/Valkey integration 17/17, backend lint/typecheck, backend unit 585/585 and contracts 27/27 passed locally; senior review accepted the exact head; exact-head CI and independent QA remain pending |
| Focused correction accepted; broader gates pending | PR #124 backend correction | Exact `7e562e1ab9bc5d94153b8ff4828597cc0dc5196a`: 70 disposable migrations, document integration 4/4, backend lint/typecheck and diff check passed; senior review and independent QA accepted the receipt-fence correction; cumulative coverage, prerequisites, hosted/browser/human gates remain pending |
| Pending | Shared tracker publication/readback | Google Drive connector not installed |
| Pending | Owner merges, post-merge regressions and deep integrated release regression | Owner-only merge sequence has not started after PR #116 |

## Risks, Compatibility And Recovery

- Tenant/security risks: merging descendants out of order can duplicate stale policy, hide cross-tenant regressions or inflate coverage denominators. Reconcile one child only after its parent actually merges.
- Data/migration risks: asset, holiday and expense constraints fence old behavior. Drain writers and follow forward-recovery runbooks; do not deploy old binaries after the cutover.
- API/deployment compatibility: PR #125 requires private R2 configuration and authenticated byte delivery. Vercel preview success does not prove Render-to-R2 behavior.
- Observability: retain exact CI URLs/counts and case-level evidence; do not replace failed or pending states with summary language.
- Rollback or recovery: test-only/docs-only PRs can be reverted normally. Schema fencing and object-storage cutovers require their task-specific forward recovery and reconciliation.

## Handoff

- Files/artifacts: this ledger; individual task plans and QA artifacts in their PR branches; live tracker remains externally pending.
- Commands and results: remote PR/head/check inspection and read-only tracker export were completed; task-specific commands stay in each task plan.
- Remaining blockers or human actions: merge PR #120; approve/bootstrap PR #117 and pin the immutable required workflow; approve the TEN-S25-021 receipt uploader/status matrix; install/connect Google Drive for tracker publication; provide hosted R2 environment and complete human/provider gates when their prerequisites are ready.
- Commit/PR/deployment references: ledger branch `sprint-25/del-s25-002` starts from `a08e2ab7722b7aaa94482f5ed5db9f187f87ba71`. No deployment or hosted configuration change is authorized or claimed.
