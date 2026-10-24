-- The five-minute Cloudflare sweep pages all open sessions by (checked_in_at,
-- id). Keep that traversal index narrow so each bounded continuation does not
-- rescan and sort the full attendance.sessions table.
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS attendance_sessions_open_sweep_idx
  ON attendance.sessions (checked_in_at, id)
  WHERE closed_at IS NULL AND deleted_at IS NULL;
