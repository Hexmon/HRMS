# API Error Response Guide

Date: 2026-05-01

## Common Shape

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "details": {},
  "request_id": "601fe7b7-6361-463e-ae66-5d972673dd27"
}
```

`details` is optional. Validation errors use Zod-style:

```json
{
  "formErrors": [],
  "fieldErrors": {
    "expected_version": ["Invalid input: expected number, received undefined"]
  }
}
```

## Important Status Codes

| Status | Meaning | Consumer action |
|---|---|---|
| `400` | Invalid request or business precondition | Fix fields, required remarks, state, or payload |
| `401` | Missing/invalid auth | Login and send bearer token or cookie |
| `403` | Role/object policy denial | Show forbidden state; do not retry blindly |
| `404` | Resource not found or not visible | Check id and object access |
| `409` | OCC conflict | Refresh latest record/version and retry |
| `429` | Rate limit exceeded | Wait for `Retry-After` seconds and retry safely |
| `500` | Unexpected server error | Capture `request_id` and report defect |

## OCC Conflict Example

```json
{
  "code": "WORKFLOW_CONFLICT",
  "message": "The ticket was modified by another actor. Refresh and retry.",
  "request_id": "..."
}
```

## Forbidden Example

```json
{
  "code": "FORBIDDEN",
  "message": "Forbidden",
  "request_id": "..."
}
```

## Rate Limit Example

The API protects business routes with request rate limits. Health checks, Swagger UI, and OpenAPI JSON are exempt.

Default local limits:

- Auth login: 10 requests per minute per IP.
- Public asset scan: 60 requests per minute per IP.
- General read APIs: 120 requests per minute per authenticated user or IP.
- Mutating APIs: 60 requests per minute per authenticated user or IP.

When the limit is exceeded, the API returns `429` with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

```json
{
  "code": "TOO_MANY_REQUESTS",
  "message": "Too many requests. Please wait and try again.",
  "details": {
    "retry_after_seconds": 60
  },
  "request_id": "..."
}
```

Consumers should avoid tight retry loops and wait at least the documented retry interval.

## Attendance Examples

Attendance APIs use the same envelope. Representative domain examples:

Validation failure:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "command.location": ["location is required when source is web_geo."]
    }
  },
  "request_id": "601fe7b7-6361-463e-ae66-5d972673dd27"
}
```

Idempotency or workflow conflict:

```json
{
  "code": "WORKFLOW_CONFLICT",
  "message": "Attendance command conflicts with an existing command. Retry with a new idempotency key.",
  "details": {
    "reason_code": "idempotency_conflict"
  },
  "request_id": "601fe7b7-6361-463e-ae66-5d972673dd27"
}
```

Self approval blocked:

```json
{
  "code": "SELF_APPROVAL_BLOCKED",
  "message": "Users cannot approve, return, or reject their own attendance regularization.",
  "request_id": "601fe7b7-6361-463e-ae66-5d972673dd27"
}
```

Exact attendance location denial:

```json
{
  "code": "FORBIDDEN",
  "message": "Exact attendance location access requires additional authorization.",
  "request_id": "601fe7b7-6361-463e-ae66-5d972673dd27"
}
```

Exact coordinate permission denials are `403` responses. They are not `200`
responses with null coordinates.

## Defect Reporting

Always include:

- endpoint and method
- persona/employee code
- request payload without secrets
- response status and body
- `request_id`
- Docker QA timestamp
