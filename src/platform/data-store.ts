import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import type {
  AssetRecord,
  AttendanceDayRecord,
  AttendancePunch,
  AttendanceRegularizationRequest,
  AuthUser,
  CoreUser,
  Department,
  Designation,
  DocumentMetadata,
  EmsEmployeeProfile,
  EmsLetter,
  EmsPolicy,
  EmsPolicyAcknowledgement,
  EmsProfileChangeRequest,
  EmsServiceRequest,
  ExpenseAuditLog,
  ExpenseDocument,
  ExpenseLineItem,
  ExpensePayment,
  FinanceGovernanceConfig,
  ExpenseSubType,
  ExpenseTicket,
  Holiday,
  LeaveRequest,
  ManagerBackupAssignment,
  OutboxEvent,
  TimesheetSubmission,
  UUID,
  WfhRequest
} from "#shared";
import {
  AssetStatuses,
  DocumentClassifications,
  EmploymentStatuses,
  ExpenseStatuses,
  ExpenseSubTypes,
  ExpenseTypes,
  LicenseStatuses,
  PaymentTypes,
  RequiredDocumentsByExpenseSubType,
  Roles,
  EmsLetterStatuses,
  EmsPolicyAcknowledgementStatuses,
  TimesheetStatuses
} from "#shared";
import { MemorySessionStore, getLocalDemoPassword, hashPasswordSync, type SessionStore } from "#auth";

export interface NotificationRecord {
  id: UUID;
  actor_user_id: UUID | null;
  target_user_id: UUID | null;
  event_type: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "dead_letter";
  created_at: string;
}

export interface ExpenseApprovalRecord {
  id: UUID;
  ticket_id: UUID;
  approval_stage: string;
  approver_user_id: UUID;
  decision: string;
  remarks: string | null;
  role_snapshot: string;
  designation_snapshot: string | null;
  route_snapshot: Record<string, unknown>;
  action_at: string;
  created_at: string;
}

export interface DocumentVersionRecord {
  id: UUID;
  document_id: UUID;
  version: number;
  storage_key: string;
  file_name: string;
  size_bytes: number;
  checksum_sha256: string | null;
  created_by_user_id: UUID;
  created_at: string;
}

export interface DocumentAccessLogRecord {
  id: UUID;
  document_id: UUID;
  actor_user_id: UUID;
  action: string;
  decision: "allowed" | "denied";
  reason: string | null;
  created_at: string;
}

