# Attendance Client Event And Idempotency Standard

This backend standard applies to client-originated self-service attendance punch commands:

`POST /api/v1/attendance/punches`

It also summarizes the implemented event-level identity rules for:

`POST /api/v1/attendance/offline-sync`

## Client Identity

- `Idempotency-Key` is required and must be a UUID.
- Body `client_event_id` is required and must be the same UUID as `Idempotency-Key`.
- The client generates the UUID once for one logical attendance action.
- The same UUID and exact canonical command payload must survive HTTP retries, application restarts, offline queue persistence, and later synchronization.
- A new logical attendance action requires a new UUID.
- Clients must never generate a new `client_event_id` merely because a request timed out.

## Retryable Outcomes

Clients may retry with the same UUID and the same canonical command payload after:

- network interruption;
- client timeout;
- HTTP `408`;
- HTTP `429`, respecting `Retry-After` when present;
- temporary `5xx` responses.

## Terminal Outcomes

Clients must treat these outcomes as terminal for the logical action:

- successful response;
- replayed response with `Idempotency-Replayed: true`;
- persisted attendance business denial;
- validation failure;
- workflow/idempotency conflict;
- client-event reuse conflict.

Business denials are processed command results and must not be retried indefinitely.

## Replay Semantics

Replay is semantic business-response replay, not byte-for-byte transport replay.

- The original business status and stored business response semantics are preserved.
- The current HTTP request receives its own `x-request-id`.
- `Idempotency-Replayed: true` is emitted only on replay.
- The header is omitted on first execution.

Durable `client_event_id` replay protects retries even after the 24-hour `platform.idempotency_keys` window expires.

## Offline Synchronization

Offline sync is implemented at:

`POST /api/v1/attendance/offline-sync`

Offline batches do not send a top-level `Idempotency-Key`. Replay identity is
per event through `client_event_id`, with company, actor, employee, and device
context derived from authenticated server-side context and the registered mobile
device path.

The top-level `batch_id` is transport correlation metadata. It must not replace
event-level replay identity.

Each event includes:

- `client_event_id`
- `sequence`
- `command_kind: "employee_manual_now"`
- `captured_at`
- `source: "mobile_offline"`
- event/work mode
- optional strict metadata
- optional location evidence

The submitted batch must not contain duplicate `client_event_id` or duplicate
`sequence` values. Per-event results use `accepted`, `replayed`, `conflict`,
`rejected`, or `deferred` with the matching verification status and reason code.

Offline event hashes use the same canonical sorted-JSON SHA-256 behavior as
current attendance command request and response hashes: object keys are sorted
recursively and array order remains significant.

The current contract is documented in
`docs/api/OFFLINE_ATTENDANCE_SYNC_CONTRACT.md` and the generated OpenAPI
operation examples.
