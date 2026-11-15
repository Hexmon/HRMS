# Asset Tenant Ownership Cutover

This runbook is a draft deployment dependency for TEN-S25-010. It is not authorization to modify QA or production. The cutover uses a verified-map phase, an ownership-enforcement phase and a finalization phase because existing asset roots do not contain trustworthy company ownership.

## Safety And Required Inputs

- Obtain release-owner approval, a tested database backup, an application-write maintenance window, and the exact candidate SHA.
- Stop every old API and worker capable of writing asset tables. Migrations 0069-0073 change ownership, identity and immutability rules; mixed old/new writers are unsafe.
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

Do not proceed if any row is missing, disputed, duplicated in the source evidence, or points at an incorrect company. An inactive company row is valid when it is the verified original historical owner; company status must not reassign history. Resolve disputed ownership with the company data owner.

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

## Phase 3 — Finalize Evidence And Historical Recovery Identity

1. Keep asset writes quiesced. Confirm every ownership row has an existing accountable verifier, every map root still exists, and every map owner agrees with the owner applied by 0069. These checks must return zero:

```sql
SELECT count(*) AS unattributed
  FROM assets.asset_tenant_ownership_map
 WHERE verified_by_user_id IS NULL;

SELECT count(*) AS unknown_verifier
  FROM assets.asset_tenant_ownership_map ownership
 WHERE NOT EXISTS (
   SELECT 1 FROM core.users verifier WHERE verifier.id = ownership.verified_by_user_id
 );

SELECT count(*) AS orphan_or_mismatch
  FROM assets.asset_tenant_ownership_map ownership
 WHERE CASE ownership.resource_type
   WHEN 'asset' THEN NOT EXISTS (
     SELECT 1 FROM assets.assets root
      WHERE root.id = ownership.resource_id AND root.company_id = ownership.company_id
   )
   WHEN 'request' THEN NOT EXISTS (
     SELECT 1 FROM assets.asset_requests root
      WHERE root.id = ownership.resource_id AND root.company_id = ownership.company_id
   )
   WHEN 'vendor' THEN NOT EXISTS (
     SELECT 1 FROM assets.software_vendors root
      WHERE root.id = ownership.resource_id AND root.company_id = ownership.company_id
   )
   ELSE true
 END;
```

2. Apply `0071_asset_recovery_identity_evidence_prep.sql` only. Pause before 0072. Populate one `assets.asset_recovery_identity_evidence` row per legacy recovery ticket from an approved original-company source, recording the ticket/company/user, historical name/code, source reference, accountable verifier and verification time. Also populate one `core.user_termination_identity_evidence` row for every existing `core.user.terminated` outbox event, including `published` and `dead_letter` rows: both remain replayable, and `published` proves Queue acceptance rather than downstream completion. Bind each row to the event ID, original company, employee ID, transition-time name/code and employee version, with the approved source and accountable verifier. Grant the named migration operator only the temporary DML needed for this staging step; the runtime role must never receive it. Reconcile exact one-to-one counts and independently review blank, extra and mismatched rows.
   The normal migration runner enforces this pause: without approval it applies 0071, refuses 0072 and exits non-zero. This first non-approved failure is expected and must be handled by deployment orchestration as a paused, incomplete rollout—not a successful deployment and not an automatic retry loop. After evidence review, run the finalization once with `HRMS_MIGRATION_APPROVAL=0072_asset_tenant_ownership_finalization.sql pnpm db:migrate` (or the production command), then remove that environment variable immediately. A wrong, absent, or prematurely supplied value cannot cross the barrier.
3. Apply `0072_asset_tenant_ownership_finalization.sql`. It must fail closed with SQLSTATE `23502` for unattributed mappings or missing recovery evidence, `23503` for an unknown verifier/orphan root, and `23514` for an owner/evidence mismatch. It replaces any legacy mutable-profile snapshot with ticket-bound verified evidence, freezes both evidence maps and does not read current employee profiles. The migration does not require an historical company to remain active.
4. Before applying `0073_asset_termination_identity_snapshot.sql`, the following query must return zero. The migration refuses every historical termination event without exact staged evidence, regardless of status, because pending/retry rows may still deliver, published rows may be replayed, and dead-letter rows may be reset. Reconcile each row under its verified original company through an independently reviewed procedure; do not change its status, delete it, or copy a mutable current profile merely to cross the gate.

```sql
SELECT event.event_id, event.aggregate_id, event.status, event.created_at
  FROM platform.outbox_events event
  LEFT JOIN core.user_termination_identity_evidence evidence
    ON evidence.lifecycle_event_id = event.event_id
   AND evidence.employee_user_id = event.aggregate_id
 WHERE event.aggregate_type = 'core.user'
   AND event.event_type = 'core.user.terminated'
   AND evidence.lifecycle_event_id IS NULL
 ORDER BY event.created_at, event.event_id;
```

   Apply `0073_asset_termination_identity_snapshot.sql` only after that review is complete. It validates the complete staged set, copies historical evidence into immutable snapshots, freezes the staging table, and refuses missing, extra, blank, mismatched or unverified rows with SQLSTATE `23514`. Confirm new `core.user.terminated` inserts succeed only when the exact company/version employee row is already terminated with a termination date, atomically create an immutable snapshot, and reject malformed or active-employee events with SQLSTATE `23514`. Revoke any temporary evidence-staging grant before starting the API.
