-- TEN-S25-021: durable, tenant-owned media publication.
-- This migration is additive. Legacy ownership is activated only when a
-- company-profile pointer proves one unique company; every other legacy row
-- remains retained but quarantined for an audited repair.

ALTER TABLE documents.doc_metadata
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'quarantined',
  ADD COLUMN IF NOT EXISTS replaced_by_document_id uuid,
  ADD COLUMN IF NOT EXISTS lifecycle_reason text;

WITH candidate_owners AS (
  SELECT metadata.id AS document_id, company.id AS company_id,
         (company.logo_document_id = metadata.id) AS is_current_pointer
  FROM documents.doc_metadata metadata
  JOIN platform.company_profiles company
    ON metadata.business_object_type='company_profile'
   AND metadata.business_object_id=company.id
  UNION ALL
  SELECT metadata.id, preference.company_id, true
  FROM documents.doc_metadata metadata
  JOIN core.users employee
    ON metadata.business_object_type='core_user'
   AND metadata.business_object_id=employee.id
   AND metadata.document_type='profile_photo'
   AND employee.profile_photo_document_id=metadata.id
  JOIN platform.user_session_preferences preference
    ON preference.user_id=employee.id AND preference.company_id IS NOT NULL
  UNION ALL
  SELECT metadata.id, ticket.company_id, true
  FROM documents.doc_metadata metadata
  JOIN expenses.expense_tickets ticket
    ON metadata.business_object_type='expense_ticket'
   AND metadata.business_object_id=ticket.id
  WHERE ticket.company_id IS NOT NULL
), unambiguous AS (
  SELECT document_id,min(company_id::text)::uuid AS company_id,bool_or(is_current_pointer) AS is_current_pointer
  FROM candidate_owners
  GROUP BY document_id
  HAVING count(DISTINCT company_id)=1
)
UPDATE documents.doc_metadata metadata
SET company_id=owner.company_id,
    lifecycle_state=CASE
      WHEN metadata.deleted_at IS NOT NULL THEN 'tombstoned'
      WHEN metadata.document_type IN ('company_logo','profile_photo') AND NOT owner.is_current_pointer THEN 'replaced'
      ELSE 'active'
    END,
    lifecycle_reason=NULL
FROM unambiguous owner
WHERE metadata.id=owner.document_id AND metadata.company_id IS NULL;

UPDATE documents.doc_metadata
SET lifecycle_state = 'quarantined',
    lifecycle_reason = COALESCE(lifecycle_reason, 'legacy_company_owner_unverified')
