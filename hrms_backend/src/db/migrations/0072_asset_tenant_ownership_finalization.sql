-- Finalize the operator-verified asset ownership evidence after 0068/0069
-- and the separately staged recovery evidence table from migration 0071.
-- This migration is intentionally fail-closed: every map row must be
-- attributable, refer to a real root, and agree with the enforced owner.

-- Recovery snapshot backfill is a controlled migration write. Runtime writes
-- remain fenced by 0069 and must never set this transaction-local flag.
SET LOCAL hrms.asset_writer_v2 = 'on';

ALTER TABLE assets.asset_recovery_tickets
  ADD COLUMN IF NOT EXISTS employee_full_name_snapshot text,
  ADD COLUMN IF NOT EXISTS employee_code_snapshot text;

-- Migration 0070 already froze its mutable-profile backfill. Remove that
-- trigger only inside this migration transaction so reviewed evidence can
-- replace it; immutability is recreated before commit below.
DROP TRIGGER IF EXISTS asset_recovery_identity_immutable_trg
  ON assets.asset_recovery_tickets;

UPDATE assets.asset_recovery_tickets ticket
   SET employee_full_name_snapshot = evidence.employee_full_name_snapshot,
       employee_code_snapshot = evidence.employee_code_snapshot
  FROM assets.asset_recovery_identity_evidence evidence
 WHERE evidence.ticket_id = ticket.id
   AND evidence.company_id = ticket.company_id
   AND evidence.employee_user_id = ticket.employee_user_id;

DO $$
DECLARE
  unattributed_count bigint;
  unknown_verifier_count bigint;
  orphan_count bigint;
  mismatch_count bigint;
  missing_snapshot_count bigint;
  invalid_recovery_evidence_count bigint;
BEGIN
  SELECT count(*) INTO unattributed_count
    FROM assets.asset_tenant_ownership_map
   WHERE verified_by_user_id IS NULL;
  IF unattributed_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23502',
      MESSAGE = format('Asset ownership finalization blocked: %s mappings have no verifier.', unattributed_count),
      HINT = 'Set verified_by_user_id to the accountable operator before applying migration 0072.';
  END IF;

  SELECT count(*) INTO unknown_verifier_count
    FROM assets.asset_tenant_ownership_map ownership
   WHERE NOT EXISTS (SELECT 1 FROM core.users verifier WHERE verifier.id = ownership.verified_by_user_id);
  IF unknown_verifier_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = format('Asset ownership finalization blocked: %s mappings reference an unknown verifier.', unknown_verifier_count),
      HINT = 'Use an existing accountable operator user ID.';
  END IF;

  SELECT count(*) INTO orphan_count
    FROM assets.asset_tenant_ownership_map ownership
   WHERE CASE ownership.resource_type
     WHEN 'asset' THEN NOT EXISTS (SELECT 1 FROM assets.assets root WHERE root.id = ownership.resource_id)
     WHEN 'request' THEN NOT EXISTS (SELECT 1 FROM assets.asset_requests root WHERE root.id = ownership.resource_id)
     WHEN 'vendor' THEN NOT EXISTS (SELECT 1 FROM assets.software_vendors root WHERE root.id = ownership.resource_id)
     ELSE true
   END;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = format('Asset ownership finalization blocked: %s mappings do not reference an existing root.', orphan_count),
      HINT = 'Remove erroneous draft mappings before applying migration 0072; do not guess a replacement root.';
  END IF;

  SELECT count(*) INTO mismatch_count
    FROM assets.asset_tenant_ownership_map ownership
   WHERE CASE ownership.resource_type
     WHEN 'asset' THEN EXISTS (
       SELECT 1 FROM assets.assets root
        WHERE root.id = ownership.resource_id AND root.company_id <> ownership.company_id
     )
     WHEN 'request' THEN EXISTS (
       SELECT 1 FROM assets.asset_requests root
        WHERE root.id = ownership.resource_id AND root.company_id <> ownership.company_id
     )
     WHEN 'vendor' THEN EXISTS (
       SELECT 1 FROM assets.software_vendors root
        WHERE root.id = ownership.resource_id AND root.company_id <> ownership.company_id
     )
     ELSE true
   END;
  IF mismatch_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('Asset ownership finalization blocked: %s mappings disagree with enforced root ownership.', mismatch_count),
      HINT = 'Restore or repair the complete 0068/0069 cutover from reviewed evidence.';
  END IF;

  SELECT count(*) INTO invalid_recovery_evidence_count
    FROM assets.asset_recovery_identity_evidence evidence
    FULL JOIN assets.asset_recovery_tickets ticket ON ticket.id = evidence.ticket_id
   WHERE ticket.id IS NULL
      OR (evidence.ticket_id IS NOT NULL AND (
         evidence.company_id <> ticket.company_id
      OR evidence.employee_user_id <> ticket.employee_user_id
      OR btrim(evidence.employee_full_name_snapshot) = ''
      OR btrim(evidence.employee_code_snapshot) = ''
      OR btrim(evidence.source_reference) = ''
      OR NOT EXISTS (
        SELECT 1 FROM core.users verifier WHERE verifier.id = evidence.verified_by_user_id
      ))) ;
  IF invalid_recovery_evidence_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('Asset ownership finalization blocked: %s recovery identity evidence rows are missing, extra, blank, mismatched or unverified.', invalid_recovery_evidence_count),
      HINT = 'Provide exactly one independently verified original-company evidence row for every legacy recovery ticket.';
  END IF;

  SELECT count(*) INTO invalid_recovery_evidence_count
    FROM assets.asset_recovery_tickets ticket
   WHERE NOT EXISTS (
     SELECT 1 FROM assets.asset_recovery_identity_evidence evidence WHERE evidence.ticket_id = ticket.id
   );
  IF invalid_recovery_evidence_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23502',
      MESSAGE = format('Asset ownership finalization blocked: %s recovery tickets have no verified identity evidence.', invalid_recovery_evidence_count),
      HINT = 'Provide one verified evidence row per ticket; never copy a mutable current employee profile.';
  END IF;

  SELECT count(*) INTO missing_snapshot_count
    FROM assets.asset_recovery_tickets
   WHERE employee_full_name_snapshot IS NULL OR employee_code_snapshot IS NULL;
  IF missing_snapshot_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23502',
      MESSAGE = format('Asset ownership finalization blocked: %s recovery tickets lack historical employee identity.', missing_snapshot_count),
      HINT = 'Restore the missing employee identity from approved original-company records.';
  END IF;
