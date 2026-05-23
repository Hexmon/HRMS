ALTER TABLE core.departments
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE core.designations
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS core_departments_parent_status_idx
  ON core.departments (parent_department_id, status)
  WHERE deleted_at IS NULL;
