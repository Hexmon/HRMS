-- Migration 0004 installed a table constraint whose generated name was
-- holidays_region_holiday_date_name_key.  0027 dropped a different index
-- name, leaving the global constraint active alongside the company index.
-- The global key prevents two companies from using the same holiday label.
ALTER TABLE leave_wfh.holidays
  DROP CONSTRAINT IF EXISTS holidays_region_holiday_date_name_key;

-- Match the API invariant: names are case-insensitive within one company and
-- a soft-deleted holiday does not reserve the key forever.
DROP INDEX IF EXISTS leave_wfh.holidays_company_region_date_name_uq;
CREATE UNIQUE INDEX holidays_company_region_date_name_uq
  ON leave_wfh.holidays (company_id, region, holiday_date, lower(name))
  WHERE deleted_at IS NULL;
