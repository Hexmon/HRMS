# External Task Sheet Patch - QA Artifact Upgrade

Add a section named:

`Codex Sprint Update - Full Product QA Artifact Upgrade`

## Summary Row

| Task ID | Feature/Area | Business Rule / Scope | Implementation Status | Files Changed | Verification Status | Tester Priority | Tester Scope | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HRMS-QA-UPGRADE-001 | QA Workbook | First full-product QA workbook with P0/P1/P2 split, sprint plan, story points, coverage matrix, role matrix, BLQ traceability, defect/signoff sheets | Completed | `qa/TESTING_TEST_CASES.xlsx`, `qa/TESTER_RUN_BOOK.md`, QA checklist docs, validation scripts | Validation script passed | P0 | Full QA Cycle | 7-day sprints, 48 points per sprint |
| HRMS-QA-UPGRADE-002 | Tester Manual | OS-aware tester run book for macOS, Ubuntu/Linux, Windows; defect logging; signoff rules | Completed | `qa/TESTER_RUN_BOOK.md`, `qa/TESTING_CHECKLIST_CLIENT.docx` | Validation script passed | P0 | QA Execution | Client doc remains non-technical |
| HRMS-QA-UPGRADE-003 | Traceability | Expanded role permission matrix and BLQ-001 through BLQ-025 traceability | Completed | Workbook tabs `Role Permission Matrix`, `Business Rule Traceability` | Validation script passed | P0/P1/P2 | Regression Planning | Backend is source of truth |

## Sprint Plan Rows

| Sprint | Scope | Story Points | Related IDs |
| --- | --- | --- | --- |
| 1 | Auth, onboarding, RBAC, attendance, expenses, documents, Cloudinary, empty workspace, mobile smoke | 40.5 | AUTH-P0-001, AUTH-P0-002, AUTH-P0-003, ONB-P0-001, RBAC-P0-001, DASH-P0-001, ATT-P0-001, ATT-P0-002, EXP-P0-001, EXP-P0-002, DOC-P0-001, STOR-P0-001, ADM-P0-001, REP-P0-001, MOB-P0-001 |
| 2 | Employees, EMS, leave/WFH, holidays, attendance regression, timesheets, notifications, dashboard, admin master/RBAC | 39.5 | EMP-P1-001, EMP-P1-002, EMP-P1-003, EMS-P1-001, EMS-P1-002, EMS-P1-003, LEAVE-P1-001, WFH-P1-001, HOL-P1-001, ATT-P1-001, ATT-P1-002, TS-P1-001, TS-P1-002, NOTIF-P1-001, DASH-P1-001, ADM-P1-001 |
| 3 | Projects, assets, helpdesk, reports, admin settings, API negatives, deep mobile/security/edge tests | 44.5 | PROJ-P1-001, PROJ-P1-002, PROJ-P1-003, ASSET-P1-001, ASSET-P1-002, HELP-P1-001, HELP-P1-002, EXP-P1-001, REP-P1-002, ADMIN-P1-001, API-P1-001, API-P2-001, DOC-P2-001, ATT-P2-001, EXP-P2-001, REP-P2-001, SEC-P2-001, MOB-P2-001 |

## Story Point Capacity Rule

- Sprint length: 7 days.
- Capacity: 48 story points per sprint.
- Story point scale: 0.5, 1, 2, 3, 5.
- All generated sprints are under capacity.
