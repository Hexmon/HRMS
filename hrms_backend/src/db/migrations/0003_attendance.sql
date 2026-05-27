CREATE SCHEMA IF NOT EXISTS attendance;

CREATE TABLE IF NOT EXISTS attendance.punch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('check_in', 'break_start', 'break_end', 'check_out')),
  occurred_at timestamptz NOT NULL,
  work_mode text NOT NULL DEFAULT 'office' CHECK (work_mode IN ('office', 'remote', 'wfh', 'field')),
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'mobile', 'kiosk', 'admin')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS attendance_punch_employee_occurred_idx
  ON attendance.punch_events (employee_user_id, occurred_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS attendance_punch_event_type_idx
  ON attendance.punch_events (event_type, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS attendance.daily_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id uuid NOT NULL,
  work_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present', 'late', 'absent', 'wfh', 'leave', 'weekend', 'holiday', 'future')),
  first_check_in timestamptz NULL,
  last_check_out timestamptz NULL,
  work_minutes integer NOT NULL DEFAULT 0 CHECK (work_minutes >= 0),
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  late_minutes integer NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
  early_out_minutes integer NOT NULL DEFAULT 0 CHECK (early_out_minutes >= 0),
  work_mode text NULL CHECK (work_mode IS NULL OR work_mode IN ('office', 'remote', 'wfh', 'field')),
  note text NULL,
  exception_type text NULL CHECK (exception_type IS NULL OR exception_type IN ('late', 'missing_punch', 'absent', 'early_out')),
  regularization_status text NULL CHECK (regularization_status IS NULL OR regularization_status IN ('pending', 'approved', 'returned', 'rejected')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (employee_user_id, work_date)
);

CREATE INDEX IF NOT EXISTS attendance_daily_status_date_idx
  ON attendance.daily_records (status, work_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS attendance_daily_exception_idx
  ON attendance.daily_records (exception_type, work_date DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS attendance.regularization_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id uuid NOT NULL,
  work_date date NOT NULL,
  reason text NOT NULL,
  requested_punches jsonb NOT NULL DEFAULT '[]'::jsonb,
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

CREATE INDEX IF NOT EXISTS attendance_regularizations_employee_date_idx
  ON attendance.regularization_requests (employee_user_id, work_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS attendance_regularizations_queue_idx
  ON attendance.regularization_requests (status, current_approver_user_id, created_at DESC)
  WHERE deleted_at IS NULL;
