# Implementation Documentation

Last verified from the repository: 2026-06-30.

This folder preserves implementation status, coverage, and documentation completeness. The [shared sprint task sheet](https://docs.google.com/spreadsheets/d/1dr5qLKxq5IGIZAyIAdMlcDYDfld-LYxfvSHkKw1jBnA/edit?usp=sharing) tracks current sprint tasks and owners; use `../process/task-tracker.md` for its update rules. For operational steps, use `../runbooks/` and `../deployment/`.

## Implementation Set

| Document | Purpose |
| --- | --- |
| `HRMS_PRODUCTION_TASK_SHEET.md` | Historical implementation task sheet and module completion log; reconcile current claims with source and dated evidence. |
| `implementation-status-index.md` | Short current implementation summary with source-of-truth pointers. |
| `documentation-coverage-audit.md` | Required documentation set, current coverage, gaps, and maintenance ownership. |
| `GEO-S10-010-backend-implementation-sequencing-checklist.md` | Attendance implementation sequencing, compatibility gates, and geo/mobile rollout prerequisites. |

## Current Source Evidence

| Evidence | Current Value |
| --- | --- |
| Backend OpenAPI | 245 operations across 214 paths. |
| Backend modules | 19 module directories under `hrms_backend/src/modules/`. |
| Frontend route files | 87 `.tsx` route files under `hrms-client/src/routes/`. |
| Frontend domains | 17 domain adapter directories under `hrms-client/src/domains/`. |
| DB migrations | 25 SQL migrations under `hrms_backend/src/db/migrations/`. |

Regenerate or re-check these before making broad implementation claims.

