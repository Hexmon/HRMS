CREATE TABLE IF NOT EXISTS platform.admin_notification_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  module text NOT NULL,
  label text NOT NULL,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_admin_notification_channels_key_uq
  ON platform.admin_notification_channels (event_key);

CREATE INDEX IF NOT EXISTS platform_admin_notification_channels_module_status_idx
  ON platform.admin_notification_channels (module, status);
