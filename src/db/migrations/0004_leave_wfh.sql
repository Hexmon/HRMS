CREATE SCHEMA IF NOT EXISTS leave_wfh;

CREATE TABLE IF NOT EXISTS leave_wfh.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code text NOT NULL UNIQUE,
  employee_user_id uuid NOT NULL,
  leave_type text NOT NULL CHECK (leave_type IN ('casual', 'sick', 'earned', 'unpaid', 'comp_off')),
  date_from date NOT NULL,
  date_to date NOT NULL,
  half_day boolean NOT NULL DEFAULT false,
  duration numeric(5,2) NOT NULL CHECK (duration > 0),
  reason text NOT NULL,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK (status IN ('pending_manager', 'approved', 'returned', 'rejected', 'cancelled')),
  current_approver_user_id uuid NULL,
  decision_remarks text NULL,
  decided_by_user_id uuid NULL,
  decided_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CHECK (date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS leave_requests_employee_date_idx
  ON leave_wfh.leave_requests (employee_user_id, date_from DESC, date_to DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS leave_requests_queue_idx
  ON leave_wfh.leave_requests (status, current_approver_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS leave_wfh.wfh_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code text NOT NULL UNIQUE,
  employee_user_id uuid NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  half_day boolean NOT NULL DEFAULT false,
  duration numeric(5,2) NOT NULL CHECK (duration > 0),
  reason text NOT NULL,
  project_ref text NULL,
  status text NOT NULL CHECK (status IN ('pending_manager', 'approved', 'returned', 'rejected', 'cancelled')),
  current_approver_user_id uuid NULL,
  decision_remarks text NULL,
  decided_by_user_id uuid NULL,
  decided_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CHECK (date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS wfh_requests_employee_date_idx
  ON leave_wfh.wfh_requests (employee_user_id, date_from DESC, date_to DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS wfh_requests_queue_idx
  ON leave_wfh.wfh_requests (status, current_approver_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS leave_wfh.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  holiday_date date NOT NULL,
  region text NOT NULL DEFAULT 'All',
  optional boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (region, holiday_date, name)
);

CREATE INDEX IF NOT EXISTS holidays_date_idx
  ON leave_wfh.holidays (holiday_date)
  WHERE deleted_at IS NULL;
