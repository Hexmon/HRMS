import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { MemorySessionStore, ValkeySessionStore } from "#auth";
import { EmploymentStatuses, RequiredDocumentsByExpenseSubType, Roles, WorkflowActions, type AuthUser, type RoleKey } from "#shared";
import type {
  AssetRecord,
  AttendanceDayRecord,
  AttendanceGeoFallbackReview,
  AttendancePunch,
  AttendanceRegularizationAction,
  AttendanceRegularizationCorrectionApplication,
  AttendanceRegularizationRequest,
  AttendanceRegularizationRequestItem,
  CoreUser,
  Department,
  Designation,
  DocumentMetadata,
  EmsAdminChecklist,
  EmsEmployeeProfile,
  EmsLetter,
  EmsPolicy,
  EmsPolicyAcknowledgement,
  EmsProbationReview,
  EmsProfileChangeRequest,
  EmsServiceRequest,
  ExpenseAuditLog,
  ExpenseDocument,
  ExpenseLineItem,
  ExpensePayment,
  ExpenseTicket,
  FinanceGovernanceConfig,
  HelpdeskCategory,
  HelpdeskTicket,
  HelpdeskTicketAttachment,
  HelpdeskTicketComment,
  HelpdeskTicketEvent,
  Holiday,
  HolidayUpsertInput,
  LeaveRequest,
  ManagerBackupAssignment,
  OutboxEvent,
  ProjectAllocationRecord,
  ProjectMemberRecord,
  ProjectMilestoneRecord,
  ProjectRecord,
  AdminEmailTemplateRecord,
  AdminNotificationChannelRecord,
  AdminPolicyConfigRecord,
  AdminSecuritySettingsRecord,
  AdminWorkflowConfigRecord,
  TimesheetSubmission,
  UUID,
  WfhRequest,
} from "#shared";
import {
  type AssetAssignmentRecord,
  type AssetCommandInput,
  type AssetStateEventRecord,
  type AdminMasterDataItemRecord,
  type AuthPersistenceFlushOptions,
  type AuthTokenRecord,
  type CompanyLogoPersistenceFlushOptions,
  type CompanyProfileRecord,
  type DataStore,
  type DashboardExactMetrics,
  type DomainPersistenceFlushOptions,
  type DocumentProcessingConfig,
  type DocumentAccessLogRecord,
  type DocumentVersionRecord,
  type DurableSessionContext,
  type ExpenseApprovalRecord,
  type LicenseActivation,
  type LicenseEntitlement,
  type NotificationRecord,
  type PersistenceDomain,
  type PublicAssetScan,
  type UserSessionPreferenceRecord,
  type WorkSegment,
  type WorkflowDefinitionRecord,
  buildDefaultAdminMasterDataItems,
  buildDefaultAdminSecuritySettings,
  createMemoryDataStore,
} from "./data-store.js";
import { createValkeyClient } from "./valkey-client.js";
import type { EmailDeliveryRecord, EmailEventRecord } from "./email/types.js";
import { MemoryObjectStorage, R2ObjectStorage } from "./object-storage.js";
import { normalizeAttendancePolicyConfig } from "../modules/attendance/policy-config.js";
import { badRequest, companyContextRequired, conflict, forbidden, notFound, unauthorized } from "./errors.js";
import { assertFinanceActor, assertManagerActor } from "../modules/expenses/policy.js";
import {
  lockExpenseCombinedRoutingWriter,
  lockExpenseFinanceGovernanceWriter,
  lockExpenseReviewerRoutingGovernance,
  lockExpenseReviewerRoutingSubjects,
  lockExpenseReviewerRoutingWriter,
  lockExpenseRoutingReader,
} from "../modules/expenses/routing-locks.js";

type ExpenseReportAudience =
  | "company"
  | "requester"
  | "manager_queue"
  | "manager_history"
  | "finance_assigned"
  | "finance_history"
  | "advance_aging"
  | "payment_register"
  | "audit";

type ExpenseMutationAction =
  | "create"
  | "submit"
  | "withdraw"
  | "clarification"
  | "manager.verify"
  | "bills";
type ExpenseMutationResult = Pick<ExpenseTicket, "id" | "status" | "version">;

function assertExpenseReportAudienceRole(
  actor: AuthUser,
  audience: ExpenseReportAudience,
): void {
  const required: readonly RoleKey[] | null =
    audience === "manager_queue" || audience === "manager_history"
      ? [Roles.Reviewer, Roles.Admin]
      : audience === "finance_assigned" || audience === "finance_history"
        ? [Roles.FinanceManager, Roles.Admin, Roles.Auditor]
        : audience === "advance_aging"
          ? [Roles.FinanceManager, Roles.Admin]
          : audience === "payment_register" || audience === "audit"
            ? [Roles.FinanceManager, Roles.Admin, Roles.Auditor]
            : null;
  if (required && !required.some((role) => actor.roles.includes(role))) {
    throw forbidden("Report access denied");
  }
}

function optionalSet(
  values: readonly string[] | undefined,
): ReadonlySet<string> | undefined {
  return values?.length ? new Set(values) : undefined;
}

function hasAnyDomainFlushOption(
  options: DomainPersistenceFlushOptions,
): boolean {
  return Boolean(
    options.userIds?.length ||
    options.companyIds?.length ||
    options.documentIds?.length ||
    options.aggregateIds?.length ||
    options.emsProfileChangeRequestIds?.length ||
    options.emsServiceRequestIds?.length ||
    options.emsLetterIds?.length ||
    options.emsPolicyIds?.length ||
    options.emsAdminChecklistIds?.length ||
    options.emsProbationReviewIds?.length,
  );
}

function shouldFlushId(
  id: string,
  filter: ReadonlySet<string> | undefined,
  filtered: boolean,
): boolean {
  return filtered ? Boolean(filter?.has(id)) : true;
}

const assetCollections = [
  "assets", "assetAssignments", "assetStateEvents", "assetRequests",
  "assetAcknowledgements", "assetMaintenanceRecords", "assetVendors",
  "assetRecoveryTickets", "licenseEntitlements", "licenseActivations",
  "compromisedKeys",
] as const;

type AssetCollection = (typeof assetCollections)[number];

function assetMutationStore(before: DataStore, actor: AuthUser): DataStore {
  const staged = { ...before, outbox: [] as OutboxEvent[], nextOutboxId: 1 };
  for (const collection of assetCollections) {
    // The service/repository layer mutates objects in place. Keep the SQL
    // snapshot and the process-wide hydrated store untouched until commit.
    (staged as unknown as Record<AssetCollection, unknown>)[collection] = structuredClone(before[collection]);
  }
  staged.users = before.users.map((user) => user.id === actor.id ? { ...user, roles: actor.roles, employment_status: actor.employment_status } : user);
  return staged;
}

function assetDeltaStore(before: DataStore, after: DataStore): DataStore {
  const changed = { ...after };
  for (const collection of assetCollections) {
    const oldRows = before[collection] as Array<{ id: string }>;
    const newRows = after[collection] as Array<{ id: string }>;
    const oldById = new Map(oldRows.map((row) => [row.id, row]));
    if (oldRows.some((row) => !newRows.some((candidate) => candidate.id === row.id))) {
      throw new Error(`Asset command removed a ${collection} row without a durable deletion.`);
    }
    (changed as unknown as Record<AssetCollection, unknown>)[collection] = newRows.filter(
      (row) => !isDeepStrictEqual(oldById.get(row.id), row),
    );
  }
  return changed;
}

function isSqlLockTimeout(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "55P03");
}

export interface PostgresObjectStorageOptions {
  driver: "memory" | "r2";
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint?: string;
  requestTimeoutMs: number;
  forcePathStyle: boolean;
}

export interface PostgresDataStoreOptions {
  databaseUrl: string;
  valkeyUrl: string;
  objectStorage: PostgresObjectStorageOptions;
  documentProcessing?: DocumentProcessingConfig;
  seedIfEmpty?: boolean;
}

const resetTables = [
  "helpdesk.ticket_events",
  "helpdesk.ticket_attachments",
  "helpdesk.ticket_comments",
  "helpdesk.tickets",
  "helpdesk.categories",
  "projects.project_milestones",
  "projects.project_allocations",
  "projects.project_members",
  "projects.projects",
  "ems.probation_reviews",
  "ems.admin_checklists",
  "ems.policy_acknowledgements",
  "ems.policies",
  "ems.letters",
  "ems.service_requests",
  "ems.profile_change_requests",
  "ems.employee_profiles",
  "leave_wfh.holidays",
  "leave_wfh.wfh_requests",
  "leave_wfh.leave_requests",
  "attendance.shift_instances",
  "attendance.shift_assignments",
  "attendance.shift_template_versions",
  "attendance.shift_templates",
  "attendance.policy_assignments",
  "attendance.policy_versions",
  "attendance.policies",
  "attendance.projection_rebuild_runs",
  "attendance.payroll_attendance_adjustments",
  "attendance.payroll_attendance_snapshots",
  "attendance.payroll_period_actions",
  "attendance.payroll_periods",
  "attendance.break_segments",
  "attendance.employee_command_states",
  "attendance.attestation_evidence",
  "attendance.command_decisions",
  "attendance.command_executions",
  "attendance.offline_sync_security_audit_logs",
  "attendance.offline_event_inbox",
  "attendance.location_access_audit_logs",
  "attendance.decision_reasons",
  "attendance.attendance_decisions",
  "attendance.location_evidence",
  "attendance.attendance_events",
  "attendance.sessions",
  "attendance.regularization_correction_applications",
  "attendance.regularization_actions",
  "attendance.regularization_request_items",
  "attendance.regularization_requests",
  "attendance.daily_records",
  "attendance.punch_events",
  "timesheets.timesheet_approval_actions",
  "timesheets.timesheet_submissions",
  "timesheets.workflow_definitions",
  "timesheets.work_segments",
  "assets.asset_command_results",
  "assets.compromised_keys",
  "assets.license_activations",
  "assets.license_entitlements",
  "assets.asset_maintenance_records",
  "assets.asset_acknowledgements",
  "assets.asset_requests",
  "assets.asset_recovery_tickets",
  "assets.asset_state_events",
  "assets.asset_assignments",
  "assets.software_products",
  "assets.software_vendors",
  "assets.assets",
  "documents.doc_access_logs",
  "documents.doc_permissions",
  "documents.doc_versions",
  "documents.doc_metadata",
  "expenses.expense_command_results",
  "expenses.expense_owner_repair_audit",
  "expenses.expense_policy_rules",
  "expenses.expense_audit_logs",
  "expenses.expense_payments",
  "expenses.expense_documents",
  "expenses.employee_reviewer_mappings",
  "expenses.expense_approvals",
  "expenses.expense_line_items",
  "expenses.expense_tickets",
  "platform.processed_events",
  "platform.email_events",
  "platform.email_deliveries",
  "platform.admin_master_data_items",
  "platform.admin_notification_channels",
  "platform.admin_email_templates",
  "platform.admin_policies",
  "platform.admin_workflows",
  "platform.notifications",
  "platform.outbox_events",
  "platform.idempotency_keys",
  "platform.user_sessions",
  "platform.auth_tokens",
  "platform.registered_devices",
  "platform.user_session_preferences",
  "platform.company_profiles",
  "platform.user_credentials",
  "platform.finance_governance_config",
  "core.user_roles",
  "core.role_permissions",
  "core.roles",
  "core.users",
  "core.designations",
  "core.departments",
];

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function asIsoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : asIso(value);
}

function asDate(value: unknown): string {
  if (value instanceof Date) {
    // node-postgres parses SQL DATE as midnight in the process timezone.
    // Converting that instant to UTC shifts the calendar date backwards in
    // positive-offset zones such as Asia/Kolkata.
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
}

function asDateOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : asDate(value);
}

function mapHolidayRow(row: Record<string, unknown>): Holiday {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    name: String(row.name),
    holiday_date: asDate(row.holiday_date),
    region: String(row.region),
    optional: Boolean(row.optional),
    version: Number(row.version),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
    deleted_at: asIsoOrNull(row.deleted_at),
  };
}

function asMoney(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : Number(value).toFixed(2);
}

function json(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function booleanRecord(value: unknown): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(json(value)).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

function copyData(target: DataStore, source: DataStore): void {
  target.departments = source.departments;
  target.designations = source.designations;
  target.rbacRoles = source.rbacRoles;
  target.rbacRolePermissions = source.rbacRolePermissions;
  target.adminWorkflows = source.adminWorkflows;
  target.adminPolicies = source.adminPolicies;
  target.adminEmailTemplates = source.adminEmailTemplates;
  target.adminNotificationChannels = source.adminNotificationChannels;
  target.adminSecuritySettings = source.adminSecuritySettings;
  target.adminMasterDataItems = source.adminMasterDataItems;
  target.users = source.users;
  target.userCredentials = source.userCredentials;
  target.authTokens = source.authTokens;
  target.companyProfiles = source.companyProfiles;
  target.userSessionPreferences = source.userSessionPreferences;
  target.financeGovernanceConfig = source.financeGovernanceConfig;
  target.managerBackupAssignments = source.managerBackupAssignments;
  target.tickets = source.tickets;
  target.lineItems = source.lineItems;
  target.expenseApprovals = source.expenseApprovals;
  target.auditLogs = source.auditLogs;
  target.expenseDocuments = source.expenseDocuments;
  target.payments = source.payments;
  target.documents = source.documents;
  target.documentVersions = source.documentVersions;
  target.documentAccessLogs = source.documentAccessLogs;
  target.notifications = source.notifications;
  target.emailDeliveries = source.emailDeliveries;
  target.emailEvents = source.emailEvents;
  target.outbox = source.outbox;
  target.assets = source.assets;
  target.assetAssignments = source.assetAssignments;
  target.assetStateEvents = source.assetStateEvents;
  target.assetRequests = source.assetRequests;
  target.assetAcknowledgements = source.assetAcknowledgements;
  target.assetMaintenanceRecords = source.assetMaintenanceRecords;
  target.assetVendors = source.assetVendors;
  target.assetRecoveryTickets = source.assetRecoveryTickets;
  target.licenseEntitlements = source.licenseEntitlements;
  target.licenseActivations = source.licenseActivations;
  target.compromisedKeys = source.compromisedKeys;
  target.workSegments = source.workSegments;
  target.workflowDefinitions = source.workflowDefinitions;
  target.timesheetSubmissions = source.timesheetSubmissions;
  target.timesheetActions = source.timesheetActions;
  target.projects = source.projects;
  target.projectMembers = source.projectMembers;
  target.projectAllocations = source.projectAllocations;
  target.projectMilestones = source.projectMilestones;
  target.helpdeskCategories = source.helpdeskCategories;
  target.helpdeskTickets = source.helpdeskTickets;
  target.helpdeskComments = source.helpdeskComments;
  target.helpdeskAttachments = source.helpdeskAttachments;
  target.helpdeskEvents = source.helpdeskEvents;
  target.attendancePunches = source.attendancePunches;
  target.attendanceDayRecords = source.attendanceDayRecords;
  target.attendanceRegularizations = source.attendanceRegularizations;
  target.attendanceRegularizationActions =
    source.attendanceRegularizationActions;
  target.attendanceRegularizationCorrectionApplications =
    source.attendanceRegularizationCorrectionApplications;
  target.leaveRequests = source.leaveRequests;
  target.wfhRequests = source.wfhRequests;
  target.holidays = source.holidays;
  target.emsEmployeeProfiles = source.emsEmployeeProfiles;
  target.emsProfileChangeRequests = source.emsProfileChangeRequests;
  target.emsServiceRequests = source.emsServiceRequests;
  target.emsLetters = source.emsLetters;
  target.emsPolicies = source.emsPolicies;
  target.emsPolicyAcknowledgements = source.emsPolicyAcknowledgements;
  target.emsAdminChecklists = source.emsAdminChecklists;
  target.emsProbationReviews = source.emsProbationReviews;
  target.nextTicketNo = source.nextTicketNo;
  target.nextOutboxId = source.nextOutboxId;
}

function migrationSql(): string {
  const directories = ["src/db/migrations", "dist/src/db/migrations"];
  for (const directory of directories) {
    if (!existsSync(directory)) {
      continue;
    }
    const files = readdirSync(directory)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    if (files.length > 0) {
      return files
        .map((file) => readFileSync(`${directory}/${file}`, "utf8"))
        .join("\n");
    }
  }
  throw new Error(
    "SQL migrations are missing from src/db/migrations or dist/src/db/migrations",
  );
}

export async function resetPostgresDatabase(
  databaseUrl: string,
): Promise<void> {
  assertDisposableResetTarget(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  let schemaLockAcquired = false;
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext('hrms_postgres_schema_reset'))",
    );
    schemaLockAcquired = true;
    // Reapplying the full local migration bundle is a test-only bootstrap.
    // Once 0068 exists, its old-writer fence is already active while earlier
    // idempotent migrations are replayed, so explicitly mark this trusted
    // schema-maintenance session and clear it before returning the client.
    await client.query("SELECT set_config('app.expense_command_v1', 'on', false)");
    await client.query(migrationSql());
    await client.query("SELECT set_config('app.expense_command_v1', 'off', false)");
    await client.query("BEGIN");
    await client.query(`TRUNCATE ${resetTables.join(", ")} RESTART IDENTITY`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query("SELECT set_config('app.expense_command_v1', 'off', false)").catch(() => undefined);
    throw error;
  } finally {
    if (schemaLockAcquired) {
      await client
        .query(
          "SELECT pg_advisory_unlock(hashtext('hrms_postgres_schema_reset'))",
        )
        .catch(() => undefined);
    }
    client.release();
    await pool.end();
  }
}

export function assertDisposableResetTarget(databaseUrl: string): void {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Refusing to reset outside a local disposable test database.");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.search || url.hash || database.includes("/") ||
    !/(?:^|[_-])test(?:$|[_-])/i.test(database)
  ) {
    throw new Error("Refusing to reset outside a local disposable test database.");
  }
}

export async function createPostgresDataStore(
  options: PostgresDataStoreOptions,
): Promise<DataStore> {
  const pool = new Pool({ connectionString: options.databaseUrl });
  const objectStorage = options.objectStorage.driver === "memory"
    ? new MemoryObjectStorage()
    : new R2ObjectStorage(options.objectStorage);
  if (objectStorage instanceof R2ObjectStorage) {
    await objectStorage.ensureReady();
  }
  const documentProcessing = options.documentProcessing;
  const valkey = createValkeyClient(options.valkeyUrl);

  const store = createMemoryDataStore();
  store.kind = "postgres";
  store.pgPool = pool;
  store.valkey = valkey;
  store.sessionStore = new ValkeySessionStore(valkey);
  store.objectStorage = objectStorage;
  if (documentProcessing) {
    store.documentProcessing = documentProcessing;
  }
  store.persistence = new PostgresPersistence(pool, store);
  await store.persistence.reload();

  if (options.seedIfEmpty && store.users.length === 0) {
    const seed = createMemoryDataStore();
    copyData(store, seed);
    store.kind = "postgres";
    store.pgPool = pool;
    store.valkey = valkey;
    store.sessionStore = new ValkeySessionStore(valkey);
    store.objectStorage = objectStorage;
    if (documentProcessing) {
      store.documentProcessing = documentProcessing;
    }
    const seedPersistence = new PostgresPersistence(pool, store);
    store.persistence = seedPersistence;
    await seedPersistence.flushInitialSeed();
    await store.persistence.reload();
  }

  return store;
}

export type PostgresEmsDocumentAccessTestPort = Pick<
  NonNullable<DataStore["persistence"]>,
  "classifyEmsEmployeeDocumentAccess"
>;

/** @internal Narrow constructor seam for deterministic persistence unit tests. */
export function createPostgresPersistenceForTesting(
  pool: Pool,
  store: DataStore,
): Required<PostgresEmsDocumentAccessTestPort> {
  return new PostgresPersistence(pool, store);
}

class PostgresPersistence {
  constructor(
    private readonly pool: Pool,
    private readonly store: DataStore,
  ) {}

