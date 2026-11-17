# Sprint 25 Current-Source Boundary Check

Executed 2026-11-09 on branch `sprint-25/saas-s25-001`, source commit `6a8d11f7063484a0a992b4426dc108b286983b5b`, with only documentation/inventory changes in the worktree. This evidence supersedes neither the original probes nor their stated limits.

## Synthetic in-memory API checks

Commands from `hrms_backend/` used the tracked QA example values only as parser inputs and forced local app mode, mock uploads, disabled email, and cleared inherited cloud connection variables:

```bash
env -u DATABASE_URL -u TEST_DATABASE_URL -u VALKEY_URL APP_ENV=local CLOUDINARY_MOCK_UPLOADS=true EMAIL_DELIVERY_MODE=disabled HRMS_ENV_FILE=.env.qa.example pnpm exec tsx ../qa-artifacts/hrms/discovery-2026-11-09/tenant-boundary-probe.ts
env -u DATABASE_URL -u TEST_DATABASE_URL -u VALKEY_URL APP_ENV=local CLOUDINARY_MOCK_UPLOADS=true EMAIL_DELIVERY_MODE=disabled HRMS_ENV_FILE=.env.qa.example pnpm exec tsx ../qa-artifacts/hrms/discovery-2026-11-09/admin-settings-cross-company-probe.ts
```

Both exited 0. The tenant probe returned HTTP 200 for B's A helpdesk/project detail requests and included A's assigned asset in B's asset list. The Admin settings probe changed the synthetic B setting from minimum password length 10 to 11; after a direct test-fixture preference reassignment, A read 11 and version 2. This preference reassignment is **not** the approved two-HR transfer workflow. Both checks use Fastify injection and a seeded process-local store; they do not establish PostgreSQL, browser or hosted behavior.

The first rerun with the default `.env.test` failed before executing because that file is absent. A rerun using `.env.qa.example` alone failed local employee-code login because QA mode disables that shortcut. The successful commands above set `APP_ENV=local`, matching the synthetic probe's login path. These setup failures are not product results.

## PostgreSQL verification gap

`timeout 8s docker info --format '{{.ServerVersion}}'` initially received sandbox socket permission denial. An approved unsandboxed retry returned `Cannot connect to the Docker daemon` on the Docker Desktop socket. Therefore the prior two-instance PostgreSQL asset result in `multi-instance-asset-probe.evidence.md` was **not rerun** on this branch. Current source still calls `flushDomain("assets")` from `app.ts:onSend` and `flushAssets` still iterates all hydrated assets with an unconditional `ON CONFLICT (id) DO UPDATE`; this supports persistence of the mechanism, not a fresh runtime result.

## Scope

No hosted endpoint, real tenant, persistent production database, real external email, or real object store was accessed. No browser or human-role journey was run. The complete BOLA/role matrix, concurrent writes, Redis outage, worker DLQ replay and load tests remain open.
