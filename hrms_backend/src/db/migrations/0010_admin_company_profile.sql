ALTER TABLE platform.company_profiles
  ADD COLUMN IF NOT EXISTS website text NULL,
  ADD COLUMN IF NOT EXISTS industry text NULL,
  ADD COLUMN IF NOT EXISTS address text NULL,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS working_week text NOT NULL DEFAULT 'Mon-Fri',
  ADD COLUMN IF NOT EXISTS work_hours_per_day numeric(4,2) NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS logo_label text NULL;

CREATE INDEX IF NOT EXISTS platform_company_profiles_slug_status_idx
  ON platform.company_profiles (company_slug, status);
