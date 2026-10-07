CREATE TABLE IF NOT EXISTS attendance.mobile_evidence_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  category text NOT NULL CHECK (
    category IN ('replay_warning', 'device_eligibility')
  ),
  reason_code text NOT NULL CHECK (
    reason_code IN (
      'mobile_replay.changed_body_conflict',
      'offline_sync.changed_body_conflict',
      'offline_sync.duplicate_sequence',
      'mobile_registered_device_required',
      'mobile_registered_device_revoked',
      'mobile_registered_device_suspended',
      'mobile_registered_device_unavailable'
    )
  ),
  event_type text NOT NULL CHECK (
    event_type IN ('check_in', 'break_start', 'break_end', 'check_out')
  ),
  work_mode text NULL CHECK (
    work_mode IS NULL OR work_mode IN ('office', 'remote', 'wfh', 'field')
  ),
  source text NOT NULL CHECK (
    source IN ('mobile', 'mobile_foreground', 'mobile_offline')
  ),
  work_date date NOT NULL,
  captured_at timestamptz NULL,
  server_received_at timestamptz NOT NULL,
  client_event_id uuid NOT NULL,
  registered_device_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_mobile_evidence_warnings_dedupe_uq
  ON attendance.mobile_evidence_warnings (
    company_id,
    employee_user_id,
    client_event_id,
    category,
    reason_code
  );

CREATE INDEX IF NOT EXISTS attendance_mobile_evidence_warnings_day_idx
  ON attendance.mobile_evidence_warnings (
    company_id,
    employee_user_id,
    work_date,
    captured_at,
    server_received_at
  );

CREATE INDEX IF NOT EXISTS attendance_mobile_evidence_warnings_reason_idx
  ON attendance.mobile_evidence_warnings (
    company_id,
    reason_code,
    server_received_at DESC
  );

CREATE INDEX IF NOT EXISTS attendance_mobile_evidence_warnings_device_idx
  ON attendance.mobile_evidence_warnings (
    company_id,
    registered_device_id,
    server_received_at DESC
  )
  WHERE registered_device_id IS NOT NULL;

DROP TRIGGER IF EXISTS mobile_evidence_warnings_immutable
  ON attendance.mobile_evidence_warnings;

CREATE TRIGGER mobile_evidence_warnings_immutable
  BEFORE UPDATE OR DELETE ON attendance.mobile_evidence_warnings
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_immutable_update_delete();