END $$;

ALTER TABLE assets.asset_tenant_ownership_map
  ALTER COLUMN verified_by_user_id SET NOT NULL;

ALTER TABLE assets.asset_recovery_tickets
  ALTER COLUMN employee_full_name_snapshot SET NOT NULL,
  ALTER COLUMN employee_code_snapshot SET NOT NULL;

CREATE OR REPLACE FUNCTION assets.reject_finalized_asset_ownership_map_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'Finalized asset tenant ownership evidence is immutable.';
END $$;

DROP TRIGGER IF EXISTS asset_tenant_ownership_map_finalized_trg
  ON assets.asset_tenant_ownership_map;
CREATE TRIGGER asset_tenant_ownership_map_finalized_trg
  BEFORE INSERT OR UPDATE OR DELETE ON assets.asset_tenant_ownership_map
  FOR EACH ROW EXECUTE FUNCTION assets.reject_finalized_asset_ownership_map_mutation();

DROP TRIGGER IF EXISTS asset_recovery_identity_evidence_finalized_trg
  ON assets.asset_recovery_identity_evidence;
CREATE TRIGGER asset_recovery_identity_evidence_finalized_trg
  BEFORE INSERT OR UPDATE OR DELETE ON assets.asset_recovery_identity_evidence
  FOR EACH ROW EXECUTE FUNCTION assets.reject_finalized_asset_ownership_map_mutation();

CREATE OR REPLACE FUNCTION assets.prevent_finalized_asset_root_orphaning()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  root_type text := CASE TG_TABLE_NAME
    WHEN 'assets' THEN 'asset'
    WHEN 'asset_requests' THEN 'request'
    WHEN 'software_vendors' THEN 'vendor'
    ELSE NULL
  END;
BEGIN
  IF root_type IS NOT NULL
     AND (TG_OP = 'DELETE' OR NEW.id IS DISTINCT FROM OLD.id)
     AND EXISTS (
       SELECT 1
         FROM assets.asset_tenant_ownership_map ownership
        WHERE ownership.resource_type = root_type
          AND ownership.resource_id = OLD.id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Finalized asset ownership root identity cannot be deleted or replaced.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS finalized_asset_root_identity_trg ON assets.assets;
CREATE TRIGGER finalized_asset_root_identity_trg
  BEFORE UPDATE OR DELETE ON assets.assets
  FOR EACH ROW EXECUTE FUNCTION assets.prevent_finalized_asset_root_orphaning();

DROP TRIGGER IF EXISTS finalized_asset_request_root_identity_trg ON assets.asset_requests;
CREATE TRIGGER finalized_asset_request_root_identity_trg
  BEFORE UPDATE OR DELETE ON assets.asset_requests
  FOR EACH ROW EXECUTE FUNCTION assets.prevent_finalized_asset_root_orphaning();

DROP TRIGGER IF EXISTS finalized_asset_vendor_root_identity_trg ON assets.software_vendors;
CREATE TRIGGER finalized_asset_vendor_root_identity_trg
  BEFORE UPDATE OR DELETE ON assets.software_vendors
  FOR EACH ROW EXECUTE FUNCTION assets.prevent_finalized_asset_root_orphaning();

CREATE OR REPLACE FUNCTION assets.reject_asset_recovery_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.employee_user_id IS DISTINCT FROM OLD.employee_user_id
     OR NEW.employee_full_name_snapshot IS DISTINCT FROM OLD.employee_full_name_snapshot
     OR NEW.employee_code_snapshot IS DISTINCT FROM OLD.employee_code_snapshot
     OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
     OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Asset recovery ownership and historical identity are immutable.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS asset_recovery_identity_immutable_trg
  ON assets.asset_recovery_tickets;
CREATE TRIGGER asset_recovery_identity_immutable_trg
  BEFORE UPDATE ON assets.asset_recovery_tickets
  FOR EACH ROW EXECUTE FUNCTION assets.reject_asset_recovery_identity_mutation();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON assets.asset_tenant_ownership_map FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON assets.asset_recovery_identity_evidence FROM PUBLIC;

COMMENT ON TABLE assets.asset_tenant_ownership_map IS
  'Finalized operator-verified evidence for the one-time asset tenant cutover; immutable after migration 0072.';
