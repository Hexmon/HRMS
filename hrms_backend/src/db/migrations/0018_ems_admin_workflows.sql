CREATE TABLE IF NOT EXISTS ems.admin_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_type text NOT NULL CHECK (checklist_type IN ('onboarding', 'exit')),
  employee_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  due_date date NULL,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  remarks text NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS ems_admin_checklists_type_employee_uq
  ON ems.admin_checklists (checklist_type, employee_user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ems_admin_checklists_queue_idx
  ON ems.admin_checklists (checklist_type, status, due_date, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ems.probation_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id uuid NOT NULL,
  joining_on date NOT NULL,
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'extended')),
  extended_until date NULL,
  remarks text NULL,
  decided_by_user_id uuid NULL,
  decided_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS ems_probation_reviews_employee_uq
  ON ems.probation_reviews (employee_user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ems_probation_reviews_queue_idx
  ON ems.probation_reviews (status, due_on, updated_at DESC)
  WHERE deleted_at IS NULL;