WHERE company_id IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_metadata_lifecycle_state_ck'
      AND conrelid = 'documents.doc_metadata'::regclass
  ) THEN
    ALTER TABLE documents.doc_metadata
      ADD CONSTRAINT documents_metadata_lifecycle_state_ck
      CHECK (lifecycle_state IN ('staged','active','replaced','tombstoned','quarantined'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_metadata_tenant_state_company_ck'
      AND conrelid = 'documents.doc_metadata'::regclass
  ) THEN
    ALTER TABLE documents.doc_metadata
      ADD CONSTRAINT documents_metadata_tenant_state_company_ck
      CHECK (
        lifecycle_state = 'quarantined'
        OR (company_id IS NOT NULL AND lifecycle_state IN ('staged','active','replaced','tombstoned'))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='documents_metadata_replaced_by_fk'
      AND conrelid='documents.doc_metadata'::regclass
  ) THEN
    ALTER TABLE documents.doc_metadata
      ADD CONSTRAINT documents_metadata_replaced_by_fk
      FOREIGN KEY (replaced_by_document_id) REFERENCES documents.doc_metadata(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS documents_metadata_company_lifecycle_idx
  ON documents.doc_metadata (company_id,lifecycle_state,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS documents_metadata_replacement_idx
  ON documents.doc_metadata (replaced_by_document_id)
  WHERE replaced_by_document_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS documents.document_owner_repair_audit (
  document_id uuid PRIMARY KEY,
  repaired_company_id uuid NOT NULL,
  evidence_reference text NOT NULL,
  evidence_sha256 text NOT NULL CONSTRAINT document_owner_repair_audit_evidence_sha256_ck
    CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  reviewed_by text NOT NULL,
  applied_by text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION documents.enforce_document_company_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    IF OLD.company_id IS NULL AND NEW.company_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM documents.document_owner_repair_audit audit
      WHERE audit.document_id=OLD.id AND audit.repaired_company_id=NEW.company_id
    ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Document company ownership is immutable'
      USING ERRCODE='23514', CONSTRAINT='documents_metadata_company_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_metadata_company_immutable_trg
  ON documents.doc_metadata;
CREATE TRIGGER documents_metadata_company_immutable_trg
  BEFORE UPDATE ON documents.doc_metadata
  FOR EACH ROW EXECUTE FUNCTION documents.enforce_document_company_immutable();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='documents.document_owner_repair_audit'::regclass
      AND tgname='document_owner_repair_audit_immutable_trg'
  ) THEN
    CREATE TRIGGER document_owner_repair_audit_immutable_trg
      BEFORE UPDATE OR DELETE ON documents.document_owner_repair_audit
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS documents.media_upload_intents (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  operation text NOT NULL CONSTRAINT media_upload_intents_operation_ck
    CHECK (operation IN ('create','replace_company_logo','replace_profile_photo')),
  parent_type text NOT NULL CONSTRAINT media_upload_intents_parent_type_ck
    CHECK (parent_type IN ('generic','company_profile','core_user')),
  parent_id uuid NOT NULL,
  business_object_type text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL CONSTRAINT media_upload_intents_request_fingerprint_ck
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  object_key text NOT NULL,
  document_id uuid NOT NULL,
  expected_pointer_document_id uuid,
  expected_parent_version integer,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  measured_size_bytes bigint NOT NULL CONSTRAINT media_upload_intents_measured_size_bytes_ck
    CHECK (measured_size_bytes > 0),
  checksum_sha256 text NOT NULL CONSTRAINT media_upload_intents_checksum_sha256_ck
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  classification text NOT NULL,
  document_type text NOT NULL,
  owner_user_id uuid,
  state text NOT NULL DEFAULT 'prepared' CONSTRAINT media_upload_intents_state_ck
    CHECK (state IN ('prepared','uploading','retry_wait','object_confirmed','finalized','quarantined','failed')),
  provider_etag text,
  provider_size_bytes bigint,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  lease_owner text,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CONSTRAINT media_upload_intents_attempt_count_ck
    CHECK (attempt_count >= 0),
  last_safe_error text,
  expires_at timestamptz NOT NULL,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS media_upload_intents_scope_key_uq
  ON documents.media_upload_intents (company_id,actor_user_id,operation,idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS media_upload_intents_object_key_uq
  ON documents.media_upload_intents (object_key);
CREATE UNIQUE INDEX IF NOT EXISTS media_upload_intents_document_id_uq
  ON documents.media_upload_intents (document_id);
CREATE INDEX IF NOT EXISTS media_upload_intents_reconcile_idx
  ON documents.media_upload_intents (state,lease_expires_at,created_at,id)
  WHERE state IN ('prepared','uploading','retry_wait','object_confirmed');
CREATE INDEX IF NOT EXISTS media_upload_intents_parent_idx
  ON documents.media_upload_intents (company_id,parent_type,parent_id,created_at DESC);

CREATE TABLE IF NOT EXISTS documents.media_lifecycle_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  document_id uuid NOT NULL,
  intent_id uuid,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  previous_state text,
  new_state text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_lifecycle_audit_company_document_idx
  ON documents.media_lifecycle_audit (company_id,document_id,created_at,id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='documents.media_lifecycle_audit'::regclass
      AND tgname='media_lifecycle_audit_immutable_trg'
  ) THEN
    CREATE TRIGGER media_lifecycle_audit_immutable_trg
      BEFORE UPDATE OR DELETE ON documents.media_lifecycle_audit
      FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;
