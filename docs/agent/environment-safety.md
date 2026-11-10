# Environment And Execution Safety

## Local

Local Docker PostgreSQL and Valkey are the default development dependencies. Mock email and object storage are allowed only where the local environment documentation permits them. Local seed data must be synthetic.

## Hosted Development And QA

- Confirm the target URL, `APP_ENV`, database branch, Valkey service, object-storage prefix, and email-delivery mode before mutation.
- Use synthetic test identities and data. Do not copy production personal data into lower environments.
- Security, concurrency, recovery, load, and destructive scenarios require an isolated authorized environment and an explicit cleanup/recovery plan.
- Record the environment, actor, role, tenant, build SHA, request IDs, and time range in QA evidence.

## Production

- Read-only diagnosis does not authorize mutation.
- Deployment, migration, secret changes, data repair, seeding, worker activation, rollback, load testing, and security probing require explicit user authorization and the applicable runbook.
- Never run demo seeds or test automation that mutates business records.
- Production deployment requires protected-environment approval, verified backups where relevant, migration/rollback review, post-deploy health checks, and monitored recovery.
- Cloudflare worker activation must follow the inactive-first cutover workflow and must not overlap the legacy worker.

## Credentials And External Systems

- Keep secrets in provider or GitHub environment secret stores; use least-privilege, environment-scoped credentials.
- Never paste secret values into documentation, source, issues, commits, screenshots, or chat.
- Do not commit, push, deploy, send email, update a tracker, or modify third-party configuration unless that external action was explicitly requested.
