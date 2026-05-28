ALTER TABLE core.departments
  ADD COLUMN IF NOT EXISTS cost_center text NULL;

CREATE INDEX IF NOT EXISTS core_departments_cost_center_idx
  ON core.departments (cost_center)
  WHERE cost_center IS NOT NULL AND deleted_at IS NULL;
