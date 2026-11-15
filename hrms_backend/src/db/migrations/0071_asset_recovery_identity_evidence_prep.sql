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

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON assets.asset_recovery_identity_evidence FROM PUBLIC;
