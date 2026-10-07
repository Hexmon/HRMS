# Mobile App API Handoff

Last verified from the repository: 2026-10-05.

This handoff kit summarizes the backend API surface that a native employee mobile app can use at the start of Sprint 14. It is written for mobile engineers and QA engineers who need the current contract behavior without reading every backend route.

The canonical source of truth remains the committed OpenAPI contract at [`../../hrms_backend/docs/api/openapi.json`](../../hrms_backend/docs/api/openapi.json). The generated endpoint index at [`../../hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md`](../../hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md) is the quickest machine-generated route map. This document adds mobile-specific integration rules, retry behavior, and privacy boundaries.

## Contract Snapshot

The committed OpenAPI contract reviewed for this handoff is OpenAPI `3.0.3`, API version `0.1.0`, with 279 operations across 238 paths. The backend and frontend committed OpenAPI copies are expected to remain byte-for-byte aligned:

- `hrms_backend/docs/api/openapi.json`
- `hrms_backend/docs/api/frontend-contract/openapi.json`
- `hrms-client/docs/api/openapi.json`
- `hrms-client/docs/api/frontend-contract/openapi.json`

No OpenAPI regeneration, route change, schema change, service change, migration, package update, or source-code change is part of this handoff.

## Mobile Employee Endpoint Scope

These are the endpoints a native employee app should plan around first.

| Area | Method and Path | Mobile Use |
| --- | --- | --- |
| Auth | `POST /api/v1/auth/login` | Sign in and receive bearer token. |
| Auth | `POST /api/v1/auth/logout` | End current authenticated session. |
| Auth | `GET /api/v1/auth/me` | Load user, role, permission, company, navigation, and preferences context. |
| Device | `POST /api/v1/platform/devices` | Register this app installation as a mobile attendance device. |
| Device | `GET /api/v1/platform/devices` | List the employee's registered devices. |
| Device | `POST /api/v1/platform/devices/{deviceId}/revoke` | Revoke a registered device. |
| Attendance | `POST /api/v1/attendance/punches` | Submit an online employee punch command. |
| Attendance | `GET /api/v1/attendance/punches/my` | Read the employee's punch events. |
| Attendance | `GET /api/v1/attendance/summary/my` | Read the employee's attendance summary. |
| Attendance | `GET /api/v1/attendance/calendar/daily` | Read daily attendance calendar and self-evidence. |
| Attendance | `GET /api/v1/attendance/calendar/monthly` | Read monthly attendance calendar. |
| Attendance | `POST /api/v1/attendance/geo-fallbacks/{id}/submit` | Submit manual fallback after an eligible geo-related punch conflict. |
| Attendance | `POST /api/v1/attendance/regularizations` | Submit attendance regularization. |
| Attendance | `GET /api/v1/attendance/regularizations/my` | Read the employee's regularization requests. |
| Leave | `GET /api/v1/leave/balances/my` | Read leave balances. |
| Leave | `POST /api/v1/leave/requests` | Apply for leave. |
| Leave | `GET /api/v1/leave/requests/my` | Read the employee's leave requests. |
| WFH | `POST /api/v1/wfh/requests` | Apply for WFH. |
| WFH | `GET /api/v1/wfh/requests/my` | Read the employee's WFH requests. |
| Holidays | `GET /api/v1/holidays` | Read holiday calendar. |
| EMS | `GET /api/v1/ems/profile/me` | Read employee profile. |
| EMS | `PATCH /api/v1/ems/profile/me` | Update employee profile. |
| Notifications | `GET /api/v1/notifications` | List notifications. |
| Notifications | `GET /api/v1/notifications/unread-count` | Read unread count. |
| Notifications | `POST /api/v1/notifications/{id}/read` | Mark one notification read. |
| Notifications | `POST /api/v1/notifications/read-all` | Mark all notifications read. |
| Offline Attendance | `POST /api/v1/attendance/offline-sync` | Provisional offline batch sync only. See offline rules below. |

The employee mobile app should exclude manager queues, admin attendance configuration, geofence administration, payroll APIs, reporting and export APIs, audit APIs, and other admin-only routes from its first handoff scope.

The exact-location reveal endpoint, `POST /api/v1/attendance/geo-fallbacks/{id}/exact-location`, is not an employee mobile API. It is a manager/admin visibility flow gated by `attendance:view_exact_location`, record-level authorization, and audited exact-coordinate access.

## Authentication

