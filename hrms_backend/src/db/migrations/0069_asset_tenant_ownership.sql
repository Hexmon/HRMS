-- This migration intentionally fails if any existing root record lacks an
-- operator-verified mapping. Migration 0068 remains committed, so operators
-- can populate the map and rerun without guessing historical ownership.
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE assets.asset_assignments ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE assets.asset_state_events ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE assets.asset_requests ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE assets.asset_acknowledgements ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE assets.asset_maintenance_records ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE assets.software_vendors ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE assets.asset_recovery_tickets ADD COLUMN IF NOT EXISTS company_id uuid;

SET LOCAL hrms.asset_writer_v2 = 'on';

UPDATE assets.assets AS target
SET company_id = ownership.company_id
FROM assets.asset_tenant_ownership_map AS ownership
WHERE ownership.resource_type = 'asset'
  AND ownership.resource_id = target.id
  AND target.company_id IS NULL;

UPDATE assets.asset_requests AS target
SET company_id = ownership.company_id
FROM assets.asset_tenant_ownership_map AS ownership
WHERE ownership.resource_type = 'request'
  AND ownership.resource_id = target.id
  AND target.company_id IS NULL;

UPDATE assets.software_vendors AS target
SET company_id = ownership.company_id
FROM assets.asset_tenant_ownership_map AS ownership
WHERE ownership.resource_type = 'vendor'
  AND ownership.resource_id = target.id
  AND target.company_id IS NULL;

UPDATE assets.asset_assignments AS target
SET company_id = owner.company_id
FROM assets.assets AS owner
WHERE owner.id = target.asset_id
  AND target.company_id IS NULL;

-- The immutable event trigger protects runtime evidence. Disable it only for
-- this one migration transaction and restore it before validation completes.
ALTER TABLE assets.asset_state_events DISABLE TRIGGER assets_state_events_immutable_trg;
UPDATE assets.asset_state_events AS target
SET company_id = owner.company_id
FROM assets.assets AS owner
WHERE owner.id = target.asset_id
  AND target.company_id IS NULL;
ALTER TABLE assets.asset_state_events ENABLE TRIGGER assets_state_events_immutable_trg;

UPDATE assets.asset_acknowledgements AS target
SET company_id = owner.company_id
FROM assets.assets AS owner
WHERE owner.id = target.asset_id
  AND target.company_id IS NULL;

UPDATE assets.asset_maintenance_records AS target
SET company_id = owner.company_id
FROM assets.assets AS owner
WHERE owner.id = target.asset_id
  AND target.company_id IS NULL;

UPDATE assets.asset_recovery_tickets AS target
SET company_id = owner.company_id
FROM assets.assets AS owner
WHERE owner.id = target.asset_id
  AND target.company_id IS NULL;

DO $$
DECLARE
  missing_summary text;
BEGIN
  SELECT string_agg(format('%s=%s', relation_name, missing_count), ', ' ORDER BY relation_name)
  INTO missing_summary
  FROM (
    SELECT 'assets' AS relation_name, count(*) AS missing_count FROM assets.assets WHERE company_id IS NULL
    UNION ALL SELECT 'asset_requests', count(*) FROM assets.asset_requests WHERE company_id IS NULL
    UNION ALL SELECT 'software_vendors', count(*) FROM assets.software_vendors WHERE company_id IS NULL
    UNION ALL SELECT 'asset_assignments', count(*) FROM assets.asset_assignments WHERE company_id IS NULL
    UNION ALL SELECT 'asset_state_events', count(*) FROM assets.asset_state_events WHERE company_id IS NULL
    UNION ALL SELECT 'asset_acknowledgements', count(*) FROM assets.asset_acknowledgements WHERE company_id IS NULL
    UNION ALL SELECT 'asset_maintenance_records', count(*) FROM assets.asset_maintenance_records WHERE company_id IS NULL
    UNION ALL SELECT 'asset_recovery_tickets', count(*) FROM assets.asset_recovery_tickets WHERE company_id IS NULL
  ) AS counts
  WHERE missing_count > 0;

  IF missing_summary IS NOT NULL THEN
    RAISE EXCEPTION 'Asset tenant ownership mapping is incomplete: %', missing_summary
      USING ERRCODE = '23502',
            HINT = 'Populate assets.asset_tenant_ownership_map for every existing asset, request and vendor, then rerun migrations.';
  END IF;
