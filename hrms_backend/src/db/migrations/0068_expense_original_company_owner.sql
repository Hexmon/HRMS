-- Deploy only after the legacy expense writers have drained. Their full-store
-- flush does not provide a typed ticket owner and must never run after this
-- guard becomes active. Legacy context_payload.company_id and requester audit
-- were writable by the old application and do not independently prove the
-- original company. Every historical row is quarantined. Owner repair must
-- use a separate, human-reviewed forward migration with immutable audit.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='expenses' AND table_name='expense_tickets' AND column_name='company_id'
  ) THEN
    ALTER TABLE expenses.expense_tickets
      ADD COLUMN company_id uuid NULL,
      ADD COLUMN owner_resolution_status text NOT NULL DEFAULT 'quarantined',
      ADD COLUMN owner_resolution_reason text NULL;
    UPDATE expenses.expense_tickets
    SET company_id = NULL,
        owner_resolution_status = 'quarantined',
        owner_resolution_reason = 'legacy_owner_unverified';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='expense_ticket_owner_resolution_ck'
      AND conrelid='expenses.expense_tickets'::regclass
  ) THEN
    ALTER TABLE expenses.expense_tickets
      ADD CONSTRAINT expense_ticket_owner_resolution_ck CHECK (
        (company_id IS NULL AND owner_resolution_status = 'quarantined' AND owner_resolution_reason IS NOT NULL)
        OR
        (company_id IS NOT NULL AND owner_resolution_status IN ('typed_creation', 'audited_repair') AND owner_resolution_reason IS NULL)
      );
  END IF;
END $$;

-- Test/bootstrap tooling can reapply the ordered idempotent bundle to an
-- already-migrated database. Earlier migrations may touch tickets and queue
-- this migration's existing deferred constraint triggers in the surrounding
-- transaction. Validate those queued events at the migration boundary before
-- issuing CREATE INDEX/trigger DDL; first-time installs have no such triggers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='expenses.expense_tickets'::regclass
      AND tgname='expense_ticket_repair_evidence_consistency_trg'
  ) THEN
    SET CONSTRAINTS expenses.expense_ticket_repair_evidence_consistency_trg,
      expenses.expense_owner_repair_evidence_consistency_trg IMMEDIATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS expense_tickets_company_status_updated_idx
  ON expenses.expense_tickets (company_id, status, updated_at DESC, id)
  WHERE deleted_at IS NULL AND company_id IS NOT NULL;

