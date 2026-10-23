# Cloudflare background worker local QA — 2026-10-23

Status: local engineering evidence only; **not a hosted cutover or production signoff**.

## Scope and setup

- Vercel frontend and Render API remain the intended hosted applications; this run used a separate synthetic PostGIS/Valkey database, seeded Fastify API, local Wrangler Queue/Cron emulator, production frontend bundle, and Chromium browser in `infra/docker/docker-compose.cloudflare-e2e.yml`.
- The owner confirmed no service outside this repository currently consumes `hrms.*` Redis Streams. Reconfirm for the actual environment immediately before cutover.
- Browser/API/DB clocks were real. Only the local scheduled-event reference time was advanced by 48 hours to exercise an overdue attendance session without waiting for a natural five-minute Cron.
- Synthetic personas: E2 employee, E4 clean employee, D1 reviewer/manager. Expense creation was an authenticated API fixture; manager approval itself was performed in Chromium. No hosted data or credentials were used.
- Read-only hosted dev API probe on 2026-10-23: after a cold start, `/health/live` and `/health/ready` returned HTTP 200. Readiness reported PostgreSQL, Valkey, and object storage ready; it did not establish which providers or revision were deployed. `build_sha` was `dev`, so the actual Render commit remains unverified and must be recorded before cutover. No hosted user data was read or changed.

## Executed evidence

| Risk / journey | Observation |
| --- | --- |
| E2 personal attendance | Chromium clock-in, local scheduled auto-checkout, refreshed attendance page/calendar, dashboard, and daily report all showed one completed session. |
| E4 manual checkout/Cron race | Chromium manual checkout raced a scheduled event; the API/DB showed exactly one checkout punch and one closed session. |
| Post-deactivation, transfer, and deletion payroll closure | The HR owner chose auto-closure under the original company after deactivation, transfer, or employee soft deletion. Six PostgreSQL-backed attendance cases passed for active, inactive-employee, inactive-company, transferred-employee, removed-preference, and soft-deleted-employee states; each produced a single closed session and checkout punch. Transfer/removal used the immutable check-in policy snapshot. A separate legacy no-snapshot session passed after transfer and soft deletion using the original-company historical fallback. The scheduled sweep does not create a new session. |
| Manager expense approval | Chromium loaded the pending ticket, clicked Verify and Confirm, and then showed the ticket in Manager verified. This initially exposed an empty-history UI bug; the provider now fetches manager-history data. Final targeted browser rerun passed (1/1). |
| Outbox transport | Local Worker logged the bounded drain and event-Queue consumer; five seed/attendance events were `published` after the attendance browser run. `published` means Queue accepted the event, not that an external consumer performed a business side effect. |
| Coordinate retention | Inserted one synthetic expired location evidence row (id `89032186-a9dc-4b04-b31c-7311e54c660c`) with a separate synthetic attendance event. Authenticated `/internal/lag` reported one due row; local hourly scheduled event returned 200 and Worker logged `purged:1`. Latitude/longitude/altitude became null, raw payload became `{}`, a retention action was recorded, and a nonexpired seeded row remained intact. This was a DB/Cron drill, not a browser location-privacy journey. |
| Tenant isolation on exports | Added company identity to new export outbox events and company-scoped visibility for administrator/auditor and owner reads. Legacy events without a historical company marker fail closed pending reviewed backfill; a creator's current company would be unsafe after a transfer. A real PostgreSQL-backed integration test switched the administrator's company context and observed an empty export list and 403 for the other company's export. |
| Missing company context | Dashboard and attendance-report reads now reject an authenticated account without an active company context, rather than falling back to a process-start snapshot that could contain another tenant. Export creation also rejects this state. Dashboard/report API regression cases passed locally. |
| Production token exposure | The existing production-signup unit test caught a raw verification token when `NODE_ENV=production` but `APP_ENV=local`; the auth service now suppresses dev-only tokens whenever the runtime is production. Its targeted 22-test unit file passed after the fix. |
| Rollback race | Inactive Worker Queue messages are retried with a one-hour delay. Runbook now pauses both source Queue deliveries before deploying inactive; this still requires a hosted rollback drill. |
| Legacy Render service lifecycle | The Blueprint still declares the old worker for rollback, so the runbook requires Render auto-deploy/restart to be disabled before Cloudflare activation. CI can explicitly skip a nonexistent Render worker hook before cutover using the per-environment `*_RENDER_LEGACY_WORKER_PRESENT=false` variable; the default still requires the hook. |

A final fresh-stack Chromium run against the historical-subject fix passed **3/3** (auto-checkout 27.6s, manual-checkout/Cron race 14.9s, manager verification/history 15.6s). The Worker health endpoint reported `active:true` under the explicit local activation override. Follow-up PostgreSQL queries showed one system auto-checkout, two closed sessions for the test employees, and seven outbox rows published; E2 also has a separate seeded historical punch pair. Worker logs showed the attendance job closing one session with zero failures and both Queue consumers receiving the expected attendance and expense event IDs. The synthetic stack was stopped without deleting its final database volume.

## Automated gates

