# Two API Instances: Asset Persistence Reproduction

Executed 2026-11-09 09:34 IST at revision `af89c6ac60fc32417ee2fcfea54399e0a0358411` plus dirty worktree. This is a **reproduced local data-consistency defect**, limited to the asset path and disposable PostgreSQL/Valkey test stack. No hosted endpoint or production record was touched.

## Environment And Command

From `hrms_backend/`, start the isolated QA PostgreSQL/Valkey containers, run the probe, then stop them:

```bash
DOCKER_CONTEXT=default pnpm test:infra:up
env -u DATABASE_URL -u TEST_DATABASE_URL -u VALKEY_URL HRMS_ENV_FILE=.env.test.example pnpm exec tsx ../qa-artifacts/hrms/discovery-2026-11-09/multi-instance-asset-probe.ts > ../qa-artifacts/hrms/discovery-2026-11-09/multi-instance-asset-probe.result.json
DOCKER_CONTEXT=default pnpm test:infra:down
```

The [probe source](multi-instance-asset-probe.ts) requires `127.0.0.1:55432/hrms_platform_test`, `127.0.0.1:56379`, local app mode, mock object uploads and log-only email. It resets only the disposable test database. Both instances load the same seeded asset before either business mutation. The first setup attempt stopped because the existing `buildRealApp` guard refused a second instance while its global `DATABASE_URL` pointed at the test database; the probe was changed to build the second instance without resetting. That setup failure is not a product result. The final run exited 0; containers were removed afterward.

## Action And Observed State

| Step | HTTP result | PostgreSQL asset row | Related assignment rows |
| --- | --- | --- | --- |
| Instance A assigns seeded asset to synthetic employee E1 | 200 | `Assigned`, version 2, assignee E1 | 1 |
| Instance B creates a separate synthetic asset from its stale startup store | 200 | Original asset reverted to `In Stock`, version 1, assignee null | 1 |

Exact machine-readable observations are in [the JSON result](multi-instance-asset-probe.result.json). The first successful assignment was overwritten by a later successful mutation to a **different** asset. The assignment row persisted, leaving it inconsistent with the asset row. Source mechanism: `app.ts:onSend` calls `flushDomain("assets")`; `postgres-data-store.ts:flushAssets` iterates all process-local assets and upserts each by ID without checking the database version. The second instance held the original asset at version 1 from startup.

The probe does not establish that every domain loses updates, nor does it test high concurrency, Redis failure, browser behavior or hosted scaling. It does establish that two API instances sharing the same PostgreSQL database can lose a successful asset update under a simple sequential interleaving. Remediation needs an inventory of every whole-domain flush and a safe transaction/concurrency design; follow with permanent regression coverage after the architecture change is approved.
