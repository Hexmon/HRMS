
DO $$
DECLARE
  spec RECORD;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('project_members','project_id','projects'),
      ('project_tasks','project_id','projects'),
      ('project_documents','project_id','projects'),
      ('timesheet_entries','timesheet_id','timesheets'),
      ('timesheet_approvals','timesheet_id','timesheets'),
      ('expense_line_items','ticket_id','expense_tickets'),
      ('expense_documents','ticket_id','expense_tickets'),
      ('expense_approvals','ticket_id','expense_tickets'),
      ('expense_payments','ticket_id','expense_tickets'),
      ('expense_settlements','ticket_id','expense_tickets'),
      ('asset_assignments','asset_id','assets'),
      ('asset_maintenance','asset_id','assets'),
      ('asset_documents','asset_id','assets'),
      ('helpdesk_comments','ticket_id','helpdesk_tickets'),
      ('helpdesk_assignments','ticket_id','helpdesk_tickets'),
      ('helpdesk_sla_logs','ticket_id','helpdesk_tickets'),
      ('helpdesk_attachments','ticket_id','helpdesk_tickets')
    ) AS s(child_table, fk_col, parent_table)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth read %1$s" ON public.%1$I', spec.child_table);
    EXECUTE format('DROP POLICY IF EXISTS "auth write %1$s" ON public.%1$I', spec.child_table);

    EXECUTE format($q$
      CREATE POLICY "company read %1$s" ON public.%1$I
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.%3$I p
        WHERE p.id = %1$I.%2$I AND p.company_id = public.current_company_id()
      ))
    $q$, spec.child_table, spec.fk_col, spec.parent_table);

    EXECUTE format($q$
      CREATE POLICY "company write %1$s" ON public.%1$I
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.%3$I p
        WHERE p.id = %1$I.%2$I AND p.company_id = public.current_company_id()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.%3$I p
        WHERE p.id = %1$I.%2$I AND p.company_id = public.current_company_id()
      ))
    $q$, spec.child_table, spec.fk_col, spec.parent_table);
  END LOOP;
END $$;
