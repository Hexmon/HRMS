-- Give every reviewer-routing assignment an immutable original-company owner.
-- Current participant memberships are mutable and therefore cannot prove a
-- historical mapping's original company. Every legacy row is quarantined;
-- only new transaction-owned commands create typed rows. A later independently
-- reviewed forward migration may add audited repair evidence.

ALTER TABLE expenses.employee_reviewer_mappings
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS owner_resolution_status text NOT NULL DEFAULT 'quarantined',
  ADD COLUMN IF NOT EXISTS owner_resolution_reason text;

CREATE TABLE IF NOT EXISTS expenses.employee_reviewer_mapping_owner_audit (
  mapping_id uuid PRIMARY KEY,
  original_row jsonb NOT NULL,
  repaired_company_id uuid NOT NULL,
  evidence_reference text NOT NULL,
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  reviewed_by text NOT NULL,
  applied_by text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses.employee_reviewer_mapping_owner_quarantine (
  mapping_id uuid PRIMARY KEY,
  original_row jsonb NOT NULL,
  reason text NOT NULL,
  quarantined_at timestamptz NOT NULL DEFAULT now()
);

SELECT set_config('app.expense_command_v1', 'on', false);

INSERT INTO expenses.employee_reviewer_mapping_owner_quarantine
  (mapping_id,original_row,reason)
SELECT mapping.id,to_jsonb(mapping),'legacy_company_owner_unverified'
FROM expenses.employee_reviewer_mappings mapping
WHERE mapping.company_id IS NULL
ON CONFLICT (mapping_id) DO NOTHING;

UPDATE expenses.employee_reviewer_mappings
SET owner_resolution_status='quarantined',
    owner_resolution_reason=COALESCE(owner_resolution_reason,'legacy_company_owner_unverified')
WHERE company_id IS NULL;

SELECT set_config('app.expense_command_v1', 'off', false);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='employee_reviewer_mapping_owner_resolution_ck'
      AND conrelid='expenses.employee_reviewer_mappings'::regclass
  ) THEN
    ALTER TABLE expenses.employee_reviewer_mappings
      ADD CONSTRAINT employee_reviewer_mapping_owner_resolution_ck CHECK (
        (company_id IS NULL AND owner_resolution_status='quarantined'
          AND owner_resolution_reason IS NOT NULL)
        OR
        (company_id IS NOT NULL AND owner_resolution_status IN ('typed_creation','audited_repair')
          AND owner_resolution_reason IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS employee_reviewer_mappings_company_created_idx
  ON expenses.employee_reviewer_mappings (company_id,created_at DESC,id DESC)
  WHERE deleted_at IS NULL AND company_id IS NOT NULL
    AND owner_resolution_status IN ('typed_creation','audited_repair');

CREATE INDEX IF NOT EXISTS employee_reviewer_mappings_company_employee_active_idx
  ON expenses.employee_reviewer_mappings
    (company_id,employee_user_id,status,effective_from,effective_to)
  WHERE deleted_at IS NULL AND company_id IS NOT NULL
    AND owner_resolution_status IN ('typed_creation','audited_repair');

CREATE INDEX IF NOT EXISTS expense_command_results_actor_action_key_idx
  ON expenses.expense_command_results (actor_user_id,action,idempotency_key);

CREATE OR REPLACE FUNCTION expenses.enforce_reviewer_mapping_original_company()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.company_id IS NULL OR NEW.owner_resolution_status<>'typed_creation'
       OR NEW.owner_resolution_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Reviewer routing requires a typed company owner'
        USING ERRCODE='23514', CONSTRAINT='employee_reviewer_mapping_original_company';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.owner_resolution_status IS DISTINCT FROM OLD.owner_resolution_status
     OR NEW.owner_resolution_reason IS DISTINCT FROM OLD.owner_resolution_reason THEN
    RAISE EXCEPTION 'Reviewer routing original company ownership is immutable'
      USING ERRCODE='23514', CONSTRAINT='employee_reviewer_mapping_original_company';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_reviewer_mapping_original_company_trg
  ON expenses.employee_reviewer_mappings;
CREATE TRIGGER employee_reviewer_mapping_original_company_trg
  BEFORE INSERT OR UPDATE ON expenses.employee_reviewer_mappings
  FOR EACH ROW EXECUTE FUNCTION expenses.enforce_reviewer_mapping_original_company();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='expenses.employee_reviewer_mapping_owner_audit'::regclass
      AND tgname='employee_reviewer_mapping_owner_audit_immutable_trg'
  ) THEN
    CREATE TRIGGER employee_reviewer_mapping_owner_audit_immutable_trg
      BEFORE UPDATE OR DELETE ON expenses.employee_reviewer_mapping_owner_audit
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='expenses.employee_reviewer_mapping_owner_quarantine'::regclass
      AND tgname='employee_reviewer_mapping_owner_quarantine_immutable_trg'
  ) THEN
    CREATE TRIGGER employee_reviewer_mapping_owner_quarantine_immutable_trg
      BEFORE UPDATE OR DELETE ON expenses.employee_reviewer_mapping_owner_quarantine
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;