5. Confirm the map and recovery identity triggers are enabled and the map is no longer writable:

```sql
SELECT tgname, tgenabled
  FROM pg_trigger
 WHERE tgrelid IN (
   'assets.asset_tenant_ownership_map'::regclass,
   'assets.asset_recovery_tickets'::regclass,
   'assets.assets'::regclass,
   'assets.asset_requests'::regclass,
   'assets.software_vendors'::regclass
 )
   AND tgname IN (
     'asset_tenant_ownership_map_finalized_trg',
     'asset_recovery_identity_immutable_trg',
     'finalized_asset_root_identity_trg',
     'finalized_asset_request_root_identity_trg',
     'finalized_asset_vendor_root_identity_trg'
   );

BEGIN;
UPDATE assets.asset_tenant_ownership_map
   SET verification_note = verification_note
 WHERE false;
ROLLBACK;
```

The trigger check must return all five enabled triggers. Validate a real map row, a mapped-root delete/re-key, and both legacy and lifecycle-linked recovery-ticket deletes inside rollback-only transactions using the approved migration role and expect SQLSTATE `55000`; the `WHERE false` smoke query only confirms syntax and privileges.

Confirm both termination-evidence triggers are enabled. The snapshot trigger rejects update/delete; the staging-evidence trigger rejects insert/update/delete after finalization.

```sql
SELECT tgname, tgenabled
  FROM pg_trigger
 WHERE tgrelid IN (
   'core.user_termination_identity_snapshots'::regclass,
   'core.user_termination_identity_evidence'::regclass
 )
   AND tgname IN (
     'user_termination_identity_snapshot_immutable_trg',
     'user_termination_identity_evidence_finalized_trg'
   );
```

6. Use a distinct non-owner runtime database role. Explicitly revoke ownership-map, termination-evidence and termination-snapshot DML from that role in the environment's managed grants. Migration 0073's fixed-search-path security-definer trigger captures a valid snapshot when that role inserts the outbox event; the role must not insert staging evidence or a snapshot directly. Verify all results are false before starting the API:

```sql
SELECT
  has_table_privilege('<runtime-role>', 'assets.asset_tenant_ownership_map', 'INSERT') AS can_insert,
  has_table_privilege('<runtime-role>', 'assets.asset_tenant_ownership_map', 'UPDATE') AS can_update,
  has_table_privilege('<runtime-role>', 'assets.asset_tenant_ownership_map', 'DELETE') AS can_delete,
  has_table_privilege('<runtime-role>', 'assets.asset_tenant_ownership_map', 'TRUNCATE') AS can_truncate;

SELECT
  has_table_privilege('<runtime-role>', 'core.user_termination_identity_snapshots', 'INSERT') AS can_insert,
  has_table_privilege('<runtime-role>', 'core.user_termination_identity_snapshots', 'UPDATE') AS can_update,
  has_table_privilege('<runtime-role>', 'core.user_termination_identity_snapshots', 'DELETE') AS can_delete,
  has_table_privilege('<runtime-role>', 'core.user_termination_identity_snapshots', 'TRUNCATE') AS can_truncate;

SELECT
  has_table_privilege('<runtime-role>', 'core.user_termination_identity_evidence', 'INSERT') AS can_insert,
  has_table_privilege('<runtime-role>', 'core.user_termination_identity_evidence', 'UPDATE') AS can_update,
  has_table_privilege('<runtime-role>', 'core.user_termination_identity_evidence', 'DELETE') AS can_delete,
  has_table_privilege('<runtime-role>', 'core.user_termination_identity_evidence', 'TRUNCATE') AS can_truncate;
```

Do not run the API as the table owner or a superuser. Do not grant runtime code direct map DML after cutover. `REVOKE ... FROM PUBLIC` in 0070 is a floor, not proof that an environment-specific runtime role is least-privileged.

7. Promote the exact new API build. Verify every instance reports the candidate SHA before resuming asset writes.
8. In isolated QA, use independent Company A and Company B accounts to verify list/detail, bounded pagination and maintenance totals, foreign direct IDs, request queue/decision, maintenance/vendor relations, original-company termination recovery after an A→B profile movement, retry, restart, same-code assets, same-name vendors and parallel commands in different companies.

## Monitoring And Recovery

- Monitor asset 400/401/403/404/409/500 rates, migration failures, command-result conflicts, outbox failures, and recovery-ticket creation by company.
- If validation or the new API fails, keep asset writes paused. Do not restore an old binary after tenant-local duplicate codes or vendor names have been created.
- After migration 0069, the schema is forward-only. After 0072, the verified maps and historical recovery identity are immutable; after 0073, runtime termination snapshots and ticket lifecycle IDs are immutable. Preserve company ownership, repair forward through a separately reviewed append-only migration, or restore the entire pre-cutover backup only with release-owner approval and a complete outage plan.
- Public QR access remains a separate capability path; QR rotation, revocation, and request-path log redaction are not certified by this cutover.
