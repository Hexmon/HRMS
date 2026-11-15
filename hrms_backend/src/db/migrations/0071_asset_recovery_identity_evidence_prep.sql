-- Staging surface for independently verified original-company recovery
-- identity. Operators populate and review this table before migration 0072.

CREATE TABLE IF NOT EXISTS assets.asset_recovery_identity_evidence (
  ticket_id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  employee_full_name_snapshot text NOT NULL,
  employee_code_snapshot text NOT NULL,
  source_reference text NOT NULL,
  verified_by_user_id uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);

-- Historical termination events created before migration 0073 do not have
-- an atomic identity snapshot. Stage independently verified transition-time
-- identity for every such event, regardless of its current outbox status:
-- published and dead-letter events remain replayable.
CREATE TABLE IF NOT EXISTS core.user_termination_identity_evidence (
  lifecycle_event_id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  employee_full_name_snapshot text NOT NULL,
  employee_code_snapshot text NOT NULL,
  employee_version integer NOT NULL CHECK (employee_version > 0),
  source_reference text NOT NULL,
  verified_by_user_id uuid NOT NULL,
  approved_by_user_id uuid NOT NULL,
  CHECK (approved_by_user_id <> verified_by_user_id),
  verified_at timestamptz NOT NULL DEFAULT now()
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON assets.asset_recovery_identity_evidence FROM PUBLIC;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE
  ON core.user_termination_identity_evidence FROM PUBLIC;