-- The old binary's response-end full-store UPSERT can overwrite a later
-- same-company version even when owner is unchanged. Only new request-local
-- commands set this transaction-local marker; draining old binaries remains
-- mandatory because marker alone is not a user authorization policy.
CREATE OR REPLACE FUNCTION expenses.require_transaction_command()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.expense_command_v1', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Expense writes require a transaction-owned command'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'expense_tickets', 'expense_line_items', 'expense_approvals',
    'expense_audit_logs', 'expense_documents', 'expense_payments',
    'employee_reviewer_mappings', 'expense_policy_rules'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger trigger
      WHERE trigger.tgrelid = format('expenses.%I', table_name)::regclass
        AND trigger.tgname = table_name || '_command_guard_trg'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON expenses.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION expenses.require_transaction_command()',
        table_name || '_command_guard_trg', table_name
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION expenses.enforce_ticket_original_company()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  recorded_company_text text;
  matching_repair_evidence integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.company_id IS NULL THEN
      -- This marker is a transaction fence, not authorization. The repair
      -- runbook must use a dedicated migration role that can insert immutable
      -- repair evidence; the application runtime role must not receive that
      -- privilege. Evidence is deliberately audit-first so the guard never
      -- needs to be disabled and there is no committed bypass window.
      IF current_setting('app.expense_owner_repair_v1', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Quarantined expense ticket requires the audited repair path'
          USING ERRCODE = '23514', CONSTRAINT = 'expense_owner_repair_evidence_consistency';
      END IF;
      IF NEW.company_id IS NULL OR NEW.owner_resolution_status <> 'audited_repair'
         OR NEW.owner_resolution_reason IS NOT NULL THEN
        RAISE EXCEPTION 'Audited expense repair requires a typed company owner'
          USING ERRCODE = '23514', CONSTRAINT = 'expense_owner_repair_evidence_consistency';
      END IF;
      IF (to_jsonb(NEW) - ARRAY['company_id','owner_resolution_status','owner_resolution_reason'])
         IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['company_id','owner_resolution_status','owner_resolution_reason']) THEN
        RAISE EXCEPTION 'Audited expense repair may change only owner resolution fields'
          USING ERRCODE = '23514', CONSTRAINT = 'expense_owner_repair_evidence_consistency';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM platform.company_profiles company WHERE company.id = NEW.company_id
      ) THEN
        RAISE EXCEPTION 'Repaired expense company identity does not exist'
          USING ERRCODE = '23514', CONSTRAINT = 'expense_owner_repair_evidence_consistency';
      END IF;
      SELECT count(*) INTO matching_repair_evidence
      FROM expenses.expense_owner_repair_audit audit
      WHERE audit.ticket_id = OLD.id
        AND audit.repaired_company_id = NEW.company_id
        AND audit.original_context_payload = OLD.context_payload;
      IF matching_repair_evidence <> 1 THEN
        RAISE EXCEPTION 'Audited expense repair requires one matching immutable audit row'
          USING ERRCODE = '23514', CONSTRAINT = 'expense_owner_repair_evidence_consistency';
      END IF;
    ELSE
      IF NEW.company_id IS DISTINCT FROM OLD.company_id
         OR NEW.owner_resolution_status IS DISTINCT FROM OLD.owner_resolution_status
         OR NEW.owner_resolution_reason IS DISTINCT FROM OLD.owner_resolution_reason THEN
        RAISE EXCEPTION 'Expense original company owner is immutable'
          USING ERRCODE = '23514';
      END IF;
      IF OLD.owner_resolution_status = 'audited_repair'
         AND NEW.context_payload IS DISTINCT FROM OLD.context_payload THEN
        RAISE EXCEPTION 'Audited expense creation context is immutable'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF NEW.company_id IS NULL OR NEW.owner_resolution_status <> 'typed_creation'
        OR NEW.owner_resolution_reason IS NOT NULL THEN
    RAISE EXCEPTION 'New expense ticket requires a typed original company owner'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.owner_resolution_status = 'typed_creation' THEN
    recorded_company_text := NEW.context_payload->>'company_id';
    IF jsonb_typeof(NEW.context_payload->'company_id') IS DISTINCT FROM 'string'
       OR recorded_company_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Expense creation company evidence is missing or malformed'
        USING ERRCODE = '23514';
    END IF;
    IF recorded_company_text::uuid IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Expense creation company evidence differs from original owner'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM platform.company_profiles company WHERE company.id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Expense original company identity does not exist'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='expenses.expense_tickets'::regclass
    AND tgname='expense_ticket_original_company_guard_trg') THEN
    CREATE TRIGGER expense_ticket_original_company_guard_trg
      BEFORE INSERT OR UPDATE ON expenses.expense_tickets
      FOR EACH ROW EXECUTE FUNCTION expenses.enforce_ticket_original_company();
  END IF;
END $$;

-- A future evidence-reviewed repair migration records its provenance here in
-- the same transaction as the owner change. No application repair route is
-- created by this migration.
CREATE TABLE IF NOT EXISTS expenses.expense_owner_repair_audit (
  ticket_id uuid PRIMARY KEY REFERENCES expenses.expense_tickets(id) ON DELETE RESTRICT,
  original_context_payload jsonb NOT NULL,
  repaired_company_id uuid NOT NULL,
  evidence_reference text NOT NULL CHECK (length(trim(evidence_reference)) > 0),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  reviewed_by text NOT NULL CHECK (length(trim(reviewed_by)) > 0),
  applied_by text NOT NULL CHECK (length(trim(applied_by)) > 0),
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='expenses.expense_owner_repair_audit'::regclass
    AND tgname='expense_owner_repair_audit_immutable_trg') THEN
    CREATE TRIGGER expense_owner_repair_audit_immutable_trg
      BEFORE UPDATE OR DELETE ON expenses.expense_owner_repair_audit
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;