- Backend `pnpm lint`: passed (475 files) after the historical soft-deletion closure change.
- Backend `pnpm typecheck`: passed after the historical soft-deletion closure change.
- Backend unit: an initial aggregate run found the production-token exposure above (532/533); after the fix and final historical-subject changes, the latest aggregate unit phase passed **534/534** across 45 files.
- Backend contracts: the latest aggregate contract phase passed **27/27**. Explicit local test environment variables, a separate `TEST_DATABASE_URL`, and a 60-second contracts hook timeout were required for repeated PostgreSQL schema resets. Earlier attempts failed on missing test environment values or reset-hook timeouts/deadlocks while a browser stack was also active; those are not counted as passes.
- Generated Wrangler deployment config: `dev` inactive and `qa` active bundle dry-runs passed with an obviously synthetic Hyperdrive UUID, isolated Queue bindings, and the expected `WORKER_ACTIVE` value. This validates config/path/bundle shape only, not Cloudflare credentials or a real Hyperdrive connection.
- Open-session sweep index: migration `0064` applied to the isolated local main PostgreSQL database (1 new, 63 previously applied) in 39 ms; `pg_indexes` confirmed the partial `(checked_in_at, id)` index. The scalability verifier now requires it. No Neon migration was run.
- Targeted Cloudflare jobs, reports, and dashboard integration: **17/17** passed on the final tree. An earlier interrupted aggregate run had exposed a synthetic export fixture missing the now-required `company_id`; the corrected test is included in this passing targeted run.
- Targeted attendance payroll regression after the final historical-subject fix: 7/7 passed (six API check-in scenarios and one legacy direct-session scenario). The previously failing soft-deletion cases exposed an active-user guard in day projection; only the existing-session auto-closure path now permits a historical subject.
- Backend cross-schema-FK, quality, implementation, and scalability verifiers passed after the final historical-subject fix.
- Frontend `pnpm typecheck`, `pnpm lint` (0 errors, 43 pre-existing warnings), and production bundle were rerun before the final 3/3 browser pass and passed.
- Backend E2E project passed **1/1** on the final tree. Full backend `pnpm test` is **not passed**: its unit and contract phases passed, but the serial 53-file integration phase was deliberately interrupted after over 25 minutes without a final summary (exit 130) to complete the affected-domain checks and fresh browser flows. It must finish in CI or a stronger test runner before release. Do not count the interrupted integration phase as a pass. `verify:business`/`verify:regression` wrappers are also not signed off in this record.

## Remaining before release

1. Complete the entire backend loop in `AGENTS.md`, especially the full serial integration suite and redundant regression wrappers, and preserve the final exact results. The fresh isolated browser-stack rerun passed 3/3; add HR/administrator browser coverage in a target environment.
2. Provision isolated Cloudflare Worker/Queues/DLQs and cache-disabled Hyperdrive for the chosen environment; install the token and Render signal settings without committing secrets.
3. Perform staged inactive deployment, stop/verify any old Render poller, reconcile outbox IDs, activate the Worker, observe natural one-/five-/sixty-minute Cron runs, and drill DLQ replay and rollback.
4. Have people in employee, manager, HR and administrator roles execute the target-environment flows. Local automated browser coverage does not substitute for hosted human signoff. Review other process-snapshot readers and set operational alert thresholds with the owner.
5. Load-test the indexed five-minute open-session scan against expected tenant counts and Neon/Hyperdrive connection limits before production scale-up. The transactional index migration is nonconcurrent and may block writes while building; measure on a production-sized copy and use a reviewed low-traffic window or implement a concurrent-index migration path. Review the existing database membership rule separately: a company transfer is rejected while an employee-specific attendance-policy assignment (or shift assignment/instance) references the old membership. The Worker closes transferred sessions when a legitimate transfer is possible, but it does not change this transfer restriction.

Tracking workbook `/Users/anuragkumar/Desktop/Tasks/HRMS.xlsx` is not mounted in this workspace, so no tracker write was attempted.

## Target-environment human acceptance checks (not executed)

Use test tenants and test employees only. Before each scenario, capture the tenant, account, local timezone, expected cutoff, and UTC timestamp. Retain a screenshot or API response and a redacted DB/Queue observation; do not export real coordinates or payroll data into the QA artifact.

| Role / scenario | Human action | Expected result and failure evidence |
| --- | --- | --- |
| Employee cutoff | Clock in before the configured cutoff, leave the shift open, then return after a natural five-minute Cron. | Exactly one closed session and one auto-checkout punch; attendance page, calendar, dashboard and report agree on local work date. Record Worker invocation and punch IDs. |
| Employee race | Click manual checkout close to the cutoff while the scheduled job is processing. | One closed session and one checkout punch, never a second payroll punch. Record both request and job outcomes. |
| HR deactivation/deletion | Deactivate an employee and separately a company, and soft-delete a test employee while a previously valid session is open, then pass the cutoff. | Existing session still closes for payroll under its original company; no new session is created and no cross-company read is allowed. Verify audit trail. |
| HR transfer | Move an employee to another company while an old-company session remains open. | The old session closes under the original company using its check-in policy snapshot; a legacy no-snapshot session uses a marked historical fallback. If a direct policy/shift assignment blocks the transfer itself, record that distinct membership-rule failure for product review. |
| Manager expense | Approve a pending expense in the UI, then refresh pending and verified tabs. | Ticket leaves pending and appears once in verified; another company's manager cannot view or approve it. |
| Administrator export | Create an attendance export, switch active company, then request list and detail. | Export appears only in its original company. A legacy export without an immutable company marker is hidden pending reviewed backfill. |
| Location privacy | Submit a location-enabled attendance event with a short test retention policy; inspect the UI/API before and after the natural hourly Cron. | Evidence remains auditable but expired raw coordinates are nulled; nonexpired evidence remains intact. Verify retention action and absence from subsequent responses/exports. |
| Operations replay | Pause Queue delivery, induce a failed event, inspect the DLQ, replay with the same event ID, and rehearse inactive rollback. | No lost outbox row, duplicate business mutation, rapid inactive retry exhaustion, or simultaneous Render/Cloudflare pollers. Reconcile counts before and after. |

Human execution, hosted natural-Cron timing, performance thresholds, and alerts remain unsigned until the Cloudflare account and environment are available.
