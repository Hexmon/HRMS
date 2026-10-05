-- GEO-S12-014: explicit manual fallback review lifecycle for web geo attendance.

CREATE TABLE IF NOT EXISTS attendance.geo_fallback_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  submitted_by_user_id uuid NOT NULL,
  current_approver_user_id uuid NULL,
  original_command_id uuid NOT NULL,
  original_decision_id uuid NOT NULL,
  fallback_command_id uuid NULL,
  punch_event_id uuid NULL,
  event_type text NOT NULL,
  work_date date NOT NULL,
  occurred_at timestamptz NOT NULL,
  reason_code text NOT NULL,
  reason_detail text NULL,
  geo_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  decision_remarks text NULL,
  decided_by_user_id uuid NULL,
  decided_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT attendance_geo_fallback_status_check
    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT attendance_geo_fallback_event_type_check
    CHECK (event_type IN ('check_in', 'break_start', 'break_end', 'check_out')),
  CONSTRAINT attendance_geo_fallback_version_check
    CHECK (version > 0),
  CONSTRAINT attendance_geo_fallback_original_decision_uq
    UNIQUE (company_id, original_decision_id)
);

CREATE INDEX IF NOT EXISTS attendance_geo_fallback_queue_idx
  ON attendance.geo_fallback_reviews (company_id, status, current_approver_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_geo_fallback_employee_date_idx
  ON attendance.geo_fallback_reviews (company_id, employee_user_id, work_date DESC)
  WHERE deleted_at IS NULL;