Mobile clients should use bearer authentication:

```text
Authorization: Bearer <access_token>
```

`POST /api/v1/auth/login` accepts:

| Field | Required | Notes |
| --- | --- | --- |
| `email` | Yes | Email-formatted string. |
| `password` | Yes | Password string with minimum length 8. |
| `employee_code` | No | DEV-only fallback path. Do not build production mobile login around this field. |

Successful login returns HTTP 200 with:

| Field | Notes |
| --- | --- |
| `user` | Authenticated user profile summary. |
| `access_token` | Bearer token for subsequent API calls. |
| `expires_at` | Token expiry timestamp. |

`GET /api/v1/auth/me` returns the authenticated context, including `user`, `active_role`, `available_roles`, `permissions`, `navigation`, `company`, `preferences`, and `session_metadata`. Native clients can use the user, role, company, and permission pieces directly. Treat web navigation as optional context; do not require web route names for native screens.

`POST /api/v1/auth/logout` returns:

```json
{
  "status": "ok"
}
```

The backend also supports cookie-based web sessions, but native mobile should use bearer tokens. Bearer mobile requests do not use the web CSRF flow.

There is no refresh-token endpoint in the current contract. On a clear backend 401, re-authenticate the user and retry only when the original action is still pending under the retry rules below. Token secure storage, biometric unlock, and local session expiry UX are mobile app responsibilities.

## Registered Device Model

Mobile attendance depends on backend-registered devices. Register the installation before sending attendance punches or offline sync batches.

`POST /api/v1/platform/devices` request:

| Field | Required | Notes |
| --- | --- | --- |
| `installation_id_hash` | Yes | Lowercase SHA-256 hex string, exactly 64 characters, matching `^[0-9a-f]{64}$`. Send only a hash. Never send raw device IDs, installation IDs, or secrets. |
| `platform` | Yes | `ios` or `android`. |

This registration endpoint does not accept app version, OS version, a raw device ID, or a device secret.

Response behavior:

| Case | Result |
| --- | --- |
| First valid registration for this authenticated owner | HTTP 201. |
| Retry or same-owner lookup for an existing active device | HTTP 200. |
| Cross-owner, suspended, or revoked device conflict | HTTP 409. |

Response fields:

| Field | Notes |
| --- | --- |
| `registered_device_id` | UUID used by attendance and offline sync. |
| `platform` | `ios` or `android`. |
| `status` | `registered`, `suspended`, or `revoked`. |
| `status_changed_at` | Last status change timestamp. |
| `created_at` | Registration creation timestamp. |
| `updated_at` | Registration update timestamp. |

`registered_device_id` is the security-relevant device identity for mobile attendance. It maps to `device.registered_device_id` in online attendance and offline sync payloads.

The attendance `device` envelope also has `device_id`, `platform`, `app_version`, and `os_version` fields. Those are audit metadata only. They do not replace `registered_device_id`.

`POST /api/v1/platform/devices/{deviceId}/revoke` can receive an optional `reason` of `lost`, `replaced`, `user_requested`, `security`, or `administrative`.

## Online Attendance Punches

Use `POST /api/v1/attendance/punches` for online manual-now attendance actions.

Every request must include:

```text
Idempotency-Key: <client_event_id UUID>
```

The `Idempotency-Key` header must be a UUID and must equal the body `client_event_id`.

### Request Envelope

Use the canonical attendance command envelope.

| Field | Required | Notes |
| --- | --- | --- |
| `client_event_id` | Yes | Client-generated UUID. Generate once per logical attendance action. Must equal `Idempotency-Key`. |
| `captured_at` | Yes | ISO datetime with offset. This is client capture metadata only. The server controls the authoritative punch time. |
| `device` | Yes | Device envelope. Mobile attendance should include `registered_device_id`. |
| `command` | Yes | Attendance command details. |

Device envelope:

| Field | Required for Mobile Attendance | Notes |
| --- | --- | --- |
| `registered_device_id` | Yes | UUID returned by `POST /api/v1/platform/devices`. |
| `device_id` | No | Optional client device label or opaque app-local identifier, 1 to 128 characters. |
| `platform` | No | `web`, `ios`, or `android`; mobile should send `ios` or `android`. |
| `app_version` | No | 1 to 64 characters. |
| `os_version` | No | 1 to 64 characters. |

Command envelope:

