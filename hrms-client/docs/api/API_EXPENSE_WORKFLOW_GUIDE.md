# API Expense Workflow Guide

Date: 2026-05-01

Expense workflow is backend-owned and audit-backed. Consumers should never infer permission from UI state alone.

## Create Expense

`POST /api/v1/expenses`

Finance Web employee entry point:

- `/finance/requests/new`
- Visible label: `Raise Expense Request`

```json
{
  "submit": true,
  "expense_type": "Project",
  "expense_sub_type": "Project Travel",
  "project_code": "PRJ-100",
  "task_title": "Client implementation travel",
  "task_description": "Travel for implementation workshop",
  "location": "Mumbai",
  "start_date": "2026-05-01",
  "end_date": "2026-05-03",
  "estimated_amount": "1000.00",
  "payment_type": "Advance",
  "advance_amount": "500.00",
  "line_items": [
    { "line_category": "travel", "description": "Flight", "line_total": "700.00" },
    { "line_category": "lodging", "description": "Hotel", "line_total": "300.00" }
  ]
}
```

## Requester APIs

- `GET /api/v1/expenses/my?page=1&page_size=25`
- `GET /api/v1/expenses/{id}`
- `POST /api/v1/expenses/{id}/submit`
- `GET /api/v1/expenses/{id}/timeline`
- `GET /api/v1/expenses/{id}/audit`

Finance Web requester routes:

- `/finance/my-expenses`
- `/finance/requests/new`
- `/finance/requests/{id}`
- `/finance/requests/{id}/timeline`
- `/finance/drafts`
- `/finance/returned`
- `/finance/payment-status`

Submit body:

```json
{
  "expected_version": 1
}
```

## Manager Verification APIs

Primary UI: `/finance/manager`.

- `GET /api/v1/expenses/queue/manager`
- `POST /api/v1/expenses/{id}/manager/verify`

Decision body:

```json
{
  "decision": "verify",
  "remarks": "Verified.",
  "expected_version": 2
}
```

`reject` and `return` require remarks. The Finance Web manager workspace sends `expected_version` as a number and surfaces 403/409/validation errors through the global toast system. Legacy approval routes are removed from active use.

## Expense Timeline

`GET /api/v1/expenses/{id}/timeline`

Purpose: returns a visual, display-safe timeline derived from immutable audit events. It is used by My Expenses, manager context, and Finance ticket detail.

Object-level access follows the same ticket read policy: requester, assigned manager, assigned finance user, Admin, and Auditor may read according to backend policy. Unauthorized actors receive `403`.

Response example:

```json
[
  {
    "event_type": "expense.manager.verify",
    "label": "Manager verify",
    "stage": "manager",
    "actor_user_id": "00000000-0000-0000-0000-000000000000",
    "actor_name": "D1 - Manager",
    "timestamp": "2026-05-01T10:30:00.000Z",
    "remarks": "Verified.",
    "status_from": "Pending Manager Verification",
    "status_to": "Manager Verified"
  }
]
```

Timeline consumers should not expect raw audit `old_value` or `new_value`. Those fields remain hidden from the visual timeline to avoid leaking finance-only or internal audit payloads.

## State And Governance Notes

- Manager backup assignments are active/effective-dated.
- If direct manager is requester or unavailable, the backend uses the configured manager backup.
- If Finance Manager is requester, backend uses the configured active Finance Manager/Admin backup.
- Finance cannot approve before manager verification.
- Closed tickets are read-only except authorized correction notes.
- Every workflow mutation writes immutable audit.
- `expected_version` is required for workflow mutations; stale versions return `409`.