END;
$$;
DO $$
DECLARE
  mismatch_summary text;
BEGIN
  SELECT string_agg(format('%s=%s', relation_name, mismatch_count), ', ' ORDER BY relation_name)
  INTO mismatch_summary
  FROM (
    SELECT 'assignment_asset' AS relation_name, count(*) AS mismatch_count
      FROM assets.asset_assignments child
      LEFT JOIN assets.assets parent ON parent.id = child.asset_id AND parent.company_id = child.company_id
      WHERE parent.id IS NULL
    UNION ALL
    SELECT 'event_asset', count(*) FROM assets.asset_state_events child
      LEFT JOIN assets.assets parent ON parent.id = child.asset_id AND parent.company_id = child.company_id
      WHERE parent.id IS NULL
    UNION ALL
    SELECT 'request_asset', count(*) FROM assets.asset_requests child
      LEFT JOIN assets.assets parent ON parent.id = child.asset_id AND parent.company_id = child.company_id
      WHERE child.asset_id IS NOT NULL AND parent.id IS NULL
    UNION ALL
    SELECT 'request_assigned_asset', count(*) FROM assets.asset_requests child
      LEFT JOIN assets.assets parent ON parent.id = child.assigned_asset_id AND parent.company_id = child.company_id
      WHERE child.assigned_asset_id IS NOT NULL AND parent.id IS NULL
    UNION ALL
    SELECT 'acknowledgement_asset', count(*) FROM assets.asset_acknowledgements child
      LEFT JOIN assets.assets parent ON parent.id = child.asset_id AND parent.company_id = child.company_id
      WHERE parent.id IS NULL
    UNION ALL
    SELECT 'acknowledgement_assignment', count(*) FROM assets.asset_acknowledgements child
      LEFT JOIN assets.asset_assignments parent ON parent.id = child.assignment_id AND parent.company_id = child.company_id
      WHERE child.assignment_id IS NOT NULL AND parent.id IS NULL
    UNION ALL
    SELECT 'maintenance_asset', count(*) FROM assets.asset_maintenance_records child
      LEFT JOIN assets.assets parent ON parent.id = child.asset_id AND parent.company_id = child.company_id
      WHERE parent.id IS NULL
    UNION ALL
    SELECT 'maintenance_vendor', count(*) FROM assets.asset_maintenance_records child
      LEFT JOIN assets.software_vendors parent ON parent.id = child.vendor_id AND parent.company_id = child.company_id
      WHERE child.vendor_id IS NOT NULL AND parent.id IS NULL
    UNION ALL
    SELECT 'recovery_asset', count(*) FROM assets.asset_recovery_tickets child
      LEFT JOIN assets.assets parent ON parent.id = child.asset_id AND parent.company_id = child.company_id
      WHERE parent.id IS NULL
    UNION ALL
    SELECT 'recovery_assignment', count(*) FROM assets.asset_recovery_tickets child
      LEFT JOIN assets.asset_assignments parent ON parent.id = child.assignment_id AND parent.company_id = child.company_id
      WHERE child.assignment_id IS NOT NULL AND parent.id IS NULL
    UNION ALL
    SELECT 'command_result_company', count(*) FROM assets.asset_command_results child
      LEFT JOIN platform.company_profiles parent ON parent.id = child.company_id
      WHERE parent.id IS NULL
  ) AS counts
  WHERE mismatch_count > 0;

  IF mismatch_summary IS NOT NULL THEN
    RAISE EXCEPTION 'Asset tenant ownership relationships conflict: %', mismatch_summary
      USING ERRCODE = '23514',
            HINT = 'Correct the verified root mappings or inconsistent related rows; ownership is never reassigned automatically.';
  END IF;
