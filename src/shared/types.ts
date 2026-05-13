import type {
  AssetStatus,
  DocumentClassification,
  EmploymentStatus,
  ExpenseStatus,
  ExpenseSubType,
  ExpenseType,
  PaymentType,
  RoleKey,
  TimesheetStatus
} from "./constants.js";

export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;
export type Money = string;

export interface AuthUser {
  id: UUID;
  employee_code: string;
  email: string;
  full_name: string;
  department_id: UUID;
  designation_id: UUID;
  roles: RoleKey[];
  employment_status: EmploymentStatus;
  hierarchy_path: string;
}

export interface Department {
  id: UUID;
  department_code: string;
  name: string;
  director_user_id: UUID | null;
  status: "active" | "inactive";
  deleted_at: ISODateTime | null;
}

export interface Designation {
  id: UUID;
  designation_code: string;
  title: string;
  level: number | null;
  status: "active" | "inactive";
  deleted_at: ISODateTime | null;
}

export interface CoreUser extends AuthUser {
  manager_user_id: UUID | null;
  timezone: string | null;
  joined_on: ISODate | null;
  terminated_on: ISODate | null;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface ExpenseTicket {
  id: UUID;
  ticket_no: string;
  requester_user_id: UUID;
  requester_role_snapshot: string;
  department_id: UUID;
  expense_type: ExpenseType;
  expense_sub_type: ExpenseSubType;
  project_code: string | null;
  client_name: string | null;
  task_title: string;
  task_description: string;
  location: string | null;
  start_date: ISODate;
  end_date: ISODate;
  estimated_amount: Money;
  payment_type: PaymentType;
  advance_amount: Money | null;
  advance_justification: string | null;
  manager_verifier_id: UUID | null;
  manager_backup_user_id: UUID | null;
  finance_approver_id: UUID | null;
  status: ExpenseStatus;
  actual_amount: Money | null;
  variance_amount: Money | null;
  payment_reference_no: string | null;
  closure_remarks: string | null;
  context_payload: Record<string, unknown>;
  route_snapshot: Record<string, unknown>;
  policy_snapshot: Record<string, unknown>;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  submitted_at: ISODateTime | null;
  closed_at: ISODateTime | null;
  deleted_at: ISODateTime | null;
}

export interface ExpenseLineItem {
  id: UUID;
  ticket_id: UUID;
  line_category: string;
  description: string;
  quantity: Money | null;
  unit_cost: Money | null;
  line_total: Money;
  tax_amount: Money | null;
  vendor_name: string | null;
}

export interface ExpenseAuditLog {
  id: UUID;
  ticket_id: UUID;
  actor_user_id: UUID;
  event_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  remarks: string | null;
  payload_hash: string | null;
  created_at: ISODateTime;
}

export interface ManagerBackupAssignment {
  id: UUID;
  employee_user_id: UUID;
  backup_manager_user_id: UUID;
  assigned_by_user_id: UUID;
  effective_from: ISODate;
  effective_to: ISODate | null;
  status: "active" | "revoked" | "expired";
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface FinanceGovernanceConfig {
  id: UUID;
  scope_key: "global";
  primary_finance_manager_user_id: UUID;
  manager_backup_user_id: UUID | null;
  finance_approval_backup_user_id: UUID | null;
  status: "active" | "inactive";
  effective_from: ISODate;
  effective_to: ISODate | null;
  updated_by_user_id: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
  version: number;
}

export interface ExpenseDocument {
  id: UUID;
  ticket_id: UUID;
  document_id: UUID;
  document_type: string;
  verification_status: "pending" | "verified" | "rejected";
  uploaded_by: UUID;
  uploaded_at: ISODateTime;
}

export interface ExpensePayment {
  id: UUID;
  ticket_id: UUID;
  payment_type: PaymentType;
  approved_amount: Money;
  paid_amount: Money;
  payment_date: ISODate;
  payment_mode: string;
  reference_no: string;
  settlement_status: "payable" | "recoverable" | "no_balance" | "pending" | null;
  settlement_amount: Money | null;
  processed_by_user_id: UUID;
  created_at: ISODateTime;
}

export interface DocumentMetadata {
  id: UUID;
  business_object_type: string;
  business_object_id: UUID;
  owner_user_id: UUID | null;
  classification: DocumentClassification;
  document_type: string;
  current_version: number;
  file_name: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  metadata: Record<string, unknown>;
  created_by_user_id: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface AssetRecord {
  id: UUID;
  asset_code: string;
  qr_hash: string;
  asset_type: string;
  name: string;
  serial_no: string | null;
  status: AssetStatus;
  current_assigned_user_id: UUID | null;
  metadata: Record<string, unknown>;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface TimesheetSubmission {
  id: UUID;
  employee_user_id: UUID;
  cycle_start: ISODate;
  cycle_end: ISODate;
  status: TimesheetStatus;
  total_hours: Money;
  workflow_definition_id: UUID;
  workflow_snapshot: Record<string, unknown>;
  current_approver_user_id: UUID | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface OutboxEvent {
  id: number;
  event_id: UUID;
  aggregate_type: string;
  aggregate_id: UUID;
  event_type: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  status: "pending" | "published" | "retry" | "dead_letter";
  retry_count: number;
  available_at: ISODateTime;
  created_at: ISODateTime;
  published_at: ISODateTime | null;
  failed_at: ISODateTime | null;
  last_error: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}
