ALTER TABLE assets.asset_recovery_tickets
  ADD COLUMN IF NOT EXISTS settlement_status TEXT,
  ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS settlement_remarks TEXT,
  ADD COLUMN IF NOT EXISTS settled_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_asset_recovery_tickets_settlement
  ON assets.asset_recovery_tickets (status, settlement_status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_vendor_name_active
  ON assets.software_vendors (lower(name))
  WHERE deleted_at IS NULL;