END;
$$;
ALTER TABLE assets.assets ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE assets.asset_assignments ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE assets.asset_state_events ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE assets.asset_requests ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE assets.asset_acknowledgements ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE assets.asset_maintenance_records ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE assets.software_vendors ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE assets.asset_recovery_tickets ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE assets.assets DROP CONSTRAINT IF EXISTS assets_asset_code_key;
DROP INDEX IF EXISTS assets.assets_asset_code_uq;
DROP INDEX IF EXISTS assets.asset_requests_request_code_uq;
ALTER TABLE assets.asset_requests DROP CONSTRAINT IF EXISTS asset_requests_request_code_key;
DROP INDEX IF EXISTS assets.software_vendors_name_uq;
DROP INDEX IF EXISTS assets.uq_asset_vendor_name_active;

CREATE UNIQUE INDEX IF NOT EXISTS assets_company_asset_code_uq
  ON assets.assets (company_id, asset_code);
CREATE UNIQUE INDEX IF NOT EXISTS asset_requests_company_request_code_uq
  ON assets.asset_requests (company_id, request_code);
CREATE UNIQUE INDEX IF NOT EXISTS software_vendors_company_name_uq
  ON assets.software_vendors (company_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS assets_company_id_id_uq ON assets.assets (company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS asset_assignments_company_id_id_uq ON assets.asset_assignments (company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS software_vendors_company_id_id_uq ON assets.software_vendors (company_id, id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asset_assignments_company_asset_fkey'
      AND conrelid = 'assets.asset_assignments'::regclass
  ) THEN
    ALTER TABLE assets.asset_assignments ADD CONSTRAINT asset_assignments_company_asset_fkey
      FOREIGN KEY (company_id, asset_id) REFERENCES assets.assets(company_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asset_state_events_company_asset_fkey'
      AND conrelid = 'assets.asset_state_events'::regclass
  ) THEN
    ALTER TABLE assets.asset_state_events ADD CONSTRAINT asset_state_events_company_asset_fkey
      FOREIGN KEY (company_id, asset_id) REFERENCES assets.assets(company_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asset_requests_company_asset_fkey'
      AND conrelid = 'assets.asset_requests'::regclass
  ) THEN
    ALTER TABLE assets.asset_requests ADD CONSTRAINT asset_requests_company_asset_fkey
      FOREIGN KEY (company_id, asset_id) REFERENCES assets.assets(company_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asset_requests_company_assigned_asset_fkey'
      AND conrelid = 'assets.asset_requests'::regclass
  ) THEN
    ALTER TABLE assets.asset_requests ADD CONSTRAINT asset_requests_company_assigned_asset_fkey
      FOREIGN KEY (company_id, assigned_asset_id) REFERENCES assets.assets(company_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asset_acknowledgements_company_asset_fkey'
      AND conrelid = 'assets.asset_acknowledgements'::regclass
  ) THEN
    ALTER TABLE assets.asset_acknowledgements ADD CONSTRAINT asset_acknowledgements_company_asset_fkey
      FOREIGN KEY (company_id, asset_id) REFERENCES assets.assets(company_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asset_acknowledgements_company_assignment_fkey'
      AND conrelid = 'assets.asset_acknowledgements'::regclass
  ) THEN
    ALTER TABLE assets.asset_acknowledgements ADD CONSTRAINT asset_acknowledgements_company_assignment_fkey
      FOREIGN KEY (company_id, assignment_id) REFERENCES assets.asset_assignments(company_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asset_maintenance_company_asset_fkey'
      AND conrelid = 'assets.asset_maintenance_records'::regclass
  ) THEN
    ALTER TABLE assets.asset_maintenance_records ADD CONSTRAINT asset_maintenance_company_asset_fkey
      FOREIGN KEY (company_id, asset_id) REFERENCES assets.assets(company_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asset_maintenance_company_vendor_fkey'
      AND conrelid = 'assets.asset_maintenance_records'::regclass
  ) THEN
    ALTER TABLE assets.asset_maintenance_records ADD CONSTRAINT asset_maintenance_company_vendor_fkey
      FOREIGN KEY (company_id, vendor_id) REFERENCES assets.software_vendors(company_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asset_recovery_company_asset_fkey'
      AND conrelid = 'assets.asset_recovery_tickets'::regclass
  ) THEN
    ALTER TABLE assets.asset_recovery_tickets ADD CONSTRAINT asset_recovery_company_asset_fkey
      FOREIGN KEY (company_id, asset_id) REFERENCES assets.assets(company_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asset_recovery_company_assignment_fkey'
      AND conrelid = 'assets.asset_recovery_tickets'::regclass
  ) THEN
    ALTER TABLE assets.asset_recovery_tickets ADD CONSTRAINT asset_recovery_company_assignment_fkey
      FOREIGN KEY (company_id, assignment_id) REFERENCES assets.asset_assignments(company_id, id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS assets_company_status_updated_idx
  ON assets.assets (company_id, status, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS asset_requests_company_status_priority_idx
  ON assets.asset_requests (company_id, status, priority, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS asset_recovery_company_status_idx
  ON assets.asset_recovery_tickets (company_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION assets.prevent_company_ownership_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Asset company ownership is immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'assets_company_ownership_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'assets', 'asset_assignments', 'asset_state_events', 'asset_requests',
    'asset_acknowledgements', 'asset_maintenance_records',
    'software_vendors', 'asset_recovery_tickets', 'asset_command_results'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS assets_cross_schema_company_reference_trg ON assets.%I',
      table_name
    );
    EXECUTE format(
      'CREATE TRIGGER assets_cross_schema_company_reference_trg '
      || 'BEFORE INSERT OR UPDATE OF company_id ON assets.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION assets.validate_company_profile_reference()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION platform.restrict_asset_company_profile_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.id IS NOT DISTINCT FROM OLD.id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM assets.asset_tenant_ownership_map WHERE company_id = OLD.id
    UNION ALL SELECT 1 FROM assets.assets WHERE company_id = OLD.id
    UNION ALL SELECT 1 FROM assets.asset_assignments WHERE company_id = OLD.id
    UNION ALL SELECT 1 FROM assets.asset_state_events WHERE company_id = OLD.id
    UNION ALL SELECT 1 FROM assets.asset_requests WHERE company_id = OLD.id
    UNION ALL SELECT 1 FROM assets.asset_acknowledgements WHERE company_id = OLD.id
    UNION ALL SELECT 1 FROM assets.asset_maintenance_records WHERE company_id = OLD.id
    UNION ALL SELECT 1 FROM assets.software_vendors WHERE company_id = OLD.id
    UNION ALL SELECT 1 FROM assets.asset_recovery_tickets WHERE company_id = OLD.id
    UNION ALL SELECT 1 FROM assets.asset_command_results WHERE company_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'company profile is referenced by asset data'
      USING ERRCODE = '23503',
        CONSTRAINT = 'platform_company_profile_asset_reference';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'assets', 'asset_assignments', 'asset_requests', 'asset_acknowledgements',
    'asset_maintenance_records', 'software_vendors', 'asset_recovery_tickets',
    'asset_command_results'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS prevent_company_ownership_change_trg ON assets.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER prevent_company_ownership_change_trg '
      || 'BEFORE UPDATE OF company_id ON assets.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION assets.prevent_company_ownership_change()',
      table_name
    );
  END LOOP;
END;
$$;
