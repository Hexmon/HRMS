-- Audit rows need an immutable tenant marker. Existing asset/helpdesk rows do
-- not contain trustworthy historical ownership, so their markers remain NULL
-- until reviewed data is available. Outbox rows can be backfilled only when
-- their persisted payload already names a valid company.
SET LOCAL lock_timeout = '5s';

ALTER TABLE platform.outbox_events
  ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE assets.assets
  ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE assets.asset_state_events
  ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE helpdesk.tickets
  ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE helpdesk.ticket_events
  ADD COLUMN IF NOT EXISTS company_id uuid NULL;

CREATE INDEX IF NOT EXISTS platform_outbox_company_created_idx
  ON platform.outbox_events (company_id, created_at DESC, id)
  WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assets_assets_company_created_idx
  ON assets.assets (company_id, created_at DESC, id)
  WHERE company_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assets_state_events_company_created_idx
  ON assets.asset_state_events (company_id, created_at DESC, id)
  WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS helpdesk_tickets_company_created_idx
  ON helpdesk.tickets (company_id, created_at DESC, id)
  WHERE company_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS helpdesk_events_company_created_idx
  ON helpdesk.ticket_events (company_id, created_at DESC, id)
  WHERE company_id IS NOT NULL;

UPDATE platform.outbox_events event
SET company_id = (event.payload->>'company_id')::uuid
WHERE event.company_id IS NULL
  AND event.payload->>'company_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM platform.company_profiles company
    WHERE company.id = (event.payload->>'company_id')::uuid
  );

-- These backfills are safe only after the parent has a reviewed marker. The
-- migration intentionally does not infer a parent company from an actor or
-- requester whose active company may have changed since the event occurred.
UPDATE assets.asset_state_events event
SET company_id = asset.company_id
FROM assets.assets asset
WHERE event.asset_id = asset.id
  AND event.company_id IS NULL
  AND asset.company_id IS NOT NULL;

UPDATE helpdesk.ticket_events event
SET company_id = ticket.company_id
FROM helpdesk.tickets ticket
WHERE event.ticket_id = ticket.id
  AND event.company_id IS NULL
  AND ticket.company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION platform.validate_optional_company_marker()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company attribution is immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = TG_TABLE_SCHEMA || '_' || TG_TABLE_NAME || '_company_immutable';
  END IF;
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM 1
    FROM platform.company_profiles company
    WHERE company.id = NEW.company_id
    FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'company attribution references an unknown company'
      USING ERRCODE = '23503',
        CONSTRAINT = TG_TABLE_SCHEMA || '_' || TG_TABLE_NAME || '_company_reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION platform.prepare_outbox_company_marker()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payload_company text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.event_id IS DISTINCT FROM OLD.event_id
      OR NEW.aggregate_type IS DISTINCT FROM OLD.aggregate_type
      OR NEW.aggregate_id IS DISTINCT FROM OLD.aggregate_id
      OR NEW.event_type IS DISTINCT FROM OLD.event_type
      OR NEW.payload IS DISTINCT FROM OLD.payload
      OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'outbox event identity and company attribution are immutable'
        USING ERRCODE = '23514',
          CONSTRAINT = 'platform_outbox_event_identity_immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN
    payload_company := NEW.payload->>'company_id';
    IF payload_company ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1 FROM platform.company_profiles company
        WHERE company.id = payload_company::uuid
      )
    THEN
      NEW.company_id := payload_company::uuid;
    END IF;
  END IF;

  IF NEW.company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM platform.company_profiles company
    WHERE company.id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'outbox company attribution references an unknown company'
      USING ERRCODE = '23503',
        CONSTRAINT = 'platform_outbox_company_reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION assets.prepare_asset_state_company_marker()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_company uuid;
BEGIN
  SELECT asset.company_id INTO parent_company
  FROM assets.assets asset
  WHERE asset.id = NEW.asset_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'asset state event references an unknown asset'
      USING ERRCODE = '23503', CONSTRAINT = 'assets_state_event_asset_reference';
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := parent_company;
  ELSIF NEW.company_id IS DISTINCT FROM parent_company THEN
    RAISE EXCEPTION 'asset state event company must match its asset'
      USING ERRCODE = '23514', CONSTRAINT = 'assets_state_event_company_match';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION helpdesk.prepare_ticket_event_company_marker()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_company uuid;
BEGIN
  SELECT ticket.company_id INTO parent_company
  FROM helpdesk.tickets ticket
  WHERE ticket.id = NEW.ticket_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'helpdesk event references an unknown ticket'
      USING ERRCODE = '23503', CONSTRAINT = 'helpdesk_event_ticket_reference';
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := parent_company;
  ELSIF NEW.company_id IS DISTINCT FROM parent_company THEN
    RAISE EXCEPTION 'helpdesk event company must match its ticket'
      USING ERRCODE = '23514', CONSTRAINT = 'helpdesk_event_company_match';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_outbox_company_marker_trg ON platform.outbox_events;
CREATE TRIGGER platform_outbox_company_marker_trg
BEFORE INSERT OR UPDATE ON platform.outbox_events
FOR EACH ROW EXECUTE FUNCTION platform.prepare_outbox_company_marker();

DROP TRIGGER IF EXISTS assets_company_marker_trg ON assets.assets;
CREATE TRIGGER assets_company_marker_trg
BEFORE INSERT OR UPDATE OF company_id ON assets.assets
FOR EACH ROW EXECUTE FUNCTION platform.validate_optional_company_marker();

DROP TRIGGER IF EXISTS assets_state_company_marker_trg ON assets.asset_state_events;
CREATE TRIGGER assets_state_company_marker_trg
BEFORE INSERT ON assets.asset_state_events
FOR EACH ROW EXECUTE FUNCTION assets.prepare_asset_state_company_marker();

DROP TRIGGER IF EXISTS helpdesk_ticket_company_marker_trg ON helpdesk.tickets;
CREATE TRIGGER helpdesk_ticket_company_marker_trg
BEFORE INSERT OR UPDATE OF company_id ON helpdesk.tickets
FOR EACH ROW EXECUTE FUNCTION platform.validate_optional_company_marker();

DROP TRIGGER IF EXISTS helpdesk_event_company_marker_trg ON helpdesk.ticket_events;
CREATE TRIGGER helpdesk_event_company_marker_trg
BEFORE INSERT ON helpdesk.ticket_events
FOR EACH ROW EXECUTE FUNCTION helpdesk.prepare_ticket_event_company_marker();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'helpdesk_ticket_events_immutable_trg') THEN
    CREATE TRIGGER helpdesk_ticket_events_immutable_trg
    BEFORE UPDATE OR DELETE ON helpdesk.ticket_events
    FOR EACH ROW EXECUTE FUNCTION platform.prevent_immutable_update_delete();
  END IF;
END $$;
