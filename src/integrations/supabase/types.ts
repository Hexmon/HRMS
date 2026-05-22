export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      asset_assignments: {
        Row: {
          asset_id: string;
          assigned_at: string;
          condition_in: string | null;
          condition_out: string | null;
          employee_id: string;
          id: string;
          remarks: string | null;
          returned_at: string | null;
        };
        Insert: {
          asset_id: string;
          assigned_at?: string;
          condition_in?: string | null;
          condition_out?: string | null;
          employee_id: string;
          id?: string;
          remarks?: string | null;
          returned_at?: string | null;
        };
        Update: {
          asset_id?: string;
          assigned_at?: string;
          condition_in?: string | null;
          condition_out?: string | null;
          employee_id?: string;
          id?: string;
          remarks?: string | null;
          returned_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "asset_assignments_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_assignments_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      asset_documents: {
        Row: {
          asset_id: string;
          created_at: string;
          file_url: string | null;
          id: string;
          name: string;
        };
        Insert: {
          asset_id: string;
          created_at?: string;
          file_url?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          asset_id?: string;
          created_at?: string;
          file_url?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "asset_documents_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
      asset_maintenance: {
        Row: {
          asset_id: string;
          cost: number | null;
          created_at: string;
          id: string;
          maintenance_date: string;
          notes: string | null;
          type: string | null;
          vendor: string | null;
        };
        Insert: {
          asset_id: string;
          cost?: number | null;
          created_at?: string;
          id?: string;
          maintenance_date: string;
          notes?: string | null;
          type?: string | null;
          vendor?: string | null;
        };
        Update: {
          asset_id?: string;
          cost?: number | null;
          created_at?: string;
          id?: string;
          maintenance_date?: string;
          notes?: string | null;
          type?: string | null;
          vendor?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "asset_maintenance_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
      asset_requests: {
        Row: {
          asset_type: string;
          company_id: string;
          created_at: string;
          employee_id: string;
          fulfilled_asset_id: string | null;
          id: string;
          reason: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          asset_type: string;
          company_id: string;
          created_at?: string;
          employee_id: string;
          fulfilled_asset_id?: string | null;
          id?: string;
          reason?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          asset_type?: string;
          company_id?: string;
          created_at?: string;
          employee_id?: string;
          fulfilled_asset_id?: string | null;
          id?: string;
          reason?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "asset_requests_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_requests_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_requests_fulfilled_asset_id_fkey";
            columns: ["fulfilled_asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
      assets: {
        Row: {
          asset_code: string;
          company_id: string;
          created_at: string;
          id: string;
          location: string | null;
          name: string;
          notes: string | null;
          purchase_cost: number | null;
          purchase_date: string | null;
          serial_number: string | null;
          status: string;
          type: string | null;
          updated_at: string;
          vendor: string | null;
          warranty_until: string | null;
        };
        Insert: {
          asset_code: string;
          company_id: string;
          created_at?: string;
          id?: string;
          location?: string | null;
          name: string;
          notes?: string | null;
          purchase_cost?: number | null;
          purchase_date?: string | null;
          serial_number?: string | null;
          status?: string;
          type?: string | null;
          updated_at?: string;
          vendor?: string | null;
          warranty_until?: string | null;
        };
        Update: {
          asset_code?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          location?: string | null;
          name?: string;
          notes?: string | null;
          purchase_cost?: number | null;
          purchase_date?: string | null;
          serial_number?: string | null;
          status?: string;
          type?: string | null;
          updated_at?: string;
          vendor?: string | null;
          warranty_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assets_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_logs: {
        Row: {
          company_id: string;
          created_at: string;
          employee_id: string;
          id: string;
          log_date: string;
          punch_in: string | null;
          punch_out: string | null;
          remarks: string | null;
          source: string | null;
          status: string;
          updated_at: string;
          work_hours: number | null;
          work_mode: string | null;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          employee_id: string;
          id?: string;
          log_date: string;
          punch_in?: string | null;
          punch_out?: string | null;
          remarks?: string | null;
          source?: string | null;
          status?: string;
          updated_at?: string;
          work_hours?: number | null;
          work_mode?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          employee_id?: string;
          id?: string;
          log_date?: string;
          punch_in?: string | null;
          punch_out?: string | null;
          remarks?: string | null;
          source?: string | null;
          status?: string;
          updated_at?: string;
          work_hours?: number | null;
          work_mode?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_logs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_logs_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_user_id: string | null;
          company_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          ip_address: string | null;
          new_value: Json | null;
          old_value: Json | null;
          remarks: string | null;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          company_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          ip_address?: string | null;
          new_value?: Json | null;
          old_value?: Json | null;
          remarks?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          company_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          ip_address?: string | null;
          new_value?: Json | null;
          old_value?: Json | null;
          remarks?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          address: string | null;
          company_size: string | null;
          created_at: string;
          currency: string | null;
          email_domain: string | null;
          financial_year_start: string | null;
          id: string;
          industry: string | null;
          logo_url: string | null;
          name: string;
          timezone: string | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          company_size?: string | null;
          created_at?: string;
          currency?: string | null;
          email_domain?: string | null;
          financial_year_start?: string | null;
          id?: string;
          industry?: string | null;
          logo_url?: string | null;
          name: string;
          timezone?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          company_size?: string | null;
          created_at?: string;
          currency?: string | null;
          email_domain?: string | null;
          financial_year_start?: string | null;
          id?: string;
          industry?: string | null;
          logo_url?: string | null;
          name?: string;
          timezone?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      departments: {
        Row: {
          company_id: string;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      designations: {
        Row: {
          company_id: string;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "designations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_reviewer_mappings: {
        Row: {
          company_id: string;
          created_at: string;
          employee_id: string;
          id: string;
          reviewer_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          employee_id: string;
          id?: string;
          reviewer_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          employee_id?: string;
          id?: string;
          reviewer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_reviewer_mappings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_reviewer_mappings_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_reviewer_mappings_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      employees: {
        Row: {
          company_email: string | null;
          company_id: string;
          contact_number: string | null;
          created_at: string;
          date_of_joining: string | null;
          department_id: string | null;
          designation_id: string | null;
          dob: string | null;
          employee_code: string;
          employee_status: Database["public"]["Enums"]["employee_status"];
          employment_type: Database["public"]["Enums"]["employment_type"] | null;
          first_name: string;
          full_name: string | null;
          gender: string | null;
          id: string;
          last_name: string;
          login_enabled: boolean;
          middle_name: string | null;
          notice_period_days: number | null;
          personal_email: string | null;
          probation_end_date: string | null;
          reporting_manager_id: string | null;
          updated_at: string;
          work_location: string | null;
          work_mode: Database["public"]["Enums"]["work_mode"] | null;
        };
        Insert: {
          company_email?: string | null;
          company_id: string;
          contact_number?: string | null;
          created_at?: string;
          date_of_joining?: string | null;
          department_id?: string | null;
          designation_id?: string | null;
          dob?: string | null;
          employee_code: string;
          employee_status?: Database["public"]["Enums"]["employee_status"];
          employment_type?: Database["public"]["Enums"]["employment_type"] | null;
          first_name: string;
          full_name?: string | null;
          gender?: string | null;
          id?: string;
          last_name: string;
          login_enabled?: boolean;
          middle_name?: string | null;
          notice_period_days?: number | null;
          personal_email?: string | null;
          probation_end_date?: string | null;
          reporting_manager_id?: string | null;
          updated_at?: string;
          work_location?: string | null;
          work_mode?: Database["public"]["Enums"]["work_mode"] | null;
        };
        Update: {
          company_email?: string | null;
          company_id?: string;
          contact_number?: string | null;
          created_at?: string;
          date_of_joining?: string | null;
          department_id?: string | null;
          designation_id?: string | null;
          dob?: string | null;
          employee_code?: string;
          employee_status?: Database["public"]["Enums"]["employee_status"];
          employment_type?: Database["public"]["Enums"]["employment_type"] | null;
          first_name?: string;
          full_name?: string | null;
          gender?: string | null;
          id?: string;
          last_name?: string;
          login_enabled?: boolean;
          middle_name?: string | null;
          notice_period_days?: number | null;
          personal_email?: string | null;
          probation_end_date?: string | null;
          reporting_manager_id?: string | null;
          updated_at?: string;
          work_location?: string | null;
          work_mode?: Database["public"]["Enums"]["work_mode"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_designation_id_fkey";
            columns: ["designation_id"];
            isOneToOne: false;
            referencedRelation: "designations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_reporting_manager_id_fkey";
            columns: ["reporting_manager_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_approvals: {
        Row: {
          acted_at: string;
          approver_id: string | null;
          id: string;
          remarks: string | null;
          stage: string;
          status: string;
          ticket_id: string;
        };
        Insert: {
          acted_at?: string;
          approver_id?: string | null;
          id?: string;
          remarks?: string | null;
          stage: string;
          status: string;
          ticket_id: string;
        };
        Update: {
          acted_at?: string;
          approver_id?: string | null;
          id?: string;
          remarks?: string | null;
          stage?: string;
          status?: string;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_approvals_approver_id_fkey";
            columns: ["approver_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_approvals_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "expense_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_documents: {
        Row: {
          created_at: string;
          file_url: string | null;
          id: string;
          name: string;
          ticket_id: string;
        };
        Insert: {
          created_at?: string;
          file_url?: string | null;
          id?: string;
          name: string;
          ticket_id: string;
        };
        Update: {
          created_at?: string;
          file_url?: string | null;
          id?: string;
          name?: string;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_documents_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "expense_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_line_items: {
        Row: {
          amount: number;
          category: string;
          created_at: string;
          description: string | null;
          expense_date: string;
          id: string;
          ticket_id: string;
          vendor: string | null;
        };
        Insert: {
          amount?: number;
          category: string;
          created_at?: string;
          description?: string | null;
          expense_date: string;
          id?: string;
          ticket_id: string;
          vendor?: string | null;
        };
        Update: {
          amount?: number;
          category?: string;
          created_at?: string;
          description?: string | null;
          expense_date?: string;
          id?: string;
          ticket_id?: string;
          vendor?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "expense_line_items_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "expense_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_payments: {
        Row: {
          amount: number;
          id: string;
          method: string | null;
          paid_at: string;
          reference: string | null;
          remarks: string | null;
          ticket_id: string;
        };
        Insert: {
          amount: number;
          id?: string;
          method?: string | null;
          paid_at?: string;
          reference?: string | null;
          remarks?: string | null;
          ticket_id: string;
        };
        Update: {
          amount?: number;
          id?: string;
          method?: string | null;
          paid_at?: string;
          reference?: string | null;
          remarks?: string | null;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_payments_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "expense_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_policy_rules: {
        Row: {
          category: string;
          company_id: string;
          created_at: string;
          daily_limit: number | null;
          id: string;
          notes: string | null;
          per_item_limit: number | null;
          requires_receipt: boolean;
        };
        Insert: {
          category: string;
          company_id: string;
          created_at?: string;
          daily_limit?: number | null;
          id?: string;
          notes?: string | null;
          per_item_limit?: number | null;
          requires_receipt?: boolean;
        };
        Update: {
          category?: string;
          company_id?: string;
          created_at?: string;
          daily_limit?: number | null;
          id?: string;
          notes?: string | null;
          per_item_limit?: number | null;
          requires_receipt?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "expense_policy_rules_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_settlements: {
        Row: {
          amount: number;
          id: string;
          remarks: string | null;
          settled_at: string;
          ticket_id: string;
        };
        Insert: {
          amount: number;
          id?: string;
          remarks?: string | null;
          settled_at?: string;
          ticket_id: string;
        };
        Update: {
          amount?: number;
          id?: string;
          remarks?: string | null;
          settled_at?: string;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_settlements_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "expense_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_tickets: {
        Row: {
          company_id: string;
          created_at: string;
          currency: string | null;
          employee_id: string;
          id: string;
          purpose: string | null;
          status: string;
          submitted_at: string | null;
          ticket_code: string;
          title: string | null;
          total_amount: number;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          currency?: string | null;
          employee_id: string;
          id?: string;
          purpose?: string | null;
          status?: string;
          submitted_at?: string | null;
          ticket_code: string;
          title?: string | null;
          total_amount?: number;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          currency?: string | null;
          employee_id?: string;
          id?: string;
          purpose?: string | null;
          status?: string;
          submitted_at?: string | null;
          ticket_code?: string;
          title?: string | null;
          total_amount?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_tickets_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_tickets_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      helpdesk_assignments: {
        Row: {
          assigned_at: string;
          assigned_by: string | null;
          assignee_id: string;
          id: string;
          remarks: string | null;
          ticket_id: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by?: string | null;
          assignee_id: string;
          id?: string;
          remarks?: string | null;
          ticket_id: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string | null;
          assignee_id?: string;
          id?: string;
          remarks?: string | null;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "helpdesk_assignments_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "helpdesk_assignments_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "helpdesk_assignments_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "helpdesk_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      helpdesk_attachments: {
        Row: {
          created_at: string;
          file_url: string | null;
          id: string;
          name: string;
          ticket_id: string;
          uploaded_by: string | null;
        };
        Insert: {
          created_at?: string;
          file_url?: string | null;
          id?: string;
          name: string;
          ticket_id: string;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          file_url?: string | null;
          id?: string;
          name?: string;
          ticket_id?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "helpdesk_attachments_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "helpdesk_tickets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "helpdesk_attachments_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      helpdesk_categories: {
        Row: {
          company_id: string;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          sla_hours: number;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          sla_hours?: number;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          sla_hours?: number;
        };
        Relationships: [
          {
            foreignKeyName: "helpdesk_categories_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      helpdesk_comments: {
        Row: {
          author_id: string | null;
          body: string;
          created_at: string;
          id: string;
          is_internal: boolean;
          ticket_id: string;
        };
        Insert: {
          author_id?: string | null;
          body: string;
          created_at?: string;
          id?: string;
          is_internal?: boolean;
          ticket_id: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          is_internal?: boolean;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "helpdesk_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "helpdesk_comments_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "helpdesk_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      helpdesk_sla_logs: {
        Row: {
          breached: boolean;
          event: string;
          id: string;
          occurred_at: string;
          remarks: string | null;
          ticket_id: string;
        };
        Insert: {
          breached?: boolean;
          event: string;
          id?: string;
          occurred_at?: string;
          remarks?: string | null;
          ticket_id: string;
        };
        Update: {
          breached?: boolean;
          event?: string;
          id?: string;
          occurred_at?: string;
          remarks?: string | null;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "helpdesk_sla_logs_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "helpdesk_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      helpdesk_tickets: {
        Row: {
          assignee_id: string | null;
          category_id: string | null;
          company_id: string;
          created_at: string;
          description: string | null;
          due_at: string | null;
          id: string;
          priority: string;
          requester_id: string;
          resolved_at: string | null;
          status: string;
          subject: string;
          ticket_code: string;
          updated_at: string;
        };
        Insert: {
          assignee_id?: string | null;
          category_id?: string | null;
          company_id: string;
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          priority?: string;
          requester_id: string;
          resolved_at?: string | null;
          status?: string;
          subject: string;
          ticket_code: string;
          updated_at?: string;
        };
        Update: {
          assignee_id?: string | null;
          category_id?: string | null;
          company_id?: string;
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          priority?: string;
          requester_id?: string;
          resolved_at?: string | null;
          status?: string;
          subject?: string;
          ticket_code?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "helpdesk_tickets_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "helpdesk_tickets_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "helpdesk_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "helpdesk_tickets_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "helpdesk_tickets_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      holidays: {
        Row: {
          company_id: string;
          created_at: string;
          holiday_date: string;
          id: string;
          is_optional: boolean;
          name: string;
          region: string | null;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          holiday_date: string;
          id?: string;
          is_optional?: boolean;
          name: string;
          region?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          holiday_date?: string;
          id?: string;
          is_optional?: boolean;
          name?: string;
          region?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "holidays_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      leave_balances: {
        Row: {
          company_id: string;
          employee_id: string;
          entitled: number;
          id: string;
          leave_type: string;
          pending: number;
          updated_at: string;
          used: number;
          year: number;
        };
        Insert: {
          company_id: string;
          employee_id: string;
          entitled?: number;
          id?: string;
          leave_type: string;
          pending?: number;
          updated_at?: string;
          used?: number;
          year: number;
        };
        Update: {
          company_id?: string;
          employee_id?: string;
          entitled?: number;
          id?: string;
          leave_type?: string;
          pending?: number;
          updated_at?: string;
          used?: number;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "leave_balances_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leave_balances_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      leave_requests: {
        Row: {
          approved_at: string | null;
          approver_id: string | null;
          company_id: string;
          created_at: string;
          days: number;
          employee_id: string;
          end_date: string;
          id: string;
          leave_type: string;
          reason: string | null;
          remarks: string | null;
          start_date: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          approver_id?: string | null;
          company_id: string;
          created_at?: string;
          days?: number;
          employee_id: string;
          end_date: string;
          id?: string;
          leave_type: string;
          reason?: string | null;
          remarks?: string | null;
          start_date: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approver_id?: string | null;
          company_id?: string;
          created_at?: string;
          days?: number;
          employee_id?: string;
          end_date?: string;
          id?: string;
          leave_type?: string;
          reason?: string | null;
          remarks?: string | null;
          start_date?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leave_requests_approver_id_fkey";
            columns: ["approver_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leave_requests_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          company_id: string | null;
          created_at: string;
          id: string;
          is_read: boolean;
          message: string | null;
          related_entity_id: string | null;
          related_entity_type: string | null;
          title: string;
          type: string;
          user_profile_id: string;
        };
        Insert: {
          company_id?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message?: string | null;
          related_entity_id?: string | null;
          related_entity_type?: string | null;
          title: string;
          type?: string;
          user_profile_id: string;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message?: string | null;
          related_entity_id?: string | null;
          related_entity_type?: string | null;
          title?: string;
          type?: string;
          user_profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_profile_id_fkey";
            columns: ["user_profile_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      permissions: {
        Row: {
          action: string;
          description: string | null;
          id: string;
          module: string;
        };
        Insert: {
          action: string;
          description?: string | null;
          id?: string;
          module: string;
        };
        Update: {
          action?: string;
          description?: string | null;
          id?: string;
          module?: string;
        };
        Relationships: [];
      };
      project_documents: {
        Row: {
          created_at: string;
          file_url: string | null;
          id: string;
          name: string;
          project_id: string;
          uploaded_by: string | null;
        };
        Insert: {
          created_at?: string;
          file_url?: string | null;
          id?: string;
          name: string;
          project_id: string;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          file_url?: string | null;
          id?: string;
          name?: string;
          project_id?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_documents_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      project_members: {
        Row: {
          allocation_pct: number;
          created_at: string;
          employee_id: string;
          end_date: string | null;
          id: string;
          project_id: string;
          role: string | null;
          start_date: string | null;
        };
        Insert: {
          allocation_pct?: number;
          created_at?: string;
          employee_id: string;
          end_date?: string | null;
          id?: string;
          project_id: string;
          role?: string | null;
          start_date?: string | null;
        };
        Update: {
          allocation_pct?: number;
          created_at?: string;
          employee_id?: string;
          end_date?: string | null;
          id?: string;
          project_id?: string;
          role?: string | null;
          start_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_members_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_tasks: {
        Row: {
          assignee_id: string | null;
          created_at: string;
          description: string | null;
          due_date: string | null;
          id: string;
          priority: string | null;
          project_id: string;
          start_date: string | null;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          assignee_id?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          priority?: string | null;
          project_id: string;
          start_date?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          assignee_id?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          priority?: string | null;
          project_id?: string;
          start_date?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_tasks_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          budget: number | null;
          client: string | null;
          code: string;
          company_id: string;
          created_at: string;
          currency: string | null;
          description: string | null;
          end_date: string | null;
          id: string;
          manager_id: string | null;
          name: string;
          start_date: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          budget?: number | null;
          client?: string | null;
          code: string;
          company_id: string;
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          manager_id?: string | null;
          name: string;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          budget?: number | null;
          client?: string | null;
          code?: string;
          company_id?: string;
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          manager_id?: string | null;
          name?: string;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          id: string;
          permission_id: string;
          role_id: string;
        };
        Insert: {
          id?: string;
          permission_id: string;
          role_id: string;
        };
        Update: {
          id?: string;
          permission_id?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey";
            columns: ["permission_id"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          company_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          is_system_role: boolean;
          name: Database["public"]["Enums"]["app_role"];
          updated_at: string;
        };
        Insert: {
          company_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_system_role?: boolean;
          name: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_system_role?: boolean;
          name?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      timesheet_approvals: {
        Row: {
          approver_id: string | null;
          created_at: string;
          id: string;
          remarks: string | null;
          status: string;
          timesheet_id: string;
        };
        Insert: {
          approver_id?: string | null;
          created_at?: string;
          id?: string;
          remarks?: string | null;
          status: string;
          timesheet_id: string;
        };
        Update: {
          approver_id?: string | null;
          created_at?: string;
          id?: string;
          remarks?: string | null;
          status?: string;
          timesheet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "timesheet_approvals_approver_id_fkey";
            columns: ["approver_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timesheet_approvals_timesheet_id_fkey";
            columns: ["timesheet_id"];
            isOneToOne: false;
            referencedRelation: "timesheets";
            referencedColumns: ["id"];
          },
        ];
      };
      timesheet_entries: {
        Row: {
          created_at: string;
          description: string | null;
          entry_date: string;
          hours: number;
          id: string;
          project_id: string | null;
          task_id: string | null;
          timesheet_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          entry_date: string;
          hours?: number;
          id?: string;
          project_id?: string | null;
          task_id?: string | null;
          timesheet_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          entry_date?: string;
          hours?: number;
          id?: string;
          project_id?: string | null;
          task_id?: string | null;
          timesheet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "timesheet_entries_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timesheet_entries_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "project_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timesheet_entries_timesheet_id_fkey";
            columns: ["timesheet_id"];
            isOneToOne: false;
            referencedRelation: "timesheets";
            referencedColumns: ["id"];
          },
        ];
      };
      timesheets: {
        Row: {
          company_id: string;
          created_at: string;
          employee_id: string;
          id: string;
          status: string;
          submitted_at: string | null;
          total_hours: number | null;
          updated_at: string;
          week_end: string;
          week_start: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          employee_id: string;
          id?: string;
          status?: string;
          submitted_at?: string | null;
          total_hours?: number | null;
          updated_at?: string;
          week_end: string;
          week_start: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          employee_id?: string;
          id?: string;
          status?: string;
          submitted_at?: string | null;
          total_hours?: number | null;
          updated_at?: string;
          week_end?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "timesheets_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timesheets_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      user_profiles: {
        Row: {
          auth_user_id: string;
          avatar_url: string | null;
          company_id: string | null;
          created_at: string;
          email: string;
          employee_id: string | null;
          full_name: string;
          id: string;
          last_login_at: string | null;
          phone: string | null;
          status: Database["public"]["Enums"]["user_status"];
          updated_at: string;
        };
        Insert: {
          auth_user_id: string;
          avatar_url?: string | null;
          company_id?: string | null;
          created_at?: string;
          email: string;
          employee_id?: string | null;
          full_name: string;
          id?: string;
          last_login_at?: string | null;
          phone?: string | null;
          status?: Database["public"]["Enums"]["user_status"];
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string;
          avatar_url?: string | null;
          company_id?: string | null;
          created_at?: string;
          email?: string;
          employee_id?: string | null;
          full_name?: string;
          id?: string;
          last_login_at?: string | null;
          phone?: string | null;
          status?: Database["public"]["Enums"]["user_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_profiles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_profiles_employee_fk";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          assigned_at: string;
          assigned_by: string | null;
          id: string;
          role_id: string;
          user_profile_id: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by?: string | null;
          id?: string;
          role_id: string;
          user_profile_id: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string | null;
          id?: string;
          role_id?: string;
          user_profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_user_profile_id_fkey";
            columns: ["user_profile_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      wfh_requests: {
        Row: {
          approved_at: string | null;
          approver_id: string | null;
          company_id: string;
          created_at: string;
          days: number;
          employee_id: string;
          end_date: string;
          id: string;
          reason: string | null;
          remarks: string | null;
          start_date: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          approver_id?: string | null;
          company_id: string;
          created_at?: string;
          days?: number;
          employee_id: string;
          end_date: string;
          id?: string;
          reason?: string | null;
          remarks?: string | null;
          start_date: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approver_id?: string | null;
          company_id?: string;
          created_at?: string;
          days?: number;
          employee_id?: string;
          end_date?: string;
          id?: string;
          reason?: string | null;
          remarks?: string | null;
          start_date?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wfh_requests_approver_id_fkey";
            columns: ["approver_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wfh_requests_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wfh_requests_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_company_id: { Args: never; Returns: string };
      current_profile_id: { Args: never; Returns: string };
      has_permission: {
        Args: { _action: string; _module: string };
        Returns: boolean;
      };
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] };
        Returns: boolean;
      };
      is_company_admin: { Args: never; Returns: boolean };
    };
    Enums: {
      app_role:
        | "main_admin"
        | "hr_admin"
        | "finance_manager"
        | "manager"
        | "project_manager"
        | "asset_admin"
        | "helpdesk_agent"
        | "employee"
        | "director"
        | "auditor";
      employee_status: "active" | "on_leave" | "probation" | "notice" | "exited";
      employment_type: "full_time" | "part_time" | "contract" | "intern" | "consultant";
      user_status: "active" | "inactive" | "invited" | "suspended";
      work_mode: "on_site" | "remote" | "hybrid";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "main_admin",
        "hr_admin",
        "finance_manager",
        "manager",
        "project_manager",
        "asset_admin",
        "helpdesk_agent",
        "employee",
        "director",
        "auditor",
      ],
      employee_status: ["active", "on_leave", "probation", "notice", "exited"],
      employment_type: ["full_time", "part_time", "contract", "intern", "consultant"],
      user_status: ["active", "inactive", "invited", "suspended"],
      work_mode: ["on_site", "remote", "hybrid"],
    },
  },
} as const;
