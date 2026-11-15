-- Capture immutable employee identity at the same commit as a durable
-- core.user.terminated event. The outbox carries identifiers only; broad
-- event delivery never receives the employee name.

CREATE TABLE IF NOT EXISTS core.user_termination_identity_snapshots (
  lifecycle_event_id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  employee_full_name_snapshot text NOT NULL CHECK (btrim(employee_full_name_snapshot) <> ''),
  employee_code_snapshot text NOT NULL CHECK (btrim(employee_code_snapshot) <> ''),
  employee_version integer NOT NULL CHECK (employee_version > 0),
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_termination_identity_company_employee_idx
  ON core.user_termination_identity_snapshots (company_id, employee_user_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS asset_requests_company_numeric_code_idx
  ON assets.asset_requests (
    company_id,
    ((substring(request_code FROM '^REQ-([0-9]+)$'))::numeric) DESC
  )
  WHERE request_code ~ '^REQ-[0-9]+$';

DO $$
DECLARE
  pending_legacy_termination_count bigint;
BEGIN
  SELECT count(*) INTO pending_legacy_termination_count
    FROM platform.outbox_events
   WHERE aggregate_type = 'core.user'
     AND event_type = 'core.user.terminated'
     AND status IN ('pending', 'retry');
  IF pending_legacy_termination_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Pending pre-snapshot termination events require reviewed reconciliation.',
      HINT = 'Resolve each pending or retry termination event under its original company before applying migration 0073.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION core.capture_user_termination_identity_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, platform
AS $$
DECLARE
  payload_company_id uuid;
  payload_employee_id uuid;
  payload_employee_version integer;
  employee_record record;
  membership_count bigint;
BEGIN
  IF NEW.aggregate_type <> 'core.user' OR NEW.event_type <> 'core.user.terminated' THEN
    RETURN NEW;
  END IF;
  BEGIN
    payload_company_id := NULLIF(NEW.payload->>'company_id', '')::uuid;
    payload_employee_id := NULLIF(NEW.payload->>'user_id', '')::uuid;
    payload_employee_version := NULLIF(NEW.payload->>'employee_version', '')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Malformed termination identity reference.';
  END;
  IF payload_company_id IS NULL OR payload_employee_id IS NULL OR payload_employee_version IS NULL
     OR payload_employee_id <> NEW.aggregate_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Complete termination identity evidence is required.';
  END IF;
  SELECT count(*) INTO membership_count
    FROM core.users u
    JOIN platform.user_session_preferences preference ON preference.user_id = u.id
   WHERE u.id = payload_employee_id
     AND u.version = payload_employee_version
     AND preference.company_id = payload_company_id;
  IF membership_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Termination company does not match exactly one durable employee membership.';
  END IF;
  SELECT u.full_name, u.employee_code, u.version
    INTO employee_record
    FROM core.users u
    JOIN platform.user_session_preferences preference ON preference.user_id = u.id
   WHERE u.id = payload_employee_id AND u.version = payload_employee_version
     AND preference.company_id = payload_company_id
     AND u.employment_status = 'terminated'
     AND u.terminated_on IS NOT NULL
   FOR SHARE OF u, preference;
  IF NOT FOUND OR btrim(employee_record.full_name) = '' OR btrim(employee_record.employee_code) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Termination identity does not match the committed terminated employee version.';
  END IF;
  INSERT INTO core.user_termination_identity_snapshots (
    lifecycle_event_id, company_id, employee_user_id,
    employee_full_name_snapshot, employee_code_snapshot, employee_version
  ) VALUES (
    NEW.event_id, payload_company_id, payload_employee_id,
    employee_record.full_name, employee_record.employee_code, employee_record.version
  );
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION core.capture_user_termination_identity_snapshot() FROM PUBLIC;

DROP TRIGGER IF EXISTS capture_user_termination_identity_snapshot_trg ON platform.outbox_events;
CREATE TRIGGER capture_user_termination_identity_snapshot_trg
  AFTER INSERT ON platform.outbox_events
  FOR EACH ROW EXECUTE FUNCTION core.capture_user_termination_identity_snapshot();

CREATE OR REPLACE FUNCTION core.reject_user_termination_identity_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Termination identity evidence is immutable.';
END $$;

DROP TRIGGER IF EXISTS user_termination_identity_snapshot_immutable_trg
  ON core.user_termination_identity_snapshots;
CREATE TRIGGER user_termination_identity_snapshot_immutable_trg
  BEFORE UPDATE OR DELETE ON core.user_termination_identity_snapshots
  FOR EACH ROW EXECUTE FUNCTION core.reject_user_termination_identity_snapshot_mutation();

ALTER TABLE assets.asset_recovery_tickets
  ADD COLUMN IF NOT EXISTS lifecycle_event_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS asset_recovery_lifecycle_asset_uq
  ON assets.asset_recovery_tickets (lifecycle_event_id, asset_id)
  WHERE lifecycle_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION assets.reject_asset_recovery_identity_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Asset recovery history is immutable.';
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.employee_user_id IS DISTINCT FROM OLD.employee_user_id
     OR NEW.employee_full_name_snapshot IS DISTINCT FROM OLD.employee_full_name_snapshot
     OR NEW.employee_code_snapshot IS DISTINCT FROM OLD.employee_code_snapshot
     OR NEW.lifecycle_event_id IS DISTINCT FROM OLD.lifecycle_event_id
     OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
     OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Asset recovery ownership and historical identity are immutable.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS asset_recovery_identity_immutable_trg
  ON assets.asset_recovery_tickets;
CREATE TRIGGER asset_recovery_identity_immutable_trg
  BEFORE UPDATE OR DELETE ON assets.asset_recovery_tickets
  FOR EACH ROW EXECUTE FUNCTION assets.reject_asset_recovery_identity_mutation();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON core.user_termination_identity_snapshots FROM PUBLIC;
