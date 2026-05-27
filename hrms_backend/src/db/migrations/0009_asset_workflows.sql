ALTER TABLE assets.software_vendors
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS contact_email text NULL,
  ADD COLUMN IF NOT EXISTS phone text NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS software_vendors_name_uq ON assets.software_vendors (name);

CREATE TABLE IF NOT EXISTS assets.asset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code text NOT NULL UNIQUE,
  requester_user_id uuid NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('new', 'replacement', 'repair', 'return')),
  asset_type text NOT NULL,
  asset_id uuid NULL,
  reason text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  needed_by date NULL,
  preferred_specs jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'returned', 'fulfilled', 'cancelled')),
  decision_by_user_id uuid NULL,
  decision_at timestamptz NULL,
  decision_remarks text NULL,
  assigned_asset_id uuid NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS asset_requests_requester_status_idx ON assets.asset_requests (requester_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS asset_requests_status_priority_idx ON assets.asset_requests (status, priority, created_at DESC);

CREATE TABLE IF NOT EXISTS assets.asset_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  assignment_id uuid NULL,
  acknowledgement_type text NOT NULL CHECK (acknowledgement_type IN ('received', 'returned')),
  status text NOT NULL CHECK (status IN ('pending', 'acknowledged')),
  acknowledged_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asset_ack_asset_employee_idx ON assets.asset_acknowledgements (asset_id, employee_user_id, status);
CREATE INDEX IF NOT EXISTS asset_ack_assignment_idx ON assets.asset_acknowledgements (assignment_id);

CREATE TABLE IF NOT EXISTS assets.asset_maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  maintenance_type text NOT NULL CHECK (maintenance_type IN ('repair', 'preventive', 'warranty', 'inspection', 'other')),
  vendor_id uuid NULL,
  cost numeric(14,2) NULL,
  started_on date NOT NULL,
  completed_on date NULL,
  status text NOT NULL CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  notes text NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS asset_maintenance_asset_status_idx ON assets.asset_maintenance_records (asset_id, status, started_on DESC);
CREATE INDEX IF NOT EXISTS asset_maintenance_vendor_idx ON assets.asset_maintenance_records (vendor_id);