-- Repair evidence and repaired ownership form one deferred invariant. A
-- privileged forward migration writes immutable evidence first and repairs
-- the ticket in the same transaction. The committed state must contain a
-- one-to-one, same-company pair. Ordinary typed/quarantined tickets must not
-- acquire a misleading repair-audit row.
CREATE OR REPLACE FUNCTION expenses.enforce_owner_repair_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  subject_ticket_id uuid;
  ticket_status text;
  ticket_company_id uuid;
  audit_count integer;
  matching_audit_count integer;
BEGIN
  IF TG_TABLE_NAME = 'expense_tickets' THEN
    subject_ticket_id := COALESCE(NEW.id, OLD.id);
  ELSE
    subject_ticket_id := COALESCE(NEW.ticket_id, OLD.ticket_id);
  END IF;

  SELECT owner_resolution_status, company_id
    INTO ticket_status, ticket_company_id
  FROM expenses.expense_tickets
  WHERE id = subject_ticket_id;

  SELECT count(*), count(*) FILTER (WHERE repaired_company_id = ticket_company_id)
    INTO audit_count, matching_audit_count
  FROM expenses.expense_owner_repair_audit
  WHERE ticket_id = subject_ticket_id;

  IF ticket_status IS NULL THEN
    IF audit_count <> 0 THEN
      RAISE EXCEPTION 'Expense owner repair audit has no ticket'
        USING ERRCODE = '23514', CONSTRAINT = 'expense_owner_repair_evidence_consistency';
    END IF;
    RETURN NULL;
  END IF;

  IF ticket_status = 'audited_repair' THEN
    IF ticket_company_id IS NULL OR audit_count <> 1 OR matching_audit_count <> 1 THEN
      RAISE EXCEPTION 'Audited expense owner requires exactly one matching repair audit'
        USING ERRCODE = '23514', CONSTRAINT = 'expense_owner_repair_evidence_consistency';
    END IF;
  ELSIF audit_count <> 0 THEN
    RAISE EXCEPTION 'Expense owner repair audit requires an audited repair ticket'
      USING ERRCODE = '23514', CONSTRAINT = 'expense_owner_repair_evidence_consistency';
  END IF;
  RETURN NULL;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM expenses.expense_tickets ticket
    LEFT JOIN expenses.expense_owner_repair_audit audit ON audit.ticket_id = ticket.id
    WHERE (ticket.owner_resolution_status = 'audited_repair'
           AND (ticket.company_id IS NULL OR audit.ticket_id IS NULL
                OR audit.repaired_company_id IS DISTINCT FROM ticket.company_id))
       OR (ticket.owner_resolution_status <> 'audited_repair' AND audit.ticket_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Existing expense owner repair evidence is inconsistent'
      USING ERRCODE = '23514', CONSTRAINT = 'expense_owner_repair_evidence_consistency';
  END IF;
END $$;

DROP TRIGGER IF EXISTS expense_ticket_repair_evidence_consistency_trg
  ON expenses.expense_tickets;
CREATE CONSTRAINT TRIGGER expense_ticket_repair_evidence_consistency_trg
  AFTER INSERT OR UPDATE OR DELETE ON expenses.expense_tickets
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION expenses.enforce_owner_repair_evidence();

DROP TRIGGER IF EXISTS expense_owner_repair_evidence_consistency_trg
  ON expenses.expense_owner_repair_audit;
CREATE CONSTRAINT TRIGGER expense_owner_repair_evidence_consistency_trg
  AFTER INSERT OR UPDATE OR DELETE ON expenses.expense_owner_repair_audit
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION expenses.enforce_owner_repair_evidence();

-- Keep committed Finance command results for exact uncertain-response replay.
-- There is no automatic purge until a tombstone/retention design is approved.
CREATE TABLE IF NOT EXISTS expenses.expense_command_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES expenses.expense_tickets(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('finance.approve', 'finance.payment', 'settlement')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, actor_user_id, action, idempotency_key)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='expenses.expense_command_results'::regclass
    AND tgname='expense_command_results_immutable_trg') THEN
    CREATE TRIGGER expense_command_results_immutable_trg
      BEFORE UPDATE OR DELETE ON expenses.expense_command_results
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;
