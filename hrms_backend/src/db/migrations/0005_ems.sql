CREATE SCHEMA IF NOT EXISTS ems;

CREATE TABLE IF NOT EXISTS ems.employee_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id uuid NOT NULL UNIQUE,
  personal_email text NULL,
  phone text NULL,
  alternate_phone text NULL,
  current_address text NULL,
  permanent_address text NULL,
  city text NULL,
  country text NULL,
  emergency_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  personal_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  work_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS ems_employee_profiles_user_idx
  ON ems.employee_profiles (employee_user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ems.profile_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code text NOT NULL UNIQUE,
  employee_user_id uuid NOT NULL,
  field_key text NOT NULL,
  field_label text NOT NULL,
  old_value text NULL,
  new_value text NOT NULL,
  reason text NULL,
  supporting_document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'returned', 'rejected')),
  current_approver_user_id uuid NULL,
  decision_remarks text NULL,
  decided_by_user_id uuid NULL,
  decided_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS ems_profile_change_employee_idx
  ON ems.profile_change_requests (employee_user_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ems_profile_change_queue_idx
  ON ems.profile_change_requests (status, current_approver_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ems.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code text NOT NULL UNIQUE,
  requester_user_id uuid NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('profile_update', 'document_verification', 'letter', 'asset', 'hr_support')),
  subject text NOT NULL,
  description text NOT NULL,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK (status IN ('pending', 'in_progress', 'approved', 'returned', 'rejected', 'closed')),
  assignee_user_id uuid NULL,
  decision_remarks text NULL,
  decided_by_user_id uuid NULL,
  decided_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS ems_service_requests_requester_idx
  ON ems.service_requests (requester_user_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ems_service_requests_queue_idx
  ON ems.service_requests (status, assignee_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ems.letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id uuid NOT NULL,
  letter_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL CHECK (status IN ('available', 'requested', 'in_progress', 'acknowledged')),
  document_id uuid NULL,
  issued_on date NULL,
  acknowledged_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS ems_letters_employee_idx
  ON ems.letters (employee_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ems.policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_code text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  version_label text NOT NULL,
  effective_from date NOT NULL,
  document_id uuid NULL,
  status text NOT NULL CHECK (status IN ('active', 'inactive', 'superseded')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS ems_policies_active_idx
  ON ems.policies (status, effective_from DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ems.policy_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'acknowledged')),
  acknowledged_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, employee_user_id)
);
