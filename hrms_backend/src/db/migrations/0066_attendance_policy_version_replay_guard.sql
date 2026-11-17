CREATE OR REPLACE FUNCTION attendance.reject_overlapping_policy_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- BEFORE triggers run before ON CONFLICT resolution. Permit only an exact
  -- (policy_id, version_number) replay so the existing unique constraint can
  -- resolve it; every genuinely new overlapping version remains forbidden.
  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1
    FROM attendance.policy_versions existing
    WHERE existing.policy_id = NEW.policy_id
      AND existing.version_number = NEW.version_number
  ) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM attendance.policy_versions existing
    WHERE existing.policy_id = NEW.policy_id
      AND existing.company_id = NEW.company_id
      AND existing.id <> NEW.id
      AND NEW.effective_from < COALESCE(existing.effective_until, 'infinity'::timestamptz)
      AND COALESCE(NEW.effective_until, 'infinity'::timestamptz) > existing.effective_from
  ) THEN
    RAISE EXCEPTION 'overlapping attendance policy versions are not allowed'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_policy_versions_no_overlap';
  END IF;
  RETURN NEW;
END;
$$;
