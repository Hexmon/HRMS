import { read, fail } from "./lib.js";

const migration = read("src/db/migrations/0001_initial.sql");
const requiredIndexes = [
  "expenses_tickets_requester_queue_idx",
  "expenses_tickets_manager_queue_idx",
  "expenses_tickets_finance_queue_idx",
  "expenses_tickets_status_hot_idx",
  "core_users_hierarchy_path_gist_idx",
  "documents_metadata_business_object_idx",
  "assets_scan_idx",
  "timesheets_submissions_queue_idx",
  "timesheets_workflow_definitions_definition_gin_idx"
];

const missing = requiredIndexes.filter((name) => !migration.includes(name));
if (missing.length > 0) {
  fail(`Scalability verification failed. Missing indexes: ${missing.join(", ")}`);
}

console.log("Scalability verification passed with queue/report/index coverage.");
