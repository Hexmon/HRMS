
-- Enums
CREATE TYPE public.app_role AS ENUM (
  'main_admin','hr_admin','finance_manager','manager','project_manager',
  'asset_admin','helpdesk_agent','employee','director','auditor'
);
CREATE TYPE public.user_status AS ENUM ('active','inactive','invited','suspended');
CREATE TYPE public.employee_status AS ENUM ('active','on_leave','probation','notice','exited');
CREATE TYPE public.employment_type AS ENUM ('full_time','part_time','contract','intern','consultant');
CREATE TYPE public.work_mode AS ENUM ('on_site','remote','hybrid');

CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email_domain TEXT UNIQUE,
  website TEXT, logo_url TEXT, industry TEXT, company_size TEXT, address TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  currency TEXT DEFAULT 'INR',
  financial_year_start TEXT DEFAULT '04-01',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE public.designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  employee_id UUID,
  full_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, avatar_url TEXT,
  status public.user_status NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_profiles_company ON public.user_profiles(company_id);

CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_code TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  full_name TEXT,
  gender TEXT, dob DATE, contact_number TEXT, personal_email TEXT, company_email TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  designation_id UUID REFERENCES public.designations(id) ON DELETE SET NULL,
  reporting_manager_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  date_of_joining DATE,
  employment_type public.employment_type DEFAULT 'full_time',
  work_location TEXT,
  work_mode public.work_mode DEFAULT 'on_site',
  probation_end_date DATE,
  notice_period_days INTEGER DEFAULT 30,
  employee_status public.employee_status NOT NULL DEFAULT 'active',
  login_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, employee_code)
);
CREATE INDEX idx_employees_company ON public.employees(company_id);
CREATE INDEX idx_employees_dept ON public.employees(department_id);

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_employee_fk
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name public.app_role NOT NULL,
  description TEXT,
  is_system_role BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL, action TEXT NOT NULL, description TEXT,
  UNIQUE (module, action)
);
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  UNIQUE (role_id, permission_id)
);
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_profile_id, role_id)
);
CREATE INDEX idx_user_roles_profile ON public.user_roles(user_profile_id);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL, entity_type TEXT, entity_id TEXT,
  old_value JSONB, new_value JSONB, remarks TEXT, ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_company ON public.audit_logs(company_id, created_at DESC);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL, message TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  related_entity_type TEXT, related_entity_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_profile_id, is_read);

-- Helper functions
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.user_profiles up ON up.id = ur.user_profile_id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE up.auth_user_id = auth.uid() AND r.name = _role
  )
$$;
CREATE OR REPLACE FUNCTION public.is_company_admin()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role('main_admin') OR public.has_role('hr_admin')
$$;
CREATE OR REPLACE FUNCTION public.has_permission(_module TEXT, _action TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.user_profiles up ON up.id = ur.user_profile_id
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE up.auth_user_id = auth.uid() AND p.module = _module AND p.action = _action
  )
$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER tr_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_user_profiles_updated BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_roles_updated BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_departments_updated BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_designations_updated BEFORE UPDATE ON public.designations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- employees full_name trigger
CREATE OR REPLACE FUNCTION public.set_employee_full_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.full_name := TRIM(BOTH ' ' FROM CONCAT_WS(' ', NEW.first_name, NEW.middle_name, NEW.last_name));
  RETURN NEW;
END;
$$;
CREATE TRIGGER tr_employees_fullname BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_full_name();

-- Auto-create user profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_profiles (auth_user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (auth_user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "members read own company" ON public.companies FOR SELECT TO authenticated USING (id = public.current_company_id());
CREATE POLICY "admins update own company" ON public.companies FOR UPDATE TO authenticated USING (id = public.current_company_id() AND public.is_company_admin());
CREATE POLICY "authenticated can create company" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "read own profile" ON public.user_profiles FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR (company_id = public.current_company_id() AND public.is_company_admin()));
CREATE POLICY "update own profile" ON public.user_profiles FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR (company_id = public.current_company_id() AND public.is_company_admin()));
CREATE POLICY "admin insert profiles" ON public.user_profiles FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid() OR public.is_company_admin());

CREATE POLICY "company employees read" ON public.employees FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
CREATE POLICY "admins manage employees" ON public.employees FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_company_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin());

CREATE POLICY "company read departments" ON public.departments FOR SELECT TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY "admins manage departments" ON public.departments FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_company_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin());

CREATE POLICY "company read designations" ON public.designations FOR SELECT TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY "admins manage designations" ON public.designations FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_company_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin());

CREATE POLICY "company read roles" ON public.roles FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = public.current_company_id());
CREATE POLICY "admins manage roles" ON public.roles FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_company_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin());

CREATE POLICY "auth read permissions" ON public.permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage role_permissions" ON public.role_permissions FOR ALL TO authenticated
  USING (public.is_company_admin()) WITH CHECK (public.is_company_admin());

CREATE POLICY "read own user_roles or admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_profile_id = public.current_profile_id() OR public.is_company_admin());
CREATE POLICY "admins manage user_roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_company_admin()) WITH CHECK (public.is_company_admin());

CREATE POLICY "admins read audit" ON public.audit_logs FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_company_admin());
CREATE POLICY "auth insert audit" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_profile_id = public.current_profile_id());
CREATE POLICY "update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_profile_id = public.current_profile_id());
CREATE POLICY "admins insert notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

INSERT INTO public.permissions (module, action, description) VALUES
  ('employees','read','View employees'),
  ('employees','write','Create/update employees'),
  ('employees','delete','Delete employees'),
  ('departments','manage','Manage departments'),
  ('designations','manage','Manage designations'),
  ('roles','manage','Manage roles & permissions'),
  ('audit_logs','read','View audit logs'),
  ('company','manage','Manage company settings')
ON CONFLICT (module, action) DO NOTHING;
