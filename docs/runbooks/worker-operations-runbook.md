# Background Worker Operations

Last reviewed from repository commit `8594bc3` on 2026-10-23. Hosted Cloudflare cutover has **not** been executed. For provisioning, activation, reconciliation, replay, and rollback, use the [Cloudflare cutover runbook](../deployment/cloudflare-worker-cutover.md); this page is the day-to-day index, not authority to activate a Worker.

## Current topology and transition

| Job | Before cutover: legacy Render worker | After reviewed cutover: Cloudflare Worker |
| --- | --- | --- |
| Outbox | `run-outbox-worker.ts` polls PostgreSQL and publishes `hrms.*` Redis Streams. No consumer is known; recheck before cutover. | One-minute Cron or best-effort API post-commit signal starts a bounded outbox drain. It sends durable `event_id` values to the business-event Queue, then marks accepted rows `published`. |
| Attendance auto-checkout | The long-running worker checks overdue sessions. | Five-minute Cron starts bounded session batches. The existing transactional attendance command evaluates the original company's effective policy and timezone; PostgreSQL row locks and idempotency prevent duplicate checkout punches. No Hyperdrive advisory lock is used. |
| Location cleanup | The long-running worker periodically purges expired coordinates. | Hourly Cron starts bounded transactional purge batches and continuation jobs. |

The Cloudflare Worker defaults to inactive until the cutover gate is completed. Its Queues may already exist during staging, but they should have no production traffic; an unexpected delivery is deferred for retry rather than processed. Do not run both publishers indefinitely. Upstash Redis remains in use by the Render API for sessions and rate limiting; it is not the intended event transport after cutover.

## Normal checks

1. Identify the target environment, deployed API and Worker revisions, and whether its Render legacy worker or Cloudflare Worker is active. Do not infer deployed state from repository configuration.
2. Check API readiness and the Worker's `/health` response. Query authenticated `/internal/lag` for pending outbox count/age, database `dead_letter` rows, open sessions, and expired unpurged coordinates. Monitor source Queue/DLQ backlog and Worker errors separately; a `published` outbox row means Queue acceptance, not downstream business completion.
3. If a job is delayed, compare the last successful natural one-, five-, or sixty-minute Cron run with PostgreSQL state and Queue attempts. Check Hyperdrive/Neon connectivity, Queue delivery pause state, and Render post-commit signal warnings. Do not reset rows or replay messages before identifying the affected event IDs and cause.
4. Confirm user-visible results: one closed attendance session and checkout punch under its original company; no duplicate payroll punch after retry; expired precise coordinates redacted with one retention action; expense approval visible to the authorized manager. Keep tenant and payroll/location data out of ordinary logs.

The `platform.outbox_events` states are `pending`, `retry`, `published`, and `dead_letter`. Database dead-letter rows and Cloudflare DLQ messages are different recovery surfaces. Follow the exact-ID replay procedures in the cutover runbook; never bulk-reset dead-letter rows.

## Local synthetic verification

The isolated Docker stack and browser command are documented under “Provision one isolated environment at a time” in the [cutover runbook](../deployment/cloudflare-worker-cutover.md). They use local PostGIS, Valkey, API, Wrangler Queue/Cron emulation, and synthetic users. Local success does not establish hosted Neon/Hyperdrive connectivity, natural Cron timing, or human acceptance.

For a legacy-only rollback drill, the old worker entrypoint remains `pnpm worker:start`; it must not be launched against an active Cloudflare publisher. Use the reviewed rollback sequence in the cutover runbook, including pausing both source Queues before deploying an inactive Worker.

## Escalation

If a worker threatens attendance, payroll, privacy, or tenant integrity, pause the appropriate delivery path without deleting Queue/DLQ contents, preserve affected IDs and redacted logs, and keep the API available only if safe. Record the failure and recovery evidence with the SRE/HR owner before resuming. Do not claim production readiness until hosted cutover, natural Cron, DLQ/rollback, and human UAT evidence are signed off.
