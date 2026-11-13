-- Migration 0004 installed a table constraint whose generated name was
-- holidays_region_holiday_date_name_key.  0027 dropped a different index
-- name, leaving the global constraint active alongside the company index.
-- The global key prevents two companies from using the same holiday label.
ALTER TABLE leave_wfh.holidays
  DROP CONSTRAINT IF EXISTS holidays_region_holiday_date_name_key;

-- 0028 already creates this index on fully company-owned rows.  Retain the
-- same shape for databases where the index was removed outside migrations.
CREATE UNIQUE INDEX IF NOT EXISTS holidays_company_region_date_name_uq
  ON leave_wfh.holidays (company_id, region, holiday_date, name);