export interface AssetAssignmentRecord {
  id: UUID;
  asset_id: UUID;
  assigned_to_user_id: UUID;
  assigned_by_user_id: UUID;
  assigned_at: string;
  returned_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UserCredentialRecord {
  id: UUID;
  user_id: UUID;
  password_hash: string;
  status: "active" | "revoked";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AuthTokenRecord {
  id: UUID;
  token_hash: string;
  token_type: "email_verification" | "password_setup" | "password_reset" | "company_bootstrap";
  user_id: UUID | null;
  email: string | null;
  company_id: UUID | null;
  status: "active" | "used" | "revoked" | "expired";
  expires_at: string;
  used_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface CompanyProfileRecord {
  id: UUID;
  company_name: string;
  company_slug: string;
  timezone: string;
  locale: string;
  fiscal_year_start_month: number;
  status: "pending" | "active" | "inactive";
  bootstrap_completed_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface UserSessionPreferenceRecord {
  id: UUID;
  user_id: UUID;
  active_role: AuthUser["roles"][number];
  company_id: UUID | null;
  landing_page: string;
  locale: string;
  timezone: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface AssetStateEventRecord {
  id: UUID;
  asset_id: UUID;
  actor_user_id: UUID | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface WorkSegment {
  id: UUID;
  employee_user_id: UUID;
  work_date: string;
  project_code: string | null;
  task_code: string | null;
  hours: string;
  description: string | null;
  billable: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WorkflowDefinitionRecord {
  id: UUID;
  name: string;
  module: "timesheets";
  definition: { approver_strategy: "ltree_manager" | "project_manager" | "hr_manager"; require_billable_review: boolean };
  version: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface LicenseEntitlement {
  id: UUID;
  product_id: UUID;
  seat_count: number;
  status: "active" | "revoked";
  created_at: string;
  updated_at: string;
}

export interface LicenseActivation {
  id: UUID;
  product_id: UUID;
  entitlement_id: UUID;
  hardware_fingerprint_hash: string;
  status: "active" | "revoked";
  created_at: string;
  updated_at: string;
}

export interface ObjectStoragePort {
  readonly kind: "memory" | "minio";
  readonly bucket: string;
  putObject(key: string, body: Buffer, metadata?: Record<string, string>): Promise<void>;
  presignedGetUrl(key: string, expiresInSeconds: number): Promise<string>;
  statObject(key: string): Promise<{ size: number } | null>;
  removeObject(key: string): Promise<void>;
}

export interface DataStorePersistence {
  flush(): Promise<void>;
  reload(): Promise<void>;
  close(): Promise<void>;
}

export interface DataStore {
  kind: "memory" | "postgres";
  departments: Department[];
  designations: Designation[];
  users: CoreUser[];
  userCredentials: UserCredentialRecord[];
  authTokens: AuthTokenRecord[];
  companyProfiles: CompanyProfileRecord[];
  userSessionPreferences: UserSessionPreferenceRecord[];
  financeGovernanceConfig: FinanceGovernanceConfig | null;
  managerBackupAssignments: ManagerBackupAssignment[];
  tickets: ExpenseTicket[];
  lineItems: ExpenseLineItem[];
  expenseApprovals: ExpenseApprovalRecord[];
  auditLogs: ExpenseAuditLog[];
  expenseDocuments: ExpenseDocument[];
  payments: ExpensePayment[];
  documents: DocumentMetadata[];
  documentVersions: DocumentVersionRecord[];
  documentAccessLogs: DocumentAccessLogRecord[];
  notifications: NotificationRecord[];
  outbox: OutboxEvent[];
  assets: AssetRecord[];
  assetAssignments: AssetAssignmentRecord[];
  assetStateEvents: AssetStateEventRecord[];
  assetRecoveryTickets: Array<{
    id: UUID;
    employee_user_id: UUID;
    asset_id: UUID;
    status: string;
    created_at: string;
    updated_at: string;
  }>;
  licenseEntitlements: LicenseEntitlement[];
  licenseActivations: LicenseActivation[];
  compromisedKeys: Array<{ id: UUID; key_hash: string; status: string; created_at: string }>;
  workSegments: WorkSegment[];
  workflowDefinitions: WorkflowDefinitionRecord[];
  timesheetSubmissions: TimesheetSubmission[];
  timesheetActions: Array<{
    id: UUID;
    submission_id: UUID;
    actor_user_id: UUID;
    decision: string;
    remarks: string | null;
    created_at: string;
  }>;
  attendancePunches: AttendancePunch[];
  attendanceDayRecords: AttendanceDayRecord[];
  attendanceRegularizations: AttendanceRegularizationRequest[];
  leaveRequests: LeaveRequest[];
  wfhRequests: WfhRequest[];
  holidays: Holiday[];
  emsEmployeeProfiles: EmsEmployeeProfile[];
  emsProfileChangeRequests: EmsProfileChangeRequest[];
  emsServiceRequests: EmsServiceRequest[];
  emsLetters: EmsLetter[];
  emsPolicies: EmsPolicy[];
  emsPolicyAcknowledgements: EmsPolicyAcknowledgement[];
  processedEvents: Set<string>;
  sessionStore: SessionStore;
  objectStorage: ObjectStoragePort | null;
  persistence: DataStorePersistence | null;
  pgPool: Pool | null;
  nextOutboxId: number;
  nextTicketNo: number;
}

export type MemoryDataStore = DataStore;

export interface SeedIds {
  departmentSales: UUID;
  departmentFinance: UUID;
  designationExecutive: UUID;
  designationManager: UUID;
  designationDirector: UUID;
  designationReviewer: UUID;
  designationFinance: UUID;
  designationEmployee: UUID;
  executive: UUID;
  director: UUID;
  financeManager: UUID;
  alternateFinance: UUID;
  manager: UUID;
  reviewer: UUID;
  employee1: UUID;
  employee2: UUID;
  employee3: UUID;
  admin: UUID;
  auditor: UUID;
  assetManager: UUID;
  financeGovernanceConfig: UUID;
  workflowDefinition: UUID;
  licenseProduct: UUID;
  entitlement: UUID;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function uuidFromName(name: string): UUID {
  const hash = createHash("sha256").update(name).digest("hex");
  const variant = (8 + (Number.parseInt(hash.slice(16, 17), 16) % 4)).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export const seedIds: SeedIds = {
  departmentSales: uuidFromName("department-sales"),
  departmentFinance: uuidFromName("department-finance"),
  designationExecutive: uuidFromName("designation-executive"),
  designationManager: uuidFromName("designation-manager"),
  designationDirector: uuidFromName("designation-executive"),
  designationReviewer: uuidFromName("designation-manager"),
  designationFinance: uuidFromName("designation-finance"),
  designationEmployee: uuidFromName("designation-employee"),
  executive: uuidFromName("user-executive"),
  director: uuidFromName("user-executive"),
  financeManager: uuidFromName("user-finance-manager"),
  alternateFinance: uuidFromName("user-alternate-finance"),
  manager: uuidFromName("user-manager-d1"),
  reviewer: uuidFromName("user-manager-d1"),
  employee1: uuidFromName("user-employee-e1"),
  employee2: uuidFromName("user-employee-e2"),
  employee3: uuidFromName("user-employee-e3"),
  admin: uuidFromName("user-admin"),
  auditor: uuidFromName("user-auditor"),
  assetManager: uuidFromName("user-asset-manager"),
  financeGovernanceConfig: uuidFromName("finance-governance-global"),
  workflowDefinition: uuidFromName("workflow-timesheet-default"),
  licenseProduct: uuidFromName("license-product-office"),
  entitlement: uuidFromName("license-entitlement-office")
};

function makeUser(input: {
  id: UUID;
  employeeCode: string;
  email: string;
  name: string;
  departmentId: UUID;
  designationId: UUID;
  managerId: UUID | null;
  path: string;
  roles: AuthUser["roles"];
}): CoreUser {
  return {
    id: input.id,
    employee_code: input.employeeCode,
    email: input.email,
    full_name: input.name,
    department_id: input.departmentId,
    designation_id: input.designationId,
    roles: input.roles,
    employment_status: EmploymentStatuses.Active,
    hierarchy_path: input.path,
    manager_user_id: input.managerId,
    timezone: "Asia/Kolkata",
    joined_on: "2026-01-01",
    terminated_on: null,
    deleted_at: null,
    version: 1
  };
}

export function createMemoryDataStore(): MemoryDataStore {
  const created = nowIso();
  const departments: Department[] = [
    {
      id: seedIds.departmentSales,
      department_code: "SALES",
      name: "Sales",
      director_user_id: seedIds.executive,
      status: "active",
      deleted_at: null
    },
    {
      id: seedIds.departmentFinance,
      department_code: "FIN",
      name: "Finance",
      director_user_id: seedIds.financeManager,
      status: "active",
      deleted_at: null
    }
  ];

  const designations: Designation[] = [
    {
      id: seedIds.designationExecutive,
      designation_code: "EXECUTIVE",
      title: "Executive",
      level: 10,
      status: "active",
      deleted_at: null
    },
    {
      id: seedIds.designationManager,
      designation_code: "MANAGER",
      title: "Manager",
      level: 6,
      status: "active",
      deleted_at: null
    },
    {
      id: seedIds.designationFinance,
      designation_code: "FINANCE_MANAGER",
      title: "Finance Manager",
      level: 8,
      status: "active",
      deleted_at: null
    },
    {
      id: seedIds.designationEmployee,
      designation_code: "EMPLOYEE",
      title: "Employee",
      level: 1,
      status: "active",
      deleted_at: null
    }
  ];

  const users: CoreUser[] = [
    makeUser({
      id: seedIds.executive,
      employeeCode: "S1",
      email: "executive@example.test",
      name: "Sales Executive",
      departmentId: seedIds.departmentSales,
      designationId: seedIds.designationExecutive,
      managerId: null,
      path: "CEO.SALES.S1",
      roles: [Roles.Employee]
    }),
    makeUser({
      id: seedIds.manager,
      employeeCode: "D1",
      email: "manager@example.test",
      name: "Manager D1",
      departmentId: seedIds.departmentSales,
      designationId: seedIds.designationManager,
      managerId: seedIds.executive,
      path: "CEO.SALES.S1.D1",
      roles: [Roles.Employee]
    }),
    makeUser({
      id: seedIds.employee1,
      employeeCode: "E1",
      email: "e1@example.test",
      name: "Employee E1",
      departmentId: seedIds.departmentSales,
      designationId: seedIds.designationEmployee,
      managerId: seedIds.manager,
      path: "CEO.SALES.S1.D1.E1",
      roles: [Roles.Employee]
    }),
    makeUser({
      id: seedIds.employee2,
      employeeCode: "E2",
      email: "e2@example.test",
      name: "Employee E2",
      departmentId: seedIds.departmentSales,
      designationId: seedIds.designationEmployee,
      managerId: seedIds.manager,
      path: "CEO.SALES.S1.D1.E2",
      roles: [Roles.Employee]
    }),
    makeUser({
      id: seedIds.employee3,
      employeeCode: "E3",
      email: "e3@example.test",
      name: "Employee E3",
      departmentId: seedIds.departmentSales,
      designationId: seedIds.designationEmployee,
      managerId: seedIds.manager,
      path: "CEO.SALES.S1.D1.E3",
      roles: [Roles.Employee]
    }),
    makeUser({
      id: seedIds.financeManager,
      employeeCode: "N1",
      email: "finance@example.test",
      name: "Finance Manager N1",
      departmentId: seedIds.departmentFinance,
      designationId: seedIds.designationFinance,
      managerId: null,
      path: "CEO.FIN.N1",
      roles: [Roles.FinanceManager]
    }),
    makeUser({
      id: seedIds.alternateFinance,
      employeeCode: "N2",
      email: "finance2@example.test",
      name: "Alternate Finance N2",
      departmentId: seedIds.departmentFinance,
      designationId: seedIds.designationFinance,
      managerId: seedIds.financeManager,
      path: "CEO.FIN.N1.N2",
      roles: [Roles.FinanceManager]
    }),
    makeUser({
      id: seedIds.admin,
      employeeCode: "ADM",
      email: "admin@example.test",
      name: "Admin User",
      departmentId: seedIds.departmentFinance,
      designationId: seedIds.designationFinance,
      managerId: null,
      path: "CEO.ADM",
      roles: [Roles.Admin]
    }),
    makeUser({
      id: seedIds.auditor,
      employeeCode: "AUD",
      email: "auditor@example.test",
      name: "Auditor User",
      departmentId: seedIds.departmentFinance,
      designationId: seedIds.designationFinance,
      managerId: null,
      path: "CEO.AUD",
      roles: [Roles.Auditor]
    }),
    makeUser({
      id: seedIds.assetManager,
      employeeCode: "AST",
      email: "assets@example.test",
      name: "Asset Manager",
      departmentId: seedIds.departmentFinance,
      designationId: seedIds.designationFinance,
      managerId: null,
      path: "CEO.AST",
      roles: [Roles.AssetManager]
    })
  ];

  const managerBackupAssignments: ManagerBackupAssignment[] = [seedIds.employee1, seedIds.employee2, seedIds.employee3].map(
    (employeeId) => ({
      id: randomUUID(),
      employee_user_id: employeeId,
      backup_manager_user_id: seedIds.executive,
      assigned_by_user_id: seedIds.admin,
      effective_from: "2026-01-01",
      effective_to: null,
      status: "active",
      created_at: created,
      updated_at: created,
      deleted_at: null,
      version: 1
    })
  );

  const localDemoPassword = getLocalDemoPassword();
  const userCredentials: UserCredentialRecord[] = users.map((user) => ({
    id: uuidFromName(`credential-${user.employee_code}`),
    user_id: user.id,
    password_hash: hashPasswordSync(localDemoPassword, `hrms-local-${user.employee_code.toLowerCase()}`),
    status: "active",
    created_at: created,
    updated_at: created,
    deleted_at: null
  }));

  const financeGovernanceConfig: FinanceGovernanceConfig = {
    id: seedIds.financeGovernanceConfig,
    scope_key: "global",
    primary_finance_manager_user_id: seedIds.financeManager,
    manager_backup_user_id: seedIds.executive,
    finance_approval_backup_user_id: seedIds.admin,
    status: "active",
    effective_from: "2026-01-01",
    effective_to: null,
    updated_by_user_id: seedIds.admin,
    created_at: created,
    updated_at: created,
    deleted_at: null,
    version: 1
  };

  const firstAssetId = uuidFromName("asset-laptop-001");
  const emsEmployeeProfiles: EmsEmployeeProfile[] = users.map((user) => ({
    id: uuidFromName(`ems-profile-${user.employee_code}`),
    employee_user_id: user.id,
    personal_email: `${user.employee_code.toLowerCase()}-personal@example.test`,
    phone: "+91 98000 00000",
    alternate_phone: null,
    current_address: "Bangalore, India",
    permanent_address: "Bangalore, India",
    city: "Bangalore",
    country: "India",
    emergency_contact: { name: "Emergency Contact", relation: "Family", phone: "+91 99000 00000" },
    personal_details: { nationality: "Indian", marital_status: "Not specified" },
    work_preferences: { work_mode: "Hybrid" },
    version: 1,
    created_at: created,
    updated_at: created,
    deleted_at: null
  }));
  const emsLetters: EmsLetter[] = [
    {
      id: uuidFromName("ems-letter-e1-offer"),
      employee_user_id: seedIds.employee1,
      letter_type: "offer_letter",
      title: "Offer Letter",
      description: "Initial offer from Hawkaii HRMS",
      status: EmsLetterStatuses.Available,
      document_id: null,
      issued_on: "2026-01-01",
      acknowledged_at: null,
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("ems-letter-e1-salary-certificate"),
      employee_user_id: seedIds.employee1,
      letter_type: "salary_certificate",
      title: "Salary Certificate",
      description: "For loans, visas, and account opening",
      status: EmsLetterStatuses.InProgress,
      document_id: null,
      issued_on: null,
      acknowledged_at: null,
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    }
  ];
  const emsPolicies: EmsPolicy[] = [
    {
      id: uuidFromName("ems-policy-attendance"),
      policy_code: "ATTENDANCE",
      title: "Attendance policy",
      category: "Attendance",
      version_label: "v3.1",
      effective_from: "2026-01-12",
      document_id: null,
      status: "active",
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("ems-policy-leave"),
      policy_code: "LEAVE",
      title: "Leave policy",
      category: "Leave",
      version_label: "v4.0",
      effective_from: "2026-06-01",
      document_id: null,
      status: "active",
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    },
    {
      id: uuidFromName("ems-policy-wfh"),
      policy_code: "WFH",
      title: "Work from home policy",
      category: "Workplace",
      version_label: "v2.0",
      effective_from: "2026-03-15",
      document_id: null,
      status: "active",
      version: 1,
      created_at: created,
      updated_at: created,
      deleted_at: null
    }
  ];
  const emsPolicyAcknowledgements: EmsPolicyAcknowledgement[] = emsPolicies.map((policy) => ({
    id: uuidFromName(`ems-policy-ack-${policy.policy_code}-e1`),
    policy_id: policy.id,
    employee_user_id: seedIds.employee1,
    status: policy.policy_code === "LEAVE" ? EmsPolicyAcknowledgementStatuses.Pending : EmsPolicyAcknowledgementStatuses.Acknowledged,
    acknowledged_at: policy.policy_code === "LEAVE" ? null : created,
    version: 1,
    created_at: created,
    updated_at: created
  }));
  return {
    kind: "memory",
    departments,
    designations,
    users,
    userCredentials,
    authTokens: [],
    companyProfiles: [],
    userSessionPreferences: [],
    financeGovernanceConfig,
    managerBackupAssignments,
    tickets: [],
    lineItems: [],
    expenseApprovals: [],
    auditLogs: [],
    expenseDocuments: [],
    payments: [],
    documents: [],
    documentVersions: [],
    documentAccessLogs: [],
    notifications: [],
    outbox: [],
    assets: [
      {
        id: firstAssetId,
        asset_code: "LAP-001",
        qr_hash: createQrHash("LAP-001"),
        asset_type: "Laptop",
        name: "ThinkPad T-Series",
        serial_no: "SN-LAP-001",
        status: AssetStatuses.InStock,
        current_assigned_user_id: null,
        metadata: { procurement_cost: "65000.00" },
        version: 1,
        created_at: created,
        updated_at: created,
        deleted_at: null
      }
    ],
    assetAssignments: [],
    assetStateEvents: [],
    assetRecoveryTickets: [],
    licenseEntitlements: [
      {
        id: seedIds.entitlement,
        product_id: seedIds.licenseProduct,
        seat_count: 1,
        status: LicenseStatuses.Active,
        created_at: created,
        updated_at: created
      }
    ],
    licenseActivations: [],
    compromisedKeys: [],
    workSegments: [],
    workflowDefinitions: [
      {
        id: seedIds.workflowDefinition,
        name: "Default ltree manager approval",
        module: "timesheets",
        definition: { approver_strategy: "ltree_manager", require_billable_review: false },
        version: 1,
        status: "active",
        created_at: created,
        updated_at: created
      }
    ],
    timesheetSubmissions: [],
    timesheetActions: [],
    attendancePunches: [],
    attendanceDayRecords: [],
    attendanceRegularizations: [],
    leaveRequests: [],
    wfhRequests: [],
    holidays: [
      {
        id: uuidFromName("holiday-2026-republic-day"),
        name: "Republic Day",
        holiday_date: "2026-01-26",
        region: "All",
        optional: false,
        version: 1,
        created_at: created,
        updated_at: created,
        deleted_at: null
      },
      {
        id: uuidFromName("holiday-2026-holi"),
        name: "Holi",
        holiday_date: "2026-03-04",
        region: "All",
        optional: false,
        version: 1,
        created_at: created,
        updated_at: created,
        deleted_at: null
      },
      {
        id: uuidFromName("holiday-2026-independence-day"),
        name: "Independence Day",
        holiday_date: "2026-08-15",
        region: "All",
        optional: false,
        version: 1,
        created_at: created,
        updated_at: created,
        deleted_at: null
      },
      {
        id: uuidFromName("holiday-2026-diwali"),
        name: "Diwali",
        holiday_date: "2026-11-08",
        region: "All",
        optional: false,
        version: 1,
        created_at: created,
        updated_at: created,
        deleted_at: null
      }
    ],
    emsEmployeeProfiles,
    emsProfileChangeRequests: [],
    emsServiceRequests: [],
    emsLetters,
    emsPolicies,
    emsPolicyAcknowledgements,
    processedEvents: new Set<string>(),
    sessionStore: new MemorySessionStore(),
    objectStorage: null,
    persistence: null,
    pgPool: null,
    nextOutboxId: 1,
    nextTicketNo: 1
  };
}

export function createQrHash(seed: string): string {
  return createHash("sha256")
    .update(`${seed}:${randomBytes(8).toString("hex")}`)
    .digest("base64url")
    .slice(0, 32);
}

export function sanitizeFilename(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const name = dot >= 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "bin";
  const safeName = name.replace(/[^a-zA-Z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "");
  return `${safeName || "document"}.${ext.replace(/[^a-z0-9]/gu, "") || "bin"}`;
}

export function makeStorageKey(input: {
  actor: AuthUser;
  documentType: string;
  fileName: string;
  version: number;
}): string {
  const safe = sanitizeFilename(input.fileName);
  const ext = safe.includes(".") ? safe.split(".").at(-1) ?? "bin" : "bin";
  const date = new Date().toISOString().slice(0, 10);
  return `${date}_${input.actor.employee_code}_${sanitizeFilename(input.documentType).replace(/\.[^.]+$/u, "")}_v${input.version}_${randomUUID()}.${ext}`;
}

export function getRequiredDocuments(subType: ExpenseSubType): readonly string[] {
  return RequiredDocumentsByExpenseSubType[subType];
}

export { DocumentClassifications, ExpenseStatuses, ExpenseSubTypes, ExpenseTypes, PaymentTypes };