  async flushInitialAssetSeed(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext('hrms_asset_command'))");
      const existing = await client.query<{ populated: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM assets.assets UNION ALL
          SELECT 1 FROM assets.asset_assignments UNION ALL
          SELECT 1 FROM assets.asset_state_events UNION ALL
          SELECT 1 FROM assets.asset_requests UNION ALL
          SELECT 1 FROM assets.asset_acknowledgements UNION ALL
          SELECT 1 FROM assets.asset_maintenance_records UNION ALL
          SELECT 1 FROM assets.software_vendors UNION ALL
          SELECT 1 FROM assets.software_products UNION ALL
          SELECT 1 FROM assets.asset_recovery_tickets UNION ALL
          SELECT 1 FROM assets.license_entitlements UNION ALL
          SELECT 1 FROM assets.license_activations UNION ALL
          SELECT 1 FROM assets.compromised_keys UNION ALL
          SELECT 1 FROM assets.asset_command_results
        ) AS populated`);
      if (existing.rows[0]?.populated) {
        throw new Error("Initial asset seed requires empty asset tables.");
      }
      await client.query("SELECT set_config('hrms.asset_writer_v2', 'on', true)");
      await this.flushAssets(client, this.store);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async dashboardExpenseReadContext(userId: UUID): Promise<{
    actor: AuthUser;
    companyId: UUID;
    store: DataStore;
    exactMetrics: DashboardExactMetrics;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const session = await this.resolveDurableSessionContext(
        client,
        userId,
        "dashboard.summary",
      );
      const actor = session.actor;
      const companyId = session.company.id;
      const exactMetrics = await this.loadDashboardExactMetrics(client, actor, companyId);
      const users = await this.loadUsers(client, companyId, undefined, 5000);
      const store: DataStore = {
        ...this.store,
        users,
        userSessionPreferences: await this.loadUserSessionPreferences(client, companyId),
        companyProfiles: [session.company],
        departments: await this.loadDepartments(client, companyId),
        tickets: [],
        notifications: [],
        outbox: [],
        attendancePunches: [],
        attendanceDayRecords: [],
      };
      await client.query("COMMIT");
      return { actor, companyId, store, exactMetrics };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async notificationListContext(input: {
    userId: UUID;
    page: number;
    pageSize: number;
    unreadOnly?: boolean;
    type?: string;
  }): Promise<{ actor: AuthUser; store: DataStore; total: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const session = await this.resolveDurableSessionContext(
        client,
        input.userId,
        "notifications.list",
      );
      const params: unknown[] = [
        input.userId,
        session.company.id,
        session.actor.roles.includes(Roles.Reviewer),
        session.actor.roles.includes(Roles.FinanceManager),
      ];
      const where = [
        "target_user_id=$1",
        this.notificationVisibilitySql(),
      ];
      if (input.unreadOnly) where.push("status='pending'");
      if (input.type) {
        params.push(input.type);
        where.push(`(event_type=$${params.length} OR ${this.notificationCategorySql()}=$${params.length})`);
      }
      const predicate = where.join(" AND ");
      const count = await client.query<{ total: string }>(
        `SELECT count(*) AS total FROM platform.notifications WHERE ${predicate}`,
        params,
      );
      params.push(input.pageSize, (input.page - 1) * input.pageSize);
      const rows = await client.query(
        `SELECT * FROM platform.notifications WHERE ${predicate}
         ORDER BY created_at DESC,id DESC
         LIMIT $${params.length - 1}::integer OFFSET $${params.length}::integer`,
        params,
      );
      const notifications = rows.rows.map((row) => this.mapNotificationRow(row));
      const actorUserIds = Array.from(new Set(notifications
        .map((notification) => notification.actor_user_id)
        .filter((id): id is UUID => Boolean(id))));
      const users = actorUserIds.length
        ? await this.loadUsers(client, session.company.id, actorUserIds)
        : [];
      await client.query("COMMIT");
      return {
        actor: session.actor,
        store: { ...this.store, notifications, users },
        total: Number(count.rows[0]?.total ?? 0),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async notificationUnreadCount(userId: UUID): Promise<{ unreadCount: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const session = await this.resolveDurableSessionContext(
        client,
        userId,
        "notifications.unread-count",
      );
      const unread = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM platform.notifications
         WHERE target_user_id=$1 AND status='pending'
           AND ${this.notificationVisibilitySql()}`,
        [
          userId,
          session.company.id,
          session.actor.roles.includes(Roles.Reviewer),
          session.actor.roles.includes(Roles.FinanceManager),
        ],
      );
      await client.query("COMMIT");
      return { unreadCount: Number(unread.rows[0]?.count ?? 0) };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async notificationMarkRead(input: {
    userId: UUID;
    notificationId: UUID;
    expectedVersion?: number;
  }): Promise<{ notification: NotificationRecord; unreadCount: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.lockNotificationActorAuthority(client, input.userId);
      const session = await this.resolveDurableSessionContext(
        client,
        input.userId,
        "notifications.mark-read",
      );
      const selected = await client.query(
        `SELECT * FROM platform.notifications
         WHERE target_user_id=$1 AND id=$5
           AND ${this.notificationVisibilitySql()}
         FOR UPDATE`,
        [
          input.userId,
          session.company.id,
          session.actor.roles.includes(Roles.Reviewer),
          session.actor.roles.includes(Roles.FinanceManager),
          input.notificationId,
        ],
      );
      const current = selected.rows[0];
      if (!current) throw notFound("Notification not found", { id: input.notificationId });
      await this.lockNotificationExpenseTickets(client, [input.notificationId]);
      if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
        throw conflict("Notification was modified by another actor.", {
          aggregate: "notification", id: input.notificationId,
        });
      }
      const revalidated = await this.resolveDurableSessionContext(
        client,
        input.userId,
        "notifications.mark-read",
      );
      const result = current.status === "pending"
        ? await client.query(
            `UPDATE platform.notifications
             SET status='sent', read_at=now(), version=version+1, updated_at=now()
             WHERE target_user_id=$1 AND id=$5 AND status='pending'
               AND ${this.notificationVisibilitySql()}
             RETURNING *`,
            [
              input.userId,
              revalidated.company.id,
              revalidated.actor.roles.includes(Roles.Reviewer),
              revalidated.actor.roles.includes(Roles.FinanceManager),
              input.notificationId,
            ],
          )
        : selected;
      const notification = result.rows[0];
      if (!notification) throw conflict("Notification changed during read acknowledgement");
      const unread = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM platform.notifications
         WHERE target_user_id=$1 AND status='pending'
           AND ${this.notificationVisibilitySql()}`,
        [
          input.userId,
          revalidated.company.id,
          revalidated.actor.roles.includes(Roles.Reviewer),
          revalidated.actor.roles.includes(Roles.FinanceManager),
        ],
      );
      await client.query("COMMIT");
      return {
        notification: this.mapNotificationRow(notification),
        unreadCount: Number(unread.rows[0]?.count ?? 0),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async notificationMarkAllRead(input: {
    userId: UUID;
    type?: string;
    before?: string;
  }): Promise<{ updatedCount: number; unreadCount: number; hasMore: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.lockNotificationActorAuthority(client, input.userId);
      const session = await this.resolveDurableSessionContext(
        client,
        input.userId,
        "notifications.mark-all-read",
      );
      const selected = await client.query<{ id: UUID }>(
        `SELECT id FROM platform.notifications
         WHERE target_user_id=$1 AND status='pending'
           AND ${this.notificationVisibilitySql()}
           AND ($5::text IS NULL OR event_type=$5 OR ${this.notificationCategorySql()}=$5)
           AND ($6::timestamptz IS NULL OR created_at <= $6::timestamptz)
         ORDER BY created_at, id
         LIMIT 1001 FOR UPDATE`,
        [
          input.userId,
          session.company.id,
          session.actor.roles.includes(Roles.Reviewer),
          session.actor.roles.includes(Roles.FinanceManager),
          input.type ?? null,
          input.before ?? null,
        ],
      );
      const hasMore = selected.rows.length > 1000;
      const ids = selected.rows.slice(0, 1000).map((row) => row.id);
      await this.lockNotificationExpenseTickets(client, ids);
      const revalidated = await this.resolveDurableSessionContext(
        client,
        input.userId,
        "notifications.mark-all-read",
      );
      const updated = ids.length
        ? await client.query(
            `UPDATE platform.notifications
             SET status='sent', read_at=now(), version=version+1, updated_at=now()
             WHERE target_user_id=$1 AND status='pending' AND id=ANY($5::uuid[])
               AND ${this.notificationVisibilitySql()}`,
            [
              input.userId,
              revalidated.company.id,
              revalidated.actor.roles.includes(Roles.Reviewer),
              revalidated.actor.roles.includes(Roles.FinanceManager),
              ids,
            ],
          )
        : { rowCount: 0 };
      const unread = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM platform.notifications
         WHERE target_user_id=$1 AND status='pending'
           AND ${this.notificationVisibilitySql()}`,
        [
          input.userId,
          revalidated.company.id,
          revalidated.actor.roles.includes(Roles.Reviewer),
          revalidated.actor.roles.includes(Roles.FinanceManager),
        ],
      );
      await client.query("COMMIT");
      return {
        updatedCount: updated.rowCount ?? 0,
        unreadCount: Number(unread.rows[0]?.count ?? 0),
        hasMore,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private notificationCategorySql(): string {
    return `CASE
      WHEN nullif(trim(payload->>'category'),'') IS NOT NULL THEN payload->>'category'
      WHEN event_type LIKE '%submitted%' OR event_type LIKE '%approval%' THEN 'approval'
      WHEN event_type LIKE '%mention%' THEN 'mention'
      WHEN event_type LIKE '%helpdesk%' OR event_type LIKE '%escalated%' THEN 'alert'
      ELSE 'system'
    END`;
  }

  private async lockNotificationActorAuthority(
    client: PoolClient,
    userId: UUID,
  ): Promise<void> {
    await client.query("SELECT id FROM core.users WHERE id=$1 FOR SHARE", [userId]);
    const preference = await client.query<{ company_id: UUID | null }>(
      `SELECT company_id FROM platform.user_session_preferences
       WHERE user_id=$1 FOR SHARE`,
      [userId],
    );
    await client.query(
      `SELECT ur.user_id FROM core.user_roles ur
       JOIN core.roles role ON role.role_key=ur.role_key
       WHERE ur.user_id=$1 ORDER BY ur.role_key FOR SHARE OF ur,role`,
      [userId],
    );
    if (preference.rows[0]?.company_id) {
      await client.query(
        "SELECT id FROM platform.company_profiles WHERE id=$1 FOR SHARE",
        [preference.rows[0].company_id],
      );
    }
  }

  private async lockNotificationExpenseTickets(
    client: PoolClient,
    notificationIds: readonly UUID[],
  ): Promise<void> {
    if (notificationIds.length === 0) return;
    await client.query(
      `SELECT ticket.id
       FROM expenses.expense_tickets ticket
       JOIN platform.notifications notification
         ON nullif(notification.payload->>'ticket_id','') ~
           '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        AND ticket.id=(notification.payload->>'ticket_id')::uuid
       WHERE notification.id=ANY($1::uuid[])
       ORDER BY ticket.id FOR SHARE OF ticket`,
      [notificationIds],
    );
  }

  private notificationVisibilitySql(): string {
    return `CASE
      WHEN payload ? 'ticket_id' THEN CASE
        WHEN nullif(payload->>'ticket_id','') ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        THEN EXISTS (
          SELECT 1 FROM expenses.expense_tickets notification_ticket
          WHERE notification_ticket.id=(payload->>'ticket_id')::uuid
            AND notification_ticket.deleted_at IS NULL
            AND notification_ticket.owner_resolution_status<>'quarantined'
            AND (
              notification_ticket.requester_user_id=$1::uuid
              OR (
                notification_ticket.company_id=$2::uuid
                AND (
                  ($3::boolean AND (
                    notification_ticket.manager_verifier_id=$1::uuid
                    OR notification_ticket.manager_backup_user_id=$1::uuid
                  ))
                  OR ($4::boolean AND notification_ticket.finance_approver_id=$1::uuid)
                )
              )
            )
        )
        ELSE FALSE
      END
      ELSE nullif(payload->>'company_id','')=$2::text
    END`;
  }

  async managerBackupListContext(input: {
    userId: UUID;
    page: number;
    pageSize: number;
  }): Promise<{
    actor: AuthUser;
    companyId: UUID;
    assignments: ManagerBackupAssignment[];
    total: number;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const session = await this.resolveDurableSessionContext(
        client,
        input.userId,
        "reviewer-routing.list",
      );
      if (!session.actor.roles.includes(Roles.Admin)) {
        throw forbidden("Current Admin authority is required to list reviewer routing");
      }
      const ownership = `mapping.deleted_at IS NULL
        AND mapping.company_id=$1
        AND mapping.owner_resolution_status IN ('typed_creation','audited_repair')`;
      const count = await client.query<{ total: string }>(
        `SELECT count(*) AS total
         FROM expenses.employee_reviewer_mappings mapping
         WHERE ${ownership}`,
        [session.company.id],
      );
      const rows = await client.query(
        `SELECT mapping.*
         FROM expenses.employee_reviewer_mappings mapping
         WHERE ${ownership}
         ORDER BY mapping.created_at DESC,mapping.id DESC
         LIMIT $2::integer OFFSET $3::integer`,
        [session.company.id, input.pageSize, (input.page - 1) * input.pageSize],
      );
      await client.query("COMMIT");
      return {
        actor: session.actor,
        companyId: session.company.id,
        assignments: rows.rows.map((row) => this.mapManagerBackupAssignment(row)),
        total: Number(count.rows[0]?.total ?? 0),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async managerBackupCommand(input: {
    userId: UUID;
    action: "reviewer-routing.create" | "reviewer-routing.revoke";
    idempotencyKey: string;
    requestHash: string;
    mappingId?: UUID;
    expectedVersion?: number;
    create?: {
      employeeUserId: UUID;
      backupManagerUserId: UUID;
      effectiveFrom: string;
      effectiveTo: string | null;
    };
  }): Promise<ManagerBackupAssignment> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const preliminarySession = await this.resolveDurableSessionContext(
        client,
        input.userId,
        input.action,
      );
      if (!preliminarySession.actor.roles.includes(Roles.Admin)) {
        throw forbidden("Current Admin authority is required to manage reviewer routing");
      }

      let requesterUserId = input.create?.employeeUserId;
      if (input.action === "reviewer-routing.create" && !requesterUserId) {
        throw badRequest("Reviewer routing requester is required");
      }
      if (input.action === "reviewer-routing.revoke" && !input.mappingId) {
        throw badRequest("Reviewer routing mapping id is required");
      }

      // Platform/full-store writers take governance before authority rows.
      // The preliminary Admin check is intentionally non-locking; take only
      // the subject-independent governance lock now, then lock and revalidate
      // current authority before any client-selected subject or mapping lock.
      await lockExpenseReviewerRoutingGovernance(client);

      await this.lockReviewerRoutingActorAuthority(client, input.userId);
      const session = await this.resolveDurableSessionContext(
        client,
        input.userId,
        input.action,
      );
      if (!session.actor.roles.includes(Roles.Admin)) {
        throw forbidden("Current Admin authority is required to manage reviewer routing");
      }

      if (input.action === "reviewer-routing.revoke") {
        const owned = await client.query<{ employee_user_id: UUID }>(
          `SELECT employee_user_id
           FROM expenses.employee_reviewer_mappings
           WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL
             AND owner_resolution_status IN ('typed_creation','audited_repair')`,
          [input.mappingId, session.company.id],
        );
        requesterUserId = owned.rows[0]?.employee_user_id;
        if (!requesterUserId) throw notFound("Manager backup assignment not found");
      }
      if (!requesterUserId) throw badRequest("Reviewer routing requester is required");
      await lockExpenseReviewerRoutingSubjects(client, [requesterUserId]);
      if (input.action === "reviewer-routing.revoke") {
        const locked = await client.query<{ employee_user_id: UUID }>(
          `SELECT employee_user_id
           FROM expenses.employee_reviewer_mappings
           WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL
             AND owner_resolution_status IN ('typed_creation','audited_repair')
           FOR UPDATE`,
          [input.mappingId, session.company.id],
        );
        if (!locked.rows[0]) throw notFound("Manager backup assignment not found");
        if (locked.rows[0].employee_user_id !== requesterUserId) {
          throw conflict("Reviewer routing changed during concurrent processing");
        }
      }

      let globalCreateReplay: {
        company_id: UUID;
        request_hash: string;
        response_body: ManagerBackupAssignment;
      } | undefined;
      if (input.action === "reviewer-routing.create") {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
          [`expense:${session.actor.id}:${input.action}:${input.idempotencyKey}`],
        );
        const globalPrior = await client.query<{
          company_id: UUID;
          request_hash: string;
          response_body: ManagerBackupAssignment;
        }>(
          `SELECT company_id,request_hash,response_body
           FROM expenses.expense_command_results
           WHERE actor_user_id=$1 AND action=$2 AND idempotency_key=$3
           ORDER BY created_at,id
           LIMIT 2
           FOR SHARE`,
          [session.actor.id, input.action, input.idempotencyKey],
        );
        if (globalPrior.rows.length > 1 ||
            (globalPrior.rows[0] && globalPrior.rows[0].company_id !== session.company.id)) {
          throw conflict("Idempotency key was already used for a different reviewer-routing command or company");
        }
        globalCreateReplay = globalPrior.rows[0];
        if (globalCreateReplay && globalCreateReplay.request_hash !== input.requestHash) {
          throw conflict("Idempotency key was already used for a different reviewer-routing command");
        }
      }

      // Durable replay is still an authorization decision. The global lookup
      // above binds the key to its original company, but validate the current
      // routing subject before returning any journal response so a transferred
      // requester or reviewer, or a reviewer whose authority was removed, cannot
      // receive a previously committed response from a stale tenant context.
      if (input.action === "reviewer-routing.create") {
        const create = input.create;
        if (!create) throw badRequest("Reviewer routing create payload is required");
        if (create.employeeUserId === create.backupManagerUserId) {
          throw badRequest("Manager backup assignment cannot be self-referential");
        }
        if (create.effectiveTo && create.effectiveTo < create.effectiveFrom) {
          throw badRequest("Manager backup effective date range is reversed");
        }
        const participantIds = [create.employeeUserId, create.backupManagerUserId].sort();
        const participants = await client.query<{
          id: UUID;
          employment_status: string;
          deleted_at: Date | null;
          company_id: UUID | null;
        }>(
          `SELECT u.id,u.employment_status,u.deleted_at,pref.company_id
           FROM core.users u
           JOIN platform.user_session_preferences pref ON pref.user_id=u.id
           WHERE u.id=ANY($1::uuid[])
           ORDER BY u.id FOR SHARE OF u,pref`,
          [participantIds],
        );
        if (participants.rows.length !== 2 || participants.rows.some(
          (participant) => participant.deleted_at ||
            participant.employment_status !== EmploymentStatuses.Active ||
            participant.company_id !== session.company.id,
        )) {
          throw badRequest("Reviewer routing participants must be active users of the Admin company");
        }
        const reviewerRole = await client.query(
          `SELECT ur.user_id FROM core.user_roles ur
           JOIN core.roles role ON role.role_key=ur.role_key
           WHERE ur.user_id=$1 AND ur.role_key=$2
             AND ur.status='active' AND ur.deleted_at IS NULL
             AND role.status='active' AND role.deleted_at IS NULL
             AND ur.effective_from<=CURRENT_DATE
             AND (ur.effective_to IS NULL OR ur.effective_to>=CURRENT_DATE)
           FOR SHARE OF ur,role`,
          [create.backupManagerUserId, Roles.Reviewer],
        );
        if (!reviewerRole.rows[0]) {
          throw badRequest("Backup manager must have current Reviewer authority");
        }
      } else {
        const currentOwnership = await client.query(
          `SELECT mapping.id FROM expenses.employee_reviewer_mappings mapping
           WHERE mapping.id=$1 AND mapping.deleted_at IS NULL
             AND mapping.company_id=$2
             AND mapping.owner_resolution_status IN ('typed_creation','audited_repair')
           FOR SHARE OF mapping`,
          [input.mappingId, session.company.id],
        );
        if (!currentOwnership.rows[0]) throw notFound("Manager backup assignment not found");
      }
      if (input.action !== "reviewer-routing.create") {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
          [`expense:${session.company.id}:${session.actor.id}:${input.action}:${input.idempotencyKey}`],
        );
      }
      const prior = globalCreateReplay
        ? { rows: [globalCreateReplay] }
        : await client.query<{ request_hash: string; response_body: ManagerBackupAssignment }>(
            `SELECT request_hash,response_body FROM expenses.expense_command_results
             WHERE company_id=$1 AND actor_user_id=$2 AND action=$3 AND idempotency_key=$4`,
            [session.company.id, session.actor.id, input.action, input.idempotencyKey],
          );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== input.requestHash) {
          throw conflict("Idempotency key was already used for a different reviewer-routing command");
        }
        await client.query("COMMIT");
        return prior.rows[0].response_body;
      }

      let changed: ManagerBackupAssignment;
      if (input.action === "reviewer-routing.create") {
        const create = input.create;
        if (!create) throw badRequest("Reviewer routing create payload is required");
        if (create.employeeUserId === create.backupManagerUserId) {
          throw badRequest("Manager backup assignment cannot be self-referential");
        }
        if (create.effectiveTo && create.effectiveTo < create.effectiveFrom) {
          throw badRequest("Manager backup effective date range is reversed");
        }
        const participantIds = [create.employeeUserId, create.backupManagerUserId].sort();
        const participants = await client.query<{
          id: UUID;
          employment_status: string;
          deleted_at: Date | null;
          company_id: UUID | null;
        }>(
          `SELECT u.id,u.employment_status,u.deleted_at,pref.company_id
           FROM core.users u
           JOIN platform.user_session_preferences pref ON pref.user_id=u.id
           WHERE u.id=ANY($1::uuid[])
           ORDER BY u.id FOR SHARE OF u,pref`,
          [participantIds],
        );
        if (participants.rows.length !== 2 || participants.rows.some(
          (participant) => participant.deleted_at ||
            participant.employment_status !== EmploymentStatuses.Active ||
            participant.company_id !== session.company.id,
        )) {
          throw badRequest("Reviewer routing participants must be active users of the Admin company");
        }
        const reviewerRole = await client.query(
          `SELECT ur.user_id FROM core.user_roles ur
           JOIN core.roles role ON role.role_key=ur.role_key
           WHERE ur.user_id=$1 AND ur.role_key=$2
             AND ur.status='active' AND ur.deleted_at IS NULL
             AND role.status='active' AND role.deleted_at IS NULL
             AND ur.effective_from<=CURRENT_DATE
             AND (ur.effective_to IS NULL OR ur.effective_to>=CURRENT_DATE)
           FOR SHARE OF ur,role`,
          [create.backupManagerUserId, Roles.Reviewer],
        );
        if (!reviewerRole.rows[0]) {
          throw badRequest("Backup manager must have current Reviewer authority");
        }
        const overlap = await client.query(
          `SELECT id FROM expenses.employee_reviewer_mappings
           WHERE company_id=$1 AND employee_user_id=$2
             AND owner_resolution_status IN ('typed_creation','audited_repair')
             AND status='active' AND deleted_at IS NULL
             AND daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') &&
                 daterange($3::date,COALESCE($4::date,'infinity'::date),'[]')
           FOR UPDATE`,
          [session.company.id, create.employeeUserId, create.effectiveFrom, create.effectiveTo],
        );
        if (overlap.rows[0]) {
          throw conflict("An active manager backup already overlaps this effective period");
        }
        await client.query("SELECT set_config('app.expense_command_v1','on',true)");
        const inserted = await client.query(
          `INSERT INTO expenses.employee_reviewer_mappings
            (company_id,owner_resolution_status,owner_resolution_reason,
             employee_user_id,reviewer_user_id,assigned_by_user_id,effective_from,effective_to,status)
           VALUES ($1,'typed_creation',NULL,$2,$3,$4,$5,$6,'active') RETURNING *`,
          [session.company.id, create.employeeUserId, create.backupManagerUserId, session.actor.id,
            create.effectiveFrom, create.effectiveTo],
        );
        changed = this.mapManagerBackupAssignment(inserted.rows[0]);
      } else {
        if (!input.mappingId || input.expectedVersion === undefined) {
          throw badRequest("Reviewer routing revoke requires mapping id and expected_version");
        }
        const selected = await client.query(
          `SELECT mapping.* FROM expenses.employee_reviewer_mappings mapping
           WHERE mapping.id=$1 AND mapping.deleted_at IS NULL
             AND mapping.company_id=$2
             AND mapping.owner_resolution_status IN ('typed_creation','audited_repair')
           FOR UPDATE OF mapping`,
          [input.mappingId, session.company.id],
        );
        const current = selected.rows[0];
        if (!current) throw notFound("Manager backup assignment not found");
        if (current.employee_user_id !== requesterUserId) {
          throw conflict("Reviewer routing changed during concurrent processing");
        }
        if (current.status !== "active") throw conflict("Manager backup assignment is not active");
        if (current.version !== input.expectedVersion) {
          throw conflict("Manager backup assignment was modified by another actor", {
            id: input.mappingId,
          });
        }
        await client.query("SELECT set_config('app.expense_command_v1','on',true)");
        const updated = await client.query(
          `UPDATE expenses.employee_reviewer_mappings
           SET status='revoked',version=version+1,updated_at=now()
           WHERE id=$1 AND version=$2 AND company_id=$3 RETURNING *`,
          [input.mappingId, input.expectedVersion, session.company.id],
        );
        if (!updated.rows[0]) throw conflict("Manager backup assignment changed concurrently");
        changed = this.mapManagerBackupAssignment(updated.rows[0]);
      }

      const eventType = input.action === "reviewer-routing.create"
        ? "expense.reviewer_routing.created"
        : "expense.reviewer_routing.revoked";
      await client.query(
        `INSERT INTO platform.outbox_events
          (event_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key,status,
           retry_count,available_at,created_at)
         VALUES (gen_random_uuid(),'employee_reviewer_mapping',$1,$2,$3::jsonb,$4,'pending',0,now(),now())`,
        [changed.id, eventType, JSON.stringify({
          company_id: session.company.id,
          mapping_id: changed.id,
          employee_user_id: changed.employee_user_id,
          reviewer_user_id: changed.backup_manager_user_id,
          actor_user_id: session.actor.id,
          version: changed.version,
        }), [
          "reviewer-routing",
          session.company.id,
          session.actor.id,
          changed.id,
          input.action,
          input.idempotencyKey,
        ].join(":")],
      );
      await client.query(
        `INSERT INTO expenses.expense_command_results
          (company_id,actor_user_id,ticket_id,resource_id,action,idempotency_key,request_hash,response_body)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,$7::jsonb)`,
        [session.company.id, session.actor.id, changed.id, input.action,
          input.idempotencyKey, input.requestHash, JSON.stringify(changed)],
      );
      await client.query("COMMIT");
      return changed;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        typeof error === "object" && error !== null && "code" in error &&
        (error.code === "40001" || error.code === "40P01")
      ) {
        throw conflict("Reviewer routing changed during concurrent processing; refresh and retry");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async reportExportReadStore(scope: { companyId?: UUID; exportId?: UUID }): Promise<DataStore> {
    const client = await this.pool.connect();
    try {
      if (!scope.companyId && !scope.exportId) return { ...this.store, outbox: [] };
      const { rows } = scope.exportId
        ? await client.query(
            `SELECT * FROM platform.outbox_events WHERE event_type = 'reports.export.requested'
             AND (aggregate_id = $1 OR event_id = $1)`,
            [scope.exportId],
          )
        : await client.query(
            `SELECT * FROM platform.outbox_events WHERE event_type = 'reports.export.requested'
             AND payload->>'company_id' = $1 ORDER BY id`,
            [scope.companyId],
          );
      return { ...this.store, outbox: rows.map((row) => this.mapOutboxRow(row)) };
    } finally {
      client.release();
    }
  }

  async assetReadStore(baseStore: DataStore = this.store): Promise<DataStore> {
    const client = await this.pool.connect();
    try {
      // Every asset collection in this request must come from one committed
      // snapshot. A concurrent command may commit between individual SELECTs.
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const snapshot = await this.loadAssetSnapshot(client, baseStore);
      await client.query("COMMIT");
      return snapshot;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async assetPublicScan(qrHash: string): Promise<PublicAssetScan | null> {
    const result = await this.pool.query<{
      qr_hash: string;
      asset_code: string;
      asset_type: string;
      name: string;
      status: string;
      current_assigned_user_id: UUID | null;
    }>(
      `SELECT qr_hash, asset_code, asset_type, name, status, current_assigned_user_id
         FROM assets.assets
        WHERE qr_hash = $1
          AND deleted_at IS NULL
        LIMIT 1`,
      [qrHash],
    );
    const asset = result.rows[0];
    if (!asset) return null;
    return {
      qr_hash: asset.qr_hash,
      asset_code: asset.asset_code,
      asset_type: asset.asset_type,
      name: asset.name,
      status: asset.status,
      assigned: asset.current_assigned_user_id ? "assigned" : "unassigned",
    };
  }

  async assetAssignees(actorUserId: UUID, companyId: UUID, search = ""): Promise<{ items: Array<{ id: UUID; full_name: string }>; has_more: boolean }> {
    const client = await this.pool.connect();
    const literalSearch = search.replace(/[\\%_]/gu, (character) => `\\${character}`);
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const actor = await this.loadCurrentAssetActor(client, { actorUserId, companyId, actionKey: "assets.assignees" });
      if (!actor.roles.includes(Roles.AssetManager) && !actor.roles.includes(Roles.Admin)) {
        throw forbidden("Asset Manager role required");
      }
      const rows = await client.query<{ id: UUID; full_name: string }>(
        `SELECT u.id, u.full_name FROM core.users u
         JOIN platform.user_session_preferences p ON p.user_id = u.id
         WHERE p.company_id = $1 AND u.deleted_at IS NULL AND u.employment_status = 'active'
           AND ($2 = '' OR u.full_name ILIKE '%' || $2 || '%' ESCAPE '\\')
         ORDER BY u.full_name, u.id LIMIT 51`, [companyId, literalSearch],
      );
      await client.query("COMMIT");
      return { items: rows.rows.slice(0, 50), has_more: rows.rows.length > 50 };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async assetCommand<T>(
    input: AssetCommandInput,
    authorize: (store: DataStore, actor: AuthUser, replayBody?: T) => void,
    execute: (store: DataStore, actor: AuthUser) => T,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext('hrms_asset_command'))",
      );
      // The migration fence checks a transaction-local marker. No pooled
      // connection can carry this authority into a later request.
      await client.query("SELECT set_config('hrms.asset_writer_v2', 'on', true)");
      const actor = await this.loadCurrentAssetActor(client, input);
      const before = await this.loadAssetSnapshot(client);

      const previous = await client.query<{
        request_hash: string;
        response_body: T;
      }>(
        `SELECT request_hash, response_body
         FROM assets.asset_command_results
         WHERE company_id = $1 AND actor_user_id = $2
           AND action_key = $3 AND idempotency_key = $4`,
        [input.companyId, input.actorUserId, input.actionKey, input.idempotencyKey],
      );
      // Authorize against current SQL actor state and resource visibility
      // before either replaying or revealing a key/hash conflict.
      authorize(before, actor, previous.rows[0]?.response_body);
      if (previous.rows[0]) {
        if (previous.rows[0].request_hash !== input.requestHash) {
          throw conflict("Idempotency-Key was already used for a different asset command.");
        }
        await client.query("COMMIT");
        return previous.rows[0].response_body;
      }

      // A committed assignment remains replayable if its assignee later
      // leaves. Eligibility is a transition precondition, not replay policy.
      if (input.assigneeUserId) {
        const target = await client.query(
          `SELECT 1 FROM core.users u
           JOIN platform.user_session_preferences p ON p.user_id = u.id
           WHERE u.id = $1 AND p.company_id = $2
             AND u.deleted_at IS NULL AND u.employment_status = 'active'
           FOR SHARE OF u, p`,
          [input.assigneeUserId, input.companyId],
        );
        if (target.rowCount !== 1) throw forbidden("Assignee is not an active employee in the actor's company.");
      }

      const staged = assetMutationStore(before, actor);
      const result = execute(staged, actor);
      const changed = assetDeltaStore(before, staged);
      await this.flushAssets(client, changed);
      await this.flushOutbox(client, undefined, staged);
      const replayBody = JSON.parse(JSON.stringify(result)) as T;
      await client.query(
        `INSERT INTO assets.asset_command_results (
           company_id, actor_user_id, action_key, idempotency_key,
           request_hash, response_status, response_body
         ) VALUES ($1, $2, $3, $4, $5, 200, $6::jsonb)`,
        [
          input.companyId,
          input.actorUserId,
          input.actionKey,
          input.idempotencyKey,
          input.requestHash,
          JSON.stringify(replayBody),
        ],
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (isSqlLockTimeout(error)) {
        throw conflict("Asset command is busy; retry with the same Idempotency-Key.");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async loadCurrentAssetActor(client: PoolClient, input: Pick<AssetCommandInput, "actorUserId" | "companyId" | "actionKey">): Promise<AuthUser> {
    const cached = this.store.users.find((user) => user.id === input.actorUserId);
    if (!cached) throw unauthorized("User no longer exists");
    const actorRows = await client.query<{
      employment_status: AuthUser["employment_status"];
      deleted_at: Date | null;
      roles: RoleKey[];
    }>(
      `SELECT u.employment_status, u.deleted_at,
              COALESCE(array_agg(DISTINCT ur.role_key) FILTER (
                WHERE ur.role_key IS NOT NULL AND ur.status = 'active' AND ur.deleted_at IS NULL
                  AND ur.effective_from <= current_date
                  AND (ur.effective_to IS NULL OR ur.effective_to >= current_date)
                  AND r.status = 'active' AND r.deleted_at IS NULL
              ), '{}') AS roles
       FROM core.users u
       LEFT JOIN core.user_roles ur ON ur.user_id = u.id
       LEFT JOIN core.roles r ON r.role_key = ur.role_key
       WHERE u.id = $1 GROUP BY u.id`,
      [input.actorUserId],
    );
    const current = actorRows.rows[0];
    if (!current || current.deleted_at || current.employment_status !== EmploymentStatuses.Active) {
      throw unauthorized("User account is inactive or blocked");
    }
    const preference = await client.query<{ company_id: UUID | null; active_role: RoleKey }>(
      "SELECT company_id, active_role FROM platform.user_session_preferences WHERE user_id = $1",
      [input.actorUserId],
    );
    if (preference.rows[0]?.company_id !== input.companyId) {
      throw companyContextRequired({ user_id: input.actorUserId, operation: input.actionKey });
    }
    if (!current.roles.includes(preference.rows[0].active_role)) {
      throw forbidden("Selected role is not assigned to this user.");
    }
    const company = await client.query<{ status: string }>(
      "SELECT status FROM platform.company_profiles WHERE id = $1",
      [input.companyId],
    );
    if (company.rows[0]?.status !== "active") {
      throw companyContextRequired({ user_id: input.actorUserId, company_id: input.companyId, operation: input.actionKey });
    }
    return { ...cached, roles: current.roles, employment_status: current.employment_status };
  }

  private async loadAssetSnapshot(client: PoolClient, baseStore: DataStore = this.store): Promise<DataStore> {
    return {
      ...baseStore,
      assets: await this.loadAssets(client),
      assetAssignments: await this.loadAssetAssignments(client),
      assetStateEvents: await this.loadAssetStateEvents(client),
      assetRequests: await this.loadAssetRequests(client),
      assetAcknowledgements: await this.loadAssetAcknowledgements(client),
      assetMaintenanceRecords: await this.loadAssetMaintenanceRecords(client),
      assetVendors: await this.loadAssetVendors(client),
      assetRecoveryTickets: await this.loadAssetRecoveryTickets(client),
      licenseEntitlements: await this.loadLicenseEntitlements(client),
      licenseActivations: await this.loadLicenseActivations(client),
      compromisedKeys: await this.loadCompromisedKeys(client),
    };
  }

  private async holidayCompanyForActor(client: PoolClient, actorUserId: UUID, forWrite: boolean): Promise<UUID> {
    const lock = forWrite ? " FOR SHARE" : "";
    const user = await client.query<{ employment_status: string; deleted_at: Date | null }>(
      `SELECT employment_status, deleted_at FROM core.users WHERE id = $1${lock}`,
      [actorUserId],
    );
    if (!user.rows[0] || user.rows[0].deleted_at || user.rows[0].employment_status !== EmploymentStatuses.Active) {
      throw unauthorized("User account is inactive or blocked");
    }
    const preference = await client.query<{ company_id: UUID | null; active_role: RoleKey }>(
      `SELECT company_id, active_role FROM platform.user_session_preferences WHERE user_id = $1${lock}`,
      [actorUserId],
    );
    const assignment = preference.rows[0];
    if (!assignment?.company_id) {
      throw companyContextRequired({ user_id: actorUserId, operation: forWrite ? "holidays.upsert" : "holidays.list" });
    }
    const roles = await client.query<{ role_key: RoleKey }>(
      `SELECT ur.role_key FROM core.user_roles ur
       JOIN core.roles role ON role.role_key = ur.role_key
       WHERE ur.user_id = $1 AND ur.status = 'active' AND ur.deleted_at IS NULL
         AND ur.effective_from <= CURRENT_DATE AND (ur.effective_to IS NULL OR ur.effective_to >= CURRENT_DATE)
         AND role.status = 'active' AND role.deleted_at IS NULL${forWrite ? " FOR SHARE OF ur, role" : ""}`,
      [actorUserId],
    );
    const assignedRoles = new Set(roles.rows.map((row) => row.role_key));
    if (!assignedRoles.has(assignment.active_role)) {
      throw forbidden("Selected role is not assigned to this user.");
    }
    const company = await client.query<{ status: string }>(
      `SELECT status FROM platform.company_profiles WHERE id = $1${lock}`,
      [assignment.company_id],
    );
    if (company.rows[0]?.status !== "active") {
      throw companyContextRequired({ user_id: actorUserId, company_id: assignment.company_id, operation: forWrite ? "holidays.upsert" : "holidays.list" });
    }
    if (forWrite && !assignedRoles.has(Roles.Admin) && !assignedRoles.has(Roles.HRManager)) {
      throw forbidden("Only HR Manager or Admin users can create or update holidays.");
    }
    return assignment.company_id;
  }

  async holidaysForActor(actorUserId: UUID, year: number): Promise<Holiday[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const companyId = await this.holidayCompanyForActor(client, actorUserId, false);
      const holidays = await this.loadHolidays(client, { companyId, year });
      await client.query("COMMIT");
      return holidays;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertHoliday(actorUserId: UUID, id: UUID, input: HolidayUpsertInput): Promise<Holiday> {
    const client = await this.pool.connect();
    let saved: Holiday;
    try {
      await client.query("BEGIN");
      const companyId = await this.holidayCompanyForActor(client, actorUserId, true);
      // Serialize the name/date uniqueness check and update for one company.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [companyId]);
      const existing = await client.query<Record<string, unknown> & { company_id: UUID | null; version: number; deleted_at: Date | null; name: string; region: string; optional: boolean }>(
        "SELECT * FROM leave_wfh.holidays WHERE id = $1 FOR UPDATE",
        [id],
      );
      const row = existing.rows[0];
      if (row && (row.company_id !== companyId || row.deleted_at)) {
        throw notFound("Holiday not found");
      }
      if (!row && input.expected_version !== undefined) {
        throw notFound("Holiday not found");
      }
      const name = input.name.trim();
      const region = input.region.trim();
      const unchanged = row && row.name === name && asDate(row.holiday_date) === input.date &&
        row.region === region && row.optional === input.optional;
      if (unchanged) {
        // A lost response can be retried with the same UUID and body. Return
        // the committed result without changing its version or event stream.
        saved = mapHolidayRow(row);
      } else {
        if (row && input.expected_version === undefined) {
          throw conflict("expected_version is required to change an existing holiday.", { aggregate: "holiday", id });
        }
        if (row && row.version !== input.expected_version) {
          throw conflict("Holiday was modified by another actor.", { aggregate: "holiday", id });
        }
        const duplicate = await client.query<{ id: UUID }>(
          `SELECT id FROM leave_wfh.holidays
           WHERE company_id = $1 AND region = $2 AND holiday_date = $3::date
             AND lower(name) = lower($4) AND deleted_at IS NULL AND id <> $5 LIMIT 1`,
          [companyId, region, input.date, name, id],
        );
        if (duplicate.rows[0]) {
          throw conflict("Holiday with the same name, date, and region already exists.", { holiday_id: duplicate.rows[0].id });
        }
        const changed = row
          ? await client.query(
              `UPDATE leave_wfh.holidays SET name = $3, holiday_date = $4::date, region = $5,
                 optional = $6, version = version + 1, updated_at = now()
               WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL RETURNING *`,
              [id, companyId, name, input.date, region, input.optional],
            )
          : await client.query(
              `INSERT INTO leave_wfh.holidays (id, company_id, name, holiday_date, region, optional, version)
               VALUES ($1, $2, $3, $4::date, $5, $6, 1) RETURNING *`,
              [id, companyId, name, input.date, region, input.optional],
            );
        if (!changed.rows[0]) throw notFound("Holiday not found");
        saved = mapHolidayRow(changed.rows[0]);
        await client.query(
          `INSERT INTO platform.outbox_events (event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
           VALUES ($1, 'holiday', $2, 'holiday.upserted', $3::jsonb, $4)`,
          [randomUUID(), id, JSON.stringify({ holiday_id: id, actor_user_id: actorUserId, company_id: companyId, date: saved.holiday_date, region: saved.region }), `holiday.upserted:${id}:${saved.version}`],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if ((error as { code?: string }).code === "23505") {
        // A uniqueness conflict can come from the holiday row or its outbox
        // idempotency key. The entire transaction has rolled back either way.
        throw conflict("Holiday update conflicted with an existing record or event.");
      }
      throw error;
    } finally {
      client.release();
    }
    // Never mutate the shared process snapshot before SQL and outbox commit.
    // Other instances use the request-local SQL holiday read; their older
    // snapshots cannot replace this version through the guarded legacy flush.
    const index = this.store.holidays.findIndex((holiday) => holiday.id === id);
    if (index < 0) this.store.holidays.push(saved);
    else if (this.store.holidays[index]!.company_id === saved.company_id && this.store.holidays[index]!.version <= saved.version) {
      this.store.holidays[index] = saved;
    }
    return saved;
  }

  async attendanceReadStore(scope: { companyId: UUID; employeeUserIds?: UUID[]; includePendingOutbox?: boolean; includeReportEvidence?: boolean }): Promise<DataStore> {
    const client = await this.pool.connect();
    try {
      // Request-local data prevents an external Worker commit from being hidden
      // by this API process's hydrated startup snapshot. Never mutate the
      // shared store (or reload another request's unflushed changes).
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const reportStore: DataStore = {
        ...this.store,
        attendancePunches: await this.loadAttendancePunches(client, scope),
        attendanceDayRecords: await this.loadAttendanceDayRecords(client, scope),
        attendanceRegularizations: scope.includeReportEvidence
          ? await this.loadAttendanceRegularizations(client, scope.companyId)
          : this.store.attendanceRegularizations,
        attendanceGeoFallbackReviews: scope.includeReportEvidence
          ? await this.loadAttendanceGeoFallbackReviews(client, scope.companyId)
          : this.store.attendanceGeoFallbackReviews,
        outbox: scope.includeReportEvidence
          ? await this.loadOutbox(client, "all", scope.companyId)
          : scope.includePendingOutbox
            ? await this.loadOutbox(client, "pending", scope.companyId)
            : this.store.outbox,
      };
      if (scope.includeReportEvidence) {
        (reportStore as DataStore & { attendanceMobileEvidenceWarnings: Record<string, unknown>[] }).attendanceMobileEvidenceWarnings =
          (await client.query("SELECT *, work_date::text AS work_date FROM attendance.mobile_evidence_warnings WHERE company_id = $1 ORDER BY server_received_at, id", [scope.companyId])).rows;
      }
      await client.query("COMMIT");
      return reportStore;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async attendanceReportReadContext(userId: UUID): Promise<{ actor: AuthUser; companyId: UUID; store: DataStore }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const { actor, companyId } = await this.loadReportActorContext(client, userId, "reports.attendance.summary");
      const scope = { companyId };
      const attendanceDayRecords = await this.loadAttendanceDayRecords(client, scope);
      const employeeUserIds = [...new Set(attendanceDayRecords.map((record) => record.employee_user_id))];
      const store: DataStore = {
        ...this.store,
        attendancePunches: await this.loadAttendancePunches(client, scope),
        attendanceDayRecords,
        attendanceRegularizations: await this.loadAttendanceRegularizations(client, companyId),
        attendanceGeoFallbackReviews: await this.loadAttendanceGeoFallbackReviews(client, companyId),
        outbox: await this.loadOutbox(client, "all", companyId),
        users: await this.loadUsers(client, companyId, employeeUserIds),
        userSessionPreferences: await this.loadUserSessionPreferences(client, companyId, employeeUserIds),
        departments: await this.loadDepartments(client, companyId),
      };
      (store as DataStore & { attendanceMobileEvidenceWarnings: Record<string, unknown>[] }).attendanceMobileEvidenceWarnings =
        (await client.query("SELECT *, work_date::text AS work_date FROM attendance.mobile_evidence_warnings WHERE company_id = $1 ORDER BY server_received_at, id", [companyId])).rows;
      await client.query("COMMIT");
      return { actor, companyId, store };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async reportExportReadContext(userId: UUID, exportId?: UUID): Promise<{ actor: AuthUser; companyId: UUID; store: DataStore }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const { actor, companyId } = await this.loadReportActorContext(client, userId, "reports.exports.read");
      const { rows } = exportId
        ? await client.query(
            `SELECT * FROM platform.outbox_events WHERE event_type = 'reports.export.requested'
             AND payload->>'company_id' = $1 AND (aggregate_id = $2 OR event_id = $2)`,
            [companyId, exportId],
          )
        : await client.query(
            `SELECT * FROM platform.outbox_events WHERE event_type = 'reports.export.requested'
             AND payload->>'company_id' = $1 ORDER BY id`,
            [companyId],
          );
      await client.query("COMMIT");
      return { actor, companyId, store: { ...this.store, outbox: rows.map((row) => this.mapOutboxRow(row)) } };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async auditReportReadContext(userId: UUID): Promise<{ actor: AuthUser; companyId: UUID; store: DataStore }> {
    const client = await this.pool.connect();
    try {
      // One consistent, request-local snapshot. Never reload the shared store:
      // another request may have unflushed mutations in progress.
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const { actor, companyId } = await this.loadReportActorContext(client, userId, "reports.audit");
      const tickets = await this.loadTickets(client, companyId);
      const ticketIds = tickets.map((ticket) => ticket.id);
      const auditLogs = await this.loadAuditLogs(client, undefined, ticketIds);
      const expenseApprovals = await this.loadExpenseApprovals(client, ticketIds);
      const expenseDocuments = await this.loadExpenseDocuments(client, ticketIds);
      const payments = await this.loadPayments(client, ticketIds);
      const outbox = await this.loadOutbox(client, "all", companyId);
      const users = await this.loadUsers(client, companyId);
      const userSessionPreferences = await this.loadUserSessionPreferences(client, companyId);
      const departments = await this.loadDepartments(client, companyId);
      await client.query("COMMIT");
      return { actor, companyId, store: { ...this.store, tickets, auditLogs, expenseApprovals, expenseDocuments, payments, outbox, users, userSessionPreferences, departments } };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async reportActorContext(userId: UUID, operation: string): Promise<{ actor: AuthUser; companyId: UUID }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const context = await this.loadReportActorContext(client, userId, operation);
      await client.query("COMMIT");
      return context;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async loadReportActorContext(client: PoolClient, userId: UUID, operation: string): Promise<{ actor: AuthUser; companyId: UUID }> {
      const actorRow = await client.query<{
        id: UUID;
        employee_code: string;
        email: string;
        full_name: string;
        department_id: UUID | null;
        designation_id: UUID | null;
        hierarchy_path: string;
        employment_status: AuthUser["employment_status"];
        email_verified_at: Date | null;
        email_verification_status: AuthUser["email_verification_status"];
        deleted_at: Date | null;
        roles: RoleKey[];
      }>(
        `SELECT u.id, u.employee_code, u.email, u.full_name, u.department_id,
                u.designation_id, u.hierarchy_path::text AS hierarchy_path,
                u.employment_status, u.email_verified_at, u.email_verification_status,
                u.deleted_at,
                COALESCE(array_agg(DISTINCT ur.role_key) FILTER (
                  WHERE ur.role_key IS NOT NULL AND ur.status = 'active'
                    AND ur.deleted_at IS NULL AND role.status = 'active'
                    AND role.deleted_at IS NULL
                    AND ur.effective_from <= CURRENT_DATE
                    AND (ur.effective_to IS NULL OR ur.effective_to >= CURRENT_DATE)
                ), '{}') AS roles
         FROM core.users u
         LEFT JOIN core.user_roles ur ON ur.user_id = u.id
         LEFT JOIN core.roles role ON role.role_key = ur.role_key
         WHERE u.id = $1 GROUP BY u.id`,
        [userId],
      );
      const current = actorRow.rows[0];
      if (!current || current.deleted_at) throw unauthorized("User no longer exists");
      if (current.employment_status !== EmploymentStatuses.Active) {
        throw unauthorized("User account is inactive or blocked");
      }
      const actor: AuthUser = {
        id: current.id,
        employee_code: current.employee_code,
        email: current.email,
        full_name: current.full_name,
        department_id: current.department_id as UUID,
        designation_id: current.designation_id as UUID,
        hierarchy_path: current.hierarchy_path,
        employment_status: current.employment_status,
        roles: current.roles,
        email_verified_at: asIsoOrNull(current.email_verified_at),
        email_verification_status: current.email_verification_status ?? "unverified",
      };
      const preference = await client.query<{ company_id: UUID | null; active_role: RoleKey }>(
        "SELECT company_id, active_role FROM platform.user_session_preferences WHERE user_id = $1",
        [userId],
      );
      const assignment = preference.rows[0];
      if (!assignment?.company_id) throw companyContextRequired({ user_id: userId, operation });
      if (!actor.roles.includes(assignment.active_role)) {
        throw forbidden("Selected role is not assigned to this user.");
      }
      const company = await client.query<{ status: string }>(
        "SELECT status FROM platform.company_profiles WHERE id = $1",
        [assignment.company_id],
      );
      if (company.rows[0]?.status !== "active") {
        throw companyContextRequired({ user_id: userId, company_id: assignment.company_id, operation });
      }
      return { actor, companyId: assignment.company_id };
  }

  async expenseReportReadContext(userId: UUID, options?: {
    audience?: ExpenseReportAudience;
    filters?: {
      status?: string; expense_type?: string; expense_sub_type?: string;
      payment_type?: string; department_id?: UUID; requester_user_id?: UUID;
      manager_user_id?: UUID; finance_user_id?: UUID;
      date_from?: string; date_to?: string;
      document_status?: "any" | "complete" | "missing" | "pending" | "not_required";
    };
  }): Promise<{ actor: AuthUser; companyId: UUID; store: DataStore }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const { actor, companyId } = await this.resolveExpenseActor(client, userId);
      const audience = options?.audience ?? "company";
      assertExpenseReportAudienceRole(actor, audience);
      const filters = options?.filters;
      for (const [name, value] of [["date_from", filters?.date_from], ["date_to", filters?.date_to]] as const) {
        if (value) {
          const [valueYear, valueMonth, valueDay] = value.split("-").map(Number);
          const normalized = new Date(Date.UTC(valueYear!, valueMonth! - 1, valueDay!));
          if (Number.isNaN(normalized.getTime()) || normalized.toISOString().slice(0, 10) !== value) {
            throw badRequest(`Expense report ${name} must be a valid calendar date`);
          }
        }
      }
      if (filters?.date_from && filters?.date_to) {
        if (filters.date_from > filters.date_to) {
          throw badRequest("Expense report date range is reversed");
        }
        const [year, month, day] = filters.date_from.split("-").map(Number);
        const maximumYear = year! + 1;
        const maximumDay = Math.min(
          day!,
          new Date(Date.UTC(maximumYear, month!, 0)).getUTCDate(),
        );
        const maximum = `${maximumYear.toString().padStart(4, "0")}-${month!
          .toString()
          .padStart(2, "0")}-${maximumDay.toString().padStart(2, "0")}`;
        if (filters.date_to > maximum) {
          throw badRequest("Expense report date range cannot exceed 12 months");
        }
      }
      const params: unknown[] = [companyId, userId];
      const bind = (value: unknown): string => {
        params.push(value);
        return `$${params.length}`;
      };
      const where = [
        "ticket.deleted_at IS NULL",
        "ticket.company_id IS NOT NULL",
        "ticket.owner_resolution_status<>'quarantined'",
        "$1::uuid IS NOT NULL",
        "$2::uuid IS NOT NULL",
        audience === "requester"
          ? "ticket.requester_user_id=$2::uuid"
          : "ticket.company_id=$1::uuid",
      ];
      const seesWholeCompany = actor.roles.includes(Roles.Admin) || actor.roles.includes(Roles.Auditor);
      if (audience === "manager_queue") {
        where.push("ticket.status='Pending Manager Verification'");
        if (!actor.roles.includes(Roles.Admin)) {
          where.push("(ticket.manager_verifier_id=$2::uuid OR ticket.manager_backup_user_id=$2::uuid)");
        }
      }
      if (audience === "manager_history") {
        where.push(`EXISTS (
          SELECT 1 FROM expenses.expense_approvals approval
          WHERE approval.ticket_id=ticket.id
            AND approval.approval_stage='manager'
            ${actor.roles.includes(Roles.Admin) ? "" : "AND approval.approver_user_id=$2::uuid"}
        )`);
      }
      if ((audience === "finance_assigned" || audience === "payment_register") && !seesWholeCompany) {
        where.push(`(
          ticket.finance_approver_id=$2::uuid
          OR ticket.route_snapshot->>'finance_approver_id'=$2::text
        )`);
      }
      if (audience === "finance_history") {
        where.push(`EXISTS (
          SELECT 1 FROM expenses.expense_audit_logs audit
          WHERE audit.ticket_id=ticket.id
            ${seesWholeCompany ? "" : "AND audit.actor_user_id=$2::uuid"}
            AND (audit.event_type LIKE 'expense.finance.%'
              OR audit.event_type IN ('expense.payment_released','expense.settlement'))
        )`);
      }
      if (audience === "advance_aging") {
        where.push("ticket.payment_type='Advance'");
        where.push("ticket.status IN ('Payment Released','Bills Submitted','Pending Adjustment')");
      }
      if (audience === "payment_register") {
        where.push(`EXISTS (
          SELECT 1 FROM expenses.expense_payments payment
          WHERE payment.ticket_id=ticket.id
        )`);
      }
      if (audience === "audit") {
        where.push(`EXISTS (
          SELECT 1 FROM expenses.expense_audit_logs audit
          WHERE audit.ticket_id=ticket.id
        )`);
      }
      if (filters?.status) where.push(`ticket.status=${bind(filters.status)}`);
      if (filters?.expense_type) where.push(`ticket.expense_type=${bind(filters.expense_type)}`);
      if (filters?.expense_sub_type) where.push(`ticket.expense_sub_type=${bind(filters.expense_sub_type)}`);
      if (filters?.payment_type) where.push(`ticket.payment_type=${bind(filters.payment_type)}`);
      if (filters?.department_id) where.push(`ticket.department_id=${bind(filters.department_id)}::uuid`);
      if (filters?.requester_user_id) where.push(`ticket.requester_user_id=${bind(filters.requester_user_id)}::uuid`);
      if (filters?.manager_user_id) {
        const manager = bind(filters.manager_user_id);
        where.push(`(ticket.manager_verifier_id=${manager}::uuid OR ticket.manager_backup_user_id=${manager}::uuid)`);
      }
      if (filters?.finance_user_id) {
        const finance = bind(filters.finance_user_id);
        where.push(`(ticket.finance_approver_id=${finance}::uuid OR ticket.route_snapshot->>'finance_approver_id'=${finance}::text)`);
      }
      if (filters?.date_from) where.push(`ticket.created_at::date>=${bind(filters.date_from)}::date`);
      if (filters?.date_to) where.push(`ticket.created_at::date<=${bind(filters.date_to)}::date`);
      if (filters?.document_status && filters.document_status !== "any") {
        const requiredDocuments = bind(JSON.stringify(RequiredDocumentsByExpenseSubType));
        const documentStatus = bind(filters.document_status);
        where.push(`(
          CASE
            WHEN jsonb_array_length(COALESCE(${requiredDocuments}::jsonb->ticket.expense_sub_type,'[]'::jsonb))=0
              THEN 'not_required'
            WHEN EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(COALESCE(${requiredDocuments}::jsonb->ticket.expense_sub_type,'[]'::jsonb)) required(document_type)
              WHERE NOT EXISTS (
                SELECT 1 FROM expenses.expense_documents document
                WHERE document.ticket_id=ticket.id
                  AND document.document_type=required.document_type
                  AND document.verification_status='verified'
              )
            ) THEN 'missing'
            WHEN EXISTS (
              SELECT 1 FROM expenses.expense_documents document
              WHERE document.ticket_id=ticket.id AND document.verification_status='pending'
            ) THEN 'pending'
            ELSE 'complete'
          END
        )=${documentStatus}::text`);
      }
      const predicate = where.join(" AND ");
      const selected = await client.query<{ id: UUID }>(
        `SELECT ticket.id FROM expenses.expense_tickets ticket
         WHERE ${predicate}
         ORDER BY ticket.created_at DESC,ticket.id DESC LIMIT 1001`,
        params,
      );
      if (selected.rows.length > 1000) {
        throw badRequest(
          "Expense report supports at most 1,000 matching tickets; add or narrow a date range of at most 12 months or other report filters",
        );
      }
      const ticketIds = selected.rows.map((row) => row.id);
      const childCount = await client.query<{ total: string }>(
        `SELECT (
           (SELECT count(*) FROM expenses.expense_line_items child WHERE child.ticket_id=ANY($1::uuid[]))
           + (SELECT count(*) FROM expenses.expense_approvals child WHERE child.ticket_id=ANY($1::uuid[]))
           + (SELECT count(*) FROM expenses.expense_audit_logs child WHERE child.ticket_id=ANY($1::uuid[]))
           + (SELECT count(*) FROM expenses.expense_documents child WHERE child.ticket_id=ANY($1::uuid[]))
           + (SELECT count(*) FROM expenses.expense_payments child WHERE child.ticket_id=ANY($1::uuid[]))
         )::text AS total`,
        [ticketIds],
      );
      if (Number(childCount.rows[0]?.total ?? 0) > 10_000) {
        throw badRequest(
          "Expense report supports at most 10,000 related records for the matching tickets; narrow the date range or other report filters",
        );
      }
      const tickets = ticketIds.length
        ? await this.loadTickets(client, undefined, undefined, undefined, ticketIds)
        : [];
      const store = await this.loadExpenseReadStore(client, companyId, tickets, {
        displayCompanyIds: Array.from(new Set(tickets
          .map((ticket) => ticket.company_id)
          .filter((id): id is UUID => Boolean(id)))),
        includeDisplayPreferences: true,
      });
      await client.query("COMMIT");
      return { actor, companyId, store };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async expenseMutationCommand(input: {
    userId: UUID;
    ticketId?: UUID;
    action: ExpenseMutationAction;
    idempotencyKey: string;
    requestHash: string;
    run: (context: { actor: AuthUser; companyId: UUID; store: DataStore }) => ExpenseMutationResult;
  }): Promise<ExpenseMutationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (input.action === "create" || input.action === "submit") {
        // Routing writers use this same global-then-requester order before
        // touching actor, company or authority rows. Taking it at command
        // entry avoids a row-lock/advisory-lock inversion with flush writers.
        await lockExpenseRoutingReader(client, [input.userId]);
      }
      await client.query("SELECT 1 FROM core.users WHERE id = $1 FOR SHARE", [input.userId]);
      const preference = await client.query<{ company_id: UUID | null }>(
        "SELECT company_id FROM platform.user_session_preferences WHERE user_id = $1 FOR SHARE",
        [input.userId],
      );
      await client.query(
        `SELECT 1 FROM core.user_roles ur JOIN core.roles role ON role.role_key = ur.role_key
         WHERE ur.user_id = $1 FOR SHARE OF ur, role`,
        [input.userId],
      );
      if (preference.rows[0]?.company_id) {
        await client.query(
          "SELECT 1 FROM platform.company_profiles WHERE id = $1 FOR SHARE",
          [preference.rows[0].company_id],
        );
      }
      const { actor, companyId } = await this.resolveExpenseActor(client, input.userId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [`expense:${actor.id}:${input.action}:${input.idempotencyKey}`],
      );
      let original: ExpenseTicket | null = null;
      if (input.ticketId) {
        if (input.action === "create") {
          throw conflict("Expense create command cannot target an existing ticket");
        }
        const locked = await client.query<{ id: UUID }>(
          `SELECT id FROM expenses.expense_tickets
           WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL FOR UPDATE`,
          [input.ticketId, companyId],
        );
        if (!locked.rows[0]) throw notFound("Expense ticket not found");
        original = (
          await this.loadTickets(client, undefined, undefined, undefined, [input.ticketId])
        )[0] ?? null;
        if (!original || original.company_id !== companyId) {
          throw notFound("Expense ticket not found");
        }
        this.assertExpenseMutationActor(input.action, actor, original);
      } else {
        if (input.action !== "create") {
          throw conflict("Expense mutation command requires a ticket");
        }
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('expense-ticket-number', 0))",
        );
      }
      const prior = await client.query<{
        company_id: UUID;
        request_hash: string;
        ticket_id: UUID;
        response_body: ExpenseMutationResult;
      }>(
        `SELECT company_id, request_hash, ticket_id, response_body
         FROM expenses.expense_command_results
         WHERE actor_user_id=$1 AND action=$2 AND idempotency_key=$3
         ORDER BY created_at,id`,
        [actor.id, input.action, input.idempotencyKey],
      );
      if (prior.rows.length > 1) {
        throw conflict("Idempotency key has conflicting durable company ownership");
      }
      if (prior.rows[0]) {
        if (
          prior.rows[0].company_id !== companyId ||
          prior.rows[0].request_hash !== input.requestHash ||
          (input.ticketId && prior.rows[0].ticket_id !== input.ticketId)
        ) {
          throw conflict("Idempotency key was already used for a different expense command or company");
        }
        await client.query("COMMIT");
        return prior.rows[0].response_body;
      }
      if (input.action === "create" || input.action === "submit") {
        await this.lockExpenseRoutingAuthorityRows(
          client,
          original?.requester_user_id ?? actor.id,
          companyId,
        );
      }
      const store = await this.loadExpenseCommandStore(
        client,
        companyId,
        original ? [original] : [],
      );
      const originalVersion = original?.version ?? null;
      const originalSnapshot = original ? structuredClone(original) : null;
      const priorTicketIds = new Set(store.tickets.map((ticket) => ticket.id));
      const priorLineItemIds = new Set(store.lineItems.map((item) => item.id));
      const priorApprovalIds = new Set(store.expenseApprovals.map((item) => item.id));
      const priorAuditIds = new Set(store.auditLogs.map((item) => item.id));
      const priorNotificationIds = new Set(store.notifications.map((item) => item.id));
      const priorOutboxIds = new Set(store.outbox.map((item) => item.event_id));
      const unchangedCollections = JSON.stringify({
        mappings: store.managerBackupAssignments,
        documents: store.expenseDocuments,
        payments: store.payments,
      });
      const result = input.run({ actor, companyId, store });
      if (input.action === "clarification") {
        const clarificationAudits = store.auditLogs.filter(
          (audit) =>
            !priorAuditIds.has(audit.id) &&
            audit.event_type === "expense.clarification.added",
        );
        if (clarificationAudits.length !== 1) {
          throw conflict("Expense clarification produced an unexpected audit delta");
        }
        const documentIds = clarificationAudits[0]?.new_value?.document_ids;
        if (
          !Array.isArray(documentIds) ||
          documentIds.some((id) => typeof id !== "string")
        ) {
          throw conflict("Expense clarification document evidence is invalid");
        }
        await this.lockExpenseClarificationDocuments(
          client,
          input.ticketId!,
          documentIds as UUID[],
        );
      }
      let changed: ExpenseTicket;
      if (original) {
        const candidate = store.tickets.find((ticket) => ticket.id === original!.id);
        if (
          !candidate ||
          store.tickets.length !== 1 ||
          candidate.company_id !== companyId ||
          candidate.owner_resolution_status !== "typed_creation" ||
          originalVersion === null ||
          candidate.version !== originalVersion + 1
        ) {
          throw conflict("Expense command changed an unexpected ticket or owner");
        }
        changed = candidate;
        this.assertExpenseMutationDelta(input.action, originalSnapshot!, changed);
      } else {
        const created = store.tickets.filter((ticket) => !priorTicketIds.has(ticket.id));
        if (
          created.length !== 1 ||
          store.tickets.length !== 1 ||
          created[0]?.company_id !== companyId ||
          created[0]?.requester_user_id !== actor.id ||
          created[0]?.owner_resolution_status !== "typed_creation" ||
          created[0]?.version !== 1
        ) {
          throw conflict("Expense create command produced an unexpected ticket or owner");
        }
        changed = created[0]!;
      }
      if (
        Object.keys(result).sort().join(",") !== "id,status,version" ||
        result.id !== changed.id ||
        result.status !== changed.status ||
        result.version !== changed.version
      ) {
        throw conflict("Expense command result must contain only the committed id, status, and version");
      }
      if (
        unchangedCollections !== JSON.stringify({
          mappings: store.managerBackupAssignments,
          documents: store.expenseDocuments,
          payments: store.payments,
        }) ||
        (input.action !== "create" &&
          store.lineItems.some((item) => !priorLineItemIds.has(item.id)))
      ) {
        throw conflict("Expense command changed an unrelated child collection");
      }
      await client.query("SELECT set_config('app.expense_command_v1', 'on', true)");
      if (input.action === "create") {
        await this.insertExpenseTicket(client, changed);
        for (const item of store.lineItems.filter((row) => !priorLineItemIds.has(row.id))) {
          if (item.ticket_id !== changed.id) throw conflict("Expense line-item parent mismatch");
          await client.query(
            `INSERT INTO expenses.expense_line_items
             (id,ticket_id,line_category,description,quantity,unit_cost,line_total,tax_amount,vendor_name)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [item.id, item.ticket_id, item.line_category, item.description, item.quantity,
              item.unit_cost, item.line_total, item.tax_amount, item.vendor_name],
          );
        }
      } else {
        await this.updateExpenseTicketForAction(
          client,
          input.action,
          originalSnapshot!,
          changed,
          companyId,
        );
      }
      for (const approval of store.expenseApprovals.filter(
        (item) => !priorApprovalIds.has(item.id),
      )) {
        if (input.action !== "manager.verify" || approval.ticket_id !== changed.id) {
          throw conflict("Expense approval delta is not valid for this command");
        }
        await client.query(
          `INSERT INTO expenses.expense_approvals
           (id,ticket_id,approval_stage,approver_user_id,decision,remarks,role_snapshot,
            designation_snapshot,route_snapshot,action_at,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
          [approval.id, approval.ticket_id, approval.approval_stage, approval.approver_user_id,
            approval.decision, approval.remarks, approval.role_snapshot,
            approval.designation_snapshot, JSON.stringify(approval.route_snapshot),
            approval.action_at, approval.created_at],
        );
      }
      for (const audit of store.auditLogs.filter((item) => !priorAuditIds.has(item.id))) {
        if (audit.ticket_id !== changed.id) throw conflict("Expense audit parent mismatch");
        await client.query(
          `INSERT INTO expenses.expense_audit_logs
           (id,ticket_id,actor_user_id,event_type,old_value,new_value,remarks,payload_hash,created_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)`,
          [audit.id, audit.ticket_id, audit.actor_user_id, audit.event_type,
            audit.old_value ? JSON.stringify(audit.old_value) : null,
            audit.new_value ? JSON.stringify(audit.new_value) : null,
            audit.remarks, audit.payload_hash, audit.created_at],
        );
      }
      for (const notification of store.notifications.filter(
        (item) => !priorNotificationIds.has(item.id),
      )) {
        await client.query(
          `INSERT INTO platform.notifications
           (id,actor_user_id,target_user_id,event_type,payload,status,read_at,version,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)`,
          [
            notification.id,
            notification.actor_user_id,
            notification.target_user_id,
            notification.event_type,
            JSON.stringify(notification.payload),
            notification.status,
            notification.read_at,
            notification.version,
            notification.created_at,
            notification.updated_at,
          ],
        );
      }
      for (const event of store.outbox.filter(
        (item) => !priorOutboxIds.has(item.event_id),
      )) {
        if (
          event.aggregate_id !== changed.id ||
          event.payload.company_id !== companyId
        ) {
          throw conflict("Expense event owner mismatch");
        }
        await client.query(
          `INSERT INTO platform.outbox_events
           (event_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key,status,
            retry_count,available_at,created_at,published_at,failed_at,last_error)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [event.event_id, event.aggregate_type, event.aggregate_id, event.event_type,
            JSON.stringify(event.payload), event.idempotency_key, event.status,
            event.retry_count, event.available_at, event.created_at, event.published_at,
            event.failed_at, event.last_error],
        );
      }
      await client.query(
        `INSERT INTO expenses.expense_command_results
         (company_id,actor_user_id,ticket_id,action,idempotency_key,request_hash,response_body)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [companyId, actor.id, changed.id, input.action, input.idempotencyKey,
          input.requestHash, JSON.stringify(result)],
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error.code === "40001" || error.code === "40P01")
      ) {
        throw conflict("Expense command changed during concurrent processing; refresh and retry");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockExpenseRoutingAuthorityRows(
    client: PoolClient,
    requesterUserId: UUID,
    companyId: UUID,
  ): Promise<void> {
    const requester = await client.query<{ manager_user_id: UUID | null }>(
      "SELECT manager_user_id FROM core.users WHERE id=$1 FOR SHARE",
      [requesterUserId],
    );
    const mappings = await client.query<{ reviewer_user_id: UUID }>(
      `SELECT reviewer_user_id FROM expenses.employee_reviewer_mappings
       WHERE company_id=$1 AND employee_user_id=$2
         AND owner_resolution_status IN ('typed_creation','audited_repair')
       FOR SHARE`,
      [companyId, requesterUserId],
    );
    const governance = await client.query<{
      primary_finance_manager_user_id: UUID;
      manager_backup_user_id: UUID | null;
      finance_approval_backup_user_id: UUID | null;
      finance_self_request_fallback_user_id: UUID | null;
    }>(
      `SELECT primary_finance_manager_user_id,manager_backup_user_id,
              finance_approval_backup_user_id,finance_self_request_fallback_user_id
       FROM platform.finance_governance_config
       WHERE deleted_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 1 FOR SHARE`,
    );
    const userIds = Array.from(new Set([
      requesterUserId,
      requester.rows[0]?.manager_user_id,
      ...mappings.rows.map((row) => row.reviewer_user_id),
      governance.rows[0]?.primary_finance_manager_user_id,
      governance.rows[0]?.manager_backup_user_id,
      governance.rows[0]?.finance_approval_backup_user_id,
      governance.rows[0]?.finance_self_request_fallback_user_id,
    ].filter((id): id is UUID => Boolean(id)))).sort();
    if (!userIds.length) return;
    await client.query(
      "SELECT id FROM core.users WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",
      [userIds],
    );
    await client.query(
      `SELECT user_id FROM platform.user_session_preferences
       WHERE user_id=ANY($1::uuid[]) ORDER BY user_id FOR SHARE`,
      [userIds],
    );
    await client.query(
      `SELECT ur.id FROM core.user_roles ur
       JOIN core.roles role ON role.role_key=ur.role_key
       WHERE ur.user_id=ANY($1::uuid[])
       ORDER BY ur.user_id,ur.role_key,ur.id FOR SHARE OF ur,role`,
      [userIds],
    );
  }

  private async lockExpenseClarificationDocuments(
    client: PoolClient,
    ticketId: UUID,
    documentIds: readonly UUID[],
  ): Promise<void> {
    if (documentIds.length > 20 || new Set(documentIds).size !== documentIds.length) {
      throw badRequest("Clarification may reference at most 20 unique documents");
    }
    if (documentIds.length === 0) return;
    const coherent = await client.query<{ document_id: UUID }>(
      `SELECT link.document_id
       FROM expenses.expense_documents link
       JOIN documents.doc_metadata metadata ON metadata.id=link.document_id
       JOIN documents.doc_versions current_version
         ON current_version.document_id=metadata.id
        AND current_version.version=metadata.current_version
        AND current_version.storage_key=metadata.storage_key
        AND current_version.size_bytes=metadata.size_bytes
        AND current_version.checksum_sha256 IS NOT DISTINCT FROM metadata.checksum_sha256
       WHERE link.ticket_id=$1
         AND link.document_id=ANY($2::uuid[])
         AND metadata.business_object_type='expense_ticket'
         AND metadata.business_object_id=$1
         AND metadata.classification='finance'
         AND metadata.document_type=link.document_type
         AND metadata.deleted_at IS NULL
         AND metadata.size_bytes>0
         AND current_version.size_bytes>0
       ORDER BY link.document_id
       FOR SHARE OF link,metadata,current_version`,
      [ticketId, documentIds],
    );
    if (coherent.rows.length !== documentIds.length) {
      throw badRequest(
        "Every clarification document must be a live current document linked to this expense ticket",
      );
    }
  }

  private assertExpenseMutationActor(
    action: Exclude<ExpenseMutationAction, "create">,
    actor: AuthUser,
    ticket: ExpenseTicket,
  ): void {
    if (action === "submit" || action === "withdraw") {
      if (ticket.requester_user_id !== actor.id) {
        throw forbidden(`Only the requester can ${action} this ticket`);
      }
      return;
    }
    if (action === "manager.verify") {
      assertManagerActor(actor, ticket);
      return;
    }
    if (action === "clarification") {
      const assignedManager =
        (ticket.manager_verifier_id === actor.id ||
          ticket.manager_backup_user_id === actor.id) &&
        actor.roles.includes(Roles.Reviewer);
      const assignedFinance =
        ticket.finance_approver_id === actor.id &&
        actor.roles.includes(Roles.FinanceManager);
      if (
        ticket.requester_user_id !== actor.id &&
        !assignedManager &&
        !assignedFinance
      ) {
        throw forbidden(
          "Only the requester, assigned Manager, or assigned Finance actor can add a clarification",
        );
      }
      return;
    }
    const assignedFinance =
      ticket.finance_approver_id === actor.id &&
      actor.roles.includes(Roles.FinanceManager);
    if (ticket.requester_user_id !== actor.id && !assignedFinance) {
      throw forbidden("Only the requester or current assigned Finance actor can submit bills");
    }
  }

  private assertExpenseMutationDelta(
    action: ExpenseMutationAction,
    original: ExpenseTicket,
    changed: ExpenseTicket,
  ): void {
    const allowed = new Set<string>(["version", "updated_at"]);
    for (const field of action === "submit"
      ? ["status", "manager_verifier_id", "manager_backup_user_id", "finance_approver_id", "route_snapshot", "submitted_at"]
      : action === "withdraw"
        ? ["status", "closure_remarks", "closed_at"]
        : action === "manager.verify" || action === "bills"
          ? ["status"]
          : []) {
      allowed.add(field);
    }
    for (const key of Object.keys(original) as Array<keyof ExpenseTicket>) {
      if (allowed.has(key)) continue;
      if (JSON.stringify(original[key]) !== JSON.stringify(changed[key])) {
        throw conflict(`Expense ${action} changed protected field ${key}`);
      }
    }
  }

  private async insertExpenseTicket(
    client: PoolClient,
    ticket: ExpenseTicket,
  ): Promise<void> {
    const inserted = await client.query(
      `INSERT INTO expenses.expense_tickets (
        id,ticket_no,requester_user_id,requester_role_snapshot,department_id,expense_type,
        expense_sub_type,project_code,client_name,task_title,task_description,location,
        start_date,end_date,estimated_amount,payment_type,advance_amount,advance_justification,
        assigned_reviewer_id,director_approver_id,finance_manager_id,manager_verifier_id,
        manager_backup_user_id,finance_approver_id,status,actual_amount,variance_amount,
        payment_reference_no,closure_remarks,context_payload,route_snapshot,policy_snapshot,
        version,created_at,updated_at,submitted_at,closed_at,deleted_at,company_id,
        owner_resolution_status,owner_resolution_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
         $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30::jsonb,$31::jsonb,$32::jsonb,
         $33,$34,$35,$36,$37,$38,$39,$40,$41)
       ON CONFLICT DO NOTHING`,
      [ticket.id, ticket.ticket_no, ticket.requester_user_id, ticket.requester_role_snapshot,
        ticket.department_id, ticket.expense_type, ticket.expense_sub_type, ticket.project_code,
        ticket.client_name, ticket.task_title, ticket.task_description, ticket.location,
        ticket.start_date, ticket.end_date, ticket.estimated_amount, ticket.payment_type,
        ticket.advance_amount, ticket.advance_justification, ticket.manager_verifier_id, null,
        ticket.finance_approver_id, ticket.manager_verifier_id, ticket.manager_backup_user_id,
        ticket.finance_approver_id, ticket.status, ticket.actual_amount, ticket.variance_amount,
        ticket.payment_reference_no, ticket.closure_remarks, JSON.stringify(ticket.context_payload),
        JSON.stringify(ticket.route_snapshot), JSON.stringify(ticket.policy_snapshot), ticket.version,
        ticket.created_at, ticket.updated_at, ticket.submitted_at, ticket.closed_at,
        ticket.deleted_at, ticket.company_id, ticket.owner_resolution_status,
        ticket.owner_resolution_reason ?? null],
    );
    if (inserted.rowCount !== 1) throw conflict("Expense ticket already exists");
  }

  private async updateExpenseTicketForAction(
    client: PoolClient,
    action: Exclude<ExpenseMutationAction, "create">,
    original: ExpenseTicket,
    changed: ExpenseTicket,
    companyId: UUID,
  ): Promise<void> {
    const common = [changed.version, changed.updated_at, changed.id, companyId, original.version];
    const result = action === "submit"
      ? await client.query(
          `UPDATE expenses.expense_tickets
           SET status=$1,manager_verifier_id=$2,manager_backup_user_id=$3,
               finance_approver_id=$4,route_snapshot=$5::jsonb,submitted_at=$6,
               version=$7,updated_at=$8
           WHERE id=$9 AND company_id=$10 AND version=$11 AND owner_resolution_status='typed_creation'`,
          [changed.status, changed.manager_verifier_id, changed.manager_backup_user_id,
            changed.finance_approver_id, JSON.stringify(changed.route_snapshot), changed.submitted_at,
            ...common],
        )
      : action === "withdraw"
        ? await client.query(
            `UPDATE expenses.expense_tickets
             SET status=$1,closure_remarks=$2,closed_at=$3,version=$4,updated_at=$5
             WHERE id=$6 AND company_id=$7 AND version=$8 AND owner_resolution_status='typed_creation'`,
            [changed.status, changed.closure_remarks, changed.closed_at, ...common],
          )
        : action === "clarification"
          ? await client.query(
              `UPDATE expenses.expense_tickets SET version=$1,updated_at=$2
               WHERE id=$3 AND company_id=$4 AND version=$5 AND owner_resolution_status='typed_creation'`,
              common,
            )
          : await client.query(
              `UPDATE expenses.expense_tickets SET status=$1,version=$2,updated_at=$3
               WHERE id=$4 AND company_id=$5 AND version=$6 AND owner_resolution_status='typed_creation'`,
              [changed.status, ...common],
            );
    if (result.rowCount !== 1) throw conflict("Expense ticket changed during the command");
  }

  async expenseFinanceCommand(input: {
    userId: UUID; ticketId: UUID;
    action: "finance.approve" | "finance.payment" | "settlement";
    idempotencyKey: string; requestHash: string; expectedVersion: number;
    run: (context: { actor: AuthUser; companyId: UUID; store: DataStore }) => ExpenseTicket;
  }): Promise<Pick<ExpenseTicket, "id" | "status" | "version">> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Lock current authority through commit. The ticket row lock also
      // serializes different command keys targeting the same version.
      await client.query("SELECT 1 FROM core.users WHERE id = $1 FOR SHARE", [input.userId]);
      const preference = await client.query<{ company_id: UUID | null }>(
        "SELECT company_id FROM platform.user_session_preferences WHERE user_id = $1 FOR SHARE",
        [input.userId],
      );
      await client.query(
        `SELECT 1 FROM core.user_roles ur JOIN core.roles role ON role.role_key = ur.role_key
         WHERE ur.user_id = $1 FOR SHARE OF ur, role`, [input.userId],
      );
      if (preference.rows[0]?.company_id) {
        await client.query(
          "SELECT 1 FROM platform.company_profiles WHERE id = $1 FOR SHARE",
          [preference.rows[0].company_id],
        );
      }
      const { actor, companyId } = await this.resolveExpenseActor(client, input.userId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [`expense:${companyId}:${actor.id}:${input.action}:${input.idempotencyKey}`],
      );
      const locked = await client.query<{ id: UUID; company_id: UUID | null; version: number }>(
        `SELECT id, company_id, version FROM expenses.expense_tickets
         WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [input.ticketId],
      );
      if (!locked.rows[0]) throw notFound("Expense ticket not found");
      if (!locked.rows[0].company_id || locked.rows[0].company_id !== companyId) {
        throw notFound("Expense ticket not found");
      }
      const tickets = await this.loadTickets(client, undefined, undefined, undefined, [input.ticketId]);
      const original = tickets[0];
      if (!original) throw notFound("Expense ticket not found");
      const actionType = input.action === "finance.approve"
        ? WorkflowActions.FinanceApprove
        : input.action === "finance.payment"
          ? WorkflowActions.PaymentRelease : WorkflowActions.SettlementClose;
      assertFinanceActor(actor, original, actionType);
      const prior = await client.query<{ request_hash: string; ticket_id: UUID; response_body: {
        id: UUID; status: ExpenseTicket["status"]; version: number;
      } }>(
        `SELECT request_hash, ticket_id, response_body
         FROM expenses.expense_command_results
         WHERE company_id = $1 AND actor_user_id = $2 AND action = $3 AND idempotency_key = $4`,
        [companyId, actor.id, input.action, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== input.requestHash || prior.rows[0].ticket_id !== input.ticketId) {
          throw conflict("Idempotency key was already used for a different expense command");
        }
        await client.query("COMMIT");
        return prior.rows[0].response_body;
      }
      if (original.version !== input.expectedVersion) {
        throw conflict("The ticket was modified by another actor. Refresh and retry.", {
          expected_version: input.expectedVersion, current_version: original.version,
        });
      }
      if (input.action === "settlement") {
        const required = RequiredDocumentsByExpenseSubType[original.expense_sub_type] ?? [];
        const verified = await client.query<{ document_type: string }>(
          `SELECT link.document_type
           FROM expenses.expense_documents link
           JOIN documents.doc_metadata metadata ON metadata.id = link.document_id
           JOIN documents.doc_versions version ON version.document_id = metadata.id
             AND version.version = metadata.current_version
             AND version.storage_key = metadata.storage_key
             AND version.size_bytes = metadata.size_bytes
             AND version.checksum_sha256 IS NOT DISTINCT FROM metadata.checksum_sha256
           WHERE link.ticket_id = $1 AND link.verification_status = 'verified'
             AND metadata.business_object_type = 'expense_ticket'
             AND metadata.business_object_id = $1
             AND metadata.classification = 'finance'
             AND metadata.document_type = link.document_type
             AND metadata.deleted_at IS NULL AND metadata.size_bytes > 0
             AND version.size_bytes > 0
           FOR SHARE OF link, metadata, version`, [input.ticketId],
        );
        const present = new Set(verified.rows.map((row) => row.document_type));
        const missing = required.filter((type) => !present.has(type));
        if (missing.length) {
          throw badRequest("Closure requires live, matching and verified expense documents", {
            missing_document_types: missing,
          });
        }
      }
      const originalVersion = original.version;
      const store = await this.loadExpenseReadStore(client, companyId, tickets);
      const priorApprovalIds = new Set(store.expenseApprovals.map((item) => item.id));
      const priorAuditIds = new Set(store.auditLogs.map((item) => item.id));
      const priorPaymentIds = new Set(store.payments.map((item) => item.id));
      const priorPayments = new Map(store.payments.map((item) => [item.id, {
        settlement_status: item.settlement_status, settlement_amount: item.settlement_amount,
      }]));
      const changed = input.run({ actor, companyId, store });
      if (changed.id !== input.ticketId || changed.company_id !== companyId ||
          changed.version !== originalVersion + 1 || store.tickets.length !== 1) {
        throw conflict("Expense command changed an unexpected ticket or owner");
      }
      await client.query("SELECT set_config('app.expense_command_v1', 'on', true)");
      const updated = await client.query(
        `UPDATE expenses.expense_tickets SET status = $1, actual_amount = $2,
           variance_amount = $3, payment_reference_no = $4, closure_remarks = $5,
           version = $6, updated_at = $7, closed_at = $8
         WHERE id = $9 AND company_id = $10 AND version = $11`,
        [changed.status, changed.actual_amount, changed.variance_amount,
          changed.payment_reference_no, changed.closure_remarks, changed.version,
          changed.updated_at, changed.closed_at, changed.id, companyId, originalVersion],
      );
      if (updated.rowCount !== 1) throw conflict("Expense ticket changed during the command");
      for (const approval of store.expenseApprovals.filter((item) => !priorApprovalIds.has(item.id))) {
        if (approval.ticket_id !== input.ticketId) throw conflict("Expense approval parent mismatch");
        await client.query(
          `INSERT INTO expenses.expense_approvals
           (id, ticket_id, approval_stage, approver_user_id, decision, remarks,
            role_snapshot, designation_snapshot, route_snapshot, action_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
          [approval.id, approval.ticket_id, approval.approval_stage, approval.approver_user_id,
            approval.decision, approval.remarks, approval.role_snapshot, approval.designation_snapshot,
            JSON.stringify(approval.route_snapshot), approval.action_at, approval.created_at],
        );
      }
      for (const payment of store.payments) {
        if (payment.ticket_id !== input.ticketId) throw conflict("Expense payment parent mismatch");
        if (!priorPaymentIds.has(payment.id)) {
          await client.query(
            `INSERT INTO expenses.expense_payments
             (id,ticket_id,payment_type,approved_amount,paid_amount,payment_date,
              payment_mode,reference_no,settlement_status,settlement_amount,processed_by_user_id,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [payment.id, payment.ticket_id, payment.payment_type, payment.approved_amount,
              payment.paid_amount, payment.payment_date, payment.payment_mode, payment.reference_no,
              payment.settlement_status, payment.settlement_amount, payment.processed_by_user_id,
              payment.created_at],
          );
        } else if (payment.settlement_status !== priorPayments.get(payment.id)?.settlement_status ||
                   payment.settlement_amount !== priorPayments.get(payment.id)?.settlement_amount) {
          await client.query(
            `UPDATE expenses.expense_payments SET settlement_status = $1, settlement_amount = $2
             WHERE id = $3 AND ticket_id = $4`,
            [payment.settlement_status, payment.settlement_amount, payment.id, input.ticketId],
          );
        }
      }
      for (const audit of store.auditLogs.filter((item) => !priorAuditIds.has(item.id))) {
        if (audit.ticket_id !== input.ticketId) throw conflict("Expense audit parent mismatch");
        await client.query(
          `INSERT INTO expenses.expense_audit_logs
           (id,ticket_id,actor_user_id,event_type,old_value,new_value,remarks,payload_hash,created_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)`,
          [audit.id, audit.ticket_id, audit.actor_user_id, audit.event_type,
            audit.old_value ? JSON.stringify(audit.old_value) : null,
            audit.new_value ? JSON.stringify(audit.new_value) : null,
            audit.remarks, audit.payload_hash, audit.created_at],
        );
      }
      for (const notice of store.notifications) {
        await client.query(
          `INSERT INTO platform.notifications
           (id,actor_user_id,target_user_id,event_type,payload,status,read_at,version,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)`,
          [notice.id, notice.actor_user_id, notice.target_user_id, notice.event_type,
            JSON.stringify(notice.payload), notice.status, notice.read_at, notice.version,
            notice.created_at, notice.updated_at],
        );
      }
      for (const event of store.outbox) {
        if (event.aggregate_id !== input.ticketId || event.payload.company_id !== companyId) {
          throw conflict("Expense event owner mismatch");
        }
        await client.query(
          `INSERT INTO platform.outbox_events
           (event_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key,status,
            retry_count,available_at,created_at,published_at,failed_at,last_error)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [event.event_id, event.aggregate_type, event.aggregate_id, event.event_type,
            JSON.stringify(event.payload), event.idempotency_key, event.status, event.retry_count,
            event.available_at, event.created_at, event.published_at, event.failed_at, event.last_error],
        );
      }
      const response = { id: changed.id, status: changed.status, version: changed.version };
      await client.query(
        `INSERT INTO expenses.expense_command_results
         (company_id,actor_user_id,ticket_id,action,idempotency_key,request_hash,response_body)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [companyId, actor.id, input.ticketId, input.action, input.idempotencyKey,
          input.requestHash, JSON.stringify(response)],
      );
      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async expenseReadContext(userId: UUID, ticketId: UUID): Promise<{ actor: AuthUser; companyId: UUID; store: DataStore }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const { actor, companyId } = await this.resolveExpenseActor(client, userId);
      const candidateTickets = await this.loadTickets(client, companyId, userId, ticketId);
      const activeOwnerCompanies = candidateTickets.length
        ? await client.query<{ id: UUID }>(
            `SELECT id FROM platform.company_profiles
             WHERE id=ANY($1::uuid[]) AND status='active'`,
            [Array.from(new Set(candidateTickets
              .map((ticket) => ticket.company_id)
              .filter((id): id is UUID => Boolean(id))))],
          )
        : { rows: [] as Array<{ id: UUID }> };
      const activeCompanyIds = new Set(activeOwnerCompanies.rows.map((row) => row.id));
      const tickets = candidateTickets.filter(
        (ticket) => ticket.company_id && activeCompanyIds.has(ticket.company_id),
      );
      const store = await this.loadExpenseReadStore(client, companyId, tickets);
      await client.query("COMMIT");
      return { actor, companyId, store };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async expenseMetadataContext(userId: UUID): Promise<{
    actor: AuthUser;
    companyId: UUID;
    store: DataStore;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const { actor, companyId } = await this.resolveExpenseActor(client, userId);
      // Project rows do not yet have a durable company owner. Return the
      // company-safe platform metadata without hydrating ambiguous project or
      // client selectors; TEN-S25-009 owns project tenant attribution.
      const store = await this.loadExpenseReadStore(client, companyId, []);
      await client.query("COMMIT");
      return { actor, companyId, store };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async expensePageContext(userId: UUID, options: {
    kind: "my" | "manager" | "finance";
    page: number;
    pageSize: number;
    filters?: {
      status?: string; date_from?: string; date_to?: string;
      payment_type?: string; expense_type?: string; expense_sub_type?: string;
      amount_min?: string; amount_max?: string; requester?: string;
      department?: string; document_status?: "any" | "complete" | "missing";
      sla_bucket?: string; sort?: string;
    };
  }): Promise<{ actor: AuthUser; companyId: UUID; store: DataStore; total: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const { actor, companyId } = await this.resolveExpenseActor(client, userId);
      if (options.kind === "manager" && !actor.roles.includes(Roles.Reviewer)) {
        throw forbidden("Current Manager authority is required for this queue");
      }
      if (options.kind === "finance" && !actor.roles.includes(Roles.FinanceManager)) {
        throw forbidden("Current Finance authority is required for this queue");
      }
      const params: unknown[] = [];
      const bind = (value: unknown): string => {
        params.push(value);
        return `$${params.length}`;
      };
      const where = ["t.deleted_at IS NULL", "t.company_id IS NOT NULL"];
      if (options.kind === "my") {
        where.push(`t.requester_user_id = ${bind(userId)}::uuid`);
      } else if (options.kind === "manager") {
        where.push(`t.company_id = ${bind(companyId)}::uuid`);
        where.push(`t.manager_verifier_id = ${bind(userId)}::uuid`);
        where.push(`(
          t.status = 'Pending Manager Verification'
          OR (t.status IN ('Payment Released', 'Bills Submitted', 'Pending Adjustment')
            AND EXISTS (SELECT 1 FROM expenses.expense_documents doc
              WHERE doc.ticket_id = t.id AND doc.verification_status = 'pending'))
        )`);
      } else {
        where.push(`t.company_id = ${bind(companyId)}::uuid`);
        where.push(`t.finance_approver_id = ${bind(userId)}::uuid`);
        if (!options.filters?.status) {
          where.push(`t.status IN ('Manager Verified', 'Finance Hold', 'Clarification Required',
            'Finance Approved', 'Payment Released', 'Bills Submitted', 'Pending Adjustment')`);
        }
      }
      const filters = options.filters;
      if (filters?.status) where.push(`t.status = ${bind(filters.status)}`);
      if (filters?.date_from) where.push(`t.created_at::date >= ${bind(filters.date_from)}::date`);
      if (filters?.date_to) where.push(`t.created_at::date <= ${bind(filters.date_to)}::date`);
      if (filters?.date_from && filters?.date_to && filters.date_from > filters.date_to) {
        throw badRequest("Expense date range is reversed");
      }
      if (filters?.payment_type) where.push(`t.payment_type = ${bind(filters.payment_type)}`);
      if (filters?.expense_type) where.push(`t.expense_type = ${bind(filters.expense_type)}`);
      if (filters?.expense_sub_type) where.push(`t.expense_sub_type = ${bind(filters.expense_sub_type)}`);
      if (filters?.amount_min) where.push(`t.estimated_amount >= ${bind(filters.amount_min)}::numeric`);
      if (filters?.amount_max) where.push(`t.estimated_amount <= ${bind(filters.amount_max)}::numeric`);
      if (filters?.requester) {
        const requester = bind(filters.requester);
        where.push(`(
          strpos(
            lower(concat_ws(' ',
              t.context_payload->'requester_snapshot'->>'employee_code',
              t.context_payload->'requester_snapshot'->>'full_name'
            )),
            lower(${requester})
          ) > 0
          OR EXISTS (
            SELECT 1
            FROM core.users requester_user
            JOIN platform.user_session_preferences requester_membership
              ON requester_membership.user_id=requester_user.id
             AND requester_membership.company_id=t.company_id
            WHERE requester_user.id=t.requester_user_id
              AND strpos(
                lower(concat_ws(' ', requester_user.employee_code, requester_user.full_name)),
                lower(${requester})
              ) > 0
          )
        )`);
      }
      if (filters?.department) {
        const department = bind(filters.department);
        where.push(`EXISTS (
          SELECT 1 FROM core.departments department
          WHERE department.id=t.department_id
            AND (
              department.company_id=t.company_id
              OR (
                department.company_id IS NULL
                AND EXISTS (
                  SELECT 1 FROM core.users requester_user
                  JOIN platform.user_session_preferences requester_membership
                    ON requester_membership.user_id=requester_user.id
                   AND requester_membership.company_id=t.company_id
                  WHERE requester_user.id=t.requester_user_id
                    AND requester_user.department_id=department.id
                )
              )
            )
            AND strpos(
              lower(concat_ws(' ', department.department_code, department.name)),
              lower(${department})
            ) > 0
        )`);
      }
      if (filters?.document_status && filters.document_status !== "any") {
        const requiredDocuments = bind(
          JSON.stringify(RequiredDocumentsByExpenseSubType),
        );
        const missingRequiredDocument = `EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            COALESCE(${requiredDocuments}::jsonb->t.expense_sub_type, '[]'::jsonb)
          ) required(document_type)
          WHERE NOT EXISTS (
            SELECT 1
            FROM expenses.expense_documents document
            JOIN documents.doc_metadata metadata ON metadata.id=document.document_id
            JOIN documents.doc_versions version
              ON version.document_id=metadata.id
             AND version.version=metadata.current_version
             AND version.storage_key=metadata.storage_key
             AND version.size_bytes=metadata.size_bytes
             AND version.checksum_sha256 IS NOT DISTINCT FROM metadata.checksum_sha256
            WHERE document.ticket_id=t.id
              AND document.document_type=required.document_type
              AND document.verification_status='verified'
              AND metadata.business_object_type='expense_ticket'
              AND metadata.business_object_id=t.id
              AND metadata.classification='finance'
              AND metadata.document_type=document.document_type
              AND metadata.deleted_at IS NULL
              AND metadata.size_bytes > 0
              AND version.size_bytes > 0
          )
        )`;
        where.push(
          filters.document_status === "missing"
            ? missingRequiredDocument
            : `NOT ${missingRequiredDocument}`,
        );
      }
      if (filters?.sla_bucket && filters.sla_bucket !== "any") {
        if (filters.sla_bucket === "0-24h") where.push("t.created_at >= now() - interval '24 hours'");
        else if (filters.sla_bucket === "24-72h") where.push("t.created_at < now() - interval '24 hours' AND t.created_at >= now() - interval '72 hours'");
        else if (filters.sla_bucket === "72h-plus") where.push("t.created_at < now() - interval '72 hours'");
        else throw badRequest("Unsupported expense SLA bucket");
      }
      const order = options.kind === "finance" && filters?.sort === "amount"
        ? "t.estimated_amount DESC, t.id DESC"
        : options.kind === "finance" && filters?.sort === "status"
          ? "t.status ASC, t.created_at DESC, t.id DESC"
          : options.kind === "finance" && (filters?.sort === "sla" || !filters?.sort)
            ? "t.created_at ASC, t.id ASC"
            : "t.created_at DESC, t.id DESC";
      const predicate = where.join(" AND ");
      const count = await client.query<{ total: string }>(
        `SELECT count(*) AS total FROM expenses.expense_tickets t WHERE ${predicate}`, params,
      );
      const total = Number(count.rows[0]?.total ?? 0);
      const pageParams = [...params, options.pageSize, (options.page - 1) * options.pageSize];
      const pageRows = await client.query<{ id: UUID }>(
        `SELECT t.id FROM expenses.expense_tickets t WHERE ${predicate}
         ORDER BY ${order} LIMIT $${pageParams.length - 1}::integer OFFSET $${pageParams.length}::integer`,
        pageParams,
      );
      const orderedIds = pageRows.rows.map((row) => row.id);
      const loaded = await this.loadTickets(client, undefined, undefined, undefined, orderedIds);
      const byId = new Map(loaded.map((ticket) => [ticket.id, ticket]));
      const tickets = orderedIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
      const store = await this.loadExpenseReadStore(client, companyId, tickets);
      await client.query("COMMIT");
      return { actor, companyId, store, total };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async classifyExpenseDocumentAccess(
    userId: UUID,
    documentId: UUID,
    mode: "metadata" | "raw" | "workflow",
  ): Promise<"other" | "expense-authorized" | "hidden"> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const { actor, companyId } = await this.resolveExpenseActor(client, userId);
      const result = await client.query<{
        metadata_id: UUID | null;
        business_object_type: string | null;
        business_object_id: UUID | null;
        metadata_document_type: string | null;
        classification: string | null;
        metadata_deleted_at: Date | null;
        link_ticket_id: UUID | null;
        link_document_type: string | null;
        ticket_id: UUID | null;
        ticket_company_id: UUID | null;
        requester_user_id: UUID | null;
        manager_verifier_id: UUID | null;
        finance_approver_id: UUID | null;
        owner_resolution_status: string | null;
        ticket_deleted_at: Date | null;
        ticket_company_status: string | null;
      }>(
        `SELECT metadata.id AS metadata_id, metadata.business_object_type,
                metadata.business_object_id, metadata.document_type AS metadata_document_type,
                metadata.classification, metadata.deleted_at AS metadata_deleted_at,
                link.ticket_id AS link_ticket_id, link.document_type AS link_document_type,
                ticket.id AS ticket_id, ticket.company_id AS ticket_company_id,
                ticket.requester_user_id, ticket.manager_verifier_id,
                ticket.finance_approver_id, ticket.owner_resolution_status,
                ticket.deleted_at AS ticket_deleted_at,
                ticket_company.status AS ticket_company_status
         FROM (SELECT $1::uuid AS document_id) requested
         LEFT JOIN documents.doc_metadata metadata ON metadata.id = requested.document_id
         LEFT JOIN expenses.expense_documents link ON link.document_id = requested.document_id
         LEFT JOIN expenses.expense_tickets ticket
           ON ticket.id = COALESCE(link.ticket_id,
             CASE WHEN metadata.business_object_type = 'expense_ticket'
               THEN metadata.business_object_id ELSE NULL END)
         LEFT JOIN platform.company_profiles ticket_company
           ON ticket_company.id=ticket.company_id`,
        [documentId],
      );
      if (result.rows.length !== 1) {
        await client.query("COMMIT");
        return "hidden";
      }
      const row = result.rows[0];
      const isExpense = row?.business_object_type === "expense_ticket" || Boolean(row?.link_ticket_id);
      if (!isExpense) {
        await client.query("COMMIT");
        return row?.metadata_id ? "other" : "hidden";
      }
      const consistent = Boolean(row &&
        row.metadata_id && !row.metadata_deleted_at && row.business_object_type === "expense_ticket" &&
        row.business_object_id && row.link_ticket_id === row.business_object_id &&
        row.ticket_id === row.business_object_id && !row.ticket_deleted_at && row.ticket_company_id &&
        row.ticket_company_status === "active" &&
        row.owner_resolution_status !== "quarantined" && row.classification === "finance" &&
        row.metadata_document_type === row.link_document_type,
      );
      if (!consistent) {
        await client.query("COMMIT");
        return "hidden";
      }
      if (!row) throw new Error("Expense receipt classification invariant failed");
      const sameCompany = row.ticket_company_id === companyId;
      const metadataOnly = mode === "metadata";
      const authorized = row.requester_user_id === actor.id ||
        (sameCompany && actor.roles.includes(Roles.Admin)) ||
        (sameCompany && actor.roles.includes(Roles.FinanceManager) && row.finance_approver_id === actor.id) ||
        (sameCompany && actor.roles.includes(Roles.Reviewer) && row.manager_verifier_id === actor.id) ||
        (metadataOnly && sameCompany && actor.roles.includes(Roles.Auditor));
      await client.query("COMMIT");
      return authorized ? "expense-authorized" : "hidden";
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async classifyTenantMediaAccess(
    userId: UUID,
    documentId: UUID,
    mode: "metadata" | "raw" | "workflow",
  ): Promise<"other" | "media-authorized" | "hidden"> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const { actor, companyId } = await this.resolveExpenseActor(client, userId);
      const result = await client.query<{
        metadata_id: UUID | null;
        metadata_document_type: string | null;
        media_kind: "company_logo" | "profile_photo" | null;
        target_user_id: UUID | null;
        target_hierarchy_path: string | null;
      }>(
        `SELECT metadata.id AS metadata_id, metadata.document_type AS metadata_document_type,
                CASE
                  WHEN company.logo_document_id = metadata.id
                    AND metadata.document_type = 'company_logo'
                    AND metadata.business_object_type = 'company_profile'
                    AND metadata.business_object_id = company.id THEN 'company_logo'
                  WHEN target.profile_photo_document_id = metadata.id
                    AND target_pref.company_id = $2::uuid
                    AND metadata.document_type = 'profile_photo'
                    AND metadata.business_object_type = 'core_user'
                    AND metadata.business_object_id = target.id THEN 'profile_photo'
                  ELSE NULL
                END AS media_kind,
                target.id AS target_user_id, target.hierarchy_path AS target_hierarchy_path
         FROM (SELECT $1::uuid AS document_id) requested
         LEFT JOIN documents.doc_metadata metadata
           ON metadata.id = requested.document_id AND metadata.deleted_at IS NULL
         LEFT JOIN platform.company_profiles company
           ON company.id = $2::uuid AND company.status = 'active'
          AND company.logo_document_id = metadata.id
         LEFT JOIN core.users target
           ON target.profile_photo_document_id = metadata.id AND target.deleted_at IS NULL
         LEFT JOIN platform.user_session_preferences target_pref ON target_pref.user_id = target.id`,
        [documentId, companyId],
      );
      const row = result.rows[0];
      await client.query("COMMIT");
      if (!row?.metadata_id) return "hidden";
      if (!row.media_kind) {
        return row.metadata_document_type === "company_logo" || row.metadata_document_type === "profile_photo"
          ? "hidden"
          : "other";
      }
      if (mode === "workflow") return "hidden";
      if (row.media_kind === "company_logo") return "media-authorized";
      const privileged = actor.roles.some((role) =>
        role === Roles.Admin || role === Roles.Auditor || role === Roles.HRManager,
      );
      const subordinate = Boolean(
        row.target_hierarchy_path?.startsWith(`${actor.hierarchy_path}.`),
      );
      return row.target_user_id === actor.id || privileged || subordinate
        ? "media-authorized"
        : "hidden";
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async classifyEmsEmployeeDocumentAccess(
    userId: UUID,
    targetUserId: UUID,
    permission: "read" | "write",
  ): Promise<
    | { decision: "authorized"; actor: AuthUser }
    | { decision: "forbidden" | "hidden" }
  > {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const session = await this.resolveDurableSessionContext(client, userId, "ems.employee_documents");
      const target = await client.query<{ id: UUID; hierarchy_path: string }>(
        `SELECT target.id, target.hierarchy_path::text AS hierarchy_path
         FROM core.users target
         JOIN platform.user_session_preferences target_pref ON target_pref.user_id = target.id
         JOIN platform.company_profiles company
           ON company.id = target_pref.company_id AND company.status = 'active'
         WHERE target.id = $1 AND target.deleted_at IS NULL
           AND target_pref.company_id = $2`,
        [targetUserId, session.company.id],
      );
      await client.query("COMMIT");
      const currentTarget = target.rows[0];
      if (!currentTarget) return { decision: "hidden" };
      const isSelf = session.actor.id === currentTarget.id;
      const canManage = session.actor.roles.some(
        (role) => role === Roles.Admin || role === Roles.HRManager,
      );
      const canAudit = session.actor.roles.includes(Roles.Auditor);
      const isSubordinate = currentTarget.hierarchy_path.startsWith(
        `${session.actor.hierarchy_path}.`,
      );
      const allowed = permission === "write"
        ? isSelf || canManage
        : isSelf || canManage || canAudit || isSubordinate;
      return allowed
        ? { decision: "authorized", actor: session.actor }
        : { decision: "forbidden" };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async expenseDashboardContext(userId: UUID, filters: {
    status?: string; date_from?: string; date_to?: string;
  }): Promise<{
    actor: AuthUser; companyId: UUID; store: DataStore;
    aggregate: Record<string, string | number>;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const { actor, companyId } = await this.resolveExpenseActor(client, userId);
      if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
        throw badRequest("Expense date range is reversed");
      }
      const params: unknown[] = [
        userId, companyId,
        actor.roles.includes(Roles.Reviewer), actor.roles.includes(Roles.FinanceManager),
      ];
      const where = [
        "t.deleted_at IS NULL", "t.company_id IS NOT NULL",
        `(t.requester_user_id = $1::uuid OR
          (t.company_id = $2::uuid AND
            (($3::boolean AND t.manager_verifier_id = $1::uuid)
              OR ($4::boolean AND t.finance_approver_id = $1::uuid))))`,
      ];
      if (filters.status) { params.push(filters.status); where.push(`t.status = $${params.length}`); }
      if (filters.date_from) { params.push(filters.date_from); where.push(`t.created_at::date >= $${params.length}::date`); }
      if (filters.date_to) { params.push(filters.date_to); where.push(`t.created_at::date <= $${params.length}::date`); }
      const predicate = where.join(" AND ");
      const aggregate = await client.query<Record<string, string | number>>(`
        WITH visible AS (
          SELECT t.*, GREATEST(0, floor(extract(epoch FROM (now() - t.created_at)) / 3600)) AS age_hours
          FROM expenses.expense_tickets t WHERE ${predicate}
        )
        SELECT
          count(*) AS total_visible,
          count(*) FILTER (WHERE requester_user_id = $1) AS my_tickets,
          count(*) FILTER (WHERE $3::boolean AND company_id = $2 AND manager_verifier_id = $1
            AND status = 'Pending Manager Verification') AS manager_pending,
          count(*) FILTER (WHERE $4::boolean AND company_id = $2 AND finance_approver_id = $1
            AND status IN ('Manager Verified', 'Finance Hold', 'Clarification Required',
              'Finance Approved', 'Payment Released', 'Bills Submitted', 'Pending Adjustment')) AS finance_queue_count,
          count(*) FILTER (WHERE requester_user_id = $1 AND status IN
            ('Submitted', 'Pending Manager Verification', 'Manager Verified', 'Finance Hold',
             'Clarification Required', 'Finance Approved', 'Payment Released', 'Bills Submitted',
             'Pending Adjustment', 'Closed')) AS submitted,
          count(*) FILTER (WHERE requester_user_id = $1 AND status IN
            ('Pending Manager Verification', 'Manager Verified')) AS pending_approval,
          count(*) FILTER (WHERE requester_user_id = $1 AND status IN
            ('Finance Approved', 'Payment Released', 'Bills Submitted', 'Pending Adjustment', 'Closed')) AS approved,
          count(*) FILTER (WHERE requester_user_id = $1 AND status IN
            ('Manager Returned', 'Manager Rejected')) AS returned_or_rejected,
          count(*) FILTER (WHERE $4::boolean AND company_id = $2 AND finance_approver_id = $1
            AND status = 'Manager Verified') AS finance_pending,
          count(*) FILTER (WHERE $4::boolean AND company_id = $2 AND finance_approver_id = $1
            AND status = 'Finance Approved') AS payment_pending,
          count(*) FILTER (WHERE status IN
            ('Payment Released', 'Bills Submitted', 'Pending Adjustment')) AS settlement_pending,
          COALESCE(sum(estimated_amount), 0)::text AS visible_amount,
          COALESCE(sum(estimated_amount) FILTER (WHERE requester_user_id = $1), 0)::text AS mine_amount,
          COALESCE(sum(estimated_amount) FILTER (WHERE $4::boolean AND company_id = $2
            AND finance_approver_id = $1 AND status IN
            ('Manager Verified', 'Finance Hold', 'Clarification Required', 'Finance Approved',
             'Payment Released', 'Bills Submitted', 'Pending Adjustment')), 0)::text AS finance_queue_amount,
          COALESCE(sum(estimated_amount) FILTER (WHERE $4::boolean AND company_id = $2
            AND finance_approver_id = $1 AND status = 'Finance Approved'), 0)::text AS payment_pending_amount,
          count(*) FILTER (WHERE age_hours <= 24) AS aging_0_24_count,
          COALESCE(sum(estimated_amount) FILTER (WHERE age_hours <= 24), 0)::text AS aging_0_24_amount,
          count(*) FILTER (WHERE age_hours BETWEEN 25 AND 72) AS aging_24_72_count,
          COALESCE(sum(estimated_amount) FILTER (WHERE age_hours BETWEEN 25 AND 72), 0)::text AS aging_24_72_amount,
          count(*) FILTER (WHERE age_hours >= 73) AS aging_72_plus_count,
          COALESCE(sum(estimated_amount) FILTER (WHERE age_hours >= 73), 0)::text AS aging_72_plus_amount
        FROM visible`, params,
      );
      const ids = await client.query<{ id: UUID }>(
        `SELECT t.id FROM expenses.expense_tickets t WHERE ${predicate}
         ORDER BY t.updated_at DESC, t.id DESC LIMIT 10`, params,
      );
      const orderedIds = ids.rows.map((row) => row.id);
      const loaded = await this.loadTickets(client, undefined, undefined, undefined, orderedIds);
      const byId = new Map(loaded.map((ticket) => [ticket.id, ticket]));
      const tickets = orderedIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
      const store = await this.loadExpenseReadStore(client, companyId, tickets);
      await client.query("COMMIT");
      return { actor, companyId, store, aggregate: aggregate.rows[0] ?? {} };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async resolveExpenseActor(client: PoolClient, userId: UUID): Promise<{ actor: AuthUser; companyId: UUID }> {
    const session = await this.resolveDurableSessionContext(client, userId, "expenses.read");
    return { actor: session.actor, companyId: session.company.id };
  }

  private async lockReviewerRoutingActorAuthority(
    client: PoolClient,
    userId: UUID,
  ): Promise<void> {
    await client.query("SELECT id FROM core.users WHERE id=$1 FOR SHARE", [userId]);
    const actorPreference = await client.query<{ company_id: UUID | null }>(
      "SELECT company_id FROM platform.user_session_preferences WHERE user_id=$1 FOR SHARE",
      [userId],
    );
    await client.query(
      `SELECT ur.user_id FROM core.user_roles ur
       JOIN core.roles role ON role.role_key=ur.role_key
       WHERE ur.user_id=$1 FOR SHARE OF ur,role`,
      [userId],
    );
    if (actorPreference.rows[0]?.company_id) {
      await client.query(
        "SELECT id FROM platform.company_profiles WHERE id=$1 FOR SHARE",
        [actorPreference.rows[0].company_id],
      );
    }
  }

  private async resolveDurableSessionContext(
    client: PoolClient,
    userId: UUID,
    operation: string,
  ): Promise<DurableSessionContext> {
    const result = await client.query<{
      id: UUID;
      employee_code: string;
      email: string;
      full_name: string;
      department_id: UUID | null;
      designation_id: UUID | null;
      hierarchy_path: string;
      employment_status: AuthUser["employment_status"];
      email_verified_at: Date | null;
      email_verification_status: AuthUser["email_verification_status"];
      deleted_at: Date | null;
      roles: RoleKey[];
      preference_id: UUID | null;
      active_role: RoleKey | null;
      company_id: UUID | null;
      landing_page: string | null;
      preference_locale: string | null;
      preference_timezone: string | null;
      preference_created_at: Date | null;
      preference_updated_at: Date | null;
      preference_version: number | null;
      company_name: string | null;
      company_slug: string | null;
      website: string | null;
      industry: string | null;
      address: string | null;
      company_timezone: string | null;
      company_locale: string | null;
      currency: string | null;
      fiscal_year_start_month: number | null;
      working_week: string | null;
      work_hours_per_day: string | number | null;
      logo_label: string | null;
      logo_document_id: UUID | null;
      logo_url: string | null;
      logo_file_name: string | null;
      logo_mime_type: string | null;
      logo_size_bytes: string | number | null;
      company_status: CompanyProfileRecord["status"] | null;
      bootstrap_completed_at: Date | null;
      company_created_at: Date | null;
      company_updated_at: Date | null;
      company_version: number | null;
    }>(
      `SELECT u.id, u.employee_code, u.email, u.full_name, u.department_id,
              u.designation_id, u.hierarchy_path::text AS hierarchy_path,
              u.employment_status, u.email_verified_at, u.email_verification_status,
              u.deleted_at,
              pref.id AS preference_id, pref.active_role, pref.company_id,
              pref.landing_page, pref.locale AS preference_locale,
              pref.timezone AS preference_timezone, pref.created_at AS preference_created_at,
              pref.updated_at AS preference_updated_at, pref.version AS preference_version,
              company.company_name, company.company_slug, company.website, company.industry,
              company.address, company.timezone AS company_timezone,
              company.locale AS company_locale, company.currency,
              company.fiscal_year_start_month, company.working_week,
              company.work_hours_per_day, company.logo_label, company.logo_document_id,
              company.logo_url, company.logo_file_name, company.logo_mime_type,
              company.logo_size_bytes, company.status AS company_status,
              company.bootstrap_completed_at, company.created_at AS company_created_at,
              company.updated_at AS company_updated_at, company.version AS company_version,
              COALESCE(array_agg(DISTINCT ur.role_key) FILTER (
                WHERE ur.role_key IS NOT NULL AND ur.status = 'active'
                  AND ur.deleted_at IS NULL AND role.status = 'active'
                  AND role.deleted_at IS NULL
                  AND ur.effective_from <= CURRENT_DATE
                  AND (ur.effective_to IS NULL OR ur.effective_to >= CURRENT_DATE)
              ), '{}') AS roles
       FROM core.users u
       LEFT JOIN platform.user_session_preferences pref ON pref.user_id = u.id
       LEFT JOIN platform.company_profiles company ON company.id = pref.company_id
       LEFT JOIN core.user_roles ur ON ur.user_id = u.id
       LEFT JOIN core.roles role ON role.role_key = ur.role_key
       WHERE u.id = $1
       GROUP BY u.id, pref.id, company.id`,
      [userId],
    );
    const current = result.rows[0];
    if (!current || current.deleted_at || current.employment_status !== EmploymentStatuses.Active) {
      throw unauthorized("User account is inactive or blocked", { user_id: userId, operation });
    }
    if (!current.preference_id || !current.company_id || !current.active_role) {
      throw companyContextRequired({ user_id: userId, company_id: current.company_id, operation });
    }
    if (!current.roles.includes(current.active_role)) {
      throw forbidden("Selected role is not assigned to this user.", {
        user_id: userId, company_id: current.company_id, active_role: current.active_role, operation,
      });
    }
    if (current.company_status !== "active" || !current.company_name || !current.company_slug ||
        !current.company_timezone || !current.company_locale || !current.currency ||
        !current.working_week || current.fiscal_year_start_month === null ||
        current.work_hours_per_day === null || !current.preference_locale ||
        !current.preference_timezone || !current.landing_page ||
        !current.preference_created_at || !current.preference_updated_at ||
        current.preference_version === null || !current.company_created_at ||
        !current.company_updated_at || current.company_version === null) {
      throw companyContextRequired({ user_id: userId, company_id: current.company_id, operation });
    }
    const actor: AuthUser = {
      id: current.id,
      employee_code: current.employee_code,
      email: current.email,
      full_name: current.full_name,
      department_id: current.department_id as UUID,
      designation_id: current.designation_id as UUID,
      hierarchy_path: current.hierarchy_path,
      employment_status: current.employment_status,
      roles: current.roles,
      email_verified_at: asIsoOrNull(current.email_verified_at),
      email_verification_status: current.email_verification_status ?? "unverified",
    };
    return {
      actor,
      activeRole: current.active_role,
      preference: {
        id: current.preference_id,
        user_id: current.id,
        active_role: current.active_role,
        company_id: current.company_id,
        landing_page: current.landing_page,
        locale: current.preference_locale,
        timezone: current.preference_timezone,
        created_at: asIso(current.preference_created_at),
        updated_at: asIso(current.preference_updated_at),
        version: current.preference_version,
      },
      company: {
        id: current.company_id,
        company_name: current.company_name,
        company_slug: current.company_slug,
        website: current.website,
        industry: current.industry,
        address: current.address,
        timezone: current.company_timezone,
        locale: current.company_locale,
        currency: current.currency,
        fiscal_year_start_month: current.fiscal_year_start_month,
        working_week: current.working_week,
        work_hours_per_day: Number(current.work_hours_per_day),
        logo_label: current.logo_label,
        logo_document_id: current.logo_document_id,
        logo_url: current.logo_url,
        logo_file_name: current.logo_file_name,
        logo_mime_type: current.logo_mime_type,
        logo_size_bytes: current.logo_size_bytes === null ? null : Number(current.logo_size_bytes),
        status: current.company_status,
        bootstrap_completed_at: asIsoOrNull(current.bootstrap_completed_at),
        created_at: asIso(current.company_created_at),
        updated_at: asIso(current.company_updated_at),
        version: current.company_version,
      },
    };
  }

  private async loadExpenseReadStore(
    client: PoolClient,
    companyId: UUID,
    tickets: ExpenseTicket[],
    options: {
      displayCompanyIds?: readonly UUID[];
      includeDisplayPreferences?: boolean;
    } = {},
  ): Promise<DataStore> {
      const ticketIds = tickets.map((ticket) => ticket.id);
      // node-postgres runs one statement at a time per client. Await each
      // query to preserve its execution contract and the same SQL snapshot.
      const lineItems = await this.loadLineItems(client, ticketIds);
      const expenseApprovals = await this.loadExpenseApprovals(client, ticketIds);
      const auditLogs = await this.loadAuditLogs(client, undefined, ticketIds);
      const expenseDocuments = await this.loadExpenseDocuments(client, ticketIds);
      const documentIds = expenseDocuments.map((document) => document.document_id);
      const documents = await this.loadDocuments(client, documentIds);
      const documentVersions = await this.loadDocumentVersions(client, documentIds);
      const payments = await this.loadPayments(client, ticketIds);
      const displayUserIds = Array.from(new Set([
        ...tickets.flatMap((ticket) => [ticket.requester_user_id, ticket.manager_verifier_id, ticket.finance_approver_id]),
        ...auditLogs.map((audit) => audit.actor_user_id),
      ].filter((id): id is UUID => Boolean(id))));
      const departmentIds = Array.from(new Set(tickets.map((ticket) => ticket.department_id)));
      const displayCompanyIds = options.displayCompanyIds?.length
        ? options.displayCompanyIds
        : [companyId];
      const users: CoreUser[] = [];
      const userSessionPreferences: UserSessionPreferenceRecord[] = [];
      const departments: Department[] = [];
      for (const displayCompanyId of displayCompanyIds) {
        users.push(...await this.loadUsers(client, displayCompanyId, displayUserIds));
        if (options.includeDisplayPreferences) {
          userSessionPreferences.push(...await this.loadUserSessionPreferences(
            client,
            displayCompanyId,
            displayUserIds,
          ));
        }
        departments.push(...await this.loadDepartments(
          client,
          displayCompanyId,
          departmentIds,
        ));
      }
      // Start with no hydrated tenant collections. The shared process store
      // contains other companies' users/preferences/documents and must never
      // be reachable through this request-local service instance.
      const emptyCollections = Object.fromEntries(
        Object.entries(this.store)
          .filter(([, value]) => Array.isArray(value))
          .map(([key]) => [key, []]),
      );
      return {
          ...this.store,
          ...emptyCollections,
          tickets, lineItems, expenseApprovals, auditLogs, expenseDocuments,
          documents, documentVersions, payments,
          users, userSessionPreferences, departments,
          financeGovernanceConfig: null,
          adminSecuritySettings: buildDefaultAdminSecuritySettings(new Date().toISOString()),
          processedEvents: new Set<string>(),
          sessionStore: new MemorySessionStore(),
          objectStorage: null,
          persistence: null,
          pgPool: null,
          valkey: null,
          nextOutboxId: 1,
          nextTicketNo: 1,
      };
  }

  private async loadExpenseCommandStore(
    client: PoolClient,
    companyId: UUID,
    tickets: ExpenseTicket[],
  ): Promise<DataStore> {
    const store = await this.loadExpenseReadStore(client, companyId, tickets);
    const users = await this.loadUsers(client, companyId);
    const userIds = users.map((user) => user.id);
    const activeRoleRows = userIds.length
      ? await client.query<{ user_id: UUID; role_key: RoleKey }>(
          `SELECT ur.user_id, ur.role_key
           FROM core.user_roles ur
           JOIN core.roles role ON role.role_key = ur.role_key
           WHERE ur.user_id = ANY($1::uuid[])
             AND ur.status = 'active' AND ur.deleted_at IS NULL
             AND role.status = 'active' AND role.deleted_at IS NULL
             AND ur.effective_from <= CURRENT_DATE
             AND (ur.effective_to IS NULL OR ur.effective_to >= CURRENT_DATE)
           ORDER BY ur.user_id, ur.role_key`,
          [userIds],
        )
      : { rows: [] as Array<{ user_id: UUID; role_key: RoleKey }> };
    const rolesByUser = new Map<UUID, RoleKey[]>();
    for (const row of activeRoleRows.rows) {
      const roles = rolesByUser.get(row.user_id) ?? [];
      roles.push(row.role_key);
      rolesByUser.set(row.user_id, roles);
    }
    const companyProfiles = await this.loadCompanyProfiles(client, companyId);
    const userSessionPreferences = await this.loadUserSessionPreferences(
      client,
      companyId,
    );
    const managerBackupAssignments = (
      await this.loadManagerBackupAssignments(client, companyId)
    ).filter(
      (assignment) =>
        userIds.includes(assignment.employee_user_id) &&
        userIds.includes(assignment.backup_manager_user_id),
    );
    const ticketCounter = await client.query<{ next_ticket_no: number }>(
      `SELECT COALESCE(MAX(
         CASE WHEN ticket_no ~ '^EXP-2026-[0-9]+$'
           THEN substring(ticket_no FROM '([0-9]+)$')::integer ELSE 0 END
       ), 0) + 1 AS next_ticket_no
       FROM expenses.expense_tickets`,
    );
    return {
      ...store,
      users: users.map((user) => ({
        ...user,
        roles: rolesByUser.get(user.id) ?? [],
      })),
      companyProfiles,
      userSessionPreferences,
      financeGovernanceConfig: await this.loadFinanceGovernanceConfig(client),
      managerBackupAssignments,
      nextTicketNo: Number(ticketCounter.rows[0]?.next_ticket_no ?? 1),
    };
  }

  async reload(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const loaded = createMemoryDataStore();
      loaded.kind = "postgres";
      loaded.departments = await this.loadDepartments(client);
      loaded.designations = await this.loadDesignations(client);
      loaded.rbacRoles = await this.loadRbacRoles(client);
      loaded.rbacRolePermissions = await this.loadRbacRolePermissions(client);
      loaded.adminWorkflows = await this.loadAdminWorkflows(client);
      loaded.adminPolicies = await this.loadAdminPolicies(client);
      loaded.adminEmailTemplates = await this.loadAdminEmailTemplates(client);
      loaded.adminNotificationChannels =
        await this.loadAdminNotificationChannels(client);
      loaded.adminSecuritySettings =
        await this.loadAdminSecuritySettings(client);
      loaded.adminMasterDataItems = await this.loadAdminMasterDataItems(client);
      loaded.users = await this.loadUsers(client);
      loaded.userCredentials = await this.loadUserCredentials(client);
      loaded.authTokens = await this.loadAuthTokens(client);
      loaded.companyProfiles = await this.loadCompanyProfiles(client);
      loaded.userSessionPreferences =
        await this.loadUserSessionPreferences(client);
      loaded.financeGovernanceConfig =
        await this.loadFinanceGovernanceConfig(client);
      loaded.managerBackupAssignments =
        await this.loadManagerBackupAssignments(client);
      loaded.tickets = await this.loadTickets(client);
      loaded.lineItems = await this.loadLineItems(client);
      loaded.expenseApprovals = await this.loadExpenseApprovals(client);
      loaded.auditLogs = await this.loadAuditLogs(client);
      loaded.expenseDocuments = await this.loadExpenseDocuments(client);
      loaded.payments = await this.loadPayments(client);
      loaded.documents = await this.loadDocuments(client);
      loaded.documentVersions = await this.loadDocumentVersions(client);
      loaded.documentAccessLogs = await this.loadDocumentAccessLogs(client);
      loaded.notifications = await this.loadNotifications(client);
      loaded.emailDeliveries = await this.loadEmailDeliveries(client);
      loaded.emailEvents = await this.loadEmailEvents(client);
      loaded.outbox = await this.loadOutbox(client);
      loaded.assets = await this.loadAssets(client);
      loaded.assetAssignments = await this.loadAssetAssignments(client);
      loaded.assetStateEvents = await this.loadAssetStateEvents(client);
      loaded.assetRequests = await this.loadAssetRequests(client);
      loaded.assetAcknowledgements =
        await this.loadAssetAcknowledgements(client);
      loaded.assetMaintenanceRecords =
        await this.loadAssetMaintenanceRecords(client);
      loaded.assetVendors = await this.loadAssetVendors(client);
      loaded.assetRecoveryTickets = await this.loadAssetRecoveryTickets(client);
      loaded.licenseEntitlements = await this.loadLicenseEntitlements(client);
      loaded.licenseActivations = await this.loadLicenseActivations(client);
      loaded.compromisedKeys = await this.loadCompromisedKeys(client);
      loaded.workSegments = await this.loadWorkSegments(client);
      loaded.workflowDefinitions = await this.loadWorkflowDefinitions(client);
      loaded.timesheetSubmissions = await this.loadTimesheetSubmissions(client);
      loaded.timesheetActions = await this.loadTimesheetActions(client);
      loaded.projects = await this.loadProjects(client);
      loaded.projectMembers = await this.loadProjectMembers(client);
      loaded.projectAllocations = await this.loadProjectAllocations(client);
      loaded.projectMilestones = await this.loadProjectMilestones(client);
      loaded.helpdeskCategories = await this.loadHelpdeskCategories(client);
      loaded.helpdeskTickets = await this.loadHelpdeskTickets(client);
      loaded.helpdeskComments = await this.loadHelpdeskComments(client);
      loaded.helpdeskAttachments = await this.loadHelpdeskAttachments(client);
      loaded.helpdeskEvents = await this.loadHelpdeskEvents(client);
      loaded.attendancePunches = await this.loadAttendancePunches(client);
      loaded.attendanceDayRecords = await this.loadAttendanceDayRecords(client);
      loaded.attendanceRegularizations =
        await this.loadAttendanceRegularizations(client);
      loaded.attendanceRegularizationActions =
        await this.loadAttendanceRegularizationActions(client);
      loaded.attendanceRegularizationCorrectionApplications =
        await this.loadAttendanceRegularizationCorrectionApplications(client);
      loaded.leaveRequests = await this.loadLeaveRequests(client);
      loaded.wfhRequests = await this.loadWfhRequests(client);
      loaded.holidays = await this.loadHolidays(client);
      loaded.emsEmployeeProfiles = await this.loadEmsEmployeeProfiles(client);
      loaded.emsProfileChangeRequests =
        await this.loadEmsProfileChangeRequests(client);
      loaded.emsServiceRequests = await this.loadEmsServiceRequests(client);
      loaded.emsLetters = await this.loadEmsLetters(client);
      loaded.emsPolicies = await this.loadEmsPolicies(client);
      loaded.emsPolicyAcknowledgements =
        await this.loadEmsPolicyAcknowledgements(client);
      loaded.emsAdminChecklists = await this.loadEmsAdminChecklists(client);
      loaded.emsProbationReviews = await this.loadEmsProbationReviews(client);
      loaded.nextOutboxId = Math.max(
        1,
        ...loaded.outbox.map((event) => event.id + 1),
      );
      loaded.nextTicketNo = this.nextTicketNumber(loaded.tickets);
      copyData(this.store, loaded);
    } finally {
      client.release();
    }
  }

  async flush(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Routing readers acquire this lock before row locks. A full-store
      // writer must do the same so it cannot hold a user/preference row
      // while waiting for the global governance lock.
      await lockExpenseFinanceGovernanceWriter(client);
      await this.flushCore(client);
      await this.flushPlatform(client, true);
      // Expense mutations use request-local transaction commands. A generic
      // response-end flush must never regain authority over the fenced tables.
      await this.flushDocuments(client);
      await this.flushTimesheets(client);
      await this.flushProjects(client);
      await this.flushHelpdesk(client);
      await this.flushAttendance(client);
      await this.flushLeaveWfh(client);
      await this.flushEms(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async flushInitialSeed(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(76001, 1007)");
      const existing = await client.query<{ occupied: boolean }>(`
        SELECT EXISTS (SELECT 1 FROM core.users)
          OR EXISTS (SELECT 1 FROM expenses.expense_tickets)
          OR EXISTS (SELECT 1 FROM expenses.expense_line_items)
          OR EXISTS (SELECT 1 FROM expenses.expense_approvals)
          OR EXISTS (SELECT 1 FROM expenses.expense_audit_logs)
          OR EXISTS (SELECT 1 FROM expenses.expense_documents)
          OR EXISTS (SELECT 1 FROM expenses.expense_payments)
          OR EXISTS (SELECT 1 FROM expenses.employee_reviewer_mappings)
          OR EXISTS (SELECT 1 FROM expenses.expense_policy_rules)
          OR EXISTS (SELECT 1 FROM expenses.expense_owner_repair_audit)
          OR EXISTS (SELECT 1 FROM expenses.expense_command_results)
          AS occupied
      `);
      if (existing.rows[0]?.occupied) {
        throw new Error("Initial seed requires an empty user and expense database");
      }
      await client.query("SELECT set_config('app.expense_command_v1', 'on', true)");
      await lockExpenseCombinedRoutingWriter(
        client,
        this.store.managerBackupAssignments.map(
          (mapping) => mapping.employee_user_id,
        ),
      );
      await this.flushCore(client);
      await this.flushPlatform(client, true, true);
      await this.flushExpenses(client, this.store, true);
      await this.flushDocuments(client);
      await client.query("SELECT set_config('hrms.asset_writer_v2', 'on', true)");
      await this.flushAssets(client, this.store);
      await this.flushTimesheets(client);
      await this.flushProjects(client);
      await this.flushHelpdesk(client);
      await this.flushAttendance(client);
      await this.flushLeaveWfh(client);
      await this.flushEms(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async flushAuth(options: AuthPersistenceFlushOptions = {}): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.flushAuthCore(client, options);
      await this.flushAuthPlatform(client, options);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async flushCompanyBootstrap(
    options: AuthPersistenceFlushOptions = {},
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.flushCoreMasterData(client);
      await this.flushAuthCore(client, options);
      await this.flushAuthPlatform(client, options);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async flushCompanyLogo(
    options: CompanyLogoPersistenceFlushOptions = {},
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.flushCompanyProfiles(client, optionalSet(options.companyIds));
      const documentIds = optionalSet(options.documentIds);
      await this.flushDocuments(client, documentIds);
      await this.flushOutbox(client, documentIds);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async flushDomain(
    domain: PersistenceDomain,
    options: DomainPersistenceFlushOptions = {},
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const aggregateIds = optionalSet(options.aggregateIds);
      switch (domain) {
        case "core":
          await this.flushAuthCore(client, { userIds: options.userIds });
          await this.flushAuthPlatform(client, {
            userIds: options.userIds,
            companyIds: options.companyIds,
          });
          if (options.documentIds?.length) {
            await this.flushDocuments(client, optionalSet(options.documentIds));
          }
          await this.flushOutbox(
            client,
            aggregateIds ?? optionalSet(options.userIds),
          );
          break;
        case "platform":
          await this.flushPlatform(client);
          break;
        case "expenses":
          throw new Error("Expense mutations require a transaction-owned command");
        case "documents":
          await this.flushDocuments(client, optionalSet(options.documentIds));
          await this.flushOutbox(
            client,
            aggregateIds ?? optionalSet(options.documentIds),
          );
          break;
        case "assets":
          throw new Error("Asset writes require an assetCommand transaction.");
        case "timesheets":
          await this.flushTimesheets(client);
          await this.flushOutbox(client, aggregateIds);
          break;
        case "projects":
          await this.flushProjects(client);
          await this.flushOutbox(client, aggregateIds);
          break;
        case "helpdesk":
          await this.flushHelpdesk(client);
          await this.flushOutbox(client, aggregateIds);
          break;
        case "attendance":
          await this.flushAttendance(client);
          await this.flushOutbox(client, aggregateIds);
          break;
        case "leave-wfh":
          await this.flushLeaveWfh(client);
          await this.flushOutbox(client, aggregateIds);
          break;
        case "ems":
          await this.flushEms(client, options);
          await this.flushOutbox(client, aggregateIds);
          if (options.documentIds?.length) {
            await this.flushDocuments(client, optionalSet(options.documentIds));
          }
          break;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    this.store.valkey?.disconnect();
    await this.pool.end();
  }

  private nextTicketNumber(tickets: readonly ExpenseTicket[]): number {
    const max = tickets.reduce((current, ticket) => {
      const match = /EXP-\d{4}-(\d+)/u.exec(ticket.ticket_no);
      return Math.max(current, match ? Number(match[1]) : 0);
    }, 0);
    return max + 1;
  }

  private async flushAuthPlatform(
    client: PoolClient,
    options: AuthPersistenceFlushOptions,
  ): Promise<void> {
    const companyIds = optionalSet(options.companyIds);
    const userIds = optionalSet(options.userIds);

    await this.flushCompanyProfiles(client, companyIds);
    for (const preference of this.store.userSessionPreferences) {
      if (userIds && !userIds.has(preference.user_id)) continue;
      await client.query(
        `INSERT INTO platform.user_session_preferences (
          id, user_id, active_role, company_id, landing_page, locale, timezone, created_at, updated_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id) DO UPDATE
        SET active_role = EXCLUDED.active_role, company_id = EXCLUDED.company_id,
            landing_page = EXCLUDED.landing_page, locale = EXCLUDED.locale,
            timezone = EXCLUDED.timezone, updated_at = EXCLUDED.updated_at, version = EXCLUDED.version`,
        [
          preference.id,
          preference.user_id,
          preference.active_role,
          preference.company_id,
          preference.landing_page,
          preference.locale,
          preference.timezone,
          preference.created_at,
          preference.updated_at,
          preference.version,
        ],
      );
    }
    for (const token of this.store.authTokens) {
      if (userIds && (!token.user_id || !userIds.has(token.user_id))) continue;
      if (
        !userIds &&
        companyIds &&
        (!token.company_id || !companyIds.has(token.company_id))
      )
        continue;
      await client.query(
        `INSERT INTO platform.auth_tokens (
          id, token_hash, token_type, user_id, email, company_id, status, expires_at, used_at,
          revoked_at, created_ip_hash, user_agent_hash, last_sent_at, send_count, created_at, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            used_at = EXCLUDED.used_at,
            revoked_at = EXCLUDED.revoked_at,
            last_sent_at = EXCLUDED.last_sent_at,
            send_count = EXCLUDED.send_count,
            metadata = EXCLUDED.metadata`,
        [
          token.id,
          token.token_hash,
          token.token_type,
          token.user_id,
          token.email,
          token.company_id,
          token.status,
          token.expires_at,
          token.used_at,
          token.revoked_at,
          token.created_ip_hash,
          token.user_agent_hash,
          token.last_sent_at,
          token.send_count,
          token.created_at,
          JSON.stringify(token.metadata),
        ],
      );
    }
    for (const delivery of this.store.emailDeliveries) {
      if (userIds && (!delivery.user_id || !userIds.has(delivery.user_id)))
        continue;
      await client.query(
        `INSERT INTO platform.email_deliveries (
          id, provider, template_key, purpose, user_id, email, subject, status, provider_email_id,
          idempotency_key, error_code, error_message, queued_at, sent_at, delivered_at,
          failed_at, bounced_at, complained_at, metadata, created_at, updated_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21, $22)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            provider_email_id = EXCLUDED.provider_email_id,
            error_code = EXCLUDED.error_code,
            error_message = EXCLUDED.error_message,
            sent_at = EXCLUDED.sent_at,
            delivered_at = EXCLUDED.delivered_at,
            failed_at = EXCLUDED.failed_at,
            bounced_at = EXCLUDED.bounced_at,
            complained_at = EXCLUDED.complained_at,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at,
            version = EXCLUDED.version`,
        [
          delivery.id,
          delivery.provider,
          delivery.template_key,
          delivery.purpose,
          delivery.user_id,
          delivery.email,
          delivery.subject,
          delivery.status,
          delivery.provider_email_id,
          delivery.idempotency_key,
          delivery.error_code,
          delivery.error_message,
          delivery.queued_at,
          delivery.sent_at,
          delivery.delivered_at,
          delivery.failed_at,
          delivery.bounced_at,
          delivery.complained_at,
          JSON.stringify(delivery.metadata),
          delivery.created_at,
          delivery.updated_at,
          delivery.version,
        ],
      );
    }
  }

  private async flushCompanyProfiles(
    client: PoolClient,
    companyIds?: ReadonlySet<string>,
  ): Promise<void> {
    for (const company of this.store.companyProfiles) {
      if (companyIds && !companyIds.has(company.id)) continue;
      await client.query(
        `INSERT INTO platform.company_profiles (
          id, company_name, company_slug, website, industry, address, timezone, locale, currency,
          fiscal_year_start_month, working_week, work_hours_per_day, logo_label,
          logo_document_id, logo_url, logo_file_name, logo_mime_type, logo_size_bytes,
          status, bootstrap_completed_at, created_at, updated_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        ON CONFLICT (id) DO UPDATE
        SET company_name = EXCLUDED.company_name, website = EXCLUDED.website,
            industry = EXCLUDED.industry, address = EXCLUDED.address, timezone = EXCLUDED.timezone,
            locale = EXCLUDED.locale, currency = EXCLUDED.currency,
            fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
            working_week = EXCLUDED.working_week, work_hours_per_day = EXCLUDED.work_hours_per_day,
            logo_label = EXCLUDED.logo_label,
            logo_document_id = EXCLUDED.logo_document_id,
            logo_url = EXCLUDED.logo_url,
            logo_file_name = EXCLUDED.logo_file_name,
            logo_mime_type = EXCLUDED.logo_mime_type,
            logo_size_bytes = EXCLUDED.logo_size_bytes,
            status = EXCLUDED.status, bootstrap_completed_at = EXCLUDED.bootstrap_completed_at,
            updated_at = EXCLUDED.updated_at, version = EXCLUDED.version`,
        [
          company.id,
          company.company_name,
          company.company_slug,
          company.website,
          company.industry,
          company.address,
          company.timezone,
          company.locale,
          company.currency,
          company.fiscal_year_start_month,
          company.working_week,
          company.work_hours_per_day,
          company.logo_label,
          company.logo_document_id,
          company.logo_url,
          company.logo_file_name,
          company.logo_mime_type,
          company.logo_size_bytes,
          company.status,
          company.bootstrap_completed_at,
          company.created_at,
          company.updated_at,
          company.version,
        ],
      );
    }
  }

  private async loadDepartments(client: PoolClient, companyId?: UUID, departmentIds?: readonly UUID[]): Promise<Department[]> {
    const { rows } = await client.query(
      `SELECT id, company_id, department_code, name, cost_center, parent_department_id,
              director_user_id, status, deleted_at, version
       FROM core.departments
       ${companyId ? `WHERE company_id = $1 AND deleted_at IS NULL
         ${departmentIds ? "AND id = ANY($2::uuid[])" : ""}` : ""}
       ORDER BY department_code`,
      companyId ? departmentIds ? [companyId, departmentIds] : [companyId] : [],
    );
    return rows.map((row) => ({
      ...row,
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadDesignations(client: PoolClient): Promise<Designation[]> {
    const { rows } = await client.query(
      "SELECT id, company_id, designation_code, title, level, status, deleted_at, version FROM core.designations ORDER BY level NULLS LAST, designation_code",
    );
    return rows.map((row) => ({
      ...row,
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadRbacRoles(client: PoolClient) {
    const { rows } = await client.query(
      "SELECT id, role_key, name, description, status, builtin, created_at, updated_at, deleted_at, version FROM core.roles ORDER BY role_key",
    );
    return rows.map((row) => ({
      id: row.id,
      role_key: row.role_key,
      name: row.name,
      description: row.description,
      status: row.status,
      builtin: row.builtin,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version,
    }));
  }

  private async loadRbacRolePermissions(client: PoolClient) {
    const { rows } = await client.query(
      "SELECT id, role_key, permission_id, status, created_at, updated_at, deleted_at FROM core.role_permissions ORDER BY role_key, permission_id",
    );
    return rows.map((row) => ({
      id: row.id,
      role_key: row.role_key,
      permission_id: row.permission_id,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadAdminWorkflows(
    client: PoolClient,
  ): Promise<AdminWorkflowConfigRecord[]> {
    const { rows } = await client.query(`
      SELECT id, workflow_key, module, label, status, stages, created_at, updated_at, deleted_at, version
      FROM platform.admin_workflows
      ORDER BY workflow_key
    `);
    return rows.map((row) => ({
      id: row.id,
      workflow_key: row.workflow_key,
      module: row.module,
      label: row.label,
      status: row.status,
      stages: Array.isArray(row.stages) ? row.stages : [],
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version,
    }));
  }

  private async loadAdminPolicies(
    client: PoolClient,
  ): Promise<AdminPolicyConfigRecord[]> {
    const { rows } = await client.query(`
      SELECT id, company_id, policy_key, module, label, status, config, created_at, updated_at, deleted_at, version
      FROM platform.admin_policies
      ORDER BY policy_key
    `);
    return rows.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      policy_key: row.policy_key,
      module: row.module,
      label: row.label,
      status: row.status,
      config: json(row.config),
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version,
    }));
  }

  private async loadAdminEmailTemplates(
    client: PoolClient,
  ): Promise<AdminEmailTemplateRecord[]> {
    const { rows } = await client.query(`
      SELECT id, template_key, module, name, subject, body, locale, status, created_at, updated_at, deleted_at, version
      FROM platform.admin_email_templates
      ORDER BY template_key
    `);
    return rows.map((row) => ({
      id: row.id,
      template_key: row.template_key,
      module: row.module,
      name: row.name,
      subject: row.subject,
      body: row.body,
      locale: row.locale,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version,
    }));
  }

  private async loadAdminNotificationChannels(
    client: PoolClient,
  ): Promise<AdminNotificationChannelRecord[]> {
    const { rows } = await client.query(`
      SELECT id, event_key, module, label, in_app_enabled, email_enabled, push_enabled, status, created_at, updated_at, deleted_at, version
      FROM platform.admin_notification_channels
      ORDER BY event_key
    `);
    return rows.map((row) => ({
      id: row.id,
      event_key: row.event_key,
      module: row.module,
      label: row.label,
      in_app_enabled: row.in_app_enabled,
      email_enabled: row.email_enabled,
      push_enabled: row.push_enabled,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version,
    }));
  }

  private async loadAdminSecuritySettings(
    client: PoolClient,
  ): Promise<AdminSecuritySettingsRecord> {
    const { rows } = await client.query(`
      SELECT
        id, settings_key, password_min_length, password_require_special, password_require_number,
        password_expiry_days, session_timeout_minutes, login_attempt_limit, mfa_enabled,
        audit_role_changes, ip_device_audit_enabled, created_at, updated_at, deleted_at, version
      FROM platform.admin_security_settings
      WHERE settings_key = 'default'
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) {
      return buildDefaultAdminSecuritySettings(new Date().toISOString());
    }
    return {
      id: row.id,
      settings_key: "default",
      password_min_length: row.password_min_length,
      password_require_special: row.password_require_special,
      password_require_number: row.password_require_number,
      password_expiry_days: row.password_expiry_days,
      session_timeout_minutes: row.session_timeout_minutes,
      login_attempt_limit: row.login_attempt_limit,
      mfa_enabled: false,
      audit_role_changes: row.audit_role_changes,
      ip_device_audit_enabled: row.ip_device_audit_enabled,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version,
    };
  }

  private async loadAdminMasterDataItems(
    client: PoolClient,
  ): Promise<AdminMasterDataItemRecord[]> {
    const { rows } = await client.query(`
      SELECT id, master_key, code, name, description, status, sort_order, metadata, created_at, updated_at, deleted_at, version
      FROM platform.admin_master_data_items
      ORDER BY master_key, sort_order, name
    `);
    if (rows.length === 0) {
      return buildDefaultAdminMasterDataItems(new Date().toISOString());
    }
    return rows.map((row) => ({
      id: row.id,
      master_key: row.master_key,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status,
      sort_order: row.sort_order,
      metadata: json(row.metadata),
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version,
    }));
  }

  private async loadUsers(
    client: PoolClient,
    companyId?: UUID,
    userIds?: readonly UUID[],
    limit?: number,
  ): Promise<CoreUser[]> {
    const params: unknown[] = [];
    if (companyId) params.push(companyId);
    if (userIds) params.push(userIds);
    if (limit) params.push(limit);
    const { rows } = await client.query(`
      SELECT
        u.id, u.employee_code, u.email, u.full_name, u.department_id, u.designation_id,
        u.manager_user_id, u.hierarchy_path::text AS hierarchy_path, u.employment_status,
        u.email_verified_at, u.email_verification_status,
        u.profile_photo_document_id, u.profile_photo_url,
        u.timezone, u.joined_on, u.terminated_on, u.deleted_at, u.version,
        COALESCE(array_agg(DISTINCT ur.role_key) FILTER (WHERE ur.role_key IS NOT NULL AND ur.status = 'active' AND ur.deleted_at IS NULL), '{}') AS roles
      FROM core.users u
      ${companyId ? "JOIN platform.user_session_preferences pref ON pref.user_id = u.id AND pref.company_id = $1" : ""}
      LEFT JOIN core.user_roles ur ON ur.user_id = u.id
      ${companyId ? `WHERE u.deleted_at IS NULL
        ${userIds ? "AND u.id = ANY($2::uuid[])" : ""}` : ""}
      GROUP BY u.id
      ORDER BY u.employee_code
      ${limit ? `LIMIT $${params.length}::integer` : ""}
    `, params);
    return rows.map((row) => ({
      ...row,
      roles: row.roles as RoleKey[],
      email_verified_at: asIsoOrNull(row.email_verified_at),
      email_verification_status: row.email_verification_status ?? "unverified",
      joined_on: asDateOrNull(row.joined_on),
      terminated_on: asDateOrNull(row.terminated_on),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadUserCredentials(
    client: PoolClient,
  ): Promise<DataStore["userCredentials"]> {
    const { rows } = await client.query(`
      SELECT id, user_id, password_hash, status, created_at, updated_at, deleted_at
      FROM platform.user_credentials
      WHERE deleted_at IS NULL
      ORDER BY user_id
    `);
    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      password_hash: row.password_hash,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadAuthTokens(client: PoolClient): Promise<AuthTokenRecord[]> {
    const { rows } = await client.query(`
      SELECT id, token_hash, token_type, user_id, email, company_id, status, expires_at, used_at,
        revoked_at, created_ip_hash, user_agent_hash, last_sent_at, send_count, created_at, metadata
      FROM platform.auth_tokens
      ORDER BY created_at, id
    `);
    return rows.map((row) => ({
      id: row.id,
      token_hash: row.token_hash,
      token_type: row.token_type,
      user_id: row.user_id,
      email: row.email,
      company_id: row.company_id,
      status: row.status,
      expires_at: asIso(row.expires_at),
      used_at: asIsoOrNull(row.used_at),
      revoked_at: asIsoOrNull(row.revoked_at),
      created_ip_hash: row.created_ip_hash,
      user_agent_hash: row.user_agent_hash,
      last_sent_at: asIsoOrNull(row.last_sent_at),
      send_count: row.send_count ?? 0,
      created_at: asIso(row.created_at),
      metadata: json(row.metadata),
    }));
  }

  private async loadCompanyProfiles(
    client: PoolClient,
    companyId?: UUID,
  ): Promise<CompanyProfileRecord[]> {
    const { rows } = await client.query(`
      SELECT id, company_name, company_slug, website, industry, address, timezone, locale, currency,
        fiscal_year_start_month, working_week, work_hours_per_day, logo_label,
        logo_document_id, logo_url, logo_file_name, logo_mime_type, logo_size_bytes,
        status, bootstrap_completed_at, created_at, updated_at, version
      FROM platform.company_profiles
      ${companyId ? "WHERE id = $1" : ""}
      ORDER BY created_at, id
    `, companyId ? [companyId] : []);
    return rows.map((row) => ({
      id: row.id,
      company_name: row.company_name,
      company_slug: row.company_slug,
      website: row.website,
      industry: row.industry,
      address: row.address,
      timezone: row.timezone,
      locale: row.locale,
      currency: row.currency,
      fiscal_year_start_month: row.fiscal_year_start_month,
      working_week: row.working_week,
      work_hours_per_day: Number(row.work_hours_per_day),
      logo_label: row.logo_label,
      logo_document_id: row.logo_document_id,
      logo_url: row.logo_url,
      logo_file_name: row.logo_file_name,
      logo_mime_type: row.logo_mime_type,
      logo_size_bytes:
        row.logo_size_bytes === null ? null : Number(row.logo_size_bytes),
      status: row.status,
      bootstrap_completed_at: asIsoOrNull(row.bootstrap_completed_at),
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      version: row.version,
    }));
  }

  private async loadUserSessionPreferences(
    client: PoolClient,
    companyId?: UUID,
    userIds?: readonly UUID[],
  ): Promise<UserSessionPreferenceRecord[]> {
    const params: unknown[] = [];
    if (companyId) params.push(companyId);
    if (userIds) params.push(userIds);
    const { rows } = await client.query(`
      SELECT id, user_id, active_role, company_id, landing_page, locale, timezone, created_at, updated_at, version
      FROM platform.user_session_preferences
      ${companyId ? `WHERE company_id = $1${userIds ? " AND user_id = ANY($2::uuid[])" : ""}` : userIds ? "WHERE user_id = ANY($1::uuid[])" : ""}
      ORDER BY updated_at, id
    `, params);
    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      active_role: row.active_role,
      company_id: row.company_id,
      landing_page: row.landing_page,
      locale: row.locale,
      timezone: row.timezone,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      version: row.version,
    }));
  }

  private async loadFinanceGovernanceConfig(
    client: PoolClient,
  ): Promise<FinanceGovernanceConfig | null> {
    const { rows } = await client.query(`
      SELECT
        id,
        scope_key,
        primary_finance_manager_user_id,
        finance_self_request_fallback_user_id,
        manager_backup_user_id,
        finance_approval_backup_user_id,
        status,
        effective_from,
        effective_to,
        updated_by_user_id,
        created_at,
        updated_at,
        deleted_at,
        version
      FROM platform.finance_governance_config
      WHERE deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      scope_key: row.scope_key,
      primary_finance_manager_user_id: row.primary_finance_manager_user_id,
      manager_backup_user_id: row.manager_backup_user_id,
      finance_approval_backup_user_id:
        row.finance_approval_backup_user_id ??
        row.finance_self_request_fallback_user_id,
      status: row.status,
      effective_from: asDate(row.effective_from),
      effective_to: asDateOrNull(row.effective_to),
      updated_by_user_id: row.updated_by_user_id,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version,
    };
  }

  private async loadManagerBackupAssignments(
    client: PoolClient,
    companyId?: UUID,
  ): Promise<ManagerBackupAssignment[]> {
    const { rows } = await client.query(
      `SELECT * FROM expenses.employee_reviewer_mappings
       WHERE company_id IS NOT NULL
         AND owner_resolution_status IN ('typed_creation','audited_repair')
         AND ($1::uuid IS NULL OR company_id=$1)
       ORDER BY created_at,id`,
      [companyId ?? null],
    );
    return rows.map((row) => this.mapManagerBackupAssignment(row));
  }

  private mapManagerBackupAssignment(
    row: Record<string, any>,
  ): ManagerBackupAssignment {
    return {
      id: row.id,
      company_id: row.company_id,
      owner_resolution_status: row.owner_resolution_status,
      owner_resolution_reason: row.owner_resolution_reason,
      employee_user_id: row.employee_user_id,
      backup_manager_user_id:
        row.backup_manager_user_id ?? row.reviewer_user_id,
      assigned_by_user_id: row.assigned_by_user_id,
      effective_from: asDate(row.effective_from),
      effective_to: asDateOrNull(row.effective_to),
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version,
    };
  }

  private async loadTickets(client: PoolClient, companyId?: UUID, requesterId?: UUID, ticketId?: UUID, ticketIds?: readonly UUID[]): Promise<ExpenseTicket[]> {
    const { rows } = await client.query(
      `SELECT * FROM expenses.expense_tickets
       ${ticketIds ? "WHERE id = ANY($1::uuid[]) AND company_id IS NOT NULL"
         : companyId && requesterId && ticketId
         ? "WHERE id = $3 AND company_id IS NOT NULL AND (company_id = $1 OR requester_user_id = $2)"
         : companyId && requesterId
         ? "WHERE company_id IS NOT NULL AND (company_id = $1 OR requester_user_id = $2)"
         : companyId ? "WHERE company_id = $1" : ""}
       ORDER BY created_at, ticket_no`,
      ticketIds ? [ticketIds]
        : companyId && requesterId && ticketId ? [companyId, requesterId, ticketId]
        : companyId && requesterId ? [companyId, requesterId] : companyId ? [companyId] : [],
    );
    return rows.map((row) => ({
      id: row.id,
      company_id: row.company_id ?? null,
      owner_resolution_status: row.owner_resolution_status ?? "quarantined",
      owner_resolution_reason: row.owner_resolution_reason ?? null,
      ticket_no: row.ticket_no,
      requester_user_id: row.requester_user_id,
      requester_role_snapshot: row.requester_role_snapshot,
      department_id: row.department_id,
      expense_type: row.expense_type,
      expense_sub_type: row.expense_sub_type,
      project_code: row.project_code,
      client_name: row.client_name,
      task_title: row.task_title,
      task_description: row.task_description,
      location: row.location,
      start_date: asDate(row.start_date),
      end_date: asDate(row.end_date),
      estimated_amount: asMoney(row.estimated_amount) ?? "0.00",
      payment_type: row.payment_type,
      advance_amount: asMoney(row.advance_amount),
      advance_justification: row.advance_justification,
      manager_verifier_id:
        row.manager_verifier_id ??
        row.assigned_reviewer_id ??
        row.director_approver_id,
      manager_backup_user_id: row.manager_backup_user_id,
      finance_approver_id: row.finance_approver_id ?? row.finance_manager_id,
      status: row.status,
      actual_amount: asMoney(row.actual_amount),
      variance_amount: asMoney(row.variance_amount),
      payment_reference_no: row.payment_reference_no,
      closure_remarks: row.closure_remarks,
      context_payload: json(row.context_payload),
      route_snapshot: json(row.route_snapshot),
      policy_snapshot: json(row.policy_snapshot),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      submitted_at: asIsoOrNull(row.submitted_at),
      closed_at: asIsoOrNull(row.closed_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadLineItems(client: PoolClient, ticketIds?: readonly UUID[]): Promise<ExpenseLineItem[]> {
    const { rows } = await client.query(
      `SELECT * FROM expenses.expense_line_items
       ${ticketIds ? "WHERE ticket_id = ANY($1::uuid[])" : ""}
       ORDER BY created_at, id`,
      ticketIds ? [ticketIds] : [],
    );
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      line_category: row.line_category,
      description: row.description,
      quantity: asMoney(row.quantity),
      unit_cost: asMoney(row.unit_cost),
      line_total: asMoney(row.line_total) ?? "0.00",
      tax_amount: asMoney(row.tax_amount),
      vendor_name: row.vendor_name,
    }));
  }

  private async loadExpenseApprovals(
    client: PoolClient,
    ticketIds?: readonly UUID[],
  ): Promise<ExpenseApprovalRecord[]> {
    const { rows } = await client.query(
      `SELECT * FROM expenses.expense_approvals
       ${ticketIds ? "WHERE ticket_id = ANY($1::uuid[])" : ""}
       ORDER BY created_at, id`,
      ticketIds ? [ticketIds] : [],
    );
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      approval_stage: row.approval_stage,
      approver_user_id: row.approver_user_id,
      decision: row.decision,
      remarks: row.remarks,
      role_snapshot: row.role_snapshot,
      designation_snapshot: row.designation_snapshot,
      route_snapshot: json(row.route_snapshot),
      action_at: asIso(row.action_at),
      created_at: asIso(row.created_at),
    }));
  }

  private async loadAuditLogs(client: PoolClient, companyId?: UUID, ticketIds?: readonly UUID[]): Promise<ExpenseAuditLog[]> {
    const { rows } = await client.query(
      `SELECT log.* FROM expenses.expense_audit_logs log
       ${companyId ? "JOIN expenses.expense_tickets ticket ON ticket.id = log.ticket_id WHERE ticket.company_id = $1" : ticketIds ? "WHERE log.ticket_id = ANY($1::uuid[])" : ""}
       ORDER BY log.created_at, log.id`,
      companyId ? [companyId] : ticketIds ? [ticketIds] : [],
    );
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      actor_user_id: row.actor_user_id,
      event_type: row.event_type,
      old_value: row.old_value,
      new_value: row.new_value,
      remarks: row.remarks,
      payload_hash: row.payload_hash,
      created_at: asIso(row.created_at),
    }));
  }

  private async loadExpenseDocuments(
    client: PoolClient,
    ticketIds?: readonly UUID[],
  ): Promise<ExpenseDocument[]> {
    const { rows } = await client.query(
      `SELECT * FROM expenses.expense_documents
       ${ticketIds ? "WHERE ticket_id = ANY($1::uuid[])" : ""}
       ORDER BY uploaded_at, id`,
      ticketIds ? [ticketIds] : [],
    );
    return rows.map((row) => ({ ...row, uploaded_at: asIso(row.uploaded_at) }));
  }

  private async loadPayments(client: PoolClient, ticketIds?: readonly UUID[]): Promise<ExpensePayment[]> {
    const { rows } = await client.query(
      `SELECT * FROM expenses.expense_payments
       ${ticketIds ? "WHERE ticket_id = ANY($1::uuid[])" : ""}
       ORDER BY created_at, id`,
      ticketIds ? [ticketIds] : [],
    );
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      payment_type: row.payment_type,
      approved_amount: asMoney(row.approved_amount) ?? "0.00",
      paid_amount: asMoney(row.paid_amount) ?? "0.00",
      payment_date: asDate(row.payment_date),
      payment_mode: row.payment_mode,
      reference_no: row.reference_no,
      settlement_status: row.settlement_status,
      settlement_amount: asMoney(row.settlement_amount),
      processed_by_user_id: row.processed_by_user_id,
      created_at: asIso(row.created_at),
    }));
  }

  private async loadDocuments(
    client: PoolClient,
    documentIds?: readonly UUID[],
  ): Promise<DocumentMetadata[]> {
    if (documentIds?.length === 0) return [];
    const { rows } = await client.query(
      `SELECT * FROM documents.doc_metadata
       ${documentIds ? "WHERE id=ANY($1::uuid[])" : ""}
       ORDER BY created_at, id`,
      documentIds ? [documentIds] : [],
    );
    return rows.map((row) => ({
      id: row.id,
      business_object_type: row.business_object_type,
      business_object_id: row.business_object_id,
      owner_user_id: row.owner_user_id,
      classification: row.classification,
      document_type: row.document_type,
      current_version: row.current_version,
      file_name: row.file_name,
      storage_key: row.storage_key,
      mime_type: row.mime_type,
      size_bytes: Number(row.size_bytes),
      checksum_sha256: row.checksum_sha256,
      metadata: json(row.metadata),
      created_by_user_id: row.created_by_user_id,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadDocumentVersions(
    client: PoolClient,
    documentIds?: readonly UUID[],
  ): Promise<DocumentVersionRecord[]> {
    if (documentIds?.length === 0) return [];
    const { rows } = await client.query(
      `SELECT * FROM documents.doc_versions
       ${documentIds ? "WHERE document_id=ANY($1::uuid[])" : ""}
       ORDER BY created_at, id`,
      documentIds ? [documentIds] : [],
    );
    return rows.map((row) => ({
      id: row.id,
      document_id: row.document_id,
      version: row.version,
      storage_key: row.storage_key,
      file_name: row.file_name,
      size_bytes: Number(row.size_bytes),
      checksum_sha256: row.checksum_sha256,
      created_by_user_id: row.created_by_user_id,
      created_at: asIso(row.created_at),
    }));
  }

  private async loadDocumentAccessLogs(
    client: PoolClient,
  ): Promise<DocumentAccessLogRecord[]> {
    const { rows } = await client.query(
      "SELECT * FROM documents.doc_access_logs ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      document_id: row.document_id,
      actor_user_id: row.actor_user_id,
      action: row.action,
      decision: row.decision,
      reason: row.reason,
      created_at: asIso(row.created_at),
    }));
  }

  private async loadNotifications(
    client: PoolClient,
    targetUserIds?: readonly UUID[],
  ): Promise<NotificationRecord[]> {
    if (targetUserIds?.length === 0) return [];
    const { rows } = await client.query(
      `SELECT * FROM platform.notifications
       ${targetUserIds ? "WHERE target_user_id = ANY($1::uuid[])" : ""}
       ORDER BY created_at, id`,
      targetUserIds ? [targetUserIds] : [],
    );
    return rows.map((row) => this.mapNotificationRow(row));
  }

  private mapNotificationRow(row: Record<string, any>): NotificationRecord {
    return {
      id: row.id,
      actor_user_id: row.actor_user_id,
      target_user_id: row.target_user_id,
      event_type: row.event_type,
      payload: json(row.payload),
      status: row.status,
      read_at: asIsoOrNull(row.read_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
    };
  }

  private async loadEmailDeliveries(
    client: PoolClient,
  ): Promise<EmailDeliveryRecord[]> {
    const { rows } = await client.query(`
      SELECT id, provider, template_key, purpose, user_id, email, subject, status, provider_email_id,
        idempotency_key, error_code, error_message, queued_at, sent_at, delivered_at, failed_at,
        bounced_at, complained_at, metadata, created_at, updated_at, version
      FROM platform.email_deliveries
      ORDER BY created_at, id
    `);
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      template_key: row.template_key,
      purpose: row.purpose,
      user_id: row.user_id,
      email: row.email,
      subject: row.subject,
      status: row.status,
      provider_email_id: row.provider_email_id,
      idempotency_key: row.idempotency_key,
      error_code: row.error_code,
      error_message: row.error_message,
      queued_at: asIso(row.queued_at),
      sent_at: asIsoOrNull(row.sent_at),
      delivered_at: asIsoOrNull(row.delivered_at),
      failed_at: asIsoOrNull(row.failed_at),
      bounced_at: asIsoOrNull(row.bounced_at),
      complained_at: asIsoOrNull(row.complained_at),
      metadata: json(row.metadata),
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      version: row.version,
    }));
  }

  private async loadEmailEvents(
    client: PoolClient,
  ): Promise<EmailEventRecord[]> {
    const { rows } = await client.query(`
      SELECT id, provider, provider_event_id, provider_email_id, event_type, email, delivery_id, payload, received_at, processed_at
      FROM platform.email_events
      ORDER BY received_at, id
    `);
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      provider_event_id: row.provider_event_id,
      provider_email_id: row.provider_email_id,
      event_type: row.event_type,
      email: row.email,
      delivery_id: row.delivery_id,
      payload: json(row.payload),
      received_at: asIso(row.received_at),
      processed_at: asIsoOrNull(row.processed_at),
    }));
  }

  private async loadOutbox(client: PoolClient, filter: "all" | "pending" = "all", companyId?: UUID): Promise<OutboxEvent[]> {
    const conditions = [
      ...(filter === "pending" ? ["status IN ('pending', 'retry')"] : []),
      ...(companyId ? [`(
        (aggregate_type='expense_ticket' AND EXISTS (
          SELECT 1 FROM expenses.expense_tickets ticket
          WHERE ticket.id=platform.outbox_events.aggregate_id
            AND ticket.company_id=$1::uuid
        ))
        OR (aggregate_type<>'expense_ticket' AND payload->>'company_id'=$1::text)
      )`] : []),
    ];
    const condition = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await client.query(
      `SELECT * FROM platform.outbox_events ${condition} ORDER BY id`,
      companyId ? [companyId] : [],
    );
    return rows.map((row) => this.mapOutboxRow(row));
  }

  private async loadDashboardExactMetrics(
    client: PoolClient,
    actor: AuthUser,
    companyId: UUID,
  ): Promise<DashboardExactMetrics> {
    const systemWideRoles: readonly string[] = [
      Roles.Admin,
      Roles.Auditor,
      Roles.HRManager,
      Roles.AssetManager,
    ];
    const financeRoles: readonly string[] = [Roles.Admin, Roles.Auditor, Roles.FinanceManager];
    const systemWide = actor.roles.some((role) => systemWideRoles.includes(role));
    const canSeeFinance = actor.roles.some((role) => financeRoles.includes(role));
    const hierarchyPrefix = `${actor.hierarchy_path}.%`;
    const params = [companyId, systemWide, actor.id, hierarchyPrefix, canSeeFinance];
    const visibleUsersCte = `visible_users AS (
      SELECT user_row.id,user_row.department_id,user_row.employment_status,user_row.joined_on
      FROM core.users user_row
      JOIN platform.user_session_preferences membership ON membership.user_id=user_row.id
      WHERE membership.company_id=$1 AND user_row.deleted_at IS NULL
        AND ($2::boolean OR user_row.id=$3::uuid OR user_row.hierarchy_path::text LIKE $4)
    )`;
    const workforce = await client.query<{
      visible_employees: string;
      active_employees: string;
      inactive_employees: string;
      new_joiners_30d: string;
    }>(
      `WITH ${visibleUsersCte}
       SELECT count(*)::text AS visible_employees,
         count(*) FILTER (WHERE employment_status='active')::text AS active_employees,
         count(*) FILTER (WHERE employment_status<>'active')::text AS inactive_employees,
         count(*) FILTER (WHERE joined_on>=CURRENT_DATE-30)::text AS new_joiners_30d
       FROM visible_users`,
      params.slice(0, 4),
    );
    const departments = await client.query<{
      department_id: UUID;
      department_code: string;
      name: string;
      active_employees: string;
    }>(
      `WITH ${visibleUsersCte}
       SELECT department.id AS department_id,department.department_code,department.name,
         count(visible_users.id) FILTER (WHERE visible_users.employment_status='active')::text
           AS active_employees
       FROM core.departments department
       LEFT JOIN visible_users ON visible_users.department_id=department.id
       WHERE department.company_id=$1 AND department.deleted_at IS NULL
         AND department.status='active'
       GROUP BY department.id,department.department_code,department.name
       ORDER BY department.department_code,department.id`,
      params.slice(0, 4),
    );
    const counts = await client.query<Record<string, string>>(
      `WITH ${visibleUsersCte},
       visible_attendance AS (
         SELECT daily.*
         FROM attendance.daily_records daily
         JOIN visible_users ON visible_users.id=daily.employee_user_id
         WHERE daily.company_id=$1 AND daily.deleted_at IS NULL
       ), attendance_reporting AS (
         SELECT daily.*
         FROM visible_attendance daily
         WHERE $2::boolean
           OR EXISTS (SELECT 1 FROM visible_users other WHERE other.id<>$3::uuid)
       ), attendance_base_signals AS (
         SELECT daily.*,
           (daily.first_check_in IS NOT NULL OR daily.last_check_out IS NOT NULL
             OR daily.work_seconds>0
             OR EXISTS (
               SELECT 1 FROM attendance.punch_events punch
               WHERE punch.company_id=daily.company_id
                 AND punch.employee_user_id=daily.employee_user_id
                 AND (punch.occurred_at AT TIME ZONE 'UTC')::date=daily.work_date
                 AND punch.deleted_at IS NULL
             )
             OR EXISTS (
               SELECT 1 FROM attendance.geo_fallback_reviews review
               WHERE review.company_id=daily.company_id
                 AND review.employee_user_id=daily.employee_user_id
                 AND review.work_date=daily.work_date
                 AND review.deleted_at IS NULL AND review.status='approved'
             )
             OR EXISTS (
               SELECT 1 FROM platform.outbox_events event
               WHERE event.event_type='attendance.provisional.recorded'
                 AND event.payload->>'company_id'=daily.company_id::text
                 AND event.payload->>'subject_employee_user_id'=daily.employee_user_id::text
                 AND left(event.payload->>'captured_at',10)=daily.work_date::text
                 AND event.payload->>'verification_status' IN
                   ('unverified','review_required','verified')
             )) AS has_accepted_evidence,
           EXISTS (
             SELECT 1 FROM attendance.geo_fallback_reviews review
             WHERE review.company_id=daily.company_id
               AND review.employee_user_id=daily.employee_user_id
               AND review.work_date=daily.work_date
               AND review.deleted_at IS NULL
           ) AS has_geo_review,
           EXISTS (
             SELECT 1 FROM attendance.geo_fallback_reviews review
             WHERE review.company_id=daily.company_id
               AND review.employee_user_id=daily.employee_user_id
               AND review.work_date=daily.work_date
               AND review.deleted_at IS NULL AND review.status IN ('pending','returned')
           ) AS has_pending_geo_review,
           EXISTS (
             SELECT 1 FROM attendance.regularization_requests regularization
             WHERE regularization.company_id=daily.company_id
               AND regularization.employee_user_id=daily.employee_user_id
               AND regularization.work_date=daily.work_date
               AND regularization.deleted_at IS NULL
               AND regularization.status IN ('pending','returned')
           ) AS has_pending_regularization,
           EXISTS (
             SELECT 1 FROM platform.outbox_events event
             WHERE event.event_type='attendance.provisional.recorded'
               AND event.payload->>'company_id'=daily.company_id::text
               AND event.payload->>'subject_employee_user_id'=daily.employee_user_id::text
               AND left(event.payload->>'captured_at',10)=daily.work_date::text
               AND event.payload->>'verification_status'='review_required'
           ) AS has_review_required_outbox,
           EXISTS (
             SELECT 1 FROM platform.outbox_events event
             WHERE event.event_type='attendance.provisional.recorded'
               AND event.payload->>'company_id'=daily.company_id::text
               AND event.payload->>'subject_employee_user_id'=daily.employee_user_id::text
               AND left(event.payload->>'captured_at',10)=daily.work_date::text
               AND event.payload->>'verification_status'='rejected'
           ) AS has_rejected_outbox,
           EXISTS (
             SELECT 1 FROM platform.outbox_events event
             WHERE event.event_type='attendance.provisional.recorded'
               AND event.payload->>'company_id'=daily.company_id::text
               AND event.payload->>'subject_employee_user_id'=daily.employee_user_id::text
               AND left(event.payload->>'captured_at',10)=daily.work_date::text
               AND event.payload->>'verification_status'='unverified'
           ) AS has_provisional_outbox,
           EXISTS (
             SELECT 1 FROM attendance.mobile_evidence_warnings warning
             WHERE warning.company_id=daily.company_id
               AND warning.employee_user_id=daily.employee_user_id
               AND warning.work_date=daily.work_date
               AND warning.reason_code IN (
                 'mobile_registered_device_required',
                 'mobile_registered_device_revoked',
                 'mobile_registered_device_suspended',
                 'mobile_registered_device_unavailable'
               )
           ) AS has_device_warning,
           EXISTS (
             SELECT 1 FROM attendance.mobile_evidence_warnings warning
             WHERE warning.company_id=daily.company_id
               AND warning.employee_user_id=daily.employee_user_id
               AND warning.work_date=daily.work_date
               AND warning.reason_code IN (
                 'mobile_replay.changed_body_conflict',
                 'offline_sync.changed_body_conflict',
                 'offline_sync.duplicate_sequence'
               )
           ) AS has_integrity_warning
         FROM attendance_reporting daily
       ), attendance_signals AS (
         SELECT base.*,
           (base.has_pending_geo_review OR base.has_pending_regularization
             OR base.has_review_required_outbox) AS signal_review_required,
           (base.has_rejected_outbox
             OR (base.has_device_warning AND NOT base.has_accepted_evidence)) AS signal_rejected,
           base.has_provisional_outbox AS signal_provisional,
           (base.has_integrity_warning
             OR (base.has_device_warning AND base.has_accepted_evidence)) AS signal_warning,
           (base.has_accepted_evidence OR base.has_geo_review) AS has_contributing_evidence
         FROM attendance_base_signals base
       ), attendance_classified AS (
         SELECT daily.id,daily.employee_user_id,daily.work_date,
           CASE
             WHEN daily.day_classification IN ('future','weekend','holiday','leave')
               AND NOT daily.has_contributing_evidence
               AND NOT daily.signal_review_required
               AND NOT daily.signal_rejected
               AND NOT daily.signal_provisional
               AND NOT daily.signal_warning THEN NULL
             WHEN daily.signal_review_required
               OR daily.regularization_status IN ('pending','returned')
               OR (daily.approval_kind='regularization' AND daily.approval_state IN ('pending','returned'))
               THEN 'review_required'
             WHEN daily.signal_rejected THEN 'rejected'
             WHEN daily.signal_provisional THEN 'provisional'
             WHEN daily.signal_warning THEN 'warning'
             WHEN daily.evidence_state IN ('partial','missing','disputed','unknown')
               OR daily.approval_state IN ('mixed','unknown') THEN 'warning'
             WHEN daily.evidence_state='complete' OR daily.approval_state='approved'
               OR (daily.evidence_state='not_applicable'
                 AND daily.day_classification NOT IN ('future','weekend','holiday','leave'))
               THEN 'verified'
             ELSE 'warning'
           END AS evidence_category
         FROM attendance_signals daily
       ), attendance_sources AS (
         SELECT DISTINCT source.id,source.source_category
         FROM (
           SELECT classified.id,
             CASE
               WHEN punch.origin IN ('manager_assisted_now','approved_regularization','historical_correction')
                 OR punch.source='admin' THEN 'manual'
               WHEN punch.origin='system' OR punch.source='auto_geofence' THEN 'system'
               WHEN punch.source='web' THEN 'web'
               WHEN punch.source='web_geo' THEN 'geo'
               WHEN punch.source IN ('mobile','mobile_foreground','mobile_offline') THEN 'mobile'
               WHEN punch.source='kiosk' THEN 'kiosk'
               ELSE NULL
             END AS source_category
           FROM attendance_classified classified
           JOIN attendance.punch_events punch
             ON punch.company_id=$1 AND punch.employee_user_id=classified.employee_user_id
            AND (punch.occurred_at AT TIME ZONE 'UTC')::date=classified.work_date
            AND punch.deleted_at IS NULL
           UNION ALL
           SELECT classified.id,'geo'
           FROM attendance_classified classified
           JOIN attendance.geo_fallback_reviews review
             ON review.company_id=$1 AND review.employee_user_id=classified.employee_user_id
            AND review.work_date=classified.work_date AND review.deleted_at IS NULL
           UNION ALL
           SELECT classified.id,'manual'
           FROM attendance_classified classified
           JOIN attendance.geo_fallback_reviews review
             ON review.company_id=$1 AND review.employee_user_id=classified.employee_user_id
            AND review.work_date=classified.work_date AND review.deleted_at IS NULL
            AND (review.fallback_command_id IS NOT NULL OR review.punch_event_id IS NOT NULL)
           UNION ALL
           SELECT classified.id,'mobile'
           FROM attendance_classified classified
           JOIN platform.outbox_events event
             ON event.event_type='attendance.provisional.recorded'
            AND event.payload->>'company_id'=$1::text
            AND event.payload->>'subject_employee_user_id'=classified.employee_user_id::text
            AND left(event.payload->>'captured_at',10)=classified.work_date::text
           UNION ALL
           SELECT classified.id,'mobile'
           FROM attendance_classified classified
           JOIN attendance.mobile_evidence_warnings warning
             ON warning.company_id=$1 AND warning.employee_user_id=classified.employee_user_id
            AND warning.work_date=classified.work_date
           UNION ALL
           SELECT classified.id,'manual'
           FROM attendance_classified classified
           JOIN attendance.regularization_requests regularization
             ON regularization.company_id=$1
            AND regularization.employee_user_id=classified.employee_user_id
            AND regularization.work_date=classified.work_date
            AND regularization.deleted_at IS NULL
            AND regularization.status IN ('pending','returned','approved','rejected')
         ) source
         WHERE source.source_category IS NOT NULL
       )
       SELECT
         (SELECT count(*) FROM expenses.expense_tickets ticket
           WHERE ticket.company_id=$1 AND ticket.deleted_at IS NULL
             AND ticket.owner_resolution_status<>'quarantined'
             AND ticket.status='Pending Manager Verification'
             AND ($2::boolean OR ticket.requester_user_id IN (SELECT id FROM visible_users)
               OR ticket.manager_verifier_id IN (SELECT id FROM visible_users)
               OR ticket.manager_backup_user_id IN (SELECT id FROM visible_users)
               OR ticket.finance_approver_id IN (SELECT id FROM visible_users))
             AND ($2::boolean OR ticket.manager_verifier_id=$3 OR ticket.manager_backup_user_id=$3))::text
           AS expense_manager_pending,
         (SELECT count(*) FROM expenses.expense_tickets ticket
           WHERE ticket.company_id=$1 AND ticket.deleted_at IS NULL
             AND ticket.owner_resolution_status<>'quarantined'
             AND ticket.status IN ('Manager Verified','Finance Hold','Clarification Required',
               'Finance Approved','Payment Released','Bills Submitted','Pending Adjustment')
             AND ($2::boolean OR ticket.requester_user_id IN (SELECT id FROM visible_users)
               OR ticket.manager_verifier_id IN (SELECT id FROM visible_users)
               OR ticket.manager_backup_user_id IN (SELECT id FROM visible_users)
               OR ticket.finance_approver_id IN (SELECT id FROM visible_users))
             AND ($5::boolean OR ticket.finance_approver_id=$3))::text
           AS expense_finance_pending,
         (SELECT count(*) FROM expenses.expense_documents document
           JOIN expenses.expense_tickets ticket ON ticket.id=document.ticket_id
           WHERE ticket.company_id=$1 AND ticket.deleted_at IS NULL
             AND ticket.owner_resolution_status<>'quarantined'
             AND ($2::boolean OR ticket.requester_user_id IN (SELECT id FROM visible_users)
               OR ticket.manager_verifier_id=$3 OR ticket.manager_backup_user_id=$3
               OR ticket.finance_approver_id=$3)
             AND document.verification_status='pending')::text AS document_verification_pending,
         (SELECT count(*) FROM timesheets.timesheet_submissions submission
           WHERE submission.deleted_at IS NULL AND submission.status='Pending Approval'
             AND (submission.employee_user_id IN (SELECT id FROM visible_users)
               OR submission.current_approver_user_id=$3)
             AND ($2::boolean OR submission.current_approver_user_id=$3))::text
           AS timesheet_pending,
         (SELECT count(*) FROM leave_wfh.leave_requests request
           WHERE request.deleted_at IS NULL AND request.status='pending_manager'
             AND (request.employee_user_id IN (SELECT id FROM visible_users)
               OR request.current_approver_user_id=$3)
             AND ($2::boolean OR request.current_approver_user_id=$3))::text AS leave_pending,
         (SELECT count(*) FROM leave_wfh.wfh_requests request
           WHERE request.deleted_at IS NULL AND request.status='pending_manager'
             AND (request.employee_user_id IN (SELECT id FROM visible_users)
               OR request.current_approver_user_id=$3)
             AND ($2::boolean OR request.current_approver_user_id=$3))::text AS wfh_pending,
         (SELECT count(*) FROM assets.assets asset
           WHERE asset.deleted_at IS NULL
             AND asset.current_assigned_user_id IN (SELECT id FROM visible_users))::text AS assets_total,
         (SELECT count(*) FROM assets.assets asset
           WHERE asset.deleted_at IS NULL AND asset.status='Assigned'
             AND asset.current_assigned_user_id IN (SELECT id FROM visible_users))::text AS assets_assigned,
         (SELECT count(*) FROM assets.asset_recovery_tickets recovery
           WHERE recovery.employee_user_id IN (SELECT id FROM visible_users)
             AND recovery.status<>'closed')::text AS assets_recovery_pending,
         (SELECT count(*) FROM platform.notifications notification
           WHERE notification.status='pending'
             AND notification.target_user_id IN (SELECT id FROM visible_users)
             AND CASE WHEN notification.payload ? 'ticket_id' THEN
               nullif(notification.payload->>'ticket_id','') ~
                 '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
               AND EXISTS (SELECT 1 FROM expenses.expense_tickets ticket
                 WHERE ticket.id=(notification.payload->>'ticket_id')::uuid
                   AND ticket.company_id=$1 AND ticket.deleted_at IS NULL
                   AND ticket.owner_resolution_status<>'quarantined')
             ELSE nullif(notification.payload->>'company_id','')=$1::text END)::text
           AS notifications_pending,
         (SELECT CASE WHEN $2::boolean THEN count(*) ELSE 0 END
           FROM platform.outbox_events event
           WHERE event.status IN ('pending','retry') AND (
             (event.aggregate_type='expense_ticket' AND EXISTS (
               SELECT 1 FROM expenses.expense_tickets ticket
               WHERE ticket.id=event.aggregate_id AND ticket.company_id=$1))
             OR (event.aggregate_type<>'expense_ticket' AND event.payload->>'company_id'=$1::text)
           ))::text AS outbox_pending,
         (SELECT count(*) FROM visible_attendance daily
           WHERE daily.exception_type IS NOT NULL
             OR daily.evidence_state IN ('missing','partial','disputed')
             OR daily.presence_state='absent'
             OR daily.punctuality_state IN ('late','late_and_early_departure'))::text
           AS attendance_exception_count,
         (SELECT count(*) FROM timesheets.work_segments segment
           WHERE segment.deleted_at IS NULL
             AND segment.employee_user_id IN (SELECT id FROM visible_users))::text AS work_segments_total,
         (SELECT COALESCE(sum(segment.hours),0)::text FROM timesheets.work_segments segment
           WHERE segment.deleted_at IS NULL
             AND segment.employee_user_id IN (SELECT id FROM visible_users)) AS submitted_hours_total,
         (SELECT count(*) FROM timesheets.timesheet_submissions submission
           WHERE submission.deleted_at IS NULL AND (
             submission.employee_user_id IN (SELECT id FROM visible_users)
             OR submission.current_approver_user_id=$3))::text AS timesheet_submissions_total,
         (SELECT count(*) FROM timesheets.timesheet_submissions submission
           WHERE submission.deleted_at IS NULL AND submission.status='Approved' AND (
             submission.employee_user_id IN (SELECT id FROM visible_users)
             OR submission.current_approver_user_id=$3))::text AS timesheet_submissions_approved,
         (SELECT count(*) FROM timesheets.timesheet_submissions submission
           WHERE submission.deleted_at IS NULL AND submission.status='Returned' AND (
             submission.employee_user_id IN (SELECT id FROM visible_users)
             OR submission.current_approver_user_id=$3))::text AS timesheet_submissions_returned,
         (SELECT count(*) FILTER (WHERE evidence_category='verified') FROM attendance_classified)::text
           AS attendance_verified,
         (SELECT count(*) FILTER (WHERE evidence_category='warning') FROM attendance_classified)::text
           AS attendance_warning,
         (SELECT count(*) FILTER (WHERE evidence_category='provisional') FROM attendance_classified)::text
           AS attendance_provisional,
         (SELECT count(*) FILTER (WHERE evidence_category='review_required') FROM attendance_classified)::text
           AS attendance_review_required,
         (SELECT count(*) FILTER (WHERE evidence_category='rejected') FROM attendance_classified)::text
           AS attendance_rejected,
         (SELECT count(*) FILTER (WHERE source_category='web') FROM attendance_sources)::text AS source_web,
         (SELECT count(*) FILTER (WHERE source_category='geo') FROM attendance_sources)::text AS source_geo,
         (SELECT count(*) FILTER (WHERE source_category='mobile') FROM attendance_sources)::text AS source_mobile,
         (SELECT count(*) FILTER (WHERE source_category='manual') FROM attendance_sources)::text AS source_manual,
         (SELECT count(*) FILTER (WHERE source_category='kiosk') FROM attendance_sources)::text AS source_kiosk,
         (SELECT count(*) FILTER (WHERE source_category='system') FROM attendance_sources)::text AS source_system`,
      params,
    );
    const workforceRow = workforce.rows[0];
    const row = counts.rows[0] ?? {};
    const number = (value: string | undefined): number => Number(value ?? 0);
    return {
      workforce: {
        visible_employees: number(workforceRow?.visible_employees),
        active_employees: number(workforceRow?.active_employees),
        inactive_employees: number(workforceRow?.inactive_employees),
        new_joiners_30d: number(workforceRow?.new_joiners_30d),
        departments: departments.rows.map((department) => ({
          ...department,
          active_employees: number(department.active_employees),
        })),
      },
      expense_manager_pending: number(row.expense_manager_pending),
      expense_finance_pending: number(row.expense_finance_pending),
      timesheet_pending: number(row.timesheet_pending),
      leave_pending: number(row.leave_pending),
      wfh_pending: number(row.wfh_pending),
      document_verification_pending: number(row.document_verification_pending),
      assets_total: number(row.assets_total),
      assets_assigned: number(row.assets_assigned),
      assets_recovery_pending: number(row.assets_recovery_pending),
      notifications_pending: number(row.notifications_pending),
      outbox_pending: number(row.outbox_pending),
      workload: {
        work_segments_total: number(row.work_segments_total),
        submitted_hours_total: Number(row.submitted_hours_total ?? 0).toFixed(2),
        timesheet_submissions_total: number(row.timesheet_submissions_total),
        timesheet_submissions_approved: number(row.timesheet_submissions_approved),
        timesheet_submissions_returned: number(row.timesheet_submissions_returned),
      },
      attendance_exception_count: number(row.attendance_exception_count),
      attendance_evidence_categories: {
        verified: number(row.attendance_verified),
        warning: number(row.attendance_warning),
        provisional: number(row.attendance_provisional),
        review_required: number(row.attendance_review_required),
        rejected: number(row.attendance_rejected),
      },
      attendance_source_categories: {
        web: number(row.source_web),
        geo: number(row.source_geo),
        mobile: number(row.source_mobile),
        manual: number(row.source_manual),
        kiosk: number(row.source_kiosk),
        system: number(row.source_system),
      },
    };
  }

  private mapOutboxRow(row: OutboxEvent & Record<string, unknown>): OutboxEvent {
    return {
      id: Number(row.id),
      event_id: row.event_id,
      aggregate_type: row.aggregate_type,
      aggregate_id: row.aggregate_id,
      event_type: row.event_type,
      payload: json(row.payload),
      idempotency_key: row.idempotency_key,
      status: row.status,
      retry_count: row.retry_count,
      available_at: asIso(row.available_at),
      created_at: asIso(row.created_at),
      published_at: asIsoOrNull(row.published_at),
      failed_at: asIsoOrNull(row.failed_at),
      last_error: row.last_error,
    };
  }

  private async loadAssets(client: PoolClient): Promise<AssetRecord[]> {
    const { rows } = await client.query(
      "SELECT * FROM assets.assets ORDER BY created_at, asset_code",
    );
    return rows.map((row) => ({
      id: row.id,
      asset_code: row.asset_code,
      qr_hash: row.qr_hash,
      asset_type: row.asset_type,
      name: row.name,
      serial_no: row.serial_no,
      status: row.status,
      current_assigned_user_id: row.current_assigned_user_id,
      metadata: json(row.metadata),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadAssetAssignments(
    client: PoolClient,
  ): Promise<AssetAssignmentRecord[]> {
    const { rows } = await client.query(
      "SELECT * FROM assets.asset_assignments ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      asset_id: row.asset_id,
      assigned_to_user_id: row.assigned_to_user_id,
      assigned_by_user_id: row.assigned_by_user_id,
      assigned_at: asIso(row.assigned_at),
      returned_at: asIsoOrNull(row.returned_at),
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
    }));
  }

  private async loadAssetStateEvents(
    client: PoolClient,
  ): Promise<AssetStateEventRecord[]> {
    const { rows } = await client.query(
      "SELECT * FROM assets.asset_state_events ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      asset_id: row.asset_id,
      actor_user_id: row.actor_user_id,
      event_type: row.event_type,
      payload: json(row.payload),
      created_at: asIso(row.created_at),
    }));
  }

  private async loadAssetRequests(
    client: PoolClient,
  ): Promise<DataStore["assetRequests"]> {
    const { rows } = await client.query(
      "SELECT * FROM assets.asset_requests ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      request_code: row.request_code,
      requester_user_id: row.requester_user_id,
      request_type: row.request_type,
      asset_type: row.asset_type,
      asset_id: row.asset_id,
      reason: row.reason,
      priority: row.priority,
      needed_by: asDateOrNull(row.needed_by),
      preferred_specs: json(row.preferred_specs),
      status: row.status,
      decision_by_user_id: row.decision_by_user_id,
      decision_at: asIsoOrNull(row.decision_at),
      decision_remarks: row.decision_remarks,
      assigned_asset_id: row.assigned_asset_id,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadAssetAcknowledgements(
    client: PoolClient,
  ): Promise<DataStore["assetAcknowledgements"]> {
    const { rows } = await client.query(
      "SELECT * FROM assets.asset_acknowledgements ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      asset_id: row.asset_id,
      employee_user_id: row.employee_user_id,
      assignment_id: row.assignment_id,
      acknowledgement_type: row.acknowledgement_type,
      status: row.status,
      acknowledged_at: asIsoOrNull(row.acknowledged_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
    }));
  }

  private async loadAssetMaintenanceRecords(
    client: PoolClient,
  ): Promise<DataStore["assetMaintenanceRecords"]> {
    const { rows } = await client.query(
      "SELECT * FROM assets.asset_maintenance_records ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      asset_id: row.asset_id,
      maintenance_type: row.maintenance_type,
      vendor_id: row.vendor_id,
      cost: asMoney(row.cost),
      started_on: asDate(row.started_on),
      completed_on: asDateOrNull(row.completed_on),
      status: row.status,
      notes: row.notes,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadAssetVendors(
    client: PoolClient,
  ): Promise<DataStore["assetVendors"]> {
    const { rows } = await client.query(
      "SELECT * FROM assets.software_vendors ORDER BY name, id",
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status ?? "active",
      contact_email: row.contact_email,
      phone: row.phone,
      metadata: json(row.metadata),
      version: row.version ?? 1,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at ?? row.created_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadAssetRecoveryTickets(
    client: PoolClient,
  ): Promise<DataStore["assetRecoveryTickets"]> {
    const { rows } = await client.query(
      "SELECT * FROM assets.asset_recovery_tickets ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      asset_id: row.asset_id,
      assignment_id: row.assignment_id,
      status: row.status,
      settlement_status: row.settlement_status,
      settlement_amount: asMoney(row.settlement_amount),
      settlement_remarks: row.settlement_remarks,
      settled_by_user_id: row.settled_by_user_id,
      settled_at: asIsoOrNull(row.settled_at),
      version: row.version ?? 1,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
    }));
  }

  private async loadLicenseEntitlements(
    client: PoolClient,
  ): Promise<LicenseEntitlement[]> {
    const { rows } = await client.query(
      "SELECT * FROM assets.license_entitlements ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      seat_count: row.seat_count,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
    }));
  }

  private async loadLicenseActivations(
    client: PoolClient,
  ): Promise<LicenseActivation[]> {
    const { rows } = await client.query(
      "SELECT * FROM assets.license_activations ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      entitlement_id: row.entitlement_id,
      hardware_fingerprint_hash: row.hardware_fingerprint_hash,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
    }));
  }

  private async loadCompromisedKeys(
    client: PoolClient,
  ): Promise<DataStore["compromisedKeys"]> {
    const { rows } = await client.query(
      "SELECT * FROM assets.compromised_keys ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      key_hash: row.key_hash,
      status: row.status,
      created_at: asIso(row.created_at),
    }));
  }

  private async loadWorkSegments(client: PoolClient): Promise<WorkSegment[]> {
    const { rows } = await client.query(
      "SELECT * FROM timesheets.work_segments ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      work_date: asDate(row.work_date),
      project_code: row.project_code,
      task_code: row.task_code,
      hours: asMoney(row.hours) ?? "0.00",
      description: row.description,
      billable: row.billable,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadWorkflowDefinitions(
    client: PoolClient,
  ): Promise<WorkflowDefinitionRecord[]> {
    const { rows } = await client.query(
      "SELECT * FROM timesheets.workflow_definitions ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      module: row.module,
      definition: row.definition,
      version: row.version,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
    }));
  }

  private async loadTimesheetSubmissions(
    client: PoolClient,
  ): Promise<TimesheetSubmission[]> {
    const { rows } = await client.query(
      "SELECT * FROM timesheets.timesheet_submissions ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      cycle_start: asDate(row.cycle_start),
      cycle_end: asDate(row.cycle_end),
      status: row.status,
      total_hours: asMoney(row.total_hours) ?? "0.00",
      workflow_definition_id: row.workflow_definition_id,
      workflow_snapshot: json(row.workflow_snapshot),
      current_approver_user_id: row.current_approver_user_id,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadTimesheetActions(
    client: PoolClient,
  ): Promise<DataStore["timesheetActions"]> {
    const { rows } = await client.query(
      "SELECT * FROM timesheets.timesheet_approval_actions ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      submission_id: row.submission_id,
      actor_user_id: row.actor_user_id,
      decision: row.decision,
      remarks: row.remarks,
      created_at: asIso(row.created_at),
    }));
  }

  private async loadProjects(client: PoolClient): Promise<ProjectRecord[]> {
    const { rows } = await client.query(
      "SELECT * FROM projects.projects ORDER BY project_code",
    );
    return rows.map((row) => ({
      id: row.id,
      project_code: row.project_code,
      name: row.name,
      client_name: row.client_name,
      project_type: row.project_type,
      billing_type: row.billing_type,
      manager_user_id: row.manager_user_id,
      department_id: row.department_id,
      start_date: asDate(row.start_date),
      end_date: asDate(row.end_date),
      status: row.status,
      health: row.health,
      description: row.description,
      estimated_hours: asMoney(row.estimated_hours) ?? "0.00",
      actual_hours: asMoney(row.actual_hours) ?? "0.00",
      estimated_budget: asMoney(row.estimated_budget) ?? "0.00",
      actual_spend: asMoney(row.actual_spend) ?? "0.00",
      tech_stack: Array.isArray(row.tech_stack) ? row.tech_stack : [],
      priority: row.priority,
      cost_center: row.cost_center,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadProjectMembers(
    client: PoolClient,
  ): Promise<ProjectMemberRecord[]> {
    const { rows } = await client.query(
      "SELECT * FROM projects.project_members ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      project_id: row.project_id,
      employee_user_id: row.employee_user_id,
      project_role: row.project_role,
      allocation_percent: row.allocation_percent,
      billable: Boolean(row.billable),
      start_date: asDate(row.start_date),
      end_date: asDateOrNull(row.end_date),
      reporting_lead_user_id: row.reporting_lead_user_id,
      status: row.status,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadProjectAllocations(
    client: PoolClient,
  ): Promise<ProjectAllocationRecord[]> {
    const { rows } = await client.query(
      "SELECT * FROM projects.project_allocations ORDER BY date_from DESC, id",
    );
    return rows.map((row) => ({
      id: row.id,
      project_id: row.project_id,
      employee_user_id: row.employee_user_id,
      date_from: asDate(row.date_from),
      date_to: asDateOrNull(row.date_to),
      allocation_percent: row.allocation_percent,
      billable: Boolean(row.billable),
      notes: row.notes,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadProjectMilestones(
    client: PoolClient,
  ): Promise<ProjectMilestoneRecord[]> {
    const { rows } = await client.query(
      "SELECT * FROM projects.project_milestones ORDER BY due_date, id",
    );
    return rows.map((row) => ({
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      owner_user_id: row.owner_user_id,
      status: row.status,
      start_date: asDateOrNull(row.start_date),
      due_date: asDate(row.due_date),
      priority: row.priority,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadHelpdeskCategories(
    client: PoolClient,
  ): Promise<HelpdeskCategory[]> {
    const { rows } = await client.query(
      "SELECT * FROM helpdesk.categories ORDER BY category_key",
    );
    return rows.map((row) => ({
      id: row.id,
      category_key: row.category_key,
      label: row.label,
      default_assignee_user_id: row.default_assignee_user_id,
      default_assignee_name: row.default_assignee_name,
      default_assignee_role: row.default_assignee_role,
      team: row.team,
      active: Boolean(row.active),
      sub_categories: Array.isArray(row.sub_categories)
        ? row.sub_categories
        : [],
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadHelpdeskTickets(
    client: PoolClient,
  ): Promise<HelpdeskTicket[]> {
    const { rows } = await client.query(
      "SELECT * FROM helpdesk.tickets ORDER BY created_at DESC, ticket_no DESC",
    );
    return rows.map((row) => ({
      id: row.id,
      ticket_no: row.ticket_no,
      subject: row.subject,
      description: row.description,
      category_id: row.category_id,
      category_key: row.category_key,
      sub_category: row.sub_category,
      priority: row.priority,
      status: row.status,
      requester_user_id: row.requester_user_id,
      requester_name: row.requester_name,
      requester_email: row.requester_email,
      requester_department: row.requester_department,
      assignee_user_id: row.assignee_user_id,
      assignee_name: row.assignee_name,
      assignee_role: row.assignee_role,
      related_asset_id: row.related_asset_id,
      related_project_id: row.related_project_id,
      first_response_at: asIsoOrNull(row.first_response_at),
      resolved_at: asIsoOrNull(row.resolved_at),
      closed_at: asIsoOrNull(row.closed_at),
      resolution: row.resolution,
      reopen_count: row.reopen_count,
      escalated: Boolean(row.escalated),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadHelpdeskComments(
    client: PoolClient,
  ): Promise<HelpdeskTicketComment[]> {
    const { rows } = await client.query(
      "SELECT * FROM helpdesk.ticket_comments ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      author_user_id: row.author_user_id,
      author_name: row.author_name,
      author_role: row.author_role,
      body: row.body,
      internal: Boolean(row.internal),
      document_ids: Array.isArray(row.document_ids) ? row.document_ids : [],
      created_at: asIso(row.created_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadHelpdeskAttachments(
    client: PoolClient,
  ): Promise<HelpdeskTicketAttachment[]> {
    const { rows } = await client.query(
      "SELECT * FROM helpdesk.ticket_attachments ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      document_id: row.document_id,
      attachment_type: row.attachment_type,
      file_name: row.file_name,
      size_text: row.size_text,
      uploaded_by_user_id: row.uploaded_by_user_id,
      uploaded_by_name: row.uploaded_by_name,
      created_at: asIso(row.created_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadHelpdeskEvents(
    client: PoolClient,
  ): Promise<HelpdeskTicketEvent[]> {
    const { rows } = await client.query(
      "SELECT * FROM helpdesk.ticket_events ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      actor_user_id: row.actor_user_id,
      actor_name: row.actor_name,
      action: row.action,
      detail: row.detail,
      created_at: asIso(row.created_at),
    }));
  }

  private async loadAttendancePunches(
    client: PoolClient,
    scope?: { companyId: UUID; employeeUserIds?: UUID[]; fromDate?: string },
  ): Promise<AttendancePunch[]> {
    const { rows } = scope
      ? await client.query(
          `SELECT * FROM attendance.punch_events WHERE company_id = $1
           AND ($2::uuid[] IS NULL OR employee_user_id = ANY($2::uuid[]))
           AND ($3::timestamptz IS NULL OR occurred_at >= $3::timestamptz)
           ORDER BY occurred_at, id`,
          [scope.companyId, scope.employeeUserIds ?? null, scope.fromDate ?? null],
        )
      : await client.query("SELECT * FROM attendance.punch_events ORDER BY occurred_at, id");
    return rows.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      employee_user_id: row.employee_user_id,
      actor_user_id: row.actor_user_id ?? row.employee_user_id,
      event_type: row.event_type,
      occurred_at: asIso(row.occurred_at),
      work_mode: row.work_mode,
      source: row.source,
      origin: row.origin ?? "employee_manual_now",
      regularization_request_id: row.regularization_request_id ?? null,
      metadata: json(row.metadata),
      created_at: asIso(row.created_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadAttendanceDayRecords(
    client: PoolClient,
    scope?: { companyId: UUID; employeeUserIds?: UUID[]; fromDate?: string },
  ): Promise<AttendanceDayRecord[]> {
    const { rows } = scope
      ? await client.query(
          `SELECT day.*, day.work_date::text AS work_date FROM attendance.daily_records day WHERE day.company_id = $1
           AND ($2::uuid[] IS NULL OR day.employee_user_id = ANY($2::uuid[]))
           AND ($3::date IS NULL OR day.work_date >= $3::date)
           ORDER BY day.work_date, day.employee_user_id`,
          [scope.companyId, scope.employeeUserIds ?? null, scope.fromDate ?? null],
        )
      : await client.query("SELECT day.*, day.work_date::text AS work_date FROM attendance.daily_records day ORDER BY day.work_date, day.employee_user_id");
    return rows.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      employee_user_id: row.employee_user_id,
      work_date: asDate(row.work_date),
      status: row.status,
      day_classification: row.day_classification,
      presence_state: row.presence_state,
      punctuality_state: row.punctuality_state,
      evidence_state: row.evidence_state,
      approval_kind: row.approval_kind,
      approval_state: row.approval_state,
      payroll_state: row.payroll_state,
      first_check_in: asIsoOrNull(row.first_check_in),
      last_check_out: asIsoOrNull(row.last_check_out),
      work_minutes: row.work_minutes,
      break_minutes: row.break_minutes,
      late_minutes: row.late_minutes,
      early_out_minutes: row.early_out_minutes,
      work_seconds: row.work_seconds,
      break_seconds: row.break_seconds,
      scheduled_seconds: row.scheduled_seconds,
      late_seconds: row.late_seconds,
      early_departure_seconds: row.early_departure_seconds,
      work_mode: row.work_mode,
      note: row.note,
      exception_type: row.exception_type,
      regularization_status: row.regularization_status,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadAttendanceRegularizations(
    client: PoolClient,
    companyId?: UUID,
  ): Promise<AttendanceRegularizationRequest[]> {
    const { rows } = await client.query(
      `SELECT regularization_requests.*, work_date::text AS work_date FROM attendance.regularization_requests
       ${companyId ? "WHERE company_id = $1" : ""} ORDER BY created_at, id`,
      companyId ? [companyId] : [],
    );
    const itemRows = (
      await client.query(
        `SELECT * FROM attendance.regularization_request_items
         ${companyId ? "WHERE company_id = $1" : ""} ORDER BY regularization_request_id, ordinal, id`,
        companyId ? [companyId] : [],
      )
    ).rows;
    const itemsByRequest = new Map<
      UUID,
      AttendanceRegularizationRequestItem[]
    >();
    for (const row of itemRows) {
      const item: AttendanceRegularizationRequestItem = {
        id: row.id,
        company_id: row.company_id,
        regularization_request_id: row.regularization_request_id,
        ordinal: row.ordinal,
        operation: row.operation,
        target_punch_event_id: row.target_punch_event_id,
        event_type: row.event_type,
        occurred_at: asIsoOrNull(row.occurred_at),
        created_at: asIso(row.created_at),
      };
      const existing = itemsByRequest.get(item.regularization_request_id) ?? [];
      existing.push(item);
      itemsByRequest.set(item.regularization_request_id, existing);
    }
    return rows.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      employee_user_id: row.employee_user_id,
      submitted_by_user_id: row.submitted_by_user_id ?? row.employee_user_id,
      work_date: asDate(row.work_date),
      reason: row.reason,
      items: itemsByRequest.get(row.id) ?? [],
      requested_punches: (itemsByRequest.get(row.id) ?? []).flatMap((item) =>
        item.event_type && item.occurred_at
          ? [{ event_type: item.event_type, occurred_at: item.occurred_at }]
          : [],
      ),
      status: row.status,
      current_approver_user_id: row.current_approver_user_id,
      decision_remarks: row.decision_remarks,
      decided_by_user_id: row.decided_by_user_id,
      decided_at: asIsoOrNull(row.decided_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadAttendanceGeoFallbackReviews(client: PoolClient, companyId: UUID): Promise<AttendanceGeoFallbackReview[]> {
    const { rows } = await client.query(
      "SELECT *, work_date::text AS work_date FROM attendance.geo_fallback_reviews WHERE company_id = $1 ORDER BY created_at, id",
      [companyId],
    );
    return rows.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      employee_user_id: row.employee_user_id,
      submitted_by_user_id: row.submitted_by_user_id,
      current_approver_user_id: row.current_approver_user_id,
      original_command_id: row.original_command_id,
      original_decision_id: row.original_decision_id,
      fallback_command_id: row.fallback_command_id,
      punch_event_id: row.punch_event_id,
      event_type: row.event_type,
      work_date: asDate(row.work_date),
      occurred_at: asIso(row.occurred_at),
      reason_code: row.reason_code,
      reason_detail: row.reason_detail,
      geo_policy: json(row.geo_policy),
      status: row.status,
      decision_remarks: row.decision_remarks,
      decided_by_user_id: row.decided_by_user_id,
      decided_at: asIsoOrNull(row.decided_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadAttendanceRegularizationActions(
    client: PoolClient,
  ): Promise<AttendanceRegularizationAction[]> {
    const { rows } = await client.query(
      "SELECT * FROM attendance.regularization_actions ORDER BY regularization_request_id, resulting_version, id",
    );
    return rows.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      regularization_request_id: row.regularization_request_id,
      actor_user_id: row.actor_user_id,
      subject_employee_user_id: row.subject_employee_user_id,
      action_kind: row.action_kind,
      previous_state: row.previous_state,
      resulting_state: row.resulting_state,
      remarks: row.remarks,
      resulting_version: row.resulting_version,
      occurred_at: asIso(row.occurred_at),
      migration_reconstructed: Boolean(row.migration_reconstructed),
    }));
  }

  private async loadAttendanceRegularizationCorrectionApplications(
    client: PoolClient,
  ): Promise<AttendanceRegularizationCorrectionApplication[]> {
    const { rows } = await client.query(
      "SELECT * FROM attendance.regularization_correction_applications ORDER BY applied_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      regularization_request_id: row.regularization_request_id,
      regularization_request_item_id: row.regularization_request_item_id,
      regularization_action_id: row.regularization_action_id,
      operation: row.operation,
      target_punch_event_id: row.target_punch_event_id,
      replacement_punch_event_id: row.replacement_punch_event_id,
      attendance_event_id: row.attendance_event_id,
      applied_by_user_id: row.applied_by_user_id,
      applied_at: asIso(row.applied_at),
    }));
  }

  private async loadLeaveRequests(client: PoolClient): Promise<LeaveRequest[]> {
    const { rows } = await client.query(
      "SELECT * FROM leave_wfh.leave_requests ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      request_code: row.request_code,
      employee_user_id: row.employee_user_id,
      leave_type: row.leave_type,
      date_from: asDate(row.date_from),
      date_to: asDate(row.date_to),
      half_day: Boolean(row.half_day),
      duration: Number(row.duration),
      reason: row.reason,
      document_ids: Array.isArray(row.document_ids) ? row.document_ids : [],
      status: row.status,
      current_approver_user_id: row.current_approver_user_id,
      decision_remarks: row.decision_remarks,
      decided_by_user_id: row.decided_by_user_id,
      decided_at: asIsoOrNull(row.decided_at),
      cancelled_at: asIsoOrNull(row.cancelled_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadWfhRequests(client: PoolClient): Promise<WfhRequest[]> {
    const { rows } = await client.query(
      "SELECT * FROM leave_wfh.wfh_requests ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      request_code: row.request_code,
      employee_user_id: row.employee_user_id,
      date_from: asDate(row.date_from),
      date_to: asDate(row.date_to),
      half_day: Boolean(row.half_day),
      duration: Number(row.duration),
      reason: row.reason,
      project_ref: row.project_ref,
      status: row.status,
      current_approver_user_id: row.current_approver_user_id,
      decision_remarks: row.decision_remarks,
      decided_by_user_id: row.decided_by_user_id,
      decided_at: asIsoOrNull(row.decided_at),
      cancelled_at: asIsoOrNull(row.cancelled_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadHolidays(client: PoolClient, scope?: { companyId: UUID; year: number }): Promise<Holiday[]> {
    const { rows } = scope
      ? await client.query(
          `SELECT * FROM leave_wfh.holidays WHERE company_id = $1 AND deleted_at IS NULL
           AND holiday_date >= $2::date AND holiday_date < $3::date ORDER BY holiday_date, name`,
          [scope.companyId, `${scope.year}-01-01`, `${scope.year + 1}-01-01`],
        )
      : await client.query("SELECT * FROM leave_wfh.holidays ORDER BY holiday_date, name");
    return rows.map(mapHolidayRow);
  }

  private async loadEmsEmployeeProfiles(
    client: PoolClient,
  ): Promise<EmsEmployeeProfile[]> {
    const { rows } = await client.query(
      "SELECT * FROM ems.employee_profiles ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      personal_email: row.personal_email,
      phone: row.phone,
      alternate_phone: row.alternate_phone,
      current_address: row.current_address,
      permanent_address: row.permanent_address,
      city: row.city,
      country: row.country,
      emergency_contact: json(row.emergency_contact),
      personal_details: json(row.personal_details),
      work_preferences: json(row.work_preferences),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadEmsProfileChangeRequests(
    client: PoolClient,
  ): Promise<EmsProfileChangeRequest[]> {
    const { rows } = await client.query(
      "SELECT * FROM ems.profile_change_requests ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      request_code: row.request_code,
      employee_user_id: row.employee_user_id,
      field_key: row.field_key,
      field_label: row.field_label,
      old_value: row.old_value,
      new_value: row.new_value,
      reason: row.reason,
      supporting_document_ids: Array.isArray(row.supporting_document_ids)
        ? row.supporting_document_ids
        : [],
      status: row.status,
      current_approver_user_id: row.current_approver_user_id,
      decision_remarks: row.decision_remarks,
      decided_by_user_id: row.decided_by_user_id,
      decided_at: asIsoOrNull(row.decided_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadEmsServiceRequests(
    client: PoolClient,
  ): Promise<EmsServiceRequest[]> {
    const { rows } = await client.query(
      "SELECT * FROM ems.service_requests ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      request_code: row.request_code,
      requester_user_id: row.requester_user_id,
      request_type: row.request_type,
      subject: row.subject,
      description: row.description,
      document_ids: Array.isArray(row.document_ids) ? row.document_ids : [],
      status: row.status,
      assignee_user_id: row.assignee_user_id,
      decision_remarks: row.decision_remarks,
      decided_by_user_id: row.decided_by_user_id,
      decided_at: asIsoOrNull(row.decided_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadEmsLetters(client: PoolClient): Promise<EmsLetter[]> {
    const { rows } = await client.query(
      "SELECT * FROM ems.letters ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      letter_type: row.letter_type,
      title: row.title,
      description: row.description,
      status: row.status,
      document_id: row.document_id,
      issued_on: asDateOrNull(row.issued_on),
      acknowledged_at: asIsoOrNull(row.acknowledged_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadEmsPolicies(client: PoolClient): Promise<EmsPolicy[]> {
    const { rows } = await client.query(
      "SELECT * FROM ems.policies ORDER BY effective_from DESC, title",
    );
    return rows.map((row) => ({
      id: row.id,
      policy_code: row.policy_code,
      title: row.title,
      category: row.category,
      version_label: row.version_label,
      effective_from: asDate(row.effective_from),
      document_id: row.document_id,
      status: row.status,
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadEmsPolicyAcknowledgements(
    client: PoolClient,
  ): Promise<EmsPolicyAcknowledgement[]> {
    const { rows } = await client.query(
      "SELECT * FROM ems.policy_acknowledgements ORDER BY created_at, id",
    );
    return rows.map((row) => ({
      id: row.id,
      policy_id: row.policy_id,
      employee_user_id: row.employee_user_id,
      status: row.status,
      acknowledged_at: asIsoOrNull(row.acknowledged_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
    }));
  }

  private async loadEmsAdminChecklists(
    client: PoolClient,
  ): Promise<EmsAdminChecklist[]> {
    const { rows } = await client.query(
      "SELECT * FROM ems.admin_checklists ORDER BY updated_at DESC, id",
    );
    return rows.map((row) => ({
      id: row.id,
      checklist_type: row.checklist_type,
      employee_user_id: row.employee_user_id,
      status: row.status,
      due_date: asDateOrNull(row.due_date),
      checklist: booleanRecord(row.checklist),
      remarks: row.remarks,
      completed_at: asIsoOrNull(row.completed_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async loadEmsProbationReviews(
    client: PoolClient,
  ): Promise<EmsProbationReview[]> {
    const { rows } = await client.query(
      "SELECT * FROM ems.probation_reviews ORDER BY due_on, id",
    );
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      joining_on: asDate(row.joining_on),
      due_on: asDate(row.due_on),
      status: row.status,
      extended_until: asDateOrNull(row.extended_until),
      remarks: row.remarks,
      decided_by_user_id: row.decided_by_user_id,
      decided_at: asIsoOrNull(row.decided_at),
      version: row.version,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
    }));
  }

  private async flushCore(client: PoolClient): Promise<void> {
    await this.flushCoreMasterData(client);
    for (const role of this.store.rbacRoles) {
      await client.query(
        `INSERT INTO core.roles (id, role_key, name, description, status, builtin, deleted_at, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (role_key) DO UPDATE
         SET name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status,
             builtin = EXCLUDED.builtin, deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version,
             updated_at = now()`,
        [
          role.id,
          role.role_key,
          role.name,
          role.description,
          role.status,
          role.builtin,
          role.deleted_at,
          role.version,
        ],
      );
    }
    for (const permission of this.store.rbacRolePermissions) {
      await client.query(
        `INSERT INTO core.role_permissions (id, role_key, permission_id, status, deleted_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (role_key, permission_id) DO UPDATE
         SET status = EXCLUDED.status, deleted_at = EXCLUDED.deleted_at, updated_at = now()`,
        [
          permission.id,
          permission.role_key,
          permission.permission_id,
          permission.status,
          permission.deleted_at,
        ],
      );
    }
    await this.flushCoreUsersAndCredentials(client);
  }

  private async flushCoreMasterData(client: PoolClient): Promise<void> {
    for (const designation of this.store.designations) {
      await client.query(
        `INSERT INTO core.designations (id, company_id, designation_code, title, level, status, deleted_at, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE
         SET company_id = EXCLUDED.company_id,
             designation_code = EXCLUDED.designation_code, title = EXCLUDED.title, level = EXCLUDED.level,
             status = EXCLUDED.status, deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version,
             updated_at = now()`,
        [
          designation.id,
          designation.company_id,
          designation.designation_code,
          designation.title,
          designation.level,
          designation.status,
          designation.deleted_at,
          designation.version,
        ],
      );
    }
    for (const department of this.store.departments) {
      await client.query(
        `INSERT INTO core.departments (id, company_id, department_code, name, cost_center, parent_department_id, director_user_id, status, deleted_at, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE
         SET company_id = EXCLUDED.company_id,
             department_code = EXCLUDED.department_code, name = EXCLUDED.name,
             cost_center = EXCLUDED.cost_center,
             parent_department_id = EXCLUDED.parent_department_id,
             director_user_id = EXCLUDED.director_user_id, status = EXCLUDED.status,
             deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version,
             updated_at = now()`,
        [
          department.id,
          department.company_id,
          department.department_code,
          department.name,
          department.cost_center,
          department.parent_department_id,
          department.director_user_id,
          department.status,
          department.deleted_at,
          department.version,
        ],
      );
    }
  }

  private async flushAuthCore(
    client: PoolClient,
    options: AuthPersistenceFlushOptions,
  ): Promise<void> {
    await this.flushCoreUsersAndCredentials(
      client,
      optionalSet(options.userIds),
    );
  }

  private async flushCoreUsersAndCredentials(
    client: PoolClient,
    userIds?: ReadonlySet<string>,
  ): Promise<void> {
    for (const user of this.store.users) {
      if (userIds && !userIds.has(user.id)) continue;
      await client.query(
        `INSERT INTO core.users (
          id, employee_code, email, full_name, department_id, designation_id, manager_user_id,
          hierarchy_path, employment_status, email_verified_at, email_verification_status,
          profile_photo_document_id, profile_photo_url, timezone, joined_on, terminated_on, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::ltree, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO UPDATE
        SET employee_code = EXCLUDED.employee_code, email = EXCLUDED.email, full_name = EXCLUDED.full_name,
            department_id = EXCLUDED.department_id, designation_id = EXCLUDED.designation_id,
            manager_user_id = EXCLUDED.manager_user_id, hierarchy_path = EXCLUDED.hierarchy_path,
            employment_status = EXCLUDED.employment_status,
            email_verified_at = EXCLUDED.email_verified_at,
            email_verification_status = EXCLUDED.email_verification_status,
            profile_photo_document_id = EXCLUDED.profile_photo_document_id,
            profile_photo_url = EXCLUDED.profile_photo_url,
            timezone = EXCLUDED.timezone,
            joined_on = EXCLUDED.joined_on, terminated_on = EXCLUDED.terminated_on,
            deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version, updated_at = now()`,
        [
          user.id,
          user.employee_code,
          user.email,
          user.full_name,
          user.department_id,
          user.designation_id,
          user.manager_user_id,
          user.hierarchy_path,
          user.employment_status,
          user.email_verified_at,
          user.email_verification_status ?? "unverified",
          user.profile_photo_document_id ?? null,
          user.profile_photo_url ?? null,
          user.timezone,
          user.joined_on,
          user.terminated_on,
          user.deleted_at,
          user.version,
        ],
      );
      await client.query("DELETE FROM core.user_roles WHERE user_id = $1", [
        user.id,
      ]);
      for (const role of user.roles) {
        await client.query(
          `INSERT INTO core.user_roles (user_id, role_key, status, effective_from)
           VALUES ($1, $2, 'active', '2026-01-01')`,
          [user.id, role],
        );
      }
    }
    for (const credential of this.store.userCredentials) {
      if (userIds && !userIds.has(credential.user_id)) continue;
      await client.query(
        `INSERT INTO platform.user_credentials (
          id, user_id, password_hash, status, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          credential.id,
          credential.user_id,
          credential.password_hash,
          credential.status,
          credential.created_at,
          credential.updated_at,
          credential.deleted_at,
        ],
      );
    }
  }

  private async flushPlatform(
    client: PoolClient,
    financeRoutingLockHeld = false,
    includeInitialNotifications = false,
  ): Promise<void> {
    if (!financeRoutingLockHeld) {
      // Platform-only writers use the same lock-before-row order as routing
      // commands and the full-store writer.
      await lockExpenseFinanceGovernanceWriter(client);
    }
    for (const company of this.store.companyProfiles) {
      await client.query(
        `INSERT INTO platform.company_profiles (
          id, company_name, company_slug, website, industry, address, timezone, locale, currency,
          fiscal_year_start_month, working_week, work_hours_per_day, logo_label,
          logo_document_id, logo_url, logo_file_name, logo_mime_type, logo_size_bytes,
          status, bootstrap_completed_at, created_at, updated_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        ON CONFLICT (id) DO UPDATE
        SET company_name = EXCLUDED.company_name, website = EXCLUDED.website,
            industry = EXCLUDED.industry, address = EXCLUDED.address, timezone = EXCLUDED.timezone,
            locale = EXCLUDED.locale, currency = EXCLUDED.currency,
            fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
            working_week = EXCLUDED.working_week, work_hours_per_day = EXCLUDED.work_hours_per_day,
            logo_label = EXCLUDED.logo_label,
            logo_document_id = EXCLUDED.logo_document_id,
            logo_url = EXCLUDED.logo_url,
            logo_file_name = EXCLUDED.logo_file_name,
            logo_mime_type = EXCLUDED.logo_mime_type,
            logo_size_bytes = EXCLUDED.logo_size_bytes,
            status = EXCLUDED.status, bootstrap_completed_at = EXCLUDED.bootstrap_completed_at,
            updated_at = EXCLUDED.updated_at, version = EXCLUDED.version`,
        [
          company.id,
          company.company_name,
          company.company_slug,
          company.website,
          company.industry,
          company.address,
          company.timezone,
          company.locale,
          company.currency,
          company.fiscal_year_start_month,
          company.working_week,
          company.work_hours_per_day,
          company.logo_label,
          company.logo_document_id,
          company.logo_url,
          company.logo_file_name,
          company.logo_mime_type,
          company.logo_size_bytes,
          company.status,
          company.bootstrap_completed_at,
          company.created_at,
          company.updated_at,
          company.version,
        ],
      );
    }
    for (const workflow of this.store.adminWorkflows) {
      await client.query(
        `INSERT INTO platform.admin_workflows (
          id, workflow_key, module, label, status, stages, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
        ON CONFLICT (workflow_key) DO UPDATE
        SET module = EXCLUDED.module, label = EXCLUDED.label, status = EXCLUDED.status,
            stages = EXCLUDED.stages, updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version`,
        [
          workflow.id,
          workflow.workflow_key,
          workflow.module,
          workflow.label,
          workflow.status,
          JSON.stringify(workflow.stages),
          workflow.created_at,
          workflow.updated_at,
          workflow.deleted_at,
          workflow.version,
        ],
      );
    }
    for (const policy of this.store.adminPolicies) {
      await client.query(
        `INSERT INTO platform.admin_policies (
          id, company_id, policy_key, module, label, status, config, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE
        SET company_id = EXCLUDED.company_id,
            policy_key = EXCLUDED.policy_key,
            module = EXCLUDED.module, label = EXCLUDED.label, status = EXCLUDED.status,
            config = EXCLUDED.config, updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version`,
        [
          policy.id,
          policy.company_id,
          policy.policy_key,
          policy.module,
          policy.label,
          policy.status,
          JSON.stringify(policy.config),
          policy.created_at,
          policy.updated_at,
          policy.deleted_at,
          policy.version,
        ],
      );
      await this.publishAttendanceAdminPolicyVersion(client, policy);
    }
    for (const template of this.store.adminEmailTemplates) {
      await client.query(
        `INSERT INTO platform.admin_email_templates (
          id, template_key, module, name, subject, body, locale, status, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (template_key) DO UPDATE
        SET module = EXCLUDED.module, name = EXCLUDED.name, subject = EXCLUDED.subject,
            body = EXCLUDED.body, locale = EXCLUDED.locale, status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version`,
        [
          template.id,
          template.template_key,
          template.module,
          template.name,
          template.subject,
          template.body,
          template.locale,
          template.status,
          template.created_at,
          template.updated_at,
          template.deleted_at,
          template.version,
        ],
      );
    }
    for (const channel of this.store.adminNotificationChannels) {
      await client.query(
        `INSERT INTO platform.admin_notification_channels (
          id, event_key, module, label, in_app_enabled, email_enabled, push_enabled, status, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (event_key) DO UPDATE
        SET module = EXCLUDED.module, label = EXCLUDED.label,
            in_app_enabled = EXCLUDED.in_app_enabled, email_enabled = EXCLUDED.email_enabled,
            push_enabled = EXCLUDED.push_enabled, status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version`,
        [
          channel.id,
          channel.event_key,
          channel.module,
          channel.label,
          channel.in_app_enabled,
          channel.email_enabled,
          channel.push_enabled,
          channel.status,
          channel.created_at,
          channel.updated_at,
          channel.deleted_at,
          channel.version,
        ],
      );
    }
    for (const item of this.store.adminMasterDataItems) {
      await client.query(
        `INSERT INTO platform.admin_master_data_items (
          id, master_key, code, name, description, status, sort_order, metadata, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE
        SET master_key = EXCLUDED.master_key,
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            status = EXCLUDED.status,
            sort_order = EXCLUDED.sort_order,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version`,
        [
          item.id,
          item.master_key,
          item.code,
          item.name,
          item.description,
          item.status,
          item.sort_order,
          JSON.stringify(item.metadata),
          item.created_at,
          item.updated_at,
          item.deleted_at,
          item.version,
        ],
      );
    }
    const security = this.store.adminSecuritySettings;
    await client.query(
      `INSERT INTO platform.admin_security_settings (
        id, settings_key, password_min_length, password_require_special, password_require_number,
        password_expiry_days, session_timeout_minutes, login_attempt_limit, mfa_enabled,
        audit_role_changes, ip_device_audit_enabled, created_at, updated_at, deleted_at, version
      )
      VALUES ($1, 'default', $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (settings_key) DO UPDATE
      SET password_min_length = EXCLUDED.password_min_length,
          password_require_special = EXCLUDED.password_require_special,
          password_require_number = EXCLUDED.password_require_number,
          password_expiry_days = EXCLUDED.password_expiry_days,
          session_timeout_minutes = EXCLUDED.session_timeout_minutes,
          login_attempt_limit = EXCLUDED.login_attempt_limit,
          mfa_enabled = false,
          audit_role_changes = EXCLUDED.audit_role_changes,
          ip_device_audit_enabled = EXCLUDED.ip_device_audit_enabled,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          version = EXCLUDED.version`,
      [
        security.id,
        security.password_min_length,
        security.password_require_special,
        security.password_require_number,
        security.password_expiry_days,
        security.session_timeout_minutes,
        security.login_attempt_limit,
        security.audit_role_changes,
        security.ip_device_audit_enabled,
        security.created_at,
        security.updated_at,
        security.deleted_at,
        security.version,
      ],
    );
    for (const preference of this.store.userSessionPreferences) {
      await client.query(
        `INSERT INTO platform.user_session_preferences (
          id, user_id, active_role, company_id, landing_page, locale, timezone, created_at, updated_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id) DO UPDATE
        SET active_role = EXCLUDED.active_role, company_id = EXCLUDED.company_id,
            landing_page = EXCLUDED.landing_page, locale = EXCLUDED.locale,
            timezone = EXCLUDED.timezone, updated_at = EXCLUDED.updated_at, version = EXCLUDED.version`,
        [
          preference.id,
          preference.user_id,
          preference.active_role,
          preference.company_id,
          preference.landing_page,
          preference.locale,
          preference.timezone,
          preference.created_at,
          preference.updated_at,
          preference.version,
        ],
      );
    }
    for (const token of this.store.authTokens) {
      await client.query(
        `INSERT INTO platform.auth_tokens (
          id, token_hash, token_type, user_id, email, company_id, status, expires_at, used_at,
          revoked_at, created_ip_hash, user_agent_hash, last_sent_at, send_count, created_at, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            used_at = EXCLUDED.used_at,
            revoked_at = EXCLUDED.revoked_at,
            last_sent_at = EXCLUDED.last_sent_at,
            send_count = EXCLUDED.send_count,
            metadata = EXCLUDED.metadata`,
        [
          token.id,
          token.token_hash,
          token.token_type,
          token.user_id,
          token.email,
          token.company_id,
          token.status,
          token.expires_at,
          token.used_at,
          token.revoked_at,
          token.created_ip_hash,
          token.user_agent_hash,
          token.last_sent_at,
          token.send_count,
          token.created_at,
          JSON.stringify(token.metadata),
        ],
      );
    }
    if (this.store.financeGovernanceConfig) {
      const config = this.store.financeGovernanceConfig;
      await client.query(
        `INSERT INTO platform.finance_governance_config (
          id,
          scope_key,
          primary_finance_manager_user_id,
          finance_self_request_fallback_user_id,
          manager_backup_user_id,
          finance_approval_backup_user_id,
          status,
          effective_from,
          effective_to,
          updated_by_user_id,
          created_at,
          updated_at,
          deleted_at,
          version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE
        SET primary_finance_manager_user_id = EXCLUDED.primary_finance_manager_user_id,
            finance_self_request_fallback_user_id = EXCLUDED.finance_self_request_fallback_user_id,
            manager_backup_user_id = EXCLUDED.manager_backup_user_id,
            finance_approval_backup_user_id = EXCLUDED.finance_approval_backup_user_id,
            status = EXCLUDED.status,
            effective_from = EXCLUDED.effective_from,
            effective_to = EXCLUDED.effective_to,
            updated_by_user_id = EXCLUDED.updated_by_user_id,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version`,
        [
          config.id,
          config.scope_key,
          config.primary_finance_manager_user_id,
          config.finance_approval_backup_user_id,
          config.manager_backup_user_id,
          config.finance_approval_backup_user_id,
          config.status,
          config.effective_from,
          config.effective_to,
          config.updated_by_user_id,
          config.created_at,
          config.updated_at,
          config.deleted_at,
          config.version,
        ],
      );
    }
    // Runtime notification writes are transaction-owned. Replaying the
    // process-start snapshot here would overwrite a newer SQL read marker.
    // Only the empty-database seed may persist the initial notification set.
    if (includeInitialNotifications) {
      for (const notification of this.store.notifications) {
        await client.query(
          `INSERT INTO platform.notifications (
            id, actor_user_id, target_user_id, event_type, payload, status, read_at, version, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)`,
          [
            notification.id,
            notification.actor_user_id,
            notification.target_user_id,
            notification.event_type,
            JSON.stringify(notification.payload),
            notification.status,
            notification.read_at,
            notification.version,
            notification.created_at,
            notification.updated_at,
          ],
        );
      }
    }
    for (const delivery of this.store.emailDeliveries) {
      await client.query(
        `INSERT INTO platform.email_deliveries (
          id, provider, template_key, purpose, user_id, email, subject, status, provider_email_id,
          idempotency_key, error_code, error_message, queued_at, sent_at, delivered_at, failed_at,
          bounced_at, complained_at, metadata, created_at, updated_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21, $22)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            provider_email_id = EXCLUDED.provider_email_id,
            error_code = EXCLUDED.error_code,
            error_message = EXCLUDED.error_message,
            sent_at = EXCLUDED.sent_at,
            delivered_at = EXCLUDED.delivered_at,
            failed_at = EXCLUDED.failed_at,
            bounced_at = EXCLUDED.bounced_at,
            complained_at = EXCLUDED.complained_at,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at,
            version = EXCLUDED.version`,
        [
          delivery.id,
          delivery.provider,
          delivery.template_key,
          delivery.purpose,
          delivery.user_id,
          delivery.email,
          delivery.subject,
          delivery.status,
          delivery.provider_email_id,
          delivery.idempotency_key,
          delivery.error_code,
          delivery.error_message,
          delivery.queued_at,
          delivery.sent_at,
          delivery.delivered_at,
          delivery.failed_at,
          delivery.bounced_at,
          delivery.complained_at,
          JSON.stringify(delivery.metadata),
          delivery.created_at,
          delivery.updated_at,
          delivery.version,
        ],
      );
    }
    for (const event of this.store.emailEvents) {
      await client.query(
        `INSERT INTO platform.email_events (
          id, provider, provider_event_id, provider_email_id, event_type, email, delivery_id, payload, received_at, processed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
        ON CONFLICT (provider, provider_event_id) DO UPDATE
        SET provider_email_id = EXCLUDED.provider_email_id,
            email = EXCLUDED.email,
            delivery_id = EXCLUDED.delivery_id,
            payload = EXCLUDED.payload,
            processed_at = EXCLUDED.processed_at`,
        [
          event.id,
          event.provider,
          event.provider_event_id,
          event.provider_email_id,
          event.event_type,
          event.email,
          event.delivery_id,
          JSON.stringify(event.payload),
          event.received_at,
          event.processed_at,
        ],
      );
    }
    await this.flushOutbox(client);
  }

  private async publishAttendanceAdminPolicyVersion(
    client: PoolClient,
    policy: AdminPolicyConfigRecord,
  ): Promise<void> {
    if (
      policy.policy_key !== "attendance" ||
      !policy.company_id ||
      policy.deleted_at
    ) {
      return;
    }
    const effectiveFrom = policy.updated_at ?? policy.created_at;
    const normalizedConfig = normalizeAttendancePolicyConfig(policy.config);
    await client.query(
      `INSERT INTO attendance.policies (
          id, company_id, policy_key, name, label, status,
          created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET policy_key = EXCLUDED.policy_key,
            name = EXCLUDED.name,
            label = EXCLUDED.label,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version`,
      [
        policy.id,
        policy.company_id,
        policy.policy_key,
        policy.policy_key,
        policy.label,
        policy.status === "inactive" ? "inactive" : "active",
        policy.created_at,
        policy.updated_at,
        policy.deleted_at,
        policy.version,
      ],
    );

    const openVersion = (
      await client.query<{ id: string; version_number: number }>(
        `SELECT id, version_number
        FROM attendance.policy_versions
        WHERE company_id = $1
          AND policy_id = $2
          AND effective_until IS NULL
        ORDER BY version_number DESC
        LIMIT 1
        FOR UPDATE`,
        [policy.company_id, policy.id],
      )
    ).rows[0];
    if (openVersion && openVersion.version_number < policy.version) {
      await client.query(
        `UPDATE attendance.policy_versions
          SET effective_until = $3
          WHERE id = $1
            AND company_id = $2
            AND effective_until IS NULL`,
        [openVersion.id, policy.company_id, effectiveFrom],
      );
    }

    await client.query(
      `INSERT INTO attendance.policy_versions (
          company_id, policy_id, version_number, effective_from, config, created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $4)
        ON CONFLICT (policy_id, version_number) DO NOTHING`,
      [
        policy.company_id,
        policy.id,
        Math.max(1, policy.version),
        effectiveFrom,
        JSON.stringify(normalizedConfig),
      ],
    );

    const existingAssignment = (
      await client.query<{ id: string }>(
        `SELECT id
        FROM attendance.policy_assignments
        WHERE company_id = $1
          AND policy_id = $2
          AND scope_type = 'company'
          AND scope_id IS NULL
          AND deleted_at IS NULL
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE`,
        [policy.company_id, policy.id],
      )
    ).rows[0];
    const assignmentStatus = policy.status === "active" ? "active" : "inactive";
    if (existingAssignment) {
      await client.query(
        `UPDATE attendance.policy_assignments
          SET status = $3,
              updated_at = $4,
              version = version + 1
          WHERE id = $1
            AND company_id = $2`,
        [
          existingAssignment.id,
          policy.company_id,
          assignmentStatus,
          effectiveFrom,
        ],
      );
      return;
    }

    await client.query(
      `INSERT INTO attendance.policy_assignments (
          company_id, policy_id, scope_type, scope_id, effective_from, status,
          created_at, updated_at
        )
        VALUES ($1, $2, 'company', NULL, $3, $4, $3, $3)`,
      [policy.company_id, policy.id, effectiveFrom, assignmentStatus],
    );
  }

  private async flushOutbox(
    client: PoolClient,
    aggregateIds?: ReadonlySet<string>,
    sourceStore: DataStore = this.store,
  ): Promise<void> {
    for (const event of sourceStore.outbox) {
      if (aggregateIds && !aggregateIds.has(event.aggregate_id)) continue;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO platform.outbox_events (
          event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key,
          status, retry_count, available_at, created_at, published_at, failed_at, last_error
        )
        SELECT $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13
        WHERE NOT EXISTS (SELECT 1 FROM platform.outbox_events WHERE event_id = $1)
        -- The API's hydrated outbox snapshot can be older than a separately
        -- running publisher. Only insert new events here; delivery state is
        -- owned by the publisher's direct PostgreSQL transaction.
        ON CONFLICT DO NOTHING
        RETURNING id`,
        [
          event.event_id,
          event.aggregate_type,
          event.aggregate_id,
          event.event_type,
          JSON.stringify(event.payload),
          event.idempotency_key,
          event.status,
          event.retry_count,
          event.available_at,
          event.created_at,
          event.published_at,
          event.failed_at,
          event.last_error,
        ],
      );
      const existing = inserted.rows[0] ? null : (
        await client.query<{ id: string; aggregate_type: string; aggregate_id: string; event_type: string; payload: unknown }>(
          "SELECT id, aggregate_type, aggregate_id, event_type, payload FROM platform.outbox_events WHERE event_id = $1 OR idempotency_key = $2",
          [event.event_id, event.idempotency_key],
        )
      ).rows[0];
      if (existing && (existing.aggregate_type !== event.aggregate_type || existing.aggregate_id !== event.aggregate_id || existing.event_type !== event.event_type || !isDeepStrictEqual(existing.payload, event.payload))) {
        throw conflict("Outbox idempotency key was already used for a different event.");
      }
      const persistedId = inserted.rows[0]?.id ?? existing?.id;
      if (!persistedId) {
        throw new Error("Outbox event was not persisted.");
      }
      event.id = Number(persistedId);
      sourceStore.nextOutboxId = Math.max(sourceStore.nextOutboxId, event.id + 1);
    }
  }

  private async flushExpenses(
    client: PoolClient,
    sourceStore: DataStore = this.store,
    reviewerRoutingLocksHeld = false,
  ): Promise<void> {
    if (!reviewerRoutingLocksHeld) {
      await lockExpenseReviewerRoutingWriter(
        client,
        sourceStore.managerBackupAssignments.map(
          (mapping) => mapping.employee_user_id,
        ),
      );
    }
    for (const mapping of sourceStore.managerBackupAssignments) {
      await client.query(
        `INSERT INTO expenses.employee_reviewer_mappings (
          id, company_id, owner_resolution_status, owner_resolution_reason,
          employee_user_id, reviewer_user_id, assigned_by_user_id, effective_from,
          effective_to, status, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE
        SET reviewer_user_id = EXCLUDED.reviewer_user_id, effective_to = EXCLUDED.effective_to,
            status = EXCLUDED.status, updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version`,
        [
          mapping.id,
          mapping.company_id,
          mapping.owner_resolution_status,
          mapping.owner_resolution_reason,
          mapping.employee_user_id,
          mapping.backup_manager_user_id,
          mapping.assigned_by_user_id,
          mapping.effective_from,
          mapping.effective_to,
          mapping.status,
          mapping.created_at,
          mapping.updated_at,
          mapping.deleted_at,
          mapping.version,
        ],
      );
    }
    for (const ticket of sourceStore.tickets) {
      if (!ticket.company_id || ticket.owner_resolution_status !== "typed_creation") {
        throw new Error("Whole-domain flush cannot persist unowned or historical expense tickets");
      }
      await client.query(
        `INSERT INTO expenses.expense_tickets (
          id, ticket_no, requester_user_id, requester_role_snapshot, department_id, expense_type,
          expense_sub_type, project_code, client_name, task_title, task_description, location,
          start_date, end_date, estimated_amount, payment_type, advance_amount, advance_justification,
          assigned_reviewer_id, director_approver_id, finance_manager_id,
          manager_verifier_id, manager_backup_user_id, finance_approver_id,
          status, actual_amount, variance_amount, payment_reference_no, closure_remarks, context_payload, route_snapshot,
          policy_snapshot, version, created_at, updated_at, submitted_at, closed_at, deleted_at,
          company_id, owner_resolution_status, owner_resolution_reason
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
          $30::jsonb, $31::jsonb, $32::jsonb, $33, $34, $35, $36, $37, $38,
          $39, $40, $41
        )
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, assigned_reviewer_id = EXCLUDED.assigned_reviewer_id,
            director_approver_id = EXCLUDED.director_approver_id, finance_manager_id = EXCLUDED.finance_manager_id,
            manager_verifier_id = EXCLUDED.manager_verifier_id,
            manager_backup_user_id = EXCLUDED.manager_backup_user_id,
            finance_approver_id = EXCLUDED.finance_approver_id,
            actual_amount = EXCLUDED.actual_amount, variance_amount = EXCLUDED.variance_amount,
            payment_reference_no = EXCLUDED.payment_reference_no, closure_remarks = EXCLUDED.closure_remarks,
            context_payload = EXCLUDED.context_payload, route_snapshot = EXCLUDED.route_snapshot,
            policy_snapshot = EXCLUDED.policy_snapshot, version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at, submitted_at = EXCLUDED.submitted_at,
            closed_at = EXCLUDED.closed_at, deleted_at = EXCLUDED.deleted_at`,
        [
          ticket.id,
          ticket.ticket_no,
          ticket.requester_user_id,
          ticket.requester_role_snapshot,
          ticket.department_id,
          ticket.expense_type,
          ticket.expense_sub_type,
          ticket.project_code,
          ticket.client_name,
          ticket.task_title,
          ticket.task_description,
          ticket.location,
          ticket.start_date,
          ticket.end_date,
          ticket.estimated_amount,
          ticket.payment_type,
          ticket.advance_amount,
          ticket.advance_justification,
          ticket.manager_verifier_id,
          null,
          ticket.finance_approver_id,
          ticket.manager_verifier_id,
          ticket.manager_backup_user_id,
          ticket.finance_approver_id,
          ticket.status,
          ticket.actual_amount,
          ticket.variance_amount,
          ticket.payment_reference_no,
          ticket.closure_remarks,
          JSON.stringify(ticket.context_payload),
          JSON.stringify(ticket.route_snapshot),
          JSON.stringify(ticket.policy_snapshot),
          ticket.version,
          ticket.created_at,
          ticket.updated_at,
          ticket.submitted_at,
          ticket.closed_at,
          ticket.deleted_at,
          ticket.company_id,
          ticket.owner_resolution_status,
          ticket.owner_resolution_reason ?? null,
        ],
      );
    }
    for (const item of sourceStore.lineItems) {
      await client.query(
        `INSERT INTO expenses.expense_line_items (
          id, ticket_id, line_category, description, quantity, unit_cost, line_total,
          tax_amount, vendor_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE
        SET line_category = EXCLUDED.line_category, description = EXCLUDED.description,
            quantity = EXCLUDED.quantity, unit_cost = EXCLUDED.unit_cost,
            line_total = EXCLUDED.line_total, tax_amount = EXCLUDED.tax_amount,
            vendor_name = EXCLUDED.vendor_name, updated_at = now()`,
        [
          item.id,
          item.ticket_id,
          item.line_category,
          item.description,
          item.quantity,
          item.unit_cost,
          item.line_total,
          item.tax_amount,
          item.vendor_name,
        ],
      );
    }
    for (const approval of sourceStore.expenseApprovals) {
      await client.query(
        `INSERT INTO expenses.expense_approvals (
          id, ticket_id, approval_stage, approver_user_id, decision, remarks,
          role_snapshot, designation_snapshot, route_snapshot, action_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
        ON CONFLICT (id) DO NOTHING`,
        [
          approval.id,
          approval.ticket_id,
          approval.approval_stage,
          approval.approver_user_id,
          approval.decision,
          approval.remarks,
          approval.role_snapshot,
          approval.designation_snapshot,
          JSON.stringify(approval.route_snapshot),
          approval.action_at,
          approval.created_at,
        ],
      );
    }
    for (const audit of sourceStore.auditLogs) {
      await client.query(
        `INSERT INTO expenses.expense_audit_logs (
          id, ticket_id, actor_user_id, event_type, old_value, new_value, remarks, payload_hash, created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING`,
        [
          audit.id,
          audit.ticket_id,
          audit.actor_user_id,
          audit.event_type,
          audit.old_value ? JSON.stringify(audit.old_value) : null,
          audit.new_value ? JSON.stringify(audit.new_value) : null,
          audit.remarks,
          audit.payload_hash,
          audit.created_at,
        ],
      );
    }
    for (const document of sourceStore.expenseDocuments) {
      await client.query(
        `INSERT INTO expenses.expense_documents (
          id, ticket_id, document_id, document_type, verification_status, uploaded_by, uploaded_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE
        SET verification_status = EXCLUDED.verification_status`,
        [
          document.id,
          document.ticket_id,
          document.document_id,
          document.document_type,
          document.verification_status,
          document.uploaded_by,
          document.uploaded_at,
        ],
      );
    }
    for (const payment of sourceStore.payments) {
      await client.query(
        `INSERT INTO expenses.expense_payments (
          id, ticket_id, payment_type, approved_amount, paid_amount, payment_date,
          payment_mode, reference_no, settlement_status, settlement_amount, processed_by_user_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE
        SET paid_amount = EXCLUDED.paid_amount, settlement_status = EXCLUDED.settlement_status,
            settlement_amount = EXCLUDED.settlement_amount`,
        [
          payment.id,
          payment.ticket_id,
          payment.payment_type,
          payment.approved_amount,
          payment.paid_amount,
          payment.payment_date,
          payment.payment_mode,
          payment.reference_no,
          payment.settlement_status,
          payment.settlement_amount,
          payment.processed_by_user_id,
          payment.created_at,
        ],
      );
    }
  }

  private async flushDocuments(
    client: PoolClient,
    documentIds?: ReadonlySet<string>,
  ): Promise<void> {
    for (const document of this.store.documents) {
      if (documentIds && !documentIds.has(document.id)) continue;
      await client.query(
        `INSERT INTO documents.doc_metadata (
          id, business_object_type, business_object_id, owner_user_id, classification, document_type,
          current_version, file_name, storage_key, mime_type, size_bytes, checksum_sha256,
          metadata, created_by_user_id, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17)
        ON CONFLICT (id) DO UPDATE
        SET current_version = EXCLUDED.current_version, file_name = EXCLUDED.file_name,
            storage_key = EXCLUDED.storage_key, mime_type = EXCLUDED.mime_type,
            size_bytes = EXCLUDED.size_bytes, checksum_sha256 = EXCLUDED.checksum_sha256,
            metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at`,
        [
          document.id,
          document.business_object_type,
          document.business_object_id,
          document.owner_user_id,
          document.classification,
          document.document_type,
          document.current_version,
          document.file_name,
          document.storage_key,
          document.mime_type,
          document.size_bytes,
          document.checksum_sha256,
          JSON.stringify(document.metadata),
          document.created_by_user_id,
          document.created_at,
          document.updated_at,
          document.deleted_at,
        ],
      );
    }
    for (const version of this.store.documentVersions) {
      if (documentIds && !documentIds.has(version.document_id)) continue;
      await client.query(
        `INSERT INTO documents.doc_versions (
          id, document_id, version, storage_key, file_name, size_bytes, checksum_sha256,
          created_by_user_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING`,
        [
          version.id,
          version.document_id,
          version.version,
          version.storage_key,
          version.file_name,
          version.size_bytes,
          version.checksum_sha256,
          version.created_by_user_id,
          version.created_at,
        ],
      );
    }
    for (const log of this.store.documentAccessLogs) {
      if (documentIds && !documentIds.has(log.document_id)) continue;
      await client.query(
        `INSERT INTO documents.doc_access_logs (id, document_id, actor_user_id, action, decision, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          log.id,
          log.document_id,
          log.actor_user_id,
          log.action,
          log.decision,
          log.reason,
          log.created_at,
        ],
      );
    }
  }

  private async flushAssets(client: PoolClient, source: DataStore): Promise<void> {
    for (const asset of source.assets) {
      await client.query(
        `INSERT INTO assets.assets (
          id, asset_code, qr_hash, asset_type, name, serial_no, status,
          current_assigned_user_id, metadata, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE
        SET asset_code = EXCLUDED.asset_code, qr_hash = EXCLUDED.qr_hash,
            asset_type = EXCLUDED.asset_type, name = EXCLUDED.name, serial_no = EXCLUDED.serial_no,
            status = EXCLUDED.status, current_assigned_user_id = EXCLUDED.current_assigned_user_id,
            metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version`,
        [
          asset.id,
          asset.asset_code,
          asset.qr_hash,
          asset.asset_type,
          asset.name,
          asset.serial_no,
          asset.status,
          asset.current_assigned_user_id,
          JSON.stringify(asset.metadata),
          asset.created_at,
          asset.updated_at,
          asset.deleted_at,
          asset.version,
        ],
      );
    }
    for (const assignment of source.assetAssignments) {
      await client.query(
        `INSERT INTO assets.asset_assignments (
          id, asset_id, assigned_to_user_id, assigned_by_user_id, assigned_at, returned_at,
          status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE
        SET returned_at = EXCLUDED.returned_at, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
        [
          assignment.id,
          assignment.asset_id,
          assignment.assigned_to_user_id,
          assignment.assigned_by_user_id,
          assignment.assigned_at,
          assignment.returned_at,
          assignment.status,
          assignment.created_at,
          assignment.updated_at,
        ],
      );
    }
    for (const event of source.assetStateEvents) {
      await client.query(
        `INSERT INTO assets.asset_state_events (id, asset_id, actor_user_id, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          event.id,
          event.asset_id,
          event.actor_user_id,
          event.event_type,
          JSON.stringify(event.payload),
          event.created_at,
        ],
      );
    }
    for (const request of source.assetRequests) {
      await client.query(
        `INSERT INTO assets.asset_requests (
          id, request_code, requester_user_id, request_type, asset_type, asset_id, reason, priority,
          needed_by, preferred_specs, status, decision_by_user_id, decision_at, decision_remarks,
          assigned_asset_id, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, decision_by_user_id = EXCLUDED.decision_by_user_id,
            decision_at = EXCLUDED.decision_at, decision_remarks = EXCLUDED.decision_remarks,
            assigned_asset_id = EXCLUDED.assigned_asset_id, version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at`,
        [
          request.id,
          request.request_code,
          request.requester_user_id,
          request.request_type,
          request.asset_type,
          request.asset_id,
          request.reason,
          request.priority,
          request.needed_by,
          JSON.stringify(request.preferred_specs),
          request.status,
          request.decision_by_user_id,
          request.decision_at,
          request.decision_remarks,
          request.assigned_asset_id,
          request.version,
          request.created_at,
          request.updated_at,
          request.deleted_at,
        ],
      );
    }
    for (const acknowledgement of source.assetAcknowledgements) {
      await client.query(
        `INSERT INTO assets.asset_acknowledgements (
          id, asset_id, employee_user_id, assignment_id, acknowledgement_type, status,
          acknowledged_at, version, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, acknowledged_at = EXCLUDED.acknowledged_at,
            version = EXCLUDED.version, updated_at = EXCLUDED.updated_at`,
        [
          acknowledgement.id,
          acknowledgement.asset_id,
          acknowledgement.employee_user_id,
          acknowledgement.assignment_id,
          acknowledgement.acknowledgement_type,
          acknowledgement.status,
          acknowledgement.acknowledged_at,
          acknowledgement.version,
          acknowledgement.created_at,
          acknowledgement.updated_at,
        ],
      );
    }
    for (const maintenance of source.assetMaintenanceRecords) {
      await client.query(
        `INSERT INTO assets.asset_maintenance_records (
          id, asset_id, maintenance_type, vendor_id, cost, started_on, completed_on,
          status, notes, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, completed_on = EXCLUDED.completed_on, notes = EXCLUDED.notes,
            version = EXCLUDED.version, updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at`,
        [
          maintenance.id,
          maintenance.asset_id,
          maintenance.maintenance_type,
          maintenance.vendor_id,
          maintenance.cost,
          maintenance.started_on,
          maintenance.completed_on,
          maintenance.status,
          maintenance.notes,
          maintenance.version,
          maintenance.created_at,
          maintenance.updated_at,
          maintenance.deleted_at,
        ],
      );
    }
    for (const vendor of source.assetVendors) {
      await client.query(
        `INSERT INTO assets.software_vendors (
          id, name, status, contact_email, phone, metadata, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, status = EXCLUDED.status, contact_email = EXCLUDED.contact_email,
            phone = EXCLUDED.phone, metadata = EXCLUDED.metadata, version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at`,
        [
          vendor.id,
          vendor.name,
          vendor.status,
          vendor.contact_email,
          vendor.phone,
          JSON.stringify(vendor.metadata),
          vendor.version,
          vendor.created_at,
          vendor.updated_at,
          vendor.deleted_at,
        ],
      );
    }
    for (const ticket of source.assetRecoveryTickets) {
      await client.query(
        `INSERT INTO assets.asset_recovery_tickets (
          id, employee_user_id, asset_id, assignment_id, status, settlement_status, settlement_amount,
          settlement_remarks, settled_by_user_id, settled_at, version, created_at, updated_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE
         SET assignment_id = EXCLUDED.assignment_id,
             status = EXCLUDED.status,
             settlement_status = EXCLUDED.settlement_status,
             settlement_amount = EXCLUDED.settlement_amount,
             settlement_remarks = EXCLUDED.settlement_remarks,
             settled_by_user_id = EXCLUDED.settled_by_user_id,
             settled_at = EXCLUDED.settled_at,
             version = EXCLUDED.version,
             updated_at = EXCLUDED.updated_at`,
        [
          ticket.id,
          ticket.employee_user_id,
          ticket.asset_id,
          ticket.assignment_id,
          ticket.status,
          ticket.settlement_status,
          ticket.settlement_amount,
          ticket.settlement_remarks,
          ticket.settled_by_user_id,
          ticket.settled_at,
          ticket.version,
          ticket.created_at,
          ticket.updated_at,
        ],
      );
    }
    for (const entitlement of source.licenseEntitlements) {
      await client.query(
        `INSERT INTO assets.license_entitlements (id, product_id, seat_count, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
         SET seat_count = EXCLUDED.seat_count, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
        [
          entitlement.id,
          entitlement.product_id,
          entitlement.seat_count,
          entitlement.status,
          entitlement.created_at,
          entitlement.updated_at,
        ],
      );
    }
    for (const activation of source.licenseActivations) {
      await client.query(
        `INSERT INTO assets.license_activations (
          id, product_id, entitlement_id, hardware_fingerprint_hash, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
        [
          activation.id,
          activation.product_id,
          activation.entitlement_id,
          activation.hardware_fingerprint_hash,
          activation.status,
          activation.created_at,
          activation.updated_at,
        ],
      );
    }
    for (const key of source.compromisedKeys) {
      await client.query(
        `INSERT INTO assets.compromised_keys (id, key_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (key_hash) DO UPDATE
         SET status = EXCLUDED.status, updated_at = now()`,
        [key.id, key.key_hash, key.status, key.created_at],
      );
    }
  }

  private async flushTimesheets(client: PoolClient): Promise<void> {
    for (const segment of this.store.workSegments) {
      await client.query(
        `INSERT INTO timesheets.work_segments (
          id, employee_user_id, work_date, project_code, task_code, hours,
          description, billable, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE
        SET hours = EXCLUDED.hours, description = EXCLUDED.description,
            updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at`,
        [
          segment.id,
          segment.employee_user_id,
          segment.work_date,
          segment.project_code,
          segment.task_code,
          segment.hours,
          segment.description,
          segment.billable,
          segment.created_at,
          segment.updated_at,
          segment.deleted_at,
        ],
      );
    }
    for (const workflow of this.store.workflowDefinitions) {
      await client.query(
        `INSERT INTO timesheets.workflow_definitions (
          id, name, module, definition, version, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE
        SET definition = EXCLUDED.definition, version = EXCLUDED.version,
            status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
        [
          workflow.id,
          workflow.name,
          workflow.module,
          JSON.stringify(workflow.definition),
          workflow.version,
          workflow.status,
          workflow.created_at,
          workflow.updated_at,
        ],
      );
    }
    for (const submission of this.store.timesheetSubmissions) {
      await client.query(
        `INSERT INTO timesheets.timesheet_submissions (
          id, employee_user_id, cycle_start, cycle_end, status, total_hours,
          workflow_definition_id, workflow_snapshot, current_approver_user_id,
          version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, total_hours = EXCLUDED.total_hours,
            workflow_snapshot = EXCLUDED.workflow_snapshot,
            current_approver_user_id = EXCLUDED.current_approver_user_id,
            version = EXCLUDED.version, updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          submission.id,
          submission.employee_user_id,
          submission.cycle_start,
          submission.cycle_end,
          submission.status,
          submission.total_hours,
          submission.workflow_definition_id,
          JSON.stringify(submission.workflow_snapshot),
          submission.current_approver_user_id,
          submission.version,
          submission.created_at,
          submission.updated_at,
          submission.deleted_at,
        ],
      );
    }
    for (const action of this.store.timesheetActions) {
      await client.query(
        `INSERT INTO timesheets.timesheet_approval_actions (
          id, submission_id, actor_user_id, decision, remarks, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING`,
        [
          action.id,
          action.submission_id,
          action.actor_user_id,
          action.decision,
          action.remarks,
          action.created_at,
        ],
      );
    }
  }

  private async flushProjects(client: PoolClient): Promise<void> {
    for (const project of this.store.projects) {
      await client.query(
        `INSERT INTO projects.projects (
          id, project_code, name, client_name, project_type, billing_type,
          manager_user_id, department_id, start_date, end_date, status, health,
          description, estimated_hours, actual_hours, estimated_budget, actual_spend,
          tech_stack, priority, cost_center, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20, $21, $22, $23, $24)
        ON CONFLICT (id) DO UPDATE
        SET project_code = EXCLUDED.project_code,
            name = EXCLUDED.name,
            client_name = EXCLUDED.client_name,
            project_type = EXCLUDED.project_type,
            billing_type = EXCLUDED.billing_type,
            manager_user_id = EXCLUDED.manager_user_id,
            department_id = EXCLUDED.department_id,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            status = EXCLUDED.status,
            health = EXCLUDED.health,
            description = EXCLUDED.description,
            estimated_hours = EXCLUDED.estimated_hours,
            actual_hours = EXCLUDED.actual_hours,
            estimated_budget = EXCLUDED.estimated_budget,
            actual_spend = EXCLUDED.actual_spend,
            tech_stack = EXCLUDED.tech_stack,
            priority = EXCLUDED.priority,
            cost_center = EXCLUDED.cost_center,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          project.id,
          project.project_code,
          project.name,
          project.client_name,
          project.project_type,
          project.billing_type,
          project.manager_user_id,
          project.department_id,
          project.start_date,
          project.end_date,
          project.status,
          project.health,
          project.description,
          project.estimated_hours,
          project.actual_hours,
          project.estimated_budget,
          project.actual_spend,
          JSON.stringify(project.tech_stack),
          project.priority,
          project.cost_center,
          project.version,
          project.created_at,
          project.updated_at,
          project.deleted_at,
        ],
      );
    }
    for (const member of this.store.projectMembers) {
      await client.query(
        `INSERT INTO projects.project_members (
          id, project_id, employee_user_id, project_role, allocation_percent,
          billable, start_date, end_date, reporting_lead_user_id, status,
          version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE
        SET project_role = EXCLUDED.project_role,
            allocation_percent = EXCLUDED.allocation_percent,
            billable = EXCLUDED.billable,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            reporting_lead_user_id = EXCLUDED.reporting_lead_user_id,
            status = EXCLUDED.status,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          member.id,
          member.project_id,
          member.employee_user_id,
          member.project_role,
          member.allocation_percent,
          member.billable,
          member.start_date,
          member.end_date,
          member.reporting_lead_user_id,
          member.status,
          member.version,
          member.created_at,
          member.updated_at,
          member.deleted_at,
        ],
      );
    }
    for (const allocation of this.store.projectAllocations) {
      await client.query(
        `INSERT INTO projects.project_allocations (
          id, project_id, employee_user_id, date_from, date_to, allocation_percent,
          billable, notes, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE
        SET date_from = EXCLUDED.date_from,
            date_to = EXCLUDED.date_to,
            allocation_percent = EXCLUDED.allocation_percent,
            billable = EXCLUDED.billable,
            notes = EXCLUDED.notes,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          allocation.id,
          allocation.project_id,
          allocation.employee_user_id,
          allocation.date_from,
          allocation.date_to,
          allocation.allocation_percent,
          allocation.billable,
          allocation.notes,
          allocation.version,
          allocation.created_at,
          allocation.updated_at,
          allocation.deleted_at,
        ],
      );
    }
    for (const milestone of this.store.projectMilestones) {
      await client.query(
        `INSERT INTO projects.project_milestones (
          id, project_id, name, owner_user_id, status, start_date, due_date,
          priority, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            owner_user_id = EXCLUDED.owner_user_id,
            status = EXCLUDED.status,
            start_date = EXCLUDED.start_date,
            due_date = EXCLUDED.due_date,
            priority = EXCLUDED.priority,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          milestone.id,
          milestone.project_id,
          milestone.name,
          milestone.owner_user_id,
          milestone.status,
          milestone.start_date,
          milestone.due_date,
          milestone.priority,
          milestone.version,
          milestone.created_at,
          milestone.updated_at,
          milestone.deleted_at,
        ],
      );
    }
  }

  private async flushHelpdesk(client: PoolClient): Promise<void> {
    for (const category of this.store.helpdeskCategories) {
      await client.query(
        `INSERT INTO helpdesk.categories (
          id, category_key, label, default_assignee_user_id, default_assignee_name,
          default_assignee_role, team, active, sub_categories, version,
          created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE
        SET category_key = EXCLUDED.category_key,
            label = EXCLUDED.label,
            default_assignee_user_id = EXCLUDED.default_assignee_user_id,
            default_assignee_name = EXCLUDED.default_assignee_name,
            default_assignee_role = EXCLUDED.default_assignee_role,
            team = EXCLUDED.team,
            active = EXCLUDED.active,
            sub_categories = EXCLUDED.sub_categories,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          category.id,
          category.category_key,
          category.label,
          category.default_assignee_user_id,
          category.default_assignee_name,
          category.default_assignee_role,
          category.team,
          category.active,
          JSON.stringify(category.sub_categories),
          category.version,
          category.created_at,
          category.updated_at,
          category.deleted_at,
        ],
      );
    }
    for (const ticket of this.store.helpdeskTickets) {
      await client.query(
        `INSERT INTO helpdesk.tickets (
          id, ticket_no, subject, description, category_id, category_key, sub_category,
          priority, status, requester_user_id, requester_name, requester_email,
          requester_department, assignee_user_id, assignee_name, assignee_role,
          related_asset_id, related_project_id, first_response_at, resolved_at, closed_at,
          resolution, reopen_count, escalated, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
        ON CONFLICT (id) DO UPDATE
        SET ticket_no = EXCLUDED.ticket_no,
            subject = EXCLUDED.subject,
            description = EXCLUDED.description,
            category_id = EXCLUDED.category_id,
            category_key = EXCLUDED.category_key,
            sub_category = EXCLUDED.sub_category,
            priority = EXCLUDED.priority,
            status = EXCLUDED.status,
            requester_user_id = EXCLUDED.requester_user_id,
            requester_name = EXCLUDED.requester_name,
            requester_email = EXCLUDED.requester_email,
            requester_department = EXCLUDED.requester_department,
            assignee_user_id = EXCLUDED.assignee_user_id,
            assignee_name = EXCLUDED.assignee_name,
            assignee_role = EXCLUDED.assignee_role,
            related_asset_id = EXCLUDED.related_asset_id,
            related_project_id = EXCLUDED.related_project_id,
            first_response_at = EXCLUDED.first_response_at,
            resolved_at = EXCLUDED.resolved_at,
            closed_at = EXCLUDED.closed_at,
            resolution = EXCLUDED.resolution,
            reopen_count = EXCLUDED.reopen_count,
            escalated = EXCLUDED.escalated,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          ticket.id,
          ticket.ticket_no,
          ticket.subject,
          ticket.description,
          ticket.category_id,
          ticket.category_key,
          ticket.sub_category,
          ticket.priority,
          ticket.status,
          ticket.requester_user_id,
          ticket.requester_name,
          ticket.requester_email,
          ticket.requester_department,
          ticket.assignee_user_id,
          ticket.assignee_name,
          ticket.assignee_role,
          ticket.related_asset_id,
          ticket.related_project_id,
          ticket.first_response_at,
          ticket.resolved_at,
          ticket.closed_at,
          ticket.resolution,
          ticket.reopen_count,
          ticket.escalated,
          ticket.version,
          ticket.created_at,
          ticket.updated_at,
          ticket.deleted_at,
        ],
      );
    }
    for (const comment of this.store.helpdeskComments) {
      await client.query(
        `INSERT INTO helpdesk.ticket_comments (
          id, ticket_id, author_user_id, author_name, author_role, body,
          internal, document_ids, created_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET author_user_id = EXCLUDED.author_user_id,
            author_name = EXCLUDED.author_name,
            author_role = EXCLUDED.author_role,
            body = EXCLUDED.body,
            internal = EXCLUDED.internal,
            document_ids = EXCLUDED.document_ids,
            deleted_at = EXCLUDED.deleted_at`,
        [
          comment.id,
          comment.ticket_id,
          comment.author_user_id,
          comment.author_name,
          comment.author_role,
          comment.body,
          comment.internal,
          JSON.stringify(comment.document_ids),
          comment.created_at,
          comment.deleted_at,
        ],
      );
    }
    for (const attachment of this.store.helpdeskAttachments) {
      await client.query(
        `INSERT INTO helpdesk.ticket_attachments (
          id, ticket_id, document_id, attachment_type, file_name, size_text,
          uploaded_by_user_id, uploaded_by_name, created_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET document_id = EXCLUDED.document_id,
            attachment_type = EXCLUDED.attachment_type,
            file_name = EXCLUDED.file_name,
            size_text = EXCLUDED.size_text,
            uploaded_by_user_id = EXCLUDED.uploaded_by_user_id,
            uploaded_by_name = EXCLUDED.uploaded_by_name,
            deleted_at = EXCLUDED.deleted_at`,
        [
          attachment.id,
          attachment.ticket_id,
          attachment.document_id,
          attachment.attachment_type,
          attachment.file_name,
          attachment.size_text,
          attachment.uploaded_by_user_id,
          attachment.uploaded_by_name,
          attachment.created_at,
          attachment.deleted_at,
        ],
      );
    }
    for (const event of this.store.helpdeskEvents) {
      await client.query(
        `INSERT INTO helpdesk.ticket_events (
          id, ticket_id, actor_user_id, actor_name, action, detail, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE
        SET actor_user_id = EXCLUDED.actor_user_id,
            actor_name = EXCLUDED.actor_name,
            action = EXCLUDED.action,
            detail = EXCLUDED.detail`,
        [
          event.id,
          event.ticket_id,
          event.actor_user_id,
          event.actor_name,
          event.action,
          event.detail,
          event.created_at,
        ],
      );
    }
  }

  private async flushAttendance(client: PoolClient): Promise<void> {
    for (const punch of this.store.attendancePunches) {
      await client.query(
        `INSERT INTO attendance.punch_events (
          id, company_id, employee_user_id, actor_user_id, event_type, occurred_at, work_mode, source,
          origin, regularization_request_id, metadata, created_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
        ON CONFLICT (id) DO UPDATE
        -- Punch facts are immutable. A stale API snapshot must not replace
        -- a direct-SQL command or worker result. Preserve soft deletion only.
        SET deleted_at = EXCLUDED.deleted_at
        WHERE attendance.punch_events.deleted_at IS NULL AND EXCLUDED.deleted_at IS NOT NULL`,
        [
          punch.id,
          punch.company_id,
          punch.employee_user_id,
          punch.actor_user_id,
          punch.event_type,
          punch.occurred_at,
          punch.work_mode,
          punch.source,
          punch.origin,
          punch.regularization_request_id,
          JSON.stringify(punch.metadata),
          punch.created_at,
          punch.deleted_at,
        ],
      );
    }
    for (const day of this.store.attendanceDayRecords) {
      await client.query(
        `INSERT INTO attendance.daily_records (
          id, company_id, employee_user_id, work_date, status, day_classification,
          presence_state, punctuality_state, evidence_state, approval_kind, approval_state,
          payroll_state, first_check_in, last_check_out, work_minutes, break_minutes,
          late_minutes, early_out_minutes, work_seconds, break_seconds, scheduled_seconds,
          late_seconds, early_departure_seconds, work_mode, note, exception_type,
          regularization_status, version, created_at, updated_at, deleted_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
        ON CONFLICT (id) DO UPDATE
        SET company_id = EXCLUDED.company_id,
            employee_user_id = EXCLUDED.employee_user_id,
            work_date = EXCLUDED.work_date,
            status = EXCLUDED.status,
            day_classification = EXCLUDED.day_classification,
            presence_state = EXCLUDED.presence_state,
            punctuality_state = EXCLUDED.punctuality_state,
            evidence_state = EXCLUDED.evidence_state,
            approval_kind = EXCLUDED.approval_kind,
            approval_state = EXCLUDED.approval_state,
            payroll_state = EXCLUDED.payroll_state,
            first_check_in = EXCLUDED.first_check_in,
            last_check_out = EXCLUDED.last_check_out,
            work_minutes = EXCLUDED.work_minutes,
            break_minutes = EXCLUDED.break_minutes,
            late_minutes = EXCLUDED.late_minutes,
            early_out_minutes = EXCLUDED.early_out_minutes,
            work_seconds = EXCLUDED.work_seconds,
            break_seconds = EXCLUDED.break_seconds,
            scheduled_seconds = EXCLUDED.scheduled_seconds,
            late_seconds = EXCLUDED.late_seconds,
            early_departure_seconds = EXCLUDED.early_departure_seconds,
            work_mode = EXCLUDED.work_mode,
            note = EXCLUDED.note,
            exception_type = EXCLUDED.exception_type,
            regularization_status = EXCLUDED.regularization_status,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE attendance.daily_records.version < EXCLUDED.version`,
        [
          day.id,
          day.company_id,
          day.employee_user_id,
          day.work_date,
          day.status,
          day.day_classification,
          day.presence_state,
          day.punctuality_state,
          day.evidence_state,
          day.approval_kind,
          day.approval_state,
          day.payroll_state,
          day.first_check_in,
          day.last_check_out,
          day.work_minutes,
          day.break_minutes,
          day.late_minutes,
          day.early_out_minutes,
          day.work_seconds,
          day.break_seconds,
          day.scheduled_seconds,
          day.late_seconds,
          day.early_departure_seconds,
          day.work_mode,
          day.note,
          day.exception_type,
          day.regularization_status,
          day.version,
          day.created_at,
          day.updated_at,
          day.deleted_at,
        ],
      );
    }
    for (const request of this.store.attendanceRegularizations) {
      await client.query(
        `INSERT INTO attendance.regularization_requests (
          id, company_id, employee_user_id, submitted_by_user_id, work_date, reason, requested_punches, status,
          current_approver_user_id, decision_remarks, decided_by_user_id,
          decided_at, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE
        SET company_id = EXCLUDED.company_id,
             reason = EXCLUDED.reason,
             submitted_by_user_id = EXCLUDED.submitted_by_user_id,
            requested_punches = EXCLUDED.requested_punches,
            status = EXCLUDED.status,
            current_approver_user_id = EXCLUDED.current_approver_user_id,
            decision_remarks = EXCLUDED.decision_remarks,
            decided_by_user_id = EXCLUDED.decided_by_user_id,
            decided_at = EXCLUDED.decided_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          request.id,
          request.company_id,
          request.employee_user_id,
          request.submitted_by_user_id,
          request.work_date,
          request.reason,
          JSON.stringify(
            request.items.flatMap((item) =>
              item.event_type && item.occurred_at
                ? [
                    {
                      event_type: item.event_type,
                      occurred_at: item.occurred_at,
                    },
                  ]
                : [],
            ),
          ),
          request.status,
          request.current_approver_user_id,
          request.decision_remarks,
          request.decided_by_user_id,
          request.decided_at,
          request.version,
          request.created_at,
          request.updated_at,
          request.deleted_at,
        ],
      );
    }
    for (const request of this.store.attendanceRegularizations) {
      for (const item of request.items) {
        await client.query(
          `INSERT INTO attendance.regularization_request_items (
             id, company_id, regularization_request_id, ordinal, operation,
             target_punch_event_id, event_type, occurred_at, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO NOTHING`,
          [
            item.id,
            item.company_id,
            item.regularization_request_id,
            item.ordinal,
            item.operation,
            item.target_punch_event_id,
            item.event_type,
            item.occurred_at,
            item.created_at,
          ],
        );
      }
    }
    for (const action of this.store.attendanceRegularizationActions) {
      await client.query(
        `INSERT INTO attendance.regularization_actions (
           id, company_id, regularization_request_id, actor_user_id,
           subject_employee_user_id, action_kind, previous_state, resulting_state,
           remarks, resulting_version, occurred_at, migration_reconstructed
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (regularization_request_id, resulting_version) DO NOTHING`,
        [
          action.id,
          action.company_id,
          action.regularization_request_id,
          action.actor_user_id,
          action.subject_employee_user_id,
          action.action_kind,
          action.previous_state,
          action.resulting_state,
          action.remarks,
          action.resulting_version,
          action.occurred_at,
          action.migration_reconstructed,
        ],
      );
    }
    for (const application of this.store
      .attendanceRegularizationCorrectionApplications) {
      await client.query(
        `INSERT INTO attendance.regularization_correction_applications (
           id, company_id, regularization_request_id, regularization_request_item_id,
           regularization_action_id, operation, target_punch_event_id,
           replacement_punch_event_id, attendance_event_id, applied_by_user_id, applied_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (regularization_request_item_id) DO NOTHING`,
        [
          application.id,
          application.company_id,
          application.regularization_request_id,
          application.regularization_request_item_id,
          application.regularization_action_id,
          application.operation,
          application.target_punch_event_id,
          application.replacement_punch_event_id,
          application.attendance_event_id,
          application.applied_by_user_id,
          application.applied_at,
        ],
      );
    }
  }

  private async flushLeaveWfh(client: PoolClient): Promise<void> {
    for (const request of this.store.leaveRequests) {
      await client.query(
        `INSERT INTO leave_wfh.leave_requests (
          id, request_code, employee_user_id, leave_type, date_from, date_to,
          half_day, duration, reason, document_ids, status, current_approver_user_id,
          decision_remarks, decided_by_user_id, decided_at, cancelled_at,
          version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (id) DO UPDATE
        SET request_code = EXCLUDED.request_code,
            leave_type = EXCLUDED.leave_type,
            date_from = EXCLUDED.date_from,
            date_to = EXCLUDED.date_to,
            half_day = EXCLUDED.half_day,
            duration = EXCLUDED.duration,
            reason = EXCLUDED.reason,
            document_ids = EXCLUDED.document_ids,
            status = EXCLUDED.status,
            current_approver_user_id = EXCLUDED.current_approver_user_id,
            decision_remarks = EXCLUDED.decision_remarks,
            decided_by_user_id = EXCLUDED.decided_by_user_id,
            decided_at = EXCLUDED.decided_at,
            cancelled_at = EXCLUDED.cancelled_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          request.id,
          request.request_code,
          request.employee_user_id,
          request.leave_type,
          request.date_from,
          request.date_to,
          request.half_day,
          request.duration,
          request.reason,
          JSON.stringify(request.document_ids),
          request.status,
          request.current_approver_user_id,
          request.decision_remarks,
          request.decided_by_user_id,
          request.decided_at,
          request.cancelled_at,
          request.version,
          request.created_at,
          request.updated_at,
          request.deleted_at,
        ],
      );
    }
    for (const request of this.store.wfhRequests) {
      await client.query(
        `INSERT INTO leave_wfh.wfh_requests (
          id, request_code, employee_user_id, date_from, date_to, half_day,
          duration, reason, project_ref, status, current_approver_user_id,
          decision_remarks, decided_by_user_id, decided_at, cancelled_at,
          version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (id) DO UPDATE
        SET request_code = EXCLUDED.request_code,
            date_from = EXCLUDED.date_from,
            date_to = EXCLUDED.date_to,
            half_day = EXCLUDED.half_day,
            duration = EXCLUDED.duration,
            reason = EXCLUDED.reason,
            project_ref = EXCLUDED.project_ref,
            status = EXCLUDED.status,
            current_approver_user_id = EXCLUDED.current_approver_user_id,
            decision_remarks = EXCLUDED.decision_remarks,
            decided_by_user_id = EXCLUDED.decided_by_user_id,
            decided_at = EXCLUDED.decided_at,
            cancelled_at = EXCLUDED.cancelled_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          request.id,
          request.request_code,
          request.employee_user_id,
          request.date_from,
          request.date_to,
          request.half_day,
          request.duration,
          request.reason,
          request.project_ref,
          request.status,
          request.current_approver_user_id,
          request.decision_remarks,
          request.decided_by_user_id,
          request.decided_at,
          request.cancelled_at,
          request.version,
          request.created_at,
          request.updated_at,
          request.deleted_at,
        ],
      );
    }
    for (const holiday of this.store.holidays) {
      await client.query(
        `INSERT INTO leave_wfh.holidays (
          id, company_id, name, holiday_date, region, optional, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            holiday_date = EXCLUDED.holiday_date,
            region = EXCLUDED.region,
            optional = EXCLUDED.optional,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        -- Unrelated legacy domain flushes carry startup snapshots. They must
        -- never replace a newer direct-SQL command or a different tenant's ID.
        WHERE leave_wfh.holidays.company_id IS NOT DISTINCT FROM EXCLUDED.company_id
          AND leave_wfh.holidays.version < EXCLUDED.version`,
        [
          holiday.id,
          holiday.company_id,
          holiday.name,
          holiday.holiday_date,
          holiday.region,
          holiday.optional,
          holiday.version,
          holiday.created_at,
          holiday.updated_at,
          holiday.deleted_at,
        ],
      );
    }
  }

  private async flushEms(
    client: PoolClient,
    options: DomainPersistenceFlushOptions = {},
  ): Promise<void> {
    const filtered = hasAnyDomainFlushOption(options);
    const userIds = optionalSet(options.userIds);
    const profileChangeRequestIds = optionalSet(
      options.emsProfileChangeRequestIds,
    );
    const serviceRequestIds = optionalSet(options.emsServiceRequestIds);
    const letterIds = optionalSet(options.emsLetterIds);
    const policyIds = optionalSet(options.emsPolicyIds);
    const adminChecklistIds = optionalSet(options.emsAdminChecklistIds);
    const probationReviewIds = optionalSet(options.emsProbationReviewIds);
    for (const profile of this.store.emsEmployeeProfiles) {
      if (!shouldFlushId(profile.employee_user_id, userIds, filtered)) continue;
      await client.query(
        `INSERT INTO ems.employee_profiles (
          id, employee_user_id, personal_email, phone, alternate_phone, current_address,
          permanent_address, city, country, emergency_contact, personal_details,
          work_preferences, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE
        SET personal_email = EXCLUDED.personal_email,
            phone = EXCLUDED.phone,
            alternate_phone = EXCLUDED.alternate_phone,
            current_address = EXCLUDED.current_address,
            permanent_address = EXCLUDED.permanent_address,
            city = EXCLUDED.city,
            country = EXCLUDED.country,
            emergency_contact = EXCLUDED.emergency_contact,
            personal_details = EXCLUDED.personal_details,
            work_preferences = EXCLUDED.work_preferences,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          profile.id,
          profile.employee_user_id,
          profile.personal_email,
          profile.phone,
          profile.alternate_phone,
          profile.current_address,
          profile.permanent_address,
          profile.city,
          profile.country,
          JSON.stringify(profile.emergency_contact),
          JSON.stringify(profile.personal_details),
          JSON.stringify(profile.work_preferences),
          profile.version,
          profile.created_at,
          profile.updated_at,
          profile.deleted_at,
        ],
      );
    }
    for (const request of this.store.emsProfileChangeRequests) {
      if (!shouldFlushId(request.id, profileChangeRequestIds, filtered))
        continue;
      await client.query(
        `INSERT INTO ems.profile_change_requests (
          id, request_code, employee_user_id, field_key, field_label, old_value,
          new_value, reason, supporting_document_ids, status, current_approver_user_id,
          decision_remarks, decided_by_user_id, decided_at, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO UPDATE
        SET field_label = EXCLUDED.field_label,
            old_value = EXCLUDED.old_value,
            new_value = EXCLUDED.new_value,
            reason = EXCLUDED.reason,
            supporting_document_ids = EXCLUDED.supporting_document_ids,
            status = EXCLUDED.status,
            current_approver_user_id = EXCLUDED.current_approver_user_id,
            decision_remarks = EXCLUDED.decision_remarks,
            decided_by_user_id = EXCLUDED.decided_by_user_id,
            decided_at = EXCLUDED.decided_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          request.id,
          request.request_code,
          request.employee_user_id,
          request.field_key,
          request.field_label,
          request.old_value,
          request.new_value,
          request.reason,
          JSON.stringify(request.supporting_document_ids),
          request.status,
          request.current_approver_user_id,
          request.decision_remarks,
          request.decided_by_user_id,
          request.decided_at,
          request.version,
          request.created_at,
          request.updated_at,
          request.deleted_at,
        ],
      );
    }
    for (const request of this.store.emsServiceRequests) {
      if (!shouldFlushId(request.id, serviceRequestIds, filtered)) continue;
      await client.query(
        `INSERT INTO ems.service_requests (
          id, request_code, requester_user_id, request_type, subject, description,
          document_ids, status, assignee_user_id, decision_remarks, decided_by_user_id,
          decided_at, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE
        SET subject = EXCLUDED.subject,
            description = EXCLUDED.description,
            document_ids = EXCLUDED.document_ids,
            status = EXCLUDED.status,
            assignee_user_id = EXCLUDED.assignee_user_id,
            decision_remarks = EXCLUDED.decision_remarks,
            decided_by_user_id = EXCLUDED.decided_by_user_id,
            decided_at = EXCLUDED.decided_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          request.id,
          request.request_code,
          request.requester_user_id,
          request.request_type,
          request.subject,
          request.description,
          JSON.stringify(request.document_ids),
          request.status,
          request.assignee_user_id,
          request.decision_remarks,
          request.decided_by_user_id,
          request.decided_at,
          request.version,
          request.created_at,
          request.updated_at,
          request.deleted_at,
        ],
      );
    }
    for (const letter of this.store.emsLetters) {
      if (!shouldFlushId(letter.id, letterIds, filtered)) continue;
      await client.query(
        `INSERT INTO ems.letters (
          id, employee_user_id, letter_type, title, description, status,
          document_id, issued_on, acknowledged_at, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            description = EXCLUDED.description,
            status = EXCLUDED.status,
            document_id = EXCLUDED.document_id,
            issued_on = EXCLUDED.issued_on,
            acknowledged_at = EXCLUDED.acknowledged_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          letter.id,
          letter.employee_user_id,
          letter.letter_type,
          letter.title,
          letter.description,
          letter.status,
          letter.document_id,
          letter.issued_on,
          letter.acknowledged_at,
          letter.version,
          letter.created_at,
          letter.updated_at,
          letter.deleted_at,
        ],
      );
    }
    for (const policy of this.store.emsPolicies) {
      if (!shouldFlushId(policy.id, policyIds, filtered)) continue;
      await client.query(
        `INSERT INTO ems.policies (
          id, policy_code, title, category, version_label, effective_from,
          document_id, status, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            category = EXCLUDED.category,
            version_label = EXCLUDED.version_label,
            effective_from = EXCLUDED.effective_from,
            document_id = EXCLUDED.document_id,
            status = EXCLUDED.status,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          policy.id,
          policy.policy_code,
          policy.title,
          policy.category,
          policy.version_label,
          policy.effective_from,
          policy.document_id,
          policy.status,
          policy.version,
          policy.created_at,
          policy.updated_at,
          policy.deleted_at,
        ],
      );
    }
    for (const acknowledgement of this.store.emsPolicyAcknowledgements) {
      if (
        filtered &&
        !policyIds?.has(acknowledgement.policy_id) &&
        !userIds?.has(acknowledgement.employee_user_id)
      ) {
        continue;
      }
      await client.query(
        `INSERT INTO ems.policy_acknowledgements (
          id, policy_id, employee_user_id, status, acknowledged_at, version, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            acknowledged_at = EXCLUDED.acknowledged_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at`,
        [
          acknowledgement.id,
          acknowledgement.policy_id,
          acknowledgement.employee_user_id,
          acknowledgement.status,
          acknowledgement.acknowledged_at,
          acknowledgement.version,
          acknowledgement.created_at,
          acknowledgement.updated_at,
        ],
      );
    }
    for (const checklist of this.store.emsAdminChecklists) {
      if (!shouldFlushId(checklist.id, adminChecklistIds, filtered)) continue;
      await client.query(
        `INSERT INTO ems.admin_checklists (
          id, checklist_type, employee_user_id, status, due_date, checklist, remarks,
          completed_at, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            due_date = EXCLUDED.due_date,
            checklist = EXCLUDED.checklist,
            remarks = EXCLUDED.remarks,
            completed_at = EXCLUDED.completed_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          checklist.id,
          checklist.checklist_type,
          checklist.employee_user_id,
          checklist.status,
          checklist.due_date,
          JSON.stringify(checklist.checklist),
          checklist.remarks,
          checklist.completed_at,
          checklist.version,
          checklist.created_at,
          checklist.updated_at,
          checklist.deleted_at,
        ],
      );
    }
    for (const review of this.store.emsProbationReviews) {
      if (!shouldFlushId(review.id, probationReviewIds, filtered)) continue;
      await client.query(
        `INSERT INTO ems.probation_reviews (
          id, employee_user_id, joining_on, due_on, status, extended_until, remarks,
          decided_by_user_id, decided_at, version, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE
        SET due_on = EXCLUDED.due_on,
            status = EXCLUDED.status,
            extended_until = EXCLUDED.extended_until,
            remarks = EXCLUDED.remarks,
            decided_by_user_id = EXCLUDED.decided_by_user_id,
            decided_at = EXCLUDED.decided_at,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at`,
        [
          review.id,
          review.employee_user_id,
          review.joining_on,
          review.due_on,
          review.status,
          review.extended_until,
          review.remarks,
          review.decided_by_user_id,
          review.decided_at,
          review.version,
          review.created_at,
          review.updated_at,
          review.deleted_at,
        ],
      );
    }
  }
}
