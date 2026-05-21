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
- Default body contains `{ "email": "finance@example.test", "password": "LocalDev@123" }`.
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
