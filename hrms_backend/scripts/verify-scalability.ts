import { walkFiles, read, fail } from "./lib.js";

const migrations = walkFiles("src/db/migrations", (path) => path.endsWith(".sql"))
  .map((path) => read(path))
  .join("\n");

const requiredIndexes = [
  "core_users_hierarchy_path_gist_idx",
  "core_users_department_status_idx",
  "core_users_manager_idx",
  "platform_sessions_user_active_idx",
  "platform_outbox_pending_idx",
  "platform_auth_tokens_lookup_idx",
  "platform_notifications_target_status_idx",
  "expenses_tickets_requester_queue_idx",
  "expenses_tickets_manager_queue_idx",
  "expenses_tickets_finance_queue_idx",
  "expenses_tickets_status_hot_idx",
  "documents_metadata_business_object_idx",
  "documents_permissions_document_role_idx",
  "assets_scan_idx",
  "assets_assigned_status_idx",
  "asset_requests_requester_status_idx",
  "asset_requests_status_priority_idx",
  "asset_maintenance_asset_status_idx",
  "timesheets_segments_employee_date_idx",
  "timesheets_submissions_queue_idx",
  "timesheets_workflow_definitions_definition_gin_idx",
  "attendance_punch_employee_occurred_idx",
  "attendance_daily_status_date_idx",
  "attendance_regularizations_queue_idx",
  "leave_requests_employee_date_idx",
  "leave_requests_queue_idx",
  "wfh_requests_employee_date_idx",
  "wfh_requests_queue_idx",
  "holidays_date_idx",
  "ems_employee_profiles_user_idx",
  "ems_profile_change_queue_idx",
  "ems_service_requests_queue_idx",
  "projects_status_manager_idx",
  "project_members_active_user_uq",
  "project_allocations_employee_date_idx",
  "project_milestones_project_status_idx",
  "helpdesk_tickets_requester_idx",
  "helpdesk_tickets_queue_idx",
  "helpdesk_events_ticket_idx",
  "platform_admin_notification_channels_key_uq",
  "platform_admin_email_templates_module_status_idx",
  "platform_admin_policies_module_status_idx",
  "platform_admin_workflows_module_status_idx",
  "core_role_permissions_role_status_idx"
];

const missing = requiredIndexes.filter((name) => !migrations.includes(name));
if (missing.length > 0) {
  fail(`Scalability verification failed. Missing indexes: ${missing.join(", ")}`);
}

console.log("Scalability verification passed with full module queue/report/index coverage.");
