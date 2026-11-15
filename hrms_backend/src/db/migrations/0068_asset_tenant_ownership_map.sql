-- Existing asset rows have no authoritative tenant key. Operators must verify
-- each root record instead of inferring ownership from a user's mutable current
-- company preference. Fresh databases have no rows to map.
CREATE TABLE IF NOT EXISTS assets.asset_tenant_ownership_map (
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  company_id uuid NOT NULL,
  verification_note text NOT NULL,
  verified_by_user_id uuid NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_type, resource_id),
  CONSTRAINT asset_tenant_ownership_map_resource_type_ck
    CHECK (resource_type IN ('asset', 'request', 'vendor')),
  CONSTRAINT asset_tenant_ownership_map_note_ck
    CHECK (length(btrim(verification_note)) BETWEEN 3 AND 1000)
);

CREATE INDEX IF NOT EXISTS asset_tenant_ownership_map_company_idx
  ON assets.asset_tenant_ownership_map (company_id, resource_type, resource_id);

CREATE OR REPLACE FUNCTION assets.validate_company_profile_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
    FROM platform.company_profiles company
    WHERE company.id = NEW.company_id
    FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'asset company does not exist'
      USING ERRCODE = '23503',
        CONSTRAINT = 'assets_company_profile_reference';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assets_cross_schema_company_reference_trg
  ON assets.asset_tenant_ownership_map;
CREATE TRIGGER assets_cross_schema_company_reference_trg
  BEFORE INSERT OR UPDATE OF company_id ON assets.asset_tenant_ownership_map
  FOR EACH ROW EXECUTE FUNCTION assets.validate_company_profile_reference();

CREATE OR REPLACE FUNCTION platform.restrict_asset_company_profile_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.id IS NOT DISTINCT FROM OLD.id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM assets.asset_tenant_ownership_map WHERE company_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'company profile is referenced by asset data'
      USING ERRCODE = '23503',
        CONSTRAINT = 'platform_company_profile_asset_reference';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_company_profile_asset_reference_restrict_trg
  ON platform.company_profiles;
CREATE TRIGGER platform_company_profile_asset_reference_restrict_trg
  BEFORE DELETE OR UPDATE OF id ON platform.company_profiles
  FOR EACH ROW EXECUTE FUNCTION platform.restrict_asset_company_profile_mutation();
