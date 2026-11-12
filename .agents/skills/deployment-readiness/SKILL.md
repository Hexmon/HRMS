---
name: deployment-readiness
description: Assess and prepare Hawkaii HRMS changes for safe dev, QA, or production deployment across Vercel, Render, Neon, Upstash, private Cloudflare R2, Resend, and Cloudflare Workers. Use for deployment/configuration/cutover work; it does not authorize deployment.
---

# Deployment Readiness

1. Read `docs/agent/environment-safety.md`, the environment matrix, deployment/rollback runbooks and affected provider configuration. Identify the exact branch, environment, build SHA, services and data stores.
2. Inventory code, migrations, backfills, secrets/variables, generated contracts, worker/queue/cron changes, compatibility order, external dependencies, monitoring and rollback implications.
3. Verify strict environment separation for database, Valkey, object storage, email and worker resources. Use least-privilege, environment-scoped credentials; never record secret values.
4. Run `scripts/agent/verify-full.sh` and relevant provider dry runs. Record missing browser UAT, human approvals, backups, DNS, credentials or hosted access as blockers.
5. For Cloudflare cutover, deploy inactive first, verify configuration/secret binding and queue/DLQ behavior, stop the legacy Render worker, reconcile the outbox, then activate exactly once with monitoring and rollback prepared.
6. Produce a go/no-go evidence report with prechecks, deployment order, smoke checks, monitoring, rollback triggers and owners. Execute deployment only when explicitly requested and authorized.
