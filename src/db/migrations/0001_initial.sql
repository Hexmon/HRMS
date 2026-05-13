CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS expenses;
CREATE SCHEMA IF NOT EXISTS documents;
CREATE SCHEMA IF NOT EXISTS assets;
CREATE SCHEMA IF NOT EXISTS timesheets;
CREATE SCHEMA IF NOT EXISTS platform;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS ltree;

CREATE OR REPLACE FUNCTION platform.prevent_immutable_update_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable audit/log rows cannot be updated or deleted';
END;
$$;

CREATE TABLE IF NOT EXISTS core.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_code text NOT NULL UNIQUE,
  name text NOT NULL,
  parent_department_id uuid NULL,
  director_user_id uuid NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS core.designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designation_code text NOT NULL UNIQUE,
  title text NOT NULL,
  level integer NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS core.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  department_id uuid NULL,
  designation_id uuid NULL,
  manager_user_id uuid NULL,
  hierarchy_path ltree NOT NULL,
  employment_status text NOT NULL,
  timezone text NULL,
  joined_on date NULL,
  terminated_on date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS core_users_hierarchy_path_gist_idx ON core.users USING gist (hierarchy_path);
CREATE INDEX IF NOT EXISTS core_users_department_status_idx ON core.users (department_id, employment_status);
CREATE INDEX IF NOT EXISTS core_users_manager_idx ON core.users (manager_user_id);
CREATE INDEX IF NOT EXISTS core_users_status_updated_idx ON core.users (employment_status, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS core.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS core.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_key text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  effective_from date NOT NULL,
  effective_to date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS core_user_roles_lookup_idx ON core.user_roles (user_id, status, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS platform.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_jti text NOT NULL UNIQUE,
  valkey_key text NOT NULL,
  ip_hash text NULL,
  user_agent_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  revoked_reason text NULL
);

CREATE INDEX IF NOT EXISTS platform_sessions_user_active_idx ON platform.user_sessions (user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS platform.user_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL CONSTRAINT platform_user_credentials_user_uq UNIQUE,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS platform_user_credentials_status_idx ON platform.user_credentials (user_id, status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS platform.finance_governance_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL UNIQUE DEFAULT 'global',
  primary_finance_manager_user_id uuid NOT NULL,
  finance_self_request_fallback_user_id uuid NULL,
  manager_backup_user_id uuid NULL,
  finance_approval_backup_user_id uuid NULL,
  status text NOT NULL DEFAULT 'active',
  effective_from date NOT NULL,
  effective_to date NULL,
  updated_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS platform_finance_governance_status_idx
  ON platform.finance_governance_config (status, effective_from, effective_to)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS platform.idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  idempotency_key text NOT NULL,
  actor_user_id uuid NOT NULL,
  request_hash text NOT NULL,
  response_hash text NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (scope, idempotency_key, actor_user_id)
);

CREATE INDEX IF NOT EXISTS platform_idempotency_expires_idx ON platform.idempotency_keys (expires_at);

CREATE TABLE IF NOT EXISTS platform.outbox_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NULL,
  failed_at timestamptz NULL,
  last_error text NULL
);

ALTER TABLE platform.outbox_events
  ADD COLUMN IF NOT EXISTS failed_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS platform_outbox_pending_idx ON platform.outbox_events (status, available_at, id);

CREATE TABLE IF NOT EXISTS platform.processed_events (
  consumer_name text NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, event_id)
);

