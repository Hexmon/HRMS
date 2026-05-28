# Hawkaii HRMS QA Checklist

Use `qa/TESTING_TEST_CASES.xlsx` as the main tracker.

## How To Execute

1. Run P0 UAT Gate first.
2. Stop and report if any P0 test fails or is blocked.
3. Run P1 Core Regression after P0 is clean.
4. Run P2 Deep Regression for major release or if time permits.

## What P0 Covers

- Login/session/logout/password reset/email verification.
- New workspace shows clean empty data.
- Role navigation and permission sanity.
- Attendance punch, break, and punch out.
- Expense Manager to Finance Manager to payment/settlement journey.
- Self-approval/self-processing blocked.
- Document upload/open/delete with warning.
- Real Cloudinary readiness for QA/UAT/prod.
- Basic reports/export, notifications, and mobile employee smoke.

## Sprint Plan

| Sprint | Scope | Story Points | Priority Mix |
| --- | --- | --- | --- |
| 1 | Auth, onboarding, RBAC, attendance, expenses, documents, Cloudinary, empty workspace, mobile smoke | 40.5 | P0:15 |
| 2 | Employees, EMS, leave/WFH, holidays, attendance regression, timesheets, notifications, dashboard, admin master/RBAC | 39.5 | P1:16 |
| 3 | Projects, assets, helpdesk, reports, admin settings, API negatives, deep mobile/security/edge tests | 44.5 | P1:11, P2:7 |

## Tester Notes

- Do not pass storage tests in QA/UAT unless real Cloudinary is configured.
- Capture screenshots or videos for failures.
- Capture backend request IDs when an API error appears.
- Use `Blocked` when environment, data, or role setup is missing.
