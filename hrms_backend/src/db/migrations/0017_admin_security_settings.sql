CREATE TABLE IF NOT EXISTS platform.admin_security_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_key text NOT NULL DEFAULT 'default',
  password_min_length integer NOT NULL DEFAULT 10 CHECK (password_min_length BETWEEN 8 AND 128),
  password_require_special boolean NOT NULL DEFAULT false,
  password_require_number boolean NOT NULL DEFAULT true,
  password_expiry_days integer NOT NULL DEFAULT 90 CHECK (password_expiry_days BETWEEN 0 AND 730),
  session_timeout_minutes integer NOT NULL DEFAULT 60 CHECK (session_timeout_minutes BETWEEN 5 AND 1440),
  login_attempt_limit integer NOT NULL DEFAULT 10 CHECK (login_attempt_limit BETWEEN 1 AND 100),
  mfa_enabled boolean NOT NULL DEFAULT false,
  audit_role_changes boolean NOT NULL DEFAULT true,
  ip_device_audit_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_admin_security_settings_key_uq
  ON platform.admin_security_settings (settings_key);

INSERT INTO platform.admin_security_settings (settings_key)
VALUES ('default')
ON CONFLICT (settings_key) DO NOTHING;
