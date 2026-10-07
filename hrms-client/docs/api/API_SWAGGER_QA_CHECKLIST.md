# API Swagger QA Checklist

Date: 2026-05-01

## Start Docker QA

```bash
pnpm docker:qa:up
```

Open `http://localhost:3101/docs`.

## Auth/Login

- Auth & Sessions group is visible.
- `POST /api/v1/auth/login` opens.
- Try it out shows request body editor.
- Default body contains `{ "email": "finance@example.test", "password": "LocalDev@123" }`; if `LOCAL_DEMO_PASSWORD` differs, use that env value instead.
- Execute valid Finance Manager login returns 200 and `access_token`.
- Execute with no body returns `400 VALIDATION_FAILED`.
- Execute with `{}` returns `email` and `password` field errors.
- `request_id` appears on errors.

## Tag Groups

Confirm these groups are readable:

- Platform / Health
- Auth & Sessions
- Core / Employees & Hierarchy
- Expenses / Requester
- Expenses / Manager
- Finance Management
- Documents
- Assets
- Timesheets
- Reports & Analytics
- Outbox / Platform Events
- Admin / Configuration

## Priority API Groups

- Finance Management has queue, detail, verify/hold, payment, settlement, analytics, reports, audit.
- Documents has list, upload metadata, expense document upload, detail, download URL, verify, access log.
- Expenses workflow has create, my list, manager queue/action, finance approval, timeline/audit.
- Core hierarchy subtree is named as hierarchy/subordinate lookup and shows `summary`, `total_active_descendants`, `max_depth`, and row `depth`.
- Expense timeline shows `event_type`, `label`, `stage`, `actor_name`, `status_from`, and `status_to`, without raw audit payload fields.
- Assets has safe QR scan, inventory, assignment, return, license activation/validation/revoke.
- Timesheets/Core/Reports/Health groups are present and tagged.

## Security And Error Docs

- Protected endpoints show session cookie/bearer security.
- Login, health, OpenAPI JSON, and safe QR scan are public.
- OCC mutations document `409`.
- Common error schemas show `code`, `message`, `details`, `request_id`.
- No secrets or production credentials appear in examples.

## Attendance Sprint 13 Examples

- `POST /api/v1/attendance/punches` shows the command envelope.
- Browser web examples show `device: null`.
- `Idempotency-Key` equals `client_event_id` for online punch examples.
- `web_geo` coordinate evidence uses provider `browser`.
- `web_geo` denied/unavailable evidence contains no `latitude`, `longitude`, or coordinate pair.
- Online mobile examples use `source: "mobile"` and a non-null `device.registered_device_id`.
- Offline sync examples use `contract_version: "attendance.offline_sync.v1"` and no top-level `Idempotency-Key`.
- Offline sync documents one to 50 events, event `sequence`, event-level `client_event_id`, and accepted/replayed/conflict/deferred outcomes.
- Routine safe geo evidence summaries contain no raw coordinates.
- Exact-location reveal is documented separately as privileged, audited, and permission-gated.
- Exact-location permission denial is a `403` error envelope, not a `200` response with null coordinates.
- Daily self-evidence examples contain `self_evidence`, `summary_sources`, events, safe geo context, and regularization relationships without raw coordinates.
- Regularization examples use canonical `items` with `add`, `replace`, `void`, and mixed operations.
- Regularization decision examples include `expected_version`, and return/reject examples include required remarks.
- Manager queue/actionability examples document `can_decide` and `allowed_decisions`.
- Error examples use the common envelope and include validation, idempotency/workflow conflict, self-approval blocked, and exact-location denied cases.
- Backend and frontend-contract OpenAPI artifacts are synchronized after generation.