| Field | Required | Notes |
| --- | --- | --- |
| `event_type` | Yes | `check_in`, `break_start`, `break_end`, or `check_out`. |
| `work_mode` | No | `office`, `remote`, `wfh`, or `field`; default is `office`. Mobile should send the user-selected value explicitly. |
| `source` | No | `web`, `web_geo`, `mobile`, or `kiosk`; default is `web`. Native online attendance should send `mobile`. `mobile_offline` belongs only to offline sync events. |
| `metadata` | No | Arbitrary online metadata. Do not put coordinates, client geofence results, or trusted decision outcomes here. |
| `location` | Conditional | Location evidence. For `web_geo`, location evidence is required. Native mobile should send available evidence without making trust decisions client-side. |

### Location Evidence

Coordinate evidence:

| Field | Required | Notes |
| --- | --- | --- |
| `latitude` | Yes | Number from -90 through 90. |
| `longitude` | Yes | Number from -180 through 180. |
| `accuracy_meters` | Yes | Number greater than or equal to 0. |
| `captured_at` | Yes | Date-time for the location reading. |
| `age_ms` | No | Integer greater than or equal to 0. |
| `provider` | No | `browser`, `device`, `network`, or `unknown`; default is `unknown`. |
| `permission_state` | No | `granted` or `unknown`; default is `unknown`. |
| `altitude_meters` | No | Optional altitude. |
| `is_mocked` | No | Optional mock-location signal. |
| `integrity_status` | No | Optional string, 1 to 80 characters. |

Failure evidence:

| Field | Required | Notes |
| --- | --- | --- |
| `permission_state` | Yes | `denied` or `unavailable`. |
| `captured_at` | No | Date-time for the failed attempt. |
| `age_ms` | No | Integer greater than or equal to 0. |
| `provider` | No | `browser`, `device`, `network`, or `unknown`. |
| `integrity_status` | No | Optional string, 1 to 80 characters. |

Failure evidence must not include latitude, longitude, or accuracy.

### Coordinate Request Example

```http
POST /api/v1/attendance/punches HTTP/1.1
Authorization: Bearer <access_token>
Content-Type: application/json
Idempotency-Key: 00000000-0000-4000-8000-000000000101
```

```json
{
  "client_event_id": "00000000-0000-4000-8000-000000000101",
  "captured_at": "2026-10-05T09:00:00+05:30",
  "device": {
    "registered_device_id": "00000000-0000-4000-8000-000000000301",
    "platform": "android",
    "app_version": "2026.10.0",
    "os_version": "Android 15"
  },
  "command": {
    "event_type": "check_in",
    "work_mode": "office",
    "source": "mobile",
    "metadata": {
      "client_timezone": "Asia/Kolkata",
      "capture_method": "foreground_button"
    },
    "location": {
      "latitude": 10.000001,
      "longitude": 20.000001,
      "accuracy_meters": 18,
      "captured_at": "2026-10-05T03:29:58Z",
      "provider": "device",
      "permission_state": "granted",
      "age_ms": 2000,
      "integrity_status": "device_reported"
    }
  }
}
```

### Permission Denied Request Example

```http
POST /api/v1/attendance/punches HTTP/1.1
Authorization: Bearer <access_token>
Content-Type: application/json
Idempotency-Key: 00000000-0000-4000-8000-000000000102
```

```json
{
  "client_event_id": "00000000-0000-4000-8000-000000000102",
  "captured_at": "2026-10-05T09:02:00+05:30",
  "device": {
    "registered_device_id": "00000000-0000-4000-8000-000000000301",
    "platform": "android",
    "app_version": "2026.10.0",
    "os_version": "Android 15"
  },
  "command": {
    "event_type": "check_in",
    "work_mode": "office",
    "source": "mobile",
    "metadata": {
      "client_timezone": "Asia/Kolkata",
      "capture_method": "foreground_button"
    },
    "location": {
      "captured_at": "2026-10-05T03:31:58Z",
      "provider": "device",
      "permission_state": "denied",
      "integrity_status": "permission_denied"
    }
  }
}
```

### Punch Response

A successful attendance command response includes:

| Field | Notes |
| --- | --- |
| `allowed` | Whether the command was allowed. |
| `command_id` | Backend command identifier. |
| `decision_id` | Backend decision identifier. |
| `session_id` | Attendance session identifier when applicable. |
| `punch_id` | Punch identifier when a punch was created. |
| `punch` | Punch summary. |
| `day_status` | Current day status projection. |
| `next_allowed_actions` | Next valid attendance actions. |
| `next_allowed_action` | Single next action when available. |
| `punch_policy` | Policy detail relevant to the decision. |
| `geo_policy` | Geo-policy detail relevant to the decision. |

