CREATE TABLE IF NOT EXISTS platform.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NULL,
  target_user_id uuid NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dead_letter')),
  read_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_notifications_target_status_idx
  ON platform.notifications (target_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_notifications_type_idx
  ON platform.notifications (event_type, created_at DESC);
