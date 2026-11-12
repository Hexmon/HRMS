# Private Media Storage Runbook

Last updated from the repository: 2026-11-12.

This runbook covers the private Cloudflare R2 adapter used for document, profile-photo, company-logo and future generated-export bytes. It does not authorize a deployment or claim the still-blocked document lifecycle is production-ready.

## Architecture Summary

- Clients send bytes to the authenticated backend; browser preprocessing is only user feedback.
- The backend validates request limits and policy before calling the storage port.
- Hosted environments use separate private R2 buckets through the S3 API. Public development URLs and public custom domains must remain disabled.
- Object keys are opaque and immutable. Public responses must not contain keys, bucket names, endpoints, provider URLs or credentials.
- Authorized clients fetch bytes from `/api/v1/documents/{id}/content`; the frontend first performs an authenticated byte request and then creates a short-lived browser-local blob URL.
- The adapter implements bounded PUT/GET/HEAD/DELETE. Missing GET/HEAD returns missing; missing DELETE is idempotent; authorization, throttling, timeout and server errors remain failures.
- Generic PostgreSQL document routes and generated exports remain fail closed pending immutable tenant ownership and durable upload/purge materialization. Do not remove those fences during storage troubleshooting.

## Environment Keys

Hosted backend API and worker:

- `OBJECT_STORAGE_DRIVER=r2`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_REQUEST_TIMEOUT_MS` (default 10000, allowed 500–60000)
- `R2_FORCE_PATH_STYLE=false`

`R2_ENDPOINT` is allowed only for isolated local S3-compatible integration. Hosted QA/production reject it and derive the Cloudflare endpoint from the account ID.

Local unit/E2E runs may use `OBJECT_STORAGE_DRIVER=memory`. Hosted QA and production reject memory storage.

## Cloudflare Provisioning Checklist

1. Create one private bucket per environment. Do not share dev, QA and production.
2. Keep the bucket public development URL disabled and do not attach a public custom domain.
3. Create environment-specific S3 credentials limited to the intended bucket and required object operations.
4. Store the account, key, secret and bucket values in the matching Render environment for both API and worker.
5. Never place R2 credentials in Vercel/frontend variables, GitHub logs, screenshots, commits or chat.
6. Verify `/health/ready` reports object storage healthy without returning provider details.

## Authorized Non-Production Smoke

Use synthetic data only after the tenant-owned document route for that class is available:

1. Log in as an allowed role in Company A.
2. Upload one small permitted file and record only the HRMS document ID.
3. Refresh or restart the first API instance and fetch bytes through a second instance.
4. Compare exact byte hash and content type.
5. Attempt the same document ID as every denied Company B role and assert denial before any R2 command.
6. Delete through the approved lifecycle, then verify safe missing behavior and immutable audit evidence.
7. Inspect API JSON, browser network/DOM and logs for absence of bucket, key, endpoint, credential and provider URL.

Do not use current generic PostgreSQL document routes for this smoke while the immutable-tenant-ownership fence returns 409.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Startup/readiness fails | Driver, account ID, private bucket name, credential scope, endpoint derivation and request deadline. |
| Safe 409 before upload/read | Expected tenant-ownership or lifecycle fence; do not bypass it to test R2. |
| 404 from content | Metadata/object consistency and exact opaque key; do not disclose the key in tickets. |
| Dependency failure | Distinguish timeout, 401/403, 429 and 5xx from missing; inspect sanitized service telemetry. |
| Works in local memory only | Hosted bucket credentials/binding and private-bucket policy were not verified. |
| Logo/photo not visible | Document ID linkage and authenticated byte request; provider URLs are intentionally unsupported. |

## Safety And Recovery

- Never enable public bucket delivery for protected files.
- Never log or return credentials, endpoint, bucket or key.
- Never list or bulk-delete a bucket during ordinary recovery.
- Do not treat a timed-out PUT as proof that no object exists.
- Do not hard-delete bytes before a durable tombstone/purge intent exists.
- Object-success/database-failure reconciliation, replacement CAS, retention/hold and purge retry remain TEN-S25-021/022 blockers. Until they land, storage-adapter success alone is not production readiness.
- Roll back compatible API and worker binaries together; prefer forward repair to destructive object cleanup.
