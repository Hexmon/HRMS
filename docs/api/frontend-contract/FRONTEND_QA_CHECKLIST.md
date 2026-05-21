# Frontend QA Checklist

Run these scenarios against `http://localhost:3101` or the configured QA API base. Use seeded local personas only in local/QA environments.

## Auth And Session

- Run `npm run api:frontend-contract:route-coverage` and confirm all visible routes map to a contract group.
- Login with email/password and verify token/cookie session bootstrap.
- Load `/auth/me` after refresh.
- Logout and confirm protected screens redirect or show unauthenticated state.
- Verify invalid login, missing auth, expired/stale cookie, and forbidden role cases.

## Core

- List users with pagination/search.
- Open user detail.
- Load hierarchy subtree and confirm out-of-scope access shows backend `403`.

## Expenses And Finance

- Employee creates draft and submitted expense.
- Employee sees own expense list, detail, and timeline.
- Manager sees only assigned/backup manager queue and can verify/return/reject.
- Requester cannot manager-verify own ticket.
- Finance queue shows only manager-verified/finance-actionable records.
- Finance approval before manager verification is blocked.
- Finance requester self-processing is blocked.
- Payment release, bill submission, manager document verification, and settlement complete the happy path.
- Settlement is blocked when required documents are missing/unverified.
- Stale `expected_version` returns `409` and UI refreshes.
- Old reviewer/director approval UI is absent.

## Documents

- Upload metadata for an expense document.
- Request download URL and avoid logging it.
- Verify restricted classification access returns `403` for unauthorized personas.
- View access log with pagination.

## Assets

- List and open asset detail.
- Create, assign, and return an asset as an asset admin.
- Scan QR hash through the safe public endpoint.
- Activate, validate, and revoke a software license.
- Confirm compromised/revoked license validation is blocked.

## Timesheets

- Create work segment.
- Submit timesheet cycle.
- Approver queue shows scoped submissions.
- Approve/reject/return with version handling.
- Stale version returns `409`.

## Reports

- Load employee, manager, finance, register, aging, payments, audit, and analytics reports according to role.
- Verify pagination and empty states.
- Create export job and show backend job state.

## Error And Rate-Limit UX

- Show validation messages from `details.fieldErrors`.
- Display support-friendly `request_id`.
- Handle `403` as access denied.
- Handle `429` using `Retry-After` without tight retry loops.
