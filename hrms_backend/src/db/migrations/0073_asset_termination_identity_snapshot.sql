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

-- Freeze the complete historical input set before validation and keep
-- ordinary outbox/evidence writers excluded until finalization triggers are
-- installed in this same transaction.
LOCK TABLE platform.outbox_events, core.user_termination_identity_evidence
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  invalid_legacy_evidence_count bigint;
BEGIN
  SELECT count(*) INTO invalid_legacy_evidence_count
    FROM core.user_termination_identity_evidence evidence
    FULL JOIN platform.outbox_events event
      ON event.event_id = evidence.lifecycle_event_id
     AND event.aggregate_type = 'core.user'
     AND event.event_type = 'core.user.terminated'
   WHERE event.event_id IS NULL
      OR evidence.lifecycle_event_id IS NULL
      OR evidence.employee_user_id <> event.aggregate_id
      OR event.payload->>'user_id' IS DISTINCT FROM event.aggregate_id::text
      OR event.payload->>'employee_code' IS NULL
      OR btrim(event.payload->>'employee_code') = ''
      OR evidence.employee_code_snapshot IS DISTINCT FROM event.payload->>'employee_code'
      OR event.idempotency_key IS DISTINCT FROM (
        'core.user.deactivated:' || event.aggregate_id::text || ':' || evidence.employee_version::text
      )
      OR (
        event.payload ? 'company_id'
        AND event.payload->>'company_id' IS DISTINCT FROM evidence.company_id::text
      )
      OR (
        event.payload ? 'employee_version'
        AND event.payload->>'employee_version' IS DISTINCT FROM evidence.employee_version::text
      )
      OR btrim(evidence.employee_full_name_snapshot) = ''
      OR btrim(evidence.employee_code_snapshot) = ''
      OR btrim(evidence.source_reference) = ''
      OR NOT EXISTS (
        SELECT 1 FROM platform.company_profiles company
         WHERE company.id = evidence.company_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM core.users employee
         WHERE employee.id = evidence.employee_user_id
      )
      OR NOT EXISTS (
        SELECT 1
          FROM core.users verifier
          JOIN platform.user_session_preferences preference
            ON preference.user_id = verifier.id
           AND preference.company_id = evidence.company_id
         WHERE verifier.id = evidence.verified_by_user_id
           AND verifier.deleted_at IS NULL
           AND verifier.employment_status = 'active'
           AND preference.active_role IN ('Admin', 'HR Manager')
      )
      OR NOT EXISTS (
        SELECT 1
          FROM core.users approver
          JOIN platform.user_session_preferences preference
            ON preference.user_id = approver.id
           AND preference.company_id = evidence.company_id
         WHERE approver.id = evidence.approved_by_user_id
           AND approver.id <> evidence.verified_by_user_id
           AND approver.deleted_at IS NULL
           AND approver.employment_status = 'active'
           AND preference.active_role IN ('Admin', 'HR Manager')
      )
      OR EXISTS (
        SELECT 1
          FROM (
            SELECT assignment.company_id
              FROM assets.asset_assignments assignment
             WHERE assignment.assigned_to_user_id = evidence.employee_user_id
               AND (
                 assignment.status = 'active'
                 OR (
                   assignment.assigned_at <= event.created_at
                   AND (assignment.returned_at IS NULL OR assignment.returned_at > event.created_at)
                 )
               )
            UNION
            SELECT ticket.company_id
              FROM assets.asset_recovery_tickets ticket
             WHERE ticket.employee_user_id = evidence.employee_user_id
          ) ownership_source
        HAVING count(*) > 0
           AND (
             count(DISTINCT ownership_source.company_id) <> 1
             OR min(ownership_source.company_id::text) <> evidence.company_id::text
           )
      );
  IF invalid_legacy_evidence_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Pre-snapshot termination evidence is missing, extra, blank, mismatched or unverified.',
      HINT = 'Stage exactly one independently verified original-company identity row for every historical termination event.';
  END IF;
END $$;

INSERT INTO core.user_termination_identity_snapshots (
  lifecycle_event_id, company_id, employee_user_id,
  employee_full_name_snapshot, employee_code_snapshot, employee_version,
  captured_at
)
SELECT evidence.lifecycle_event_id, evidence.company_id, evidence.employee_user_id,
       evidence.employee_full_name_snapshot, evidence.employee_code_snapshot,
       evidence.employee_version, evidence.verified_at
  FROM core.user_termination_identity_evidence evidence
  JOIN platform.outbox_events event
    ON event.event_id = evidence.lifecycle_event_id
   AND event.aggregate_type = 'core.user'
   AND event.event_type = 'core.user.terminated'
   AND event.aggregate_id = evidence.employee_user_id;

DO $$
DECLARE
  unresolved_legacy_termination_count bigint;
BEGIN
  SELECT count(*) INTO unresolved_legacy_termination_count
    FROM platform.outbox_events event
   WHERE event.aggregate_type = 'core.user'
     AND event.event_type = 'core.user.terminated'
     AND NOT EXISTS (
       SELECT 1
         FROM core.user_termination_identity_snapshots snapshot
        WHERE snapshot.lifecycle_event_id = event.event_id
          AND snapshot.employee_user_id = event.aggregate_id
     );
  IF unresolved_legacy_termination_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Replayable pre-snapshot termination events require reviewed reconciliation.',
      HINT = 'Stage verified identity evidence for every historical termination event, including published and dead-letter rows, before applying migration 0073.';
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

DROP TRIGGER IF EXISTS user_termination_identity_evidence_finalized_trg
  ON core.user_termination_identity_evidence;
CREATE TRIGGER user_termination_identity_evidence_finalized_trg
  BEFORE INSERT OR UPDATE OR DELETE ON core.user_termination_identity_evidence
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
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE
  ON core.user_termination_identity_evidence FROM PUBLIC;
