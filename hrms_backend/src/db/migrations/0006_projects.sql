CREATE SCHEMA IF NOT EXISTS projects;

CREATE TABLE IF NOT EXISTS projects.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code text NOT NULL UNIQUE,
  name text NOT NULL,
  client_name text NOT NULL,
  project_type text NOT NULL CHECK (project_type IN ('client', 'internal')),
  billing_type text NOT NULL CHECK (billing_type IN ('fixed', 'hourly', 'retainer', 'internal')),
  manager_user_id uuid NOT NULL,
  department_id uuid NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('planned', 'active', 'on_hold', 'completed', 'cancelled', 'archived')),
  health text NOT NULL CHECK (health IN ('green', 'amber', 'red')),
  description text NULL,
  estimated_hours numeric(10,2) NOT NULL DEFAULT 0,
  actual_hours numeric(10,2) NOT NULL DEFAULT 0,
  estimated_budget numeric(14,2) NOT NULL DEFAULT 0,
  actual_spend numeric(14,2) NOT NULL DEFAULT 0,
  tech_stack jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  cost_center text NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS projects_status_manager_idx
  ON projects.projects (status, manager_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS projects_client_status_idx
  ON projects.projects (client_name, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS projects.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  project_role text NOT NULL,
  allocation_percent integer NOT NULL CHECK (allocation_percent >= 0 AND allocation_percent <= 200),
  billable boolean NOT NULL DEFAULT true,
  start_date date NOT NULL,
  end_date date NULL,
  reporting_lead_user_id uuid NULL,
  status text NOT NULL CHECK (status IN ('active', 'removed')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_members_active_user_uq
  ON projects.project_members (project_id, employee_user_id)
  WHERE status = 'active' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS project_members_employee_idx
  ON projects.project_members (employee_user_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS projects.project_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  date_from date NOT NULL,
  date_to date NULL,
  allocation_percent integer NOT NULL CHECK (allocation_percent >= 0 AND allocation_percent <= 200),
  billable boolean NOT NULL DEFAULT true,
  notes text NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CHECK (date_to IS NULL OR date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS project_allocations_employee_date_idx
  ON projects.project_allocations (employee_user_id, date_from DESC, date_to)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS project_allocations_project_date_idx
  ON projects.project_allocations (project_id, date_from DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS projects.project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  name text NOT NULL,
  owner_user_id uuid NULL,
  status text NOT NULL CHECK (status IN ('planned', 'in_progress', 'completed', 'on_hold')),
  start_date date NULL,
  due_date date NOT NULL,
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CHECK (start_date IS NULL OR due_date >= start_date)
);

CREATE INDEX IF NOT EXISTS project_milestones_project_status_idx
  ON projects.project_milestones (project_id, status, due_date)
  WHERE deleted_at IS NULL;
