# TEN-S25-005 Admin persistence reproduction — 2026-11-11

Status: **Defect reproduced in isolated local infrastructure; remediation and task QA remain Not Tested.** Source checkout `87618f88`. Independent QA executed the probes; the lead independently traced the route and SQL flush paths. No hosted request, production data, repository code edit or human browser journey was involved.

## Environment and commands

- Local Docker PostgreSQL at `127.0.0.1:55432` and Valkey at `127.0.0.1:56379`; two uniquely named disposable PostgreSQL databases, one per probe. The scripts verified a loopback PostgreSQL host/port before reset. Existing ignored local test environment file supplied values; none are recorded here.
- Backend workdir: `/home/hexmon/Desktop/HRMS/hrms_backend` at `87618f88`.
- Create probe: `pnpm exec tsx /tmp/hrms-admin-persistence-qa-20261111.mjs`.
- Update probe: `pnpm exec tsx /tmp/hrms-admin-update-persistence-qa-20261111.mjs`.
- QA closed app instances and removed both disposable databases with `dropdb` inside the local Docker container; both commands exited 0. The second probe explicitly called the test fixture's `app1.store.persistence.flush()` to make the initial version-1 rows durable before sending updates. That call is **test setup**, not behavior of the Admin route.

## Observations

| Request through Admin API | HTTP and app1 memory | Direct SQL after response | Fresh app2 / audit |
| --- | --- | --- | --- |
| `POST /api/v1/admin/rbac/roles` with one permission | 200; new role and permission in app1 | `core.roles=0`, `core.role_permissions=0`; one durable `platform.outbox_events` row for the role aggregate | New role absent after app2 load. |
| `POST /api/v1/admin/master-data/departments` | 200; department in app1 | `core.departments=0`; one durable outbox row | Department absent after app2 load. |
| `POST /api/v1/admin/master-data/designations` | 200; designation in app1 | `core.designations=0`; one durable outbox row | Designation absent after app2 load. |
| `PATCH /api/v1/admin/rbac/roles/:id` then `PUT /api/v1/admin/rbac/roles/:id/permissions` on durable version-1 fixture | Both 200; app1 showed updated name/version 3 and new permission | SQL retained original name/version 1 and original permission | App2 loaded old role/permission. Admin audit included both update events. |
| `PATCH /api/v1/admin/master-data/departments/:id` and `/designations/:id` on durable version-1 fixture | Both 200; app1 showed updated names/version 2 | SQL retained original names/version 1 | App2 loaded old values. Admin audit included both update events. |

The second probe's app2 `GET /api/v1/admin/audit-log?page=1&page_size=100` returned 200 and all seven create/update/permission-replaced event types, including four changes absent from the core tables. This is a false durable audit trail for these Admin mutations.

## Source explanation and boundaries

- `hrms_backend/src/app.ts:244-256,278-307`: successful `/api/v1/admin/*` mutations select `platform` persistence flush.
- `hrms_backend/src/platform/postgres-data-store.ts:726-750,2845-3283`: platform flush writes platform tables and outbox, but does not call `flushCore`.
- `hrms_backend/src/platform/postgres-data-store.ts:2663-2745`: RBAC role/permission and department/designation SQL writes are in `flushCore`/`flushCoreMasterData`.
- Same-process Admin integration assertions do not establish restart durability. The independent probe checked the SQL rows and a second app load.
- These runs established the create and update/permission replacement paths in one process followed by a fresh one. They did **not** test simultaneous replicas, two tenants, a failed SQL transaction, browser interaction, or the eventual fix. Those remain required cases under S25-024 U/P/N/F and the transaction foundation.

Owner: Anurag Kumar. Proposed remediation task: TEN-S25-005 with TEN-S25-001 transaction foundation; preserve the asset task's separate migration ownership. The live Sprint 25 sheet is not connected in this chat, so no tracker row or case status has been changed.