CREATE TABLE IF NOT EXISTS expenses.expense_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no text NOT NULL UNIQUE,
  requester_user_id uuid NOT NULL,
  requester_role_snapshot text NOT NULL,
  department_id uuid NOT NULL,
  expense_type text NOT NULL,
  expense_sub_type text NOT NULL,
  project_code text NULL,
  client_name text NULL,
  task_title text NOT NULL,
  task_description text NOT NULL,
  location text NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  estimated_amount numeric(14,2) NOT NULL,
  payment_type text NOT NULL,
  advance_amount numeric(14,2) NULL,
  advance_justification text NULL,
  assigned_reviewer_id uuid NULL,
  director_approver_id uuid NULL,
  finance_manager_id uuid NULL,
  manager_verifier_id uuid NULL,
  manager_backup_user_id uuid NULL,
  finance_approver_id uuid NULL,
  status text NOT NULL,
  actual_amount numeric(14,2) NULL,
  variance_amount numeric(14,2) NULL,
  payment_reference_no text NULL,
  closure_remarks text NULL,
  context_payload jsonb NOT NULL DEFAULT '{}',
  route_snapshot jsonb NOT NULL DEFAULT '{}',
  policy_snapshot jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NULL,
  closed_at timestamptz NULL,
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS expenses_tickets_requester_queue_idx ON expenses.expense_tickets (requester_user_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_tickets_reviewer_queue_idx ON expenses.expense_tickets (assigned_reviewer_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_tickets_director_queue_idx ON expenses.expense_tickets (director_approver_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_tickets_finance_queue_idx ON expenses.expense_tickets (finance_manager_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_tickets_manager_queue_idx ON expenses.expense_tickets (manager_verifier_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_tickets_finance_approver_queue_idx ON expenses.expense_tickets (finance_approver_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_tickets_status_hot_idx ON expenses.expense_tickets (status, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS expenses.expense_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  line_category text NOT NULL,
  description text NOT NULL,
  quantity numeric(12,2) NULL,
  unit_cost numeric(14,2) NULL,
  line_total numeric(14,2) NOT NULL,
  tax_amount numeric(14,2) NULL,
  vendor_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS expenses_line_items_ticket_idx ON expenses.expense_line_items (ticket_id);

CREATE TABLE IF NOT EXISTS expenses.expense_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  approval_stage text NOT NULL,
  approver_user_id uuid NOT NULL,
  decision text NOT NULL,
  remarks text NULL,
  role_snapshot text NOT NULL,
  designation_snapshot text NULL,
  route_snapshot jsonb NOT NULL DEFAULT '{}',
  action_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_approvals_ticket_stage_idx ON expenses.expense_approvals (ticket_id, approval_stage, action_at DESC);
CREATE INDEX IF NOT EXISTS expenses_approvals_approver_idx ON expenses.expense_approvals (approver_user_id, action_at DESC);

CREATE TABLE IF NOT EXISTS expenses.employee_reviewer_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id uuid NOT NULL,
  reviewer_user_id uuid NOT NULL,
  assigned_by_user_id uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to date NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT employee_reviewer_not_self CHECK (employee_user_id <> reviewer_user_id)
);

CREATE INDEX IF NOT EXISTS expenses_reviewer_mappings_employee_idx ON expenses.employee_reviewer_mappings (employee_user_id, status, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS expenses.expense_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_type text NOT NULL,
  verification_status text NOT NULL,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_documents_ticket_type_idx ON expenses.expense_documents (ticket_id, document_type, verification_status);

CREATE TABLE IF NOT EXISTS expenses.expense_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  payment_type text NOT NULL,
  approved_amount numeric(14,2) NOT NULL,
  paid_amount numeric(14,2) NOT NULL,
  payment_date date NOT NULL,
  payment_mode text NOT NULL,
  reference_no text NOT NULL UNIQUE,
  settlement_status text NULL,
  settlement_amount numeric(14,2) NULL,
  processed_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_payments_ticket_idx ON expenses.expense_payments (ticket_id);
CREATE INDEX IF NOT EXISTS expenses_payments_processor_idx ON expenses.expense_payments (processed_by_user_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS expenses_payments_settlement_idx ON expenses.expense_payments (settlement_status, payment_date DESC);

CREATE TABLE IF NOT EXISTS expenses.expense_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  event_type text NOT NULL,
  old_value jsonb NULL,
  new_value jsonb NULL,
  remarks text NULL,
  payload_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_audit_ticket_idx ON expenses.expense_audit_logs (ticket_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'expenses_audit_immutable_trg') THEN
    CREATE TRIGGER expenses_audit_immutable_trg
    BEFORE UPDATE OR DELETE ON expenses.expense_audit_logs
    FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS expenses.expense_policy_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  sub_type text NOT NULL,
  max_amount numeric(14,2) NULL,
  requires_attachment boolean NOT NULL DEFAULT false,
  requires_exception_approval boolean NOT NULL DEFAULT false,
  required_document_types jsonb NOT NULL DEFAULT '[]',
  sla_hours integer NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

ALTER TABLE platform.finance_governance_config
  ADD COLUMN IF NOT EXISTS manager_backup_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS finance_approval_backup_user_id uuid NULL;

UPDATE platform.finance_governance_config
SET finance_approval_backup_user_id = COALESCE(finance_approval_backup_user_id, finance_self_request_fallback_user_id)
WHERE finance_approval_backup_user_id IS NULL;

ALTER TABLE expenses.expense_tickets
  ADD COLUMN IF NOT EXISTS manager_verifier_id uuid NULL,
  ADD COLUMN IF NOT EXISTS manager_backup_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS finance_approver_id uuid NULL;

UPDATE expenses.expense_tickets ticket
SET
  manager_verifier_id = COALESCE(ticket.manager_verifier_id, requester.manager_user_id, ticket.assigned_reviewer_id, ticket.director_approver_id),
  finance_approver_id = COALESCE(ticket.finance_approver_id, ticket.finance_manager_id)
FROM core.users requester
WHERE ticket.requester_user_id = requester.id;

UPDATE expenses.expense_tickets
SET status = CASE status
  WHEN 'Submitted' THEN 'Pending Manager Verification'
  WHEN 'Pending Reviewer' THEN 'Pending Manager Verification'
  WHEN 'Pending Director' THEN 'Pending Manager Verification'
  WHEN 'Reviewer Returned' THEN 'Manager Returned'
  WHEN 'Director Returned' THEN 'Manager Returned'
  WHEN 'Reviewer Rejected' THEN 'Manager Rejected'
  WHEN 'Director Rejected' THEN 'Manager Rejected'
  WHEN 'Director Approved' THEN 'Manager Verified'
  WHEN 'Finance Verified' THEN 'Finance Approved'
  WHEN 'Admin Finance Exception' THEN 'Finance Routing Exception'
  ELSE status
END
WHERE status IN (
  'Submitted',
  'Pending Reviewer',
  'Pending Director',
  'Reviewer Returned',
  'Director Returned',
  'Reviewer Rejected',
  'Director Rejected',
  'Director Approved',
  'Finance Verified',
  'Admin Finance Exception'
);

CREATE TABLE IF NOT EXISTS documents.doc_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_object_type text NOT NULL,
  business_object_id uuid NOT NULL,
  owner_user_id uuid NULL,
  classification text NOT NULL,
  document_type text NOT NULL,
  current_version integer NOT NULL DEFAULT 1,
  file_name text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  checksum_sha256 text NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS documents_metadata_business_object_idx ON documents.doc_metadata (business_object_type, business_object_id);
CREATE INDEX IF NOT EXISTS documents_metadata_owner_classification_idx ON documents.doc_metadata (owner_user_id, classification);

CREATE TABLE IF NOT EXISTS documents.doc_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  version integer NOT NULL,
  storage_key text NOT NULL UNIQUE,
  file_name text NOT NULL,
  size_bytes bigint NOT NULL,
  checksum_sha256 text NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

CREATE TABLE IF NOT EXISTS documents.doc_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NULL,
  classification text NULL,
  role_key text NOT NULL,
  permission text NOT NULL,
  scope_rule jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS documents_permissions_document_role_idx ON documents.doc_permissions (document_id, role_key, permission, status);
CREATE INDEX IF NOT EXISTS documents_permissions_classification_role_idx ON documents.doc_permissions (classification, role_key, permission, status);

CREATE TABLE IF NOT EXISTS documents.doc_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  decision text NOT NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_access_document_idx ON documents.doc_access_logs (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_access_actor_idx ON documents.doc_access_logs (actor_user_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'documents_access_logs_immutable_trg') THEN
    CREATE TRIGGER documents_access_logs_immutable_trg
    BEFORE UPDATE OR DELETE ON documents.doc_access_logs
    FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS assets.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL UNIQUE,
  qr_hash text NOT NULL UNIQUE,
  asset_type text NOT NULL,
  name text NOT NULL,
  serial_no text NULL,
  status text NOT NULL,
  current_assigned_user_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS assets_scan_idx ON assets.assets (qr_hash);
CREATE INDEX IF NOT EXISTS assets_assigned_status_idx ON assets.assets (current_assigned_user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assets_status_updated_idx ON assets.assets (status, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS assets.asset_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  assigned_to_user_id uuid NOT NULL,
  assigned_by_user_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assets_assignments_asset_status_idx ON assets.asset_assignments (asset_id, status);
CREATE INDEX IF NOT EXISTS assets_assignments_user_status_idx ON assets.asset_assignments (assigned_to_user_id, status);

CREATE TABLE IF NOT EXISTS assets.asset_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  actor_user_id uuid NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assets_state_events_asset_idx ON assets.asset_state_events (asset_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'assets_state_events_immutable_trg') THEN
    CREATE TRIGGER assets_state_events_immutable_trg
    BEFORE UPDATE OR DELETE ON assets.asset_state_events
    FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS assets.asset_recovery_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assets_recovery_employee_status_idx ON assets.asset_recovery_tickets (employee_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS assets_recovery_asset_status_idx ON assets.asset_recovery_tickets (asset_id, status);

CREATE TABLE IF NOT EXISTS assets.software_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets.software_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets.license_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  seat_count integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assets_license_entitlements_product_status_idx ON assets.license_entitlements (product_id, status);

CREATE TABLE IF NOT EXISTS assets.license_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  entitlement_id uuid NOT NULL,
  hardware_fingerprint_hash text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assets_license_activations_product_fingerprint_idx ON assets.license_activations (product_id, hardware_fingerprint_hash, status);

CREATE TABLE IF NOT EXISTS assets.compromised_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL UNIQUE,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timesheets.work_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id uuid NOT NULL,
  work_date date NOT NULL,
  project_code text NULL,
  task_code text NULL,
  hours numeric(5,2) NOT NULL,
  description text NULL,
  billable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS timesheets_segments_employee_date_idx ON timesheets.work_segments (employee_user_id, work_date);

CREATE TABLE IF NOT EXISTS timesheets.workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  module text NOT NULL DEFAULT 'timesheets',
  definition jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS timesheets_workflow_definitions_module_status_idx ON timesheets.workflow_definitions (module, status, version DESC);
CREATE INDEX IF NOT EXISTS timesheets_workflow_definitions_definition_gin_idx ON timesheets.workflow_definitions USING gin (definition);

CREATE TABLE IF NOT EXISTS timesheets.timesheet_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id uuid NOT NULL,
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  status text NOT NULL,
  total_hours numeric(6,2) NOT NULL,
  workflow_definition_id uuid NOT NULL,
  workflow_snapshot jsonb NOT NULL,
  current_approver_user_id uuid NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (employee_user_id, cycle_start, cycle_end)
);

CREATE INDEX IF NOT EXISTS timesheets_submissions_queue_idx ON timesheets.timesheet_submissions (status, current_approver_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS timesheets.timesheet_approval_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  decision text NOT NULL,
  remarks text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'timesheet_approval_actions_immutable_trg') THEN
    CREATE TRIGGER timesheet_approval_actions_immutable_trg
    BEFORE UPDATE OR DELETE ON timesheets.timesheet_approval_actions
    FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;