Mobile-relevant `punch` fields include `id`, `employee_user_id`, `actor_user_id`, `event_type`, `occurred_at`, `work_mode`, `source`, and `origin`.

The server `occurred_at` is authoritative for payroll and attendance history. The client `captured_at` records when the app captured the action; it does not override server time.

Geo factual outcomes include `not_required`, `inside_confident`, `outside_confident`, `boundary_uncertain`, `stale_evidence`, `accuracy_exceeded`, `missing`, `permission_denied`, `location_unavailable`, and `fence_not_configured`.

Geo actions include `allow`, `deny`, and `manual_fallback`.

Known safe reason codes include `geo_inside_fence`, `geo_outside_fence`, `geo_stale_evidence`, `geo_accuracy_exceeded`, `geo_permission_denied`, and `geo_location_unavailable`. Mobile clients should display unknown future reason codes through a generic fallback instead of treating them as impossible.

## Error Handling

The canonical error shape is:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "details": {},
  "request_id": "req_..."
}
```

Representative mobile handling:

| HTTP | Code | Mobile Handling |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | Do not retry unchanged. Show a validation message or fix the client request. `details` may include field or form errors. |
| 401 | `UNAUTHORIZED` | Re-authenticate. A clear 401 means auth failed before the rejected route command was processed. |
| 409 | `WORKFLOW_CONFLICT` | Terminal for that submitted payload unless `details.manual_fallback.available` permits manual fallback. Details can include `reason_code`, `reason_detail`, `next_allowed_actions`, `punch_policy`, `geo_policy`, and conditional `manual_fallback`. |
| 429 | `TOO_MANY_REQUESTS` | Respect `details.retry_after_seconds` when present. |
| 500 | Server error | If the attendance outcome is uncertain, retry the exact same idempotency identity and body. |

Some OpenAPI examples reuse the generic `VALIDATION_FAILED` error example for 401 responses. Implementation helpers use `UNAUTHORIZED` for real authentication failures, so mobile handling should key off actual runtime responses.

## Attendance Idempotency And Retries

Server guarantees for attendance punch commands:

- `Idempotency-Key` is required.
- The header value must be a UUID and must equal the body `client_event_id`.
- Platform idempotency retention is 24 hours.
- Attendance also has durable replay by `client_event_id` beyond the platform window.
- Idempotency scope includes company and authenticated actor.
- The same canonical identity and same body replays the original business result.
- The same identity with a different payload returns a terminal 409 `WORKFLOW_CONFLICT`.
- Replayed responses include `Idempotency-Replayed: true`.
- Replayed responses use the current `x-request-id`.

Mobile client responsibilities:

- Persist the full pending attendance request body and idempotency key until the outcome is known.
- On timeout, network loss, app restart, or an uncertain response, resend the exact stored request.
- Do not rebuild a pending request with the current UI state, current GPS reading, or a new timestamp.
- Generate a new UUID only for a new logical attendance action.
- Suppress repeated taps while an attendance action is pending.

Authentication expiry handling:

- If the app receives a clear backend 401, the rejected request failed authentication before route command processing. Re-authenticate and continue from the pending-action state.
- If the app lost the response or cannot tell whether the command reached the backend, preserve the exact pending request, re-authenticate if needed, then retry the exact request.

## Manual Geo Fallback

Manual fallback is the employee-side continuation path for eligible geo-related attendance conflicts.

Flow:

1. Submit `POST /api/v1/attendance/punches`.
2. If the response is a 409 with `details.manual_fallback.available === true`, show a "continue manually" action.
3. Submit `POST /api/v1/attendance/geo-fallbacks/{id}/submit`, where `{id}` comes from the original 409 `details.manual_fallback.reference`.
4. Use a new `Idempotency-Key` for the fallback submission.
5. Send an empty JSON body.

Fallback submit request:

```http
POST /api/v1/attendance/geo-fallbacks/<reference>/submit HTTP/1.1
Authorization: Bearer <access_token>
Content-Type: application/json
Idempotency-Key: fallback-00000000-0000-4000-8000-000000000201
```

```json
{}
```

The fallback body is exactly `{}`. The schema allows no properties. The fallback submit idempotency key is a string with length 8 to 200; it does not have to reuse the original attendance `client_event_id`.

The success response uses the same `AttendancePunchCommandResponse` family and may include manual-fallback result details. If the response indicates `review_required`, show pending/review copy and refresh the attendance views.

Do not implement manager review or exact-location reveal as part of the employee mobile app.

## Attendance Reads And Self-Evidence

Use these reads after attendance actions and for employee history:

| Endpoint | Use |
| --- | --- |
| `GET /api/v1/attendance/summary/my` | Current employee summary. |
| `GET /api/v1/attendance/punches/my` | Employee punch event list. |
| `GET /api/v1/attendance/calendar/daily` | Daily calendar with self-evidence. |
| `GET /api/v1/attendance/calendar/monthly` | Monthly calendar. |

`GET /api/v1/attendance/calendar/daily` exposes employee-safe self-evidence. Safe fields observed in examples and service output include:

- Top-level evidence context such as `generated_at` and `date`.
- Day fields such as `work_date`, `status`, `day_classification`, `presence_state`, `punctuality_state`, `evidence_state`, `approval_kind`, `approval_state`, `payroll_state`, `regularization_status`, `in_time`, `out_time`, `hours`, `work_minutes`, `break_minutes`, and `detail`.
- `summary_sources[]` entries with `type` and `label`.
- `events[]` entries with `event_type`, `occurred_at`, `time`, `source`, `origin`, `work_mode`, `decision`, `geo`, and `regularization`.
- Decision fields such as `outcome`, `reason_codes`, and `reason`.
- Geo fields such as `outcome`, `reason_code`, `selected_action`, `work_site_name`, and `work_site_type`.
- Regularization status and operation summaries.

Employee mobile screens should avoid assuming access to raw latitude, longitude, internal evidence IDs, raw location snapshots, backend audit metadata, or manager exact-location state in routine attendance reads.

## Offline Sync

`POST /api/v1/attendance/offline-sync` is available for authenticated mobile offline batches, but it is provisional only.

Important behavior:

- The server derives company, actor, and employee from authentication.
- A registered device is required.
- Eligible events are stored as provisional offline records.
- Offline sync does not create punch events, attendance sessions, daily projections, payroll state, or other authoritative live attendance mutations.
- `accepted` means a provisional offline record was stored. It does not mean "offline punch succeeded" or "attendance was recorded normally."

Request envelope:

| Field | Required | Notes |
| --- | --- | --- |
| `contract_version` | Yes | Must be `attendance.offline_sync.v1`. |
| `batch_id` | Yes | UUID for the sync batch. |
| `device` | Yes | Device envelope. Service requires `registered_device_id`. |
| `events` | Yes | 1 to 50 events. |

Offline event fields:

| Field | Required | Notes |
| --- | --- | --- |
| `client_event_id` | Yes | UUID for the offline event. |
| `sequence` | Yes | Positive integer. Duplicate sequence values in a batch are invalid. |
| `command_kind` | Yes | `employee_manual_now`. |
| `captured_at` | Yes | ISO datetime with offset. |
| `source` | Yes | `mobile_offline`. |
| `event_type` | Yes | `check_in`, `break_start`, `break_end`, or `check_out`. |
| `work_mode` | No | Defaults to `office`; send explicit value when known. |
| `metadata` | No | Strict subset only. Do not include coordinates or trusted geo decisions. |
| `location` | No | Location evidence when available. |

Duplicate `client_event_id` values or duplicate `sequence` values inside a batch are invalid.

Response fields include `contract_version`, `batch_id`, `server_received_at`, and `results`.

Result status values include `accepted`, `replayed`, `conflict`, `rejected`, and `deferred`. Verification values include `unverified`, `review_required`, and `rejected`. `payroll_eligible` is always `false`.

Known reason codes include:

- `offline_sync.accepted_unverified`
- `offline_sync.replayed`
- `offline_sync.changed_body_conflict`
- `offline_sync.validation_failed`
- `offline_sync.processing_deferred`
- `offline_sync.sequence_gap`
- `offline_sync.sequence_out_of_order`
- `offline_sync.duplicate_sequence`
- `offline_sync.review_required`

The service can produce `deferred` for sequence gaps, out-of-order sequences, and deferred processing. Mobile copy should describe this as waiting for review or later processing, not as a completed attendance punch.

## Privacy And Exact Location Boundaries

Mobile may submit raw coordinates as one-shot attendance evidence for an employee action. The routine employee API surface does not return raw coordinates, internal location-evidence IDs, coordinate metadata, raw snapshots, or manager exact-location state.

Mobile clients must not:

- Put coordinates into `metadata`.
- Send client-side geofence verdicts as trusted backend decisions.
- Background-track location for this attendance API.
- Use the exact-location reveal endpoint.

Online attendance is modeled as one employee action plus one location evidence payload. The backend decides the geo outcome and records the audit trail.

## Admin Policy Placeholders

The current web admin mobile attendance policy card is not a live mobile runtime policy source. The placeholders currently show concepts such as:

- "Mobile backend pending"
- Require registered device
- Allow offline
- Device attestation mode

Those settings are read-only placeholders in the current frontend and are not saved or enforced as admin-configured mobile policy. Real runtime enforcement for mobile attendance and offline sync currently comes from backend ownership/status checks around `registered_device_id` plus attendance workflow rules.

The native mobile app should not query for, cache, or build behavior around those placeholder settings.

## Generated Types And SDK Guidance

Available contract sources:

- Committed OpenAPI JSON.
- Generated endpoint index.
- Backend Zod schemas in source.
- Internal `#shared` contracts.
- Hand-written web frontend API adapters and types.

