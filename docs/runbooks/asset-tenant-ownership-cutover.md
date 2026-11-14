# Asset Tenant Ownership Cutover

This runbook is a draft deployment dependency for TEN-S25-010. It is not authorization to modify QA or production. The cutover is deliberately two-phase because existing asset roots do not contain trustworthy company ownership.

## Safety And Required Inputs

- Obtain release-owner approval, a tested database backup, an application-write maintenance window, and the exact candidate SHA.
- Stop every old API and worker capable of writing asset tables. Migration 0069 changes uniqueness and ownership rules; mixed old/new writers are unsafe.
- Never infer historical ownership from a current employee company preference, current assignee, first company, or default company.
- A human data owner must verify each existing asset, request, and vendor against authoritative company records and retain a non-sensitive verification note.
- Use a dedicated QA copy first. Do not paste personal data, credentials, document contents, or secrets into mapping notes.

## Phase 0 — Read-Only Inventory

Run these queries before migration 0068. Record the exact database, timestamp, row counts, candidate SHA, and reviewer.

```sql
SELECT 'asset' AS resource_type, id AS resource_id, asset_code AS reference, status, deleted_at
  FROM assets.assets
UNION ALL
SELECT 'request', id, request_code, status, deleted_at
  FROM assets.asset_requests
UNION ALL
SELECT 'vendor', id, name, status, deleted_at
  FROM assets.software_vendors
ORDER BY resource_type, resource_id;

SELECT 'asset' AS resource_type, count(*) AS rows FROM assets.assets
UNION ALL SELECT 'request', count(*) FROM assets.asset_requests
UNION ALL SELECT 'vendor', count(*) FROM assets.software_vendors;
```

Every inventory row, including soft-deleted history, requires one verified company. A zero-row result is valid for a fresh database.

## Phase 1 — Install And Populate The Verified Map

1. Apply migration `0068_asset_tenant_ownership_map.sql` by the approved migration mechanism. Confirm it is recorded before proceeding.
2. Populate only operator-verified roots. Use parameterized tooling or reviewed SQL; the shape below is illustrative and contains no real identifiers.

```sql
INSERT INTO assets.asset_tenant_ownership_map (
  resource_type,
  resource_id,
  company_id,
  verification_note,
  verified_by_user_id
) VALUES
  ('asset',   '<asset-uuid>',   '<company-uuid>', 'verified from approved inventory register', '<reviewer-user-uuid>'),
  ('request', '<request-uuid>', '<company-uuid>', 'verified from approved request record',      '<reviewer-user-uuid>'),
  ('vendor',  '<vendor-uuid>',  '<company-uuid>', 'verified from approved vendor register',     '<reviewer-user-uuid>');
```

3. The following preflight must return zero rows and equal counts:

```sql
WITH roots AS (
  SELECT 'asset'::text AS resource_type, id AS resource_id FROM assets.assets
  UNION ALL SELECT 'request', id FROM assets.asset_requests
  UNION ALL SELECT 'vendor', id FROM assets.software_vendors
)
SELECT roots.resource_type, roots.resource_id
  FROM roots
  LEFT JOIN assets.asset_tenant_ownership_map ownership
    ON ownership.resource_type = roots.resource_type
   AND ownership.resource_id = roots.resource_id
 WHERE ownership.resource_id IS NULL;

SELECT resource_type, count(*)
  FROM assets.asset_tenant_ownership_map
 GROUP BY resource_type
 ORDER BY resource_type;
```

Do not proceed if any row is missing, disputed, duplicated in the source evidence, or points at an inactive/incorrect company. Resolve it with the company data owner.

## Phase 2 — Enforce Ownership

1. Keep asset writes quiesced.
2. Apply `0069_asset_tenant_ownership.sql`. It must fail with SQLSTATE `23502` for missing mappings and `23514` for conflicting relationships. Do not bypass these failures.
3. Confirm all checks below. Each count must be zero; every ownership column must be non-null; the immutable trigger must be enabled.

```sql
SELECT 'assets' AS relation, count(*) FROM assets.assets WHERE company_id IS NULL
UNION ALL SELECT 'assignments', count(*) FROM assets.asset_assignments WHERE company_id IS NULL
UNION ALL SELECT 'events', count(*) FROM assets.asset_state_events WHERE company_id IS NULL
UNION ALL SELECT 'requests', count(*) FROM assets.asset_requests WHERE company_id IS NULL
UNION ALL SELECT 'acknowledgements', count(*) FROM assets.asset_acknowledgements WHERE company_id IS NULL
UNION ALL SELECT 'maintenance', count(*) FROM assets.asset_maintenance_records WHERE company_id IS NULL
UNION ALL SELECT 'vendors', count(*) FROM assets.software_vendors WHERE company_id IS NULL
UNION ALL SELECT 'recovery', count(*) FROM assets.asset_recovery_tickets WHERE company_id IS NULL;

SELECT trigger.tgname, trigger.tgenabled
  FROM pg_trigger trigger
 WHERE trigger.tgrelid = 'assets.asset_state_events'::regclass
   AND trigger.tgname = 'assets_state_events_immutable_trg';

SELECT conname
  FROM pg_constraint
 WHERE connamespace = 'assets'::regnamespace
   AND conname LIKE '%_company_%_fkey'
 ORDER BY conname;
```

4. Promote the exact new API build. Verify every instance reports the candidate SHA before resuming asset writes.
5. In isolated QA, use independent Company A and Company B accounts to verify list/detail, foreign direct IDs, request queue/decision, maintenance/vendor relations, termination recovery, retry, restart, same-code assets, and same-name vendors.

## Monitoring And Recovery

- Monitor asset 400/401/403/404/409/500 rates, migration failures, command-result conflicts, outbox failures, and recovery-ticket creation by company.
- If validation or the new API fails, keep asset writes paused. Do not restore an old binary after tenant-local duplicate codes or vendor names have been created.
- After migration 0069, the schema is forward-only. Preserve company ownership, repair forward from reviewed evidence, or restore the entire pre-cutover backup only with release-owner approval and a complete outage plan.
- Public QR access remains a separate capability path; QR rotation, revocation, and request-path log redaction are not certified by this cutover.
