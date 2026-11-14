-- Asset commands are committed by the v2 request-local transaction boundary.
-- Old API binaries do not set this transaction-local marker, so their
-- whole-domain snapshot upserts fail instead of replacing newer rows.
CREATE OR REPLACE FUNCTION assets.require_transactional_writer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('hrms.asset_writer_v2', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Asset writes require the transactional command boundary'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS assets.asset_command_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  action_key text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_command_results_action_length CHECK (length(action_key) BETWEEN 3 AND 300),
  CONSTRAINT asset_command_results_key_length CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT asset_command_results_hash_length CHECK (length(request_hash) = 64),
  CONSTRAINT asset_command_results_scope_key_uq UNIQUE
    (company_id, actor_user_id, action_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS asset_command_results_committed_idx
  ON assets.asset_command_results (committed_at);

-- A single active assignment is a durable invariant, including for writers
-- that bypass the API. Existing duplicate rows require explicit repair before
-- this migration can be applied; do not silently discard payroll/audit history.
CREATE UNIQUE INDEX IF NOT EXISTS asset_assignments_one_active_per_asset_uq
  ON assets.asset_assignments (asset_id)
  WHERE status = 'active';

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'assets',
    'asset_assignments',
    'asset_state_events',
    'asset_requests',
    'asset_acknowledgements',
    'asset_maintenance_records',
    'software_vendors',
    'software_products',
    'asset_recovery_tickets',
    'license_entitlements',
    'license_activations',
    'compromised_keys',
    'asset_command_results'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS require_transactional_writer_trg ON assets.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER require_transactional_writer_trg '
      || 'BEFORE INSERT OR UPDATE OR DELETE ON assets.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION assets.require_transactional_writer()',
      table_name
    );
  END LOOP;
END;
$$;
