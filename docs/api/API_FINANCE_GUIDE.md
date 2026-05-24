# API Finance Guide

Date: 2026-05-01

Use Employee `E1` for request self-service, Manager `D1` for manager verification, Finance Manager `N1` for operations, and Auditor `AUD` for read-only audit/report checks. Finance operations mutations require Finance Manager/Admin and are blocked when the actor is the requester.

## Finance Web Consumer Shell

`apps/finance-web` owns `/finance/**` and calls Fastify APIs only. The Finance app shell maps sidebar routes to API-backed consumer workflows:

- `/finance/dashboard`: finance cockpit summaries and analytics.
- `/finance/my-expenses`: employee/requester expense self-service dashboard.
- `/finance/manager`: Manager verification dashboard and assigned manager queue.
- `/finance/requests/new`: employee/requester entry point labeled **Raise Expense Request**.
- `/finance/requests/{id}`: requester-safe request detail.
- `/finance/requests/{id}/timeline`: requester-safe visual timeline.
- `/finance/drafts`: employee drafts.
- `/finance/returned`: returned/held requests requiring employee action.
- `/finance/payment-status`: employee payment and settlement status.
- `/finance/queue`: finance queue filters, sorting, pagination, and ticket access.
- `/finance/tickets/{id}`: finance detail, actions, payment/settlement panel, and audit timeline.
- `/finance/payments`: payment register and payment-mode summaries.
- `/finance/settlements`: payable/recoverable/no-balance and pending adjustment review.
- `/finance/advance-aging`: advance exposure, aging buckets, and overdue worklist.
- `/finance/reports`: finance report catalog and export readiness.
- `/finance/audit`: immutable event timeline review.
- `/finance/export`: HIR-004 accounting export readiness state.

Finance uses the unified platform session. Anonymous users are redirected to `/login?returnTo=/finance/...`; unauthorized roles see access denied or a role-appropriate redirect while backend RBAC remains authoritative. Finance topbar owns user/session/logout actions, and the sidebar contains stable pages only. Dynamic `/finance/tickets/{id}` and `/finance/requests/{id}` routes open from queue/table/actions and are not sidebar items.

Role-aware Finance landing:
- Employee/requester `/finance` -> `/finance/my-expenses`.
- Finance Manager/Admin `/finance` -> `/finance/dashboard`.
- Auditor `/finance` -> `/finance/reports`.
- Manager `/finance` -> `/finance/manager`.

Legacy approval shell routes are removed from active use. Use `/finance/manager`.

## Employee Request Self-Service

Employees raise finance/expense requests at:

- `/finance/requests/new`

The UI label is:

- Raise Expense Request

The form uses `POST /api/v1/expenses` and supports draft or submit through the `submit` boolean.

## Dashboard And Analytics

```bash
curl -sS "$API_BASE_URL/api/v1/reports/expenses/finance-analytics" \
  -H "authorization: Bearer $TOKEN"
```

Includes operational summary, status distribution, spend trend, department/type spend, advance aging, settlement variance, risks, high-value tickets, and policy warnings.

## Finance Queue

`GET /api/v1/expenses/queue/finance`

Common filters:

- `page`, `page_size`
- `status`
- `requester`
- `department`
- `date_from`, `date_to`
- `payment_type`
- `expense_type`, `expense_sub_type`
- `amount_min`, `amount_max`
- `document_status`
- `sla_bucket`
- `sort`

Example:

```bash
curl -sS "$API_BASE_URL/api/v1/expenses/queue/finance?page=1&page_size=25&sort=sla" \
  -H "authorization: Bearer $TOKEN"
```

## Manager Verification Workspace

Manager verification work lives inside Finance Web:

- `/finance/manager` uses `GET /api/v1/expenses/queue/manager?page=1&page_size=50` and `POST /api/v1/expenses/{id}/manager/verify`.

The workspace shows searchable/sortable request tables, payment-type filtering, selected request preview, visual timeline, document verification, and verify/reject/return decisions. `reject` and `return` require remarks. `expected_version` is submitted as a number.

The visual timeline fetch is cached and deduped by request id/version in Finance Web so queue refreshes do not repeatedly call `/api/v1/expenses/{id}/timeline` for the same selected request.

```json
{
  "decision": "verify",
  "remarks": "Verified.",
  "expected_version": 2
}
```

## Finance Detail

`GET /api/v1/expenses/{id}/finance-detail`

Returns ticket context, line items, documents, payments, approvals, audit, missing documents, policy warnings, and settlement summary.

## Finance Actions

Approve or hold:

```json
{
  "decision": "approve",
  "remarks": "Manager verification complete.",
  "expected_version": 3
}
```

Hold or clarification requires remarks:

```json
{
  "decision": "hold",
  "remarks": "Receipt is unreadable.",
  "expected_version": 3
}
```

Payment release:

```json
{
  "payment_date": "2026-05-04",
  "amount": "500.00",
  "payment_mode": "NEFT",
  "reference_no": "PAY-001",
  "expected_version": 4
}
```

Settlement:

```json
{
  "actual_amount": "500.00",
  "remarks": "Bills verified and settlement complete.",
  "expected_version": 5
}
```

## Reports

- `GET /api/v1/reports/expenses/finance-dashboard`
- `GET /api/v1/reports/expenses/advance-aging`
- `GET /api/v1/reports/expenses/payments`
- `GET /api/v1/reports/expenses/audit`
- `POST /api/v1/reports/exports`

CSV and XLSX report exports generate backend document records through object storage and return a `download_document_id`. External accounting-provider exports remain HIR-004.

## Error Handling

- `403`: finance self-processing or missing role.
- `409`: stale `expected_version`; refresh finance detail and retry.
- `400`: missing remarks, invalid state, or invalid payload.