Not currently available:

- A generated mobile SDK.
- A packaged public HRMS SDK/client.
- A packaged DTO library intended for mobile import.
- An OpenAPI-generated native mobile client committed to the repo.

Mobile teams may generate their own client and DTO types from [`../../hrms_backend/docs/api/openapi.json`](../../hrms_backend/docs/api/openapi.json). Pin generation to the committed contract used for the mobile build. Do not import backend internal modules, frontend source files, or web-only route helpers into the native app.

## Implementation References

Useful repository references:

| Topic | Reference |
| --- | --- |
| OpenAPI contract | [`../../hrms_backend/docs/api/openapi.json`](../../hrms_backend/docs/api/openapi.json) |
| Generated endpoint index | [`../../hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md`](../../hrms_backend/docs/api/frontend-contract/ENDPOINT_INDEX.md) |
| Attendance routes | [`../../hrms_backend/src/modules/attendance/routes.ts`](../../hrms_backend/src/modules/attendance/routes.ts) |
| Attendance command service | [`../../hrms_backend/src/modules/attendance/command-service.ts`](../../hrms_backend/src/modules/attendance/command-service.ts) |
| Offline sync contract | [`../../hrms_backend/src/modules/attendance/offline-sync-contract.ts`](../../hrms_backend/src/modules/attendance/offline-sync-contract.ts) |
| Platform device routes | [`../../hrms_backend/src/modules/platform/routes.ts`](../../hrms_backend/src/modules/platform/routes.ts) |
| Error helper behavior | [`../../hrms_backend/src/plugins/errors.ts`](../../hrms_backend/src/plugins/errors.ts) |
| Auth behavior | [`../../hrms_backend/src/plugins/auth.ts`](../../hrms_backend/src/plugins/auth.ts) |
| Contract verification tests | [`../../hrms_backend/src/__tests__/contracts.contract.test.ts`](../../hrms_backend/src/__tests__/contracts.contract.test.ts) |
| Web attendance API adapter | [`../../hrms-client/src/domains/attendance/api.ts`](../../hrms-client/src/domains/attendance/api.ts) |
| Web manual attendance hook | [`../../hrms-client/src/domains/attendance/use-manual-attendance-action.ts`](../../hrms-client/src/domains/attendance/use-manual-attendance-action.ts) |

## Mobile Build Checklist

- Use bearer auth and secure local token storage.
- Register the app installation with `POST /api/v1/platform/devices`.
- Store `registered_device_id` and include it in mobile attendance and offline sync payloads.
- Generate one `client_event_id` UUID per logical attendance action.
- Send the same UUID in `Idempotency-Key` and `client_event_id` for online attendance.
- Persist the full pending attendance payload until the outcome is known.
- Retry uncertain attendance actions by resending the exact stored payload.
- Treat server `occurred_at` as authoritative.
- Show manual fallback only when the 409 response advertises it.
- Treat offline sync `accepted` as provisional, never as a completed punch.
- Keep raw coordinates out of metadata and routine employee display state.
- Generate native mobile types from committed OpenAPI if desired; do not import repo-internal TypeScript modules into the native app.
