# Internal QA Checklist

This document summarizes `qa/TESTING_TEST_CASES.xlsx`. The workbook is the execution source of truth.

## Coverage Model

- P0 UAT Gate: 15 cases.
- P1 Core Regression: 27 cases.
- P2 Deep Regression: 7 cases.

## Sprint Plan

| Sprint | Scope | Story Points | Priority Mix |
| --- | --- | --- | --- |
| 1 | Auth, onboarding, RBAC, attendance, expenses, documents, Cloudinary, empty workspace, mobile smoke | 40.5 | P0:15 |
| 2 | Employees, EMS, leave/WFH, holidays, attendance regression, timesheets, notifications, dashboard, admin master/RBAC | 39.5 | P1:16 |
| 3 | Projects, assets, helpdesk, reports, admin settings, API negatives, deep mobile/security/edge tests | 44.5 | P1:11, P2:7 |

## Internal Risk Notes

- Backend role/policy code is authoritative for sensitive workflows.
- User-facing Manager maps to backend `Reviewer` compatibility where present.
- Helpdesk Agent remains a role-alignment item unless backend permission support exists in target seed/config.
- Cloudinary mock is acceptable only for local/dev/test regression, not QA/UAT release storage validation.
- Immutable document access logs are preserved by database policy during hard delete.
- Admin workflow settings are persisted/configuration-facing unless a module-specific runtime consumer is proven.

## Evidence Sources

- `qa/QA_ARTIFACT_UPGRADE_ANALYSIS.md`
- `qa/EVIDENCE_REGISTER.md`
- `qa/DEV_TEST_EXECUTION_LOG.md`
- `README.md`
- Backend routes/services/policies under `hrms_backend/src/modules`
- Frontend routes under `hrms-client/src/routes`
