-- Cross-schema foreign keys are replaced with paired child validation and
-- parent restrict triggers. PostgreSQL cannot enforce a foreign key across
-- schemas under this project's schema-boundary policy, so both directions are
-- required to retain the former NO ACTION semantics.

ALTER TABLE core.departments
  DROP CONSTRAINT IF EXISTS departments_company_id_fkey;
ALTER TABLE core.designations
  DROP CONSTRAINT IF EXISTS designations_company_id_fkey;
ALTER TABLE attendance.shift_templates
  DROP CONSTRAINT IF EXISTS shift_templates_company_id_fkey;
ALTER TABLE attendance.shift_assignments
  DROP CONSTRAINT IF EXISTS shift_assignments_employee_user_id_fkey;
ALTER TABLE attendance.shift_instances
  DROP CONSTRAINT IF EXISTS shift_instances_employee_user_id_fkey;
ALTER TABLE attendance.policies
  DROP CONSTRAINT IF EXISTS policies_company_id_fkey;
ALTER TABLE attendance.policies
  DROP CONSTRAINT IF EXISTS policies_created_by_user_id_fkey;
ALTER TABLE attendance.policy_versions
  DROP CONSTRAINT IF EXISTS policy_versions_created_by_user_id_fkey;
ALTER TABLE attendance.policy_assignments
  DROP CONSTRAINT IF EXISTS policy_assignments_created_by_user_id_fkey;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM attendance.shift_assignments assignment
    WHERE NOT EXISTS (
      SELECT 1
      FROM platform.user_session_preferences preference
      WHERE preference.user_id = assignment.employee_user_id
        AND preference.company_id = assignment.company_id
    )
  ) OR EXISTS (
    SELECT 1
    FROM attendance.shift_instances instance
    WHERE NOT EXISTS (
      SELECT 1
      FROM platform.user_session_preferences preference
      WHERE preference.user_id = instance.employee_user_id
        AND preference.company_id = instance.company_id
    )
  ) THEN
    RAISE EXCEPTION 'cannot install attendance integrity triggers because a shift employee is outside its company'
      USING ERRCODE = '23514',
        CONSTRAINT = 'attendance_employee_company_reference';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION core.validate_company_profile_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1
    FROM platform.company_profiles company
    WHERE company.id = NEW.company_id
    FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'master-data company does not exist'
      USING ERRCODE = '23503',
        CONSTRAINT = 'core_master_data_company_reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION attendance.validate_company_profile_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
    FROM platform.company_profiles company
    WHERE company.id = NEW.company_id
    FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance company does not exist'
      USING ERRCODE = '23503',
        CONSTRAINT = 'attendance_company_profile_reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION attendance.validate_employee_company_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
    FROM core.users user_record
    WHERE user_record.id = NEW.employee_user_id
    FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance employee does not exist'
      USING ERRCODE = '23503',
        CONSTRAINT = 'attendance_employee_user_reference';
  END IF;

  PERFORM 1
    FROM platform.user_session_preferences preference
    WHERE preference.user_id = NEW.employee_user_id
      AND preference.company_id = NEW.company_id
    FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance employee must belong to the same company'
      USING ERRCODE = '23503',
        CONSTRAINT = 'attendance_employee_company_reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION attendance.validate_creator_user_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_by_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1
    FROM core.users user_record
    WHERE user_record.id = NEW.created_by_user_id
    FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance creator does not exist'
      USING ERRCODE = '23503',
        CONSTRAINT = 'attendance_creator_user_reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION platform.restrict_attendance_company_profile_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.id IS NOT DISTINCT FROM OLD.id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM core.departments WHERE company_id = OLD.id
    UNION ALL
    SELECT 1 FROM core.designations WHERE company_id = OLD.id
    UNION ALL
    SELECT 1 FROM attendance.shift_templates WHERE company_id = OLD.id
    UNION ALL
    SELECT 1 FROM attendance.policies WHERE company_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'company profile is referenced by tenant data'
      USING ERRCODE = '23503',
        CONSTRAINT = 'platform_company_profile_attendance_reference';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.restrict_attendance_user_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.id IS NOT DISTINCT FROM OLD.id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM attendance.shift_assignments WHERE employee_user_id = OLD.id
    UNION ALL
    SELECT 1 FROM attendance.shift_instances WHERE employee_user_id = OLD.id
    UNION ALL
    SELECT 1 FROM attendance.policies WHERE created_by_user_id = OLD.id
    UNION ALL
    SELECT 1 FROM attendance.policy_versions WHERE created_by_user_id = OLD.id
    UNION ALL
    SELECT 1 FROM attendance.policy_assignments WHERE created_by_user_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'user is referenced by attendance data'
      USING ERRCODE = '23503',
        CONSTRAINT = 'core_user_attendance_reference';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION platform.restrict_attendance_employee_membership_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
    AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
  THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM attendance.shift_assignments assignment
    WHERE assignment.employee_user_id = OLD.user_id
      AND assignment.company_id IS NOT DISTINCT FROM OLD.company_id
    UNION ALL
    SELECT 1
    FROM attendance.shift_instances instance
    WHERE instance.employee_user_id = OLD.user_id
      AND instance.company_id IS NOT DISTINCT FROM OLD.company_id
    UNION ALL
    SELECT 1
    FROM attendance.policy_assignments assignment
    WHERE assignment.scope_type = 'employee'
      AND assignment.scope_id = OLD.user_id
      AND assignment.company_id IS NOT DISTINCT FROM OLD.company_id
  ) THEN
    RAISE EXCEPTION 'employee membership is referenced by attendance data'
      USING ERRCODE = '23503',
        CONSTRAINT = 'platform_employee_attendance_membership_reference';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.restrict_attendance_department_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.id IS NOT DISTINCT FROM OLD.id
    AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
    AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
  THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM attendance.policy_assignments assignment
    WHERE assignment.scope_type = 'department'
      AND assignment.scope_id = OLD.id
      AND assignment.company_id IS NOT DISTINCT FROM OLD.company_id
  ) THEN
    RAISE EXCEPTION 'department is referenced by attendance policy assignments'
      USING ERRCODE = '23503',
        CONSTRAINT = 'core_department_attendance_policy_reference';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS core_cross_schema_company_reference_trg ON core.departments;
