# Private Media Storage Runbook

Last updated from the repository: 2026-11-12.

This runbook covers the private Cloudflare R2 adapter and TEN-S25-021 durable media lifecycle used for generic employee documents, profile photos and active-company logos. It does not authorize a deployment. Expense receipts and physical purge remain separately blocked.

## Architecture Summary

- Clients send bytes to the authenticated backend; browser preprocessing is only user feedback.
- The backend validates request limits and policy, then commits a tenant-scoped upload intent before calling the storage port.
- Hosted environments use separate private R2 buckets through the S3 API. Public development URLs and public custom domains must remain disabled.
- Object keys are opaque and immutable. Public responses must not contain keys, bucket names, endpoints, provider URLs or credentials.
- Authorized clients fetch bytes from `/api/v1/documents/{id}/content`; the frontend first performs an authenticated byte request and then creates a short-lived browser-local blob URL.
- The adapter implements bounded PUT/GET/HEAD/DELETE. TEN-S25-021 never calls DELETE: replacement and logical removal retain bytes pending TEN-S25-022 policy.
- Publication is a second PostgreSQL transaction that locks the intent and parent, revalidates live company/role/version/pointer state, inserts active metadata/version, switches the pointer, marks the old row replaced and commits audit/outbox together.
- A timed-out PUT is resolved by HEAD of the exact preallocated opaque key. Queue/Cron reconciliation leases bounded batches with `SKIP LOCKED`; it does not loop forever or purge bytes.
- Expense receipt upload remains `409` pending its approved uploader/status matrix. Unsupported generic parent types remain fail closed.

## Environment Keys

Hosted backend API and worker:

- `OBJECT_STORAGE_DRIVER=r2`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_REQUEST_TIMEOUT_MS` (default 10000, allowed 500–60000)
- `R2_FORCE_PATH_STYLE=false`
- Cloudflare Worker R2 binding `MEDIA_BUCKET` (environment-specific private bucket; this is a binding name, not a secret value)

`R2_ENDPOINT` is allowed only for isolated local S3-compatible integration. Hosted QA/production reject it and derive the Cloudflare endpoint from the account ID.

Local unit/E2E runs may use `OBJECT_STORAGE_DRIVER=memory`. Hosted QA and production reject memory storage.

## Cloudflare Provisioning Checklist

1. Create one private bucket per environment. Do not share dev, QA and production.
2. Keep the bucket public development URL disabled and do not attach a public custom domain.
3. Create environment-specific S3 credentials limited to the intended bucket and required object operations.
4. Store the S3 account/key/secret/bucket values in the matching Render API environment. Bind the same environment's private bucket to the Worker as `MEDIA_BUCKET`; the Worker does not need long-lived S3 credentials for HEAD recovery.
5. Never place R2 credentials in Vercel/frontend variables, GitHub logs, screenshots, commits or chat.
6. Verify `/health/ready` reports object storage healthy without returning provider details.

## Authorized Non-Production Smoke

Use synthetic data only after the tenant-owned document route for that class is available:

1. Log in as an allowed role in Company A.
2. Upload one small permitted file and record only the HRMS document ID.
3. Refresh or restart the first API instance and fetch bytes through a second instance.
4. Compare exact byte hash and content type.
5. Attempt the same document ID as every denied Company B role and assert denial before any R2 command.
6. Remove through the logical lifecycle, then verify the pointer is cleared, metadata is tombstoned, bytes are retained and immutable audit evidence exists. Do not expect provider deletion.
7. Inspect API JSON, browser network/DOM and logs for absence of bucket, key, endpoint, credential and provider URL.

Use only the supported `core_user` generic parent, active-company logo and profile-photo paths. Expense receipts and untyped generic parents intentionally return `409`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Startup/readiness fails | Driver, account ID, private bucket name, credential scope, endpoint derivation and request deadline. |
| Safe 409 before upload/read | Missing/stale idempotency/version/pointer headers, unsupported parent type, or expected tenant/lifecycle fence; do not bypass it to test R2. |
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
- Object-success/database-failure reconciliation and replacement CAS are TEN-S25-021 behavior. Retention, legal hold and permanent purge remain TEN-S25-022 blockers; no operator should manually delete retained lifecycle bytes.
- Roll back compatible API and worker binaries together; prefer forward repair to destructive object cleanup.

## Rollback And Recovery

1. Set `WORKER_ACTIVE=false` or pause Queue delivery before rolling back the Worker. Do not remove the `MEDIA_BUCKET` binding or bucket.
2. Roll back API and Worker binaries together. The additive `0071_document_media_lifecycle.sql` tables/columns and committed intents must remain in place; do not down-migrate them.
3. Keep all objects. A committed `prepared`, `uploading`, `retry_wait` or `object_confirmed` intent is recovery evidence, not an orphan-deletion instruction.
4. After forward recovery, re-enable bounded reconciliation and verify intent/audit/outbox counts before accepting new uploads.
5. If ownership is ambiguous, keep the row quarantined. Use an independently reviewed forward repair with `document_owner_repair_audit`; never update `company_id` ad hoc.
