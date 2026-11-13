# Sprint 25 backend source-inventory evidence index

This package collects 21 bounded source-review notes from the original HRMS checkout at `87618f88f464847d049c9e2cf97968238cae1b66` on 2026-11-11. They trace **619 distinct physical CSV rows exactly once** in `docs/discovery/backend-saas-review-inventory.csv`: 444 rows still marked `unreviewed` and 175 still marked `partially reviewed`. The one remaining CSV row is intentionally `excluded`. The inventory CSV was **not edited**. “Source-touched” means a selected route/file/table/job boundary has written evidence; it does not mean exhaustive edge-case review or a passed test.

The packaging worktree `sprint-25/disc-s25-001` was created from freshly fetched `origin/release-01` at `30783aa5` and fast-forwarded to the QA parent `eb6e94a8` to use its document-reference checker. These notes remain tied to source SHA `87618f88`, not to a new review of the QA-parent or any hosted deployment. The package adds this index, the 21 source-inventory evidence files and two cited supporting local QA artifacts. No product code, CSV, tracker, or hosted configuration was changed by packaging.

| Evidence note | CSV rows |
| --- | ---: |
| [Admin routes and module files](source-inventory-admin-routes-2026-11-11/evidence.md) | 40 |
| [Final asset tranche](source-inventory-asset-final-2026-11-11/evidence.md) | 33 |
| [Attendance contracts and helpdesk files](source-inventory-attendance-contracts-helpdesk-2026-11-11/evidence.md) | 35 |
| [Attendance, platform and webhook routes](source-inventory-attendance-platform-2026-11-11/evidence.md) | 30 |
| [Auth, onboarding and core routes](source-inventory-auth-core-2026-11-11/evidence.md) | 31 |
| [Auth, transaction and worker files](source-inventory-auth-transaction-internals-2026-11-11/evidence.md) | 32 |
| [Documents and EMS routes](source-inventory-documents-ems-2026-11-11/evidence.md) | 22 |
| [Domain boundary files](source-inventory-domain-boundaries-2026-11-11/evidence.md) | 33 |
| [EMS self-service routes](source-inventory-ems-self-policy-2026-11-11/evidence.md) | 11 |
| [Expenses and expense reports](source-inventory-expenses-reports-2026-11-11/evidence.md) | 33 |
| [Geo, reports and worker files](source-inventory-geo-reports-worker-2026-11-11/evidence.md) | 34 |
| [Leave, timesheet and notification routes](source-inventory-leave-timesheet-notifications-2026-11-11/evidence.md) | 32 |
| [Partial attendance tables](source-inventory-partial-attendance-tables-2026-11-11/evidence.md) | 30 |
| [Partial business tables](source-inventory-partial-business-tables-2026-11-11/evidence.md) | 30 |
| [Partial core/platform/attendance tables](source-inventory-partial-core-platform-attendance-2026-11-11/evidence.md) | 30 |
| [Final partial boundaries and jobs](source-inventory-partial-final-boundaries-jobs-2026-11-11/evidence.md) | 23 |
| [Final partial files](source-inventory-partial-final-files-2026-11-11/evidence.md) | 30 |
| [Final partial tables and files](source-inventory-partial-final-tables-files-2026-11-11/evidence.md) | 32 |
| [Payroll, exports and health routes](source-inventory-payroll-exports-health-2026-11-11/evidence.md) | 12 |
| [Projects and helpdesk routes](source-inventory-projects-helpdesk-2026-11-11/evidence.md) | 32 |
| [Remaining unreviewed tables, jobs and files](source-inventory-tables-jobs-boundaries-2026-11-11/evidence.md) | 34 |
| **Distinct source-touched rows** | **619** |

## Validation and next proof

The row audit can be reproduced as follows: enumerate `docs/discovery/backend-saas-review-inventory.csv` with `csv.DictReader`, starting at **2** so numbers match physical CSV lines; select rows whose status is `unreviewed` or `partially reviewed`. For each of the 21 `source-inventory-*/evidence.md` files, examine Markdown table lines only (`|` as the first character), take the first cell, and extract its **leading decimal row number**, allowing optional surrounding bold markers. Skip table headers and nonnumeric cells. The parser assumes **one CSV row per evidence table line**, with no combined-range first cells; the notes' prose range summaries are not counted. Count each extracted row number across files and compare to the selected CSV row set. Result: **619 claims, 619 distinct rows, zero missing, zero duplicate, zero unexpected; 444 `unreviewed` plus 175 `partially reviewed`**.

Two cited QA documents are included as **supporting artifacts, not additional inventory-row claims**: [Admin persistence reproduction](ten-s25-005-admin-intake-2026-11-11/persistence-reproduction.md) and [foreign-holiday UUID probe](holiday-foreign-id-intake-2026-11-11/pending-holiday-foreign-uuid-cases.md). One auth security unit-test file cited by the original dirty checkout is absent from the QA-parent branch; the source note now says so instead of treating that file as packaged evidence. The original reviews sometimes cite separate runtime QA artifacts; their limited results must not be generalized to other rows. Exact-head isolated PostgreSQL/RLS/concurrency, Valkey, object storage, Queue, browser, hosted configuration, independent QA, penetration testing, and human UAT remain task-specific gates.