CREATE TRIGGER core_cross_schema_company_reference_trg
  BEFORE INSERT OR UPDATE OF company_id ON core.departments
  FOR EACH ROW EXECUTE FUNCTION core.validate_company_profile_reference();

DROP TRIGGER IF EXISTS core_cross_schema_company_reference_trg ON core.designations;
CREATE TRIGGER core_cross_schema_company_reference_trg
  BEFORE INSERT OR UPDATE OF company_id ON core.designations
  FOR EACH ROW EXECUTE FUNCTION core.validate_company_profile_reference();

DROP TRIGGER IF EXISTS attendance_cross_schema_company_reference_trg ON attendance.shift_templates;
CREATE TRIGGER attendance_cross_schema_company_reference_trg
  BEFORE INSERT OR UPDATE OF company_id ON attendance.shift_templates
  FOR EACH ROW EXECUTE FUNCTION attendance.validate_company_profile_reference();

DROP TRIGGER IF EXISTS attendance_cross_schema_company_reference_trg ON attendance.policies;
CREATE TRIGGER attendance_cross_schema_company_reference_trg
  BEFORE INSERT OR UPDATE OF company_id ON attendance.policies
  FOR EACH ROW EXECUTE FUNCTION attendance.validate_company_profile_reference();

DROP TRIGGER IF EXISTS attendance_cross_schema_employee_reference_trg ON attendance.shift_assignments;
CREATE TRIGGER attendance_cross_schema_employee_reference_trg
  BEFORE INSERT OR UPDATE OF employee_user_id, company_id ON attendance.shift_assignments
  FOR EACH ROW EXECUTE FUNCTION attendance.validate_employee_company_reference();

DROP TRIGGER IF EXISTS attendance_cross_schema_employee_reference_trg ON attendance.shift_instances;
CREATE TRIGGER attendance_cross_schema_employee_reference_trg
  BEFORE INSERT OR UPDATE OF employee_user_id, company_id ON attendance.shift_instances
  FOR EACH ROW EXECUTE FUNCTION attendance.validate_employee_company_reference();

DROP TRIGGER IF EXISTS attendance_cross_schema_creator_reference_trg ON attendance.policies;
CREATE TRIGGER attendance_cross_schema_creator_reference_trg
  BEFORE INSERT OR UPDATE OF created_by_user_id ON attendance.policies
  FOR EACH ROW EXECUTE FUNCTION attendance.validate_creator_user_reference();

DROP TRIGGER IF EXISTS attendance_cross_schema_creator_reference_trg ON attendance.policy_versions;
CREATE TRIGGER attendance_cross_schema_creator_reference_trg
  BEFORE INSERT OR UPDATE OF created_by_user_id ON attendance.policy_versions
  FOR EACH ROW EXECUTE FUNCTION attendance.validate_creator_user_reference();

DROP TRIGGER IF EXISTS attendance_cross_schema_creator_reference_trg ON attendance.policy_assignments;
CREATE TRIGGER attendance_cross_schema_creator_reference_trg
  BEFORE INSERT OR UPDATE OF created_by_user_id ON attendance.policy_assignments
  FOR EACH ROW EXECUTE FUNCTION attendance.validate_creator_user_reference();

DROP TRIGGER IF EXISTS platform_company_profile_attendance_reference_restrict_trg ON platform.company_profiles;
CREATE TRIGGER platform_company_profile_attendance_reference_restrict_trg
  BEFORE DELETE OR UPDATE OF id ON platform.company_profiles
  FOR EACH ROW EXECUTE FUNCTION platform.restrict_attendance_company_profile_mutation();

DROP TRIGGER IF EXISTS core_user_attendance_reference_restrict_trg ON core.users;
CREATE TRIGGER core_user_attendance_reference_restrict_trg
  BEFORE DELETE OR UPDATE OF id ON core.users
  FOR EACH ROW EXECUTE FUNCTION core.restrict_attendance_user_mutation();

DROP TRIGGER IF EXISTS platform_employee_attendance_membership_reference_restrict_trg ON platform.user_session_preferences;
CREATE TRIGGER platform_employee_attendance_membership_reference_restrict_trg
  BEFORE DELETE OR UPDATE OF user_id, company_id ON platform.user_session_preferences
  FOR EACH ROW EXECUTE FUNCTION platform.restrict_attendance_employee_membership_mutation();

DROP TRIGGER IF EXISTS core_department_attendance_policy_reference_restrict_trg ON core.departments;
CREATE TRIGGER core_department_attendance_policy_reference_restrict_trg
  BEFORE DELETE OR UPDATE OF id, company_id, deleted_at ON core.departments
  FOR EACH ROW EXECUTE FUNCTION core.restrict_attendance_department_mutation();
