CREATE TABLE IF NOT EXISTS platform.admin_master_data_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_key text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_admin_master_data_items_key_code_uq
  ON platform.admin_master_data_items (master_key, lower(code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS platform_admin_master_data_items_key_status_idx
  ON platform.admin_master_data_items (master_key, status, sort_order, name)
  WHERE deleted_at IS NULL;
