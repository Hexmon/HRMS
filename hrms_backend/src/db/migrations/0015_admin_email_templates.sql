CREATE TABLE IF NOT EXISTS platform.admin_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  module text NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  locale text NOT NULL DEFAULT 'en-IN',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS platform_admin_email_templates_module_status_idx
  ON platform.admin_email_templates(module, status);
