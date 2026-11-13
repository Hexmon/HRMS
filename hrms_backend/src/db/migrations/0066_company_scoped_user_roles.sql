-- DEC-031 authorizes the union of a person's roles only inside the company
-- that granted them. Existing role rows predate explicit company ownership;
-- backfill only from the user's current single-company assignment and fail
-- rather than inventing ownership when that evidence is missing.
ALTER TABLE core.user_roles
  ADD COLUMN IF NOT EXISTS company_id uuid;

UPDATE core.user_roles role_assignment
SET company_id = preference.company_id
FROM platform.user_session_preferences preference
WHERE preference.user_id = role_assignment.user_id
  AND role_assignment.company_id IS NULL
  AND preference.company_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM core.user_roles WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot scope core.user_roles: role assignments without a company remain';
  END IF;
END
$$;

ALTER TABLE core.user_roles
  ALTER COLUMN company_id SET NOT NULL;

DROP INDEX IF EXISTS core.core_user_roles_lookup_idx;
CREATE INDEX core_user_roles_lookup_idx
  ON core.user_roles (company_id, user_id, status, effective_from, effective_to);

DROP INDEX IF EXISTS core.core_user_roles_active_company_role_uq;
CREATE UNIQUE INDEX core_user_roles_active_company_role_uq
  ON core.user_roles (company_id, user_id, role_key)
  WHERE status = 'active' AND deleted_at IS NULL;
