# Immutable audit company attribution — local QA, 2026-10-24

Status: local engineering evidence on branch `sprint-23/aud-s23-001`; **not hosted validation, human UAT, a production migration, or release signoff**.

Implementation commit: `2e607e4` (`fix(audit): preserve immutable company attribution`).

## Decision and risk

`CONFIRMED_BUSINESS_RULE` — owner decision on 2026-10-23: Admin and Auditor access to `/api/v1/reports/audit` is limited to the user's active company.

The prior implementation could not safely return asset and helpdesk history because those immutable events had no historical company marker. Outbox audit and report-export visibility also relied on mutable JSON payload fields. Inferring ownership from an actor's current company would misattribute historical rows after a transfer.

## Implemented rule

Migration `0065_audit_company_attribution.sql` adds nullable, indexed `company_id` snapshots to outbox, asset, asset-state, helpdesk-ticket, and helpdesk-event rows without adding prohibited cross-schema foreign keys. Database triggers enforce:

- a supplied company exists;
- company attribution cannot be changed after insertion;
- asset/helpdesk event attribution matches its parent record;
- outbox event identity, payload, tenant marker, and creation time are immutable while delivery/retry state remains mutable;
- helpdesk ticket events are immutable audit rows.

New asset and helpdesk records capture the actor's active company at creation. Their events copy the parent's original marker. Outbox creation is centralized and captures an explicit event-time company or a valid company already persisted in the event payload. Idempotent retries retain the first event and its original marker.

The audit route now loads outbox, asset, and helpdesk history from a request-local repeatable-read PostgreSQL snapshot filtered by the active company. Report-export list/detail checks use the immutable outbox column rather than mutable payload JSON.

## Legacy-row policy

The migration backfills an outbox row only when its persisted payload already contains a valid company UUID that exists in `platform.company_profiles`. It backfills asset/helpdesk child events only from a parent that already has a reviewed marker. It deliberately does **not** infer a legacy parent company's identity from the actor/requester's current company.

Ambiguous legacy rows retain `company_id = NULL` and fail closed from combined audit and report-export reads until a human-reviewed mapping is supplied. On the existing local development database after migration:

- outbox: 5 of 5 rows attributed from persisted evidence;
- asset state events: no rows present;
- helpdesk ticket events: 0 of 3 attributed because no trustworthy historical parent marker existed.

These local counts do not describe Neon or any hosted environment.

## Automated evidence

All commands below used local synthetic data and isolated local PostgreSQL/Valkey resources. No hosted provider was changed.

| Verification | Result |
| --- | --- |
| Focused report integration | 5/5 passed, including original-company visibility, company-switch isolation, fail-closed legacy rows, mismatched-company rejection, and immutable audit rows. |
| Focused assets/helpdesk/Cloudflare jobs integration | 19/19 passed. |
| Focused attribution and related unit coverage | 19/19 passed. |
| Backend typecheck and lint | Passed; lint covered 480 files. |
| Migration application | 1 new migration, 64 existing migrations, completed locally in 270 ms. |
| Migration history and no-cross-schema-FK verifier | Passed with 65 migrations. |
| Full backend unit suite | 539/539 across 46 files. |
| Contract suite | 27/27. |
| Full PostgreSQL integration suite | 347/347 across 53 files in 2623.42 seconds. |
| Backend E2E | 1/1. |
| Backend build | Passed. |
| Quality, implementation, scalability, and schema-drift gates | Passed; schema state was 0 pending / 65 ledger entries. |
| Full `verify:regression` rerun | Passed: unit 539/539, contracts 27/27, integration 347/347 in 2847.36 seconds, E2E 1/1, and all static gates. |
| Frontend typecheck, lint, and production build | Passed; lint reported 0 errors and 43 pre-existing Fast Refresh warnings. |
| Local Queue DLQ/replay on final implementation commit | Passed: six failed deliveries, one isolated healthy peer, and one same-body replay. |

The first `verify:regression` invocation stopped before tests because the shell did not provide the required isolated test environment. The corrected invocation completed and is the result recorded above. The three committed regression JSON files contain the corrected run timestamp and passing gate state.

## Automated browser journeys

A fresh Compose project, `hawkaii_hrms_audit_s23_20261024`, ran the production frontend bundle, Fastify API, PostgreSQL, Valkey, local Wrangler Worker, and Chromium. The corrected run passed 5/5 automated real-browser journeys in approximately 2.8 minutes:

1. employee clock-in followed by scheduled auto-checkout;
2. manual checkout racing the scheduled attendance sweep;
3. manager expense verification/history followed by administrator audit visibility;
4. HR deactivation followed by administrator payroll-report visibility;
5. browser geolocation capture followed by retention expiry and scheduled coordinate purge.

Two orchestration/configuration failures are retained for transparency:

- the first Compose orchestration used `--abort-on-container-exit`, so the successful one-shot migration container stopped the stack;
- the first browser run used a normal host-facing bundle whose API URL was `http://localhost:3001`; inside the browser container this was unreachable. Its 5/5 failures occurred before login requests reached the API. A local-only bundle using `http://hostmachine:3001` corrected the harness, after which all five journeys passed.

Final clean-run database observations:

- all 13 outbox rows were `published`; none were pending, retrying, or dead-lettered;
- each attendance test employee had one closed session and exactly one linked checkout punch;
- no expired location row retained coordinates;
- 9 of 13 outbox events carried company attribution; the remaining seed/global events were not exposed as tenant audit rows;
- Worker logs showed finite results, including attendance `scanned:1, closed:1, failed:0` and coordinate purge `purged:1`.

This was automated synthetic-user evidence, not human UAT. The stack was stopped without deleting the labeled synthetic volume.

## Loop and lifecycle review

The active Cloudflare Worker has bounded request, scheduled, and Queue-batch handlers. Repository review found:

- the endless interval poller only in `src/workers/run-outbox-worker.ts`, retained for Render rollback and excluded from the Cloudflare runtime;
- `for (;;)` in `attendance-auto-punchout-worker.ts`, which exits when the next database page is empty and is not invoked by the Cloudflare handler.

The deployment runbook must still stop and disable automatic restart of the legacy Render poller before hosted Worker activation. That is a deployment prerequisite, not part of this local implementation goal.

## Remaining external and human work

- Review and supply historical company mappings for ambiguous hosted asset/helpdesk/outbox rows before any backfill. Never derive them from current user membership after a transfer.
- Execute the migration and hosted smoke checks only through an approved environment rollout.
- Repeat role-based journeys with human owners in the target environment.
- Validate natural Cron timing, Hyperdrive/Neon behavior, hosted Queue/DLQ replay, alerts, load limits, rollback, and old-poller shutdown.

No Cloudflare, GitHub environment, Render, Vercel, Neon, Upstash, DNS, branch-promotion, or production-routing setting was changed during this work.
