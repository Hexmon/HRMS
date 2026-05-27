CREATE TABLE IF NOT EXISTS platform.admin_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key text NOT NULL,
  module text NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (workflow_key)
);

CREATE INDEX IF NOT EXISTS platform_admin_workflows_module_status_idx
  ON platform.admin_workflows (module, status)
  WHERE deleted_at IS NULL;
