# Business Rules For Frontend Consumers

## Source Of Truth

- The Fastify API is the only supported backend interface for frontend clients.
- Do not query PostgreSQL, Valkey, object storage, Drizzle, migrations, or internal repositories from frontend code.
- Frontend route guards improve UX, but backend RBAC/ABAC is authoritative.
- Use `openapi.json` for exact field-level schemas and `ENDPOINT_INDEX.md` for behavior and UI notes.

## Auth And Sessions

- `POST /api/v1/auth/login` returns an `access_token` and sets the configured HttpOnly cookie.
- Browser clients can use the cookie; API/mobile clients should send `Authorization: Bearer <access_token>`.
- `GET /api/v1/auth/me` is the session bootstrap source for user identity, role, and navigation.
- `401` means missing, expired, or invalid auth. Redirect or re-authenticate.
- `403` means authenticated but forbidden. Do not retry as if it were a network failure.

## Pagination, Filtering, And Sorting

- List endpoints expose `page`, `page_size`, and usually `sort`; use them on every table/list.
- Do not load all data into the browser for filtering unless the endpoint is explicitly small and non-paginated.
- Preserve backend filters in URL/state so users can refresh/share the same view.

## Optimistic Concurrency

- Workflow mutations use `expected_version`.
- A `409` response means the object changed after the frontend loaded it.
- On `409`, refetch detail/queue data and ask the user to reapply the action against the latest version.

## Error Shape

All API errors follow the shared shape:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "details": {},
  "request_id": "..."
}
```

Always keep `request_id` visible in logs/support views. Show field validation from `details.fieldErrors` when present.

## Rate Limits

- Business routes under `/api/v1/**` are rate-limited.
- `429` includes `Retry-After` and rate-limit headers.
- Disable tight retry loops. Wait for `Retry-After` before retrying.

## Money, Dates, IDs

- Money values are strings such as `"12500.00"`; do not use floating-point math for persisted values.
- Dates use ISO date strings for date-only fields and ISO 8601 timestamps for audit/events.
- UUIDs are strings; validate path params before making requests where possible.

## Documents

- Document APIs store metadata and authorize object access. The frontend never receives object storage credentials.
- Download URLs are short-lived sensitive values. Do not log or persist them longer than needed.
- Restricted classifications are backend enforced; hide UI controls when possible, but expect `403`.

## Expenses And Finance

- Current flow: Employee raises request -> Manager verifies -> Finance approves -> Payment release -> Bills/documents -> Manager document verification -> Settlement/closure.
- Manager assignment is relationship-based through backend Core user hierarchy and manager backup configuration.
- Requester self-processing is blocked for manager verification, finance approval, payment, document verification, and settlement.
- Return, reject, hold, and clarification decisions require remarks.
- Finance approval cannot start before manager verification.
- Settlement is blocked until required documents are present and manager-verified when policy requires them.

## Assets

- Public QR scan is safe and limited; use authenticated asset APIs for operational detail.
- Asset assignment and return are versioned workflow mutations and write audit evidence.
- License activation, validation, and revocation are backend-owned; do not store license secrets in frontend logs.

## Timesheets

- Work segments are employee-owned.
- Submission and approval decisions are workflow-backed and versioned.
- Approver queue is scoped by configured workflow definitions.

## Reports

- Reports are role-scoped. Do not combine unrelated endpoints to bypass finance/audit restrictions.
- Export creation returns backend job state; real accounting/export provider details remain server-side.
