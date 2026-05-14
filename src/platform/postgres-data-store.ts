import { existsSync, readFileSync, readdirSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { ValkeySessionStore } from "#auth";
import type { RoleKey } from "#shared";
import type {
  AssetRecord,
  CoreUser,
  Department,
  Designation,
  DocumentMetadata,
  ExpenseAuditLog,
  ExpenseDocument,
  ExpenseLineItem,
  ExpensePayment,
  ExpenseTicket,
  FinanceGovernanceConfig,
  ManagerBackupAssignment,
  OutboxEvent,
  TimesheetSubmission
} from "#shared";
import {
  type AssetAssignmentRecord,
  type AssetStateEventRecord,
  type AuthTokenRecord,
  type CompanyProfileRecord,
  type DataStore,
  type DocumentAccessLogRecord,
  type DocumentVersionRecord,
  type ExpenseApprovalRecord,
  type LicenseActivation,
  type LicenseEntitlement,
  type NotificationRecord,
  type UserSessionPreferenceRecord,
  type WorkSegment,
  type WorkflowDefinitionRecord,
  createMemoryDataStore
} from "./data-store.js";
import { MinioObjectStorage } from "./object-storage.js";

export interface PostgresDataStoreOptions {
  databaseUrl: string;
  valkeyUrl: string;
  objectStorage: {
    endpoint: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
    region: string;
  };
  seedIfEmpty?: boolean;
}

const resetTables = [
  "timesheets.timesheet_approval_actions",
  "timesheets.timesheet_submissions",
  "timesheets.workflow_definitions",
  "timesheets.work_segments",
  "assets.compromised_keys",
  "assets.license_activations",
  "assets.license_entitlements",
  "assets.asset_recovery_tickets",
  "assets.asset_state_events",
  "assets.asset_assignments",
  "assets.assets",
  "documents.doc_access_logs",
  "documents.doc_permissions",
  "documents.doc_versions",
  "documents.doc_metadata",
  "expenses.expense_policy_rules",
  "expenses.expense_audit_logs",
  "expenses.expense_payments",
  "expenses.expense_documents",
  "expenses.employee_reviewer_mappings",
  "expenses.expense_approvals",
  "expenses.expense_line_items",
  "expenses.expense_tickets",
  "platform.processed_events",
  "platform.outbox_events",
  "platform.idempotency_keys",
  "platform.user_sessions",
  "platform.auth_tokens",
  "platform.user_session_preferences",
  "platform.company_profiles",
  "platform.user_credentials",
  "platform.finance_governance_config",
  "core.user_roles",
  "core.roles",
  "core.users",
  "core.designations",
  "core.departments"
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
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function asDateOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : asDate(value);
}

function asMoney(value: unknown): string | null {
  return value === null || value === undefined ? null : Number(value).toFixed(2);
}

function json(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function copyData(target: DataStore, source: DataStore): void {
  target.departments = source.departments;
  target.designations = source.designations;
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
  target.outbox = source.outbox;
  target.assets = source.assets;
  target.assetAssignments = source.assetAssignments;
  target.assetStateEvents = source.assetStateEvents;
  target.assetRecoveryTickets = source.assetRecoveryTickets;
  target.licenseEntitlements = source.licenseEntitlements;
  target.licenseActivations = source.licenseActivations;
  target.compromisedKeys = source.compromisedKeys;
  target.workSegments = source.workSegments;
  target.workflowDefinitions = source.workflowDefinitions;
  target.timesheetSubmissions = source.timesheetSubmissions;
  target.timesheetActions = source.timesheetActions;
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
      return files.map((file) => readFileSync(`${directory}/${file}`, "utf8")).join("\n");
    }
  }
  throw new Error("SQL migrations are missing from src/db/migrations or dist/src/db/migrations");
}

export async function resetPostgresDatabase(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query(migrationSql());
    await client.query("BEGIN");
    await client.query(`TRUNCATE ${resetTables.join(", ")} RESTART IDENTITY`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function createPostgresDataStore(options: PostgresDataStoreOptions): Promise<DataStore> {
  const pool = new Pool({ connectionString: options.databaseUrl });
  const objectStorage = new MinioObjectStorage(options.objectStorage);
  await objectStorage.ensureBucket();

  const store = createMemoryDataStore();
  store.kind = "postgres";
  store.pgPool = pool;
  store.sessionStore = new ValkeySessionStore(options.valkeyUrl);
  store.objectStorage = objectStorage;
  store.persistence = new PostgresPersistence(pool, store);
  await store.persistence.reload();

  if (options.seedIfEmpty && store.users.length === 0) {
    const seed = createMemoryDataStore();
    copyData(store, seed);
    store.kind = "postgres";
    store.pgPool = pool;
    store.sessionStore = new ValkeySessionStore(options.valkeyUrl);
    store.objectStorage = objectStorage;
    store.persistence = new PostgresPersistence(pool, store);
    await store.persistence.flush();
    await store.persistence.reload();
  }

  return store;
}

class PostgresPersistence {
  constructor(
    private readonly pool: Pool,
    private readonly store: DataStore
  ) {}

  async reload(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const loaded = createMemoryDataStore();
      loaded.kind = "postgres";
      loaded.departments = await this.loadDepartments(client);
      loaded.designations = await this.loadDesignations(client);
      loaded.users = await this.loadUsers(client);
      loaded.userCredentials = await this.loadUserCredentials(client);
      loaded.authTokens = await this.loadAuthTokens(client);
      loaded.companyProfiles = await this.loadCompanyProfiles(client);
      loaded.userSessionPreferences = await this.loadUserSessionPreferences(client);
      loaded.financeGovernanceConfig = await this.loadFinanceGovernanceConfig(client);
      loaded.managerBackupAssignments = await this.loadManagerBackupAssignments(client);
      loaded.tickets = await this.loadTickets(client);
      loaded.lineItems = await this.loadLineItems(client);
      loaded.expenseApprovals = await this.loadExpenseApprovals(client);
      loaded.auditLogs = await this.loadAuditLogs(client);
      loaded.expenseDocuments = await this.loadExpenseDocuments(client);
      loaded.payments = await this.loadPayments(client);
      loaded.documents = await this.loadDocuments(client);
      loaded.documentVersions = await this.loadDocumentVersions(client);
      loaded.documentAccessLogs = await this.loadDocumentAccessLogs(client);
      loaded.outbox = await this.loadOutbox(client);
      loaded.assets = await this.loadAssets(client);
      loaded.assetAssignments = await this.loadAssetAssignments(client);
      loaded.assetStateEvents = await this.loadAssetStateEvents(client);
      loaded.assetRecoveryTickets = await this.loadAssetRecoveryTickets(client);
      loaded.licenseEntitlements = await this.loadLicenseEntitlements(client);
      loaded.licenseActivations = await this.loadLicenseActivations(client);
      loaded.compromisedKeys = await this.loadCompromisedKeys(client);
      loaded.workSegments = await this.loadWorkSegments(client);
      loaded.workflowDefinitions = await this.loadWorkflowDefinitions(client);
      loaded.timesheetSubmissions = await this.loadTimesheetSubmissions(client);
      loaded.timesheetActions = await this.loadTimesheetActions(client);
      loaded.nextOutboxId = Math.max(1, ...loaded.outbox.map((event) => event.id + 1));
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
      await this.flushCore(client);
      await this.flushPlatform(client);
      await this.flushExpenses(client);
      await this.flushDocuments(client);
      await this.flushAssets(client);
      await this.flushTimesheets(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if ("close" in this.store.sessionStore && typeof this.store.sessionStore.close === "function") {
      await this.store.sessionStore.close();
    }
    await this.pool.end();
  }

  private nextTicketNumber(tickets: readonly ExpenseTicket[]): number {
    const max = tickets.reduce((current, ticket) => {
      const match = /EXP-\d{4}-(\d+)/u.exec(ticket.ticket_no);
      return Math.max(current, match ? Number(match[1]) : 0);
    }, 0);
    return max + 1;
  }

  private async loadDepartments(client: PoolClient): Promise<Department[]> {
    const { rows } = await client.query("SELECT id, department_code, name, director_user_id, status, deleted_at FROM core.departments ORDER BY department_code");
    return rows.map((row) => ({ ...row, deleted_at: asIsoOrNull(row.deleted_at) }));
  }

  private async loadDesignations(client: PoolClient): Promise<Designation[]> {
    const { rows } = await client.query("SELECT id, designation_code, title, level, status, deleted_at FROM core.designations ORDER BY level NULLS LAST, designation_code");
    return rows.map((row) => ({ ...row, deleted_at: asIsoOrNull(row.deleted_at) }));
  }

  private async loadUsers(client: PoolClient): Promise<CoreUser[]> {
    const { rows } = await client.query(`
      SELECT
        u.id, u.employee_code, u.email, u.full_name, u.department_id, u.designation_id,
        u.manager_user_id, u.hierarchy_path::text AS hierarchy_path, u.employment_status,
        u.timezone, u.joined_on, u.terminated_on, u.deleted_at, u.version,
        COALESCE(array_agg(DISTINCT ur.role_key) FILTER (WHERE ur.role_key IS NOT NULL AND ur.status = 'active' AND ur.deleted_at IS NULL), '{}') AS roles
      FROM core.users u
      LEFT JOIN core.user_roles ur ON ur.user_id = u.id
      GROUP BY u.id
      ORDER BY u.employee_code
    `);
    return rows.map((row) => ({
      ...row,
      roles: row.roles as RoleKey[],
      joined_on: asDateOrNull(row.joined_on),
      terminated_on: asDateOrNull(row.terminated_on),
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadUserCredentials(client: PoolClient): Promise<DataStore["userCredentials"]> {
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
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }


  private async loadAuthTokens(client: PoolClient): Promise<AuthTokenRecord[]> {
    const { rows } = await client.query(`
      SELECT id, token_hash, token_type, user_id, email, company_id, status, expires_at, used_at, created_at, metadata
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
      created_at: asIso(row.created_at),
      metadata: json(row.metadata)
    }));
  }

  private async loadCompanyProfiles(client: PoolClient): Promise<CompanyProfileRecord[]> {
    const { rows } = await client.query(`
      SELECT id, company_name, company_slug, timezone, locale, fiscal_year_start_month, status, bootstrap_completed_at, created_at, updated_at, version
      FROM platform.company_profiles
      ORDER BY created_at, id
    `);
    return rows.map((row) => ({
      id: row.id,
      company_name: row.company_name,
      company_slug: row.company_slug,
      timezone: row.timezone,
      locale: row.locale,
      fiscal_year_start_month: row.fiscal_year_start_month,
      status: row.status,
      bootstrap_completed_at: asIsoOrNull(row.bootstrap_completed_at),
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      version: row.version
    }));
  }

  private async loadUserSessionPreferences(client: PoolClient): Promise<UserSessionPreferenceRecord[]> {
    const { rows } = await client.query(`
      SELECT id, user_id, active_role, company_id, landing_page, locale, timezone, created_at, updated_at, version
      FROM platform.user_session_preferences
      ORDER BY updated_at, id
    `);
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
      version: row.version
    }));
  }

  private async loadFinanceGovernanceConfig(client: PoolClient): Promise<FinanceGovernanceConfig | null> {
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
      finance_approval_backup_user_id: row.finance_approval_backup_user_id ?? row.finance_self_request_fallback_user_id,
      status: row.status,
      effective_from: asDate(row.effective_from),
      effective_to: asDateOrNull(row.effective_to),
      updated_by_user_id: row.updated_by_user_id,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version
    };
  }

  private async loadManagerBackupAssignments(client: PoolClient): Promise<ManagerBackupAssignment[]> {
    const { rows } = await client.query("SELECT * FROM expenses.employee_reviewer_mappings ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      backup_manager_user_id: row.backup_manager_user_id ?? row.reviewer_user_id,
      assigned_by_user_id: row.assigned_by_user_id,
      effective_from: asDate(row.effective_from),
      effective_to: asDateOrNull(row.effective_to),
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at),
      deleted_at: asIsoOrNull(row.deleted_at),
      version: row.version
    }));
  }

  private async loadTickets(client: PoolClient): Promise<ExpenseTicket[]> {
    const { rows } = await client.query("SELECT * FROM expenses.expense_tickets ORDER BY created_at, ticket_no");
    return rows.map((row) => ({
      id: row.id,
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
      manager_verifier_id: row.manager_verifier_id ?? row.assigned_reviewer_id ?? row.director_approver_id,
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
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadLineItems(client: PoolClient): Promise<ExpenseLineItem[]> {
    const { rows } = await client.query("SELECT * FROM expenses.expense_line_items ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      line_category: row.line_category,
      description: row.description,
      quantity: asMoney(row.quantity),
      unit_cost: asMoney(row.unit_cost),
      line_total: asMoney(row.line_total) ?? "0.00",
      tax_amount: asMoney(row.tax_amount),
      vendor_name: row.vendor_name
    }));
  }

  private async loadExpenseApprovals(client: PoolClient): Promise<ExpenseApprovalRecord[]> {
    const { rows } = await client.query("SELECT * FROM expenses.expense_approvals ORDER BY created_at, id");
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
      created_at: asIso(row.created_at)
    }));
  }

  private async loadAuditLogs(client: PoolClient): Promise<ExpenseAuditLog[]> {
    const { rows } = await client.query("SELECT * FROM expenses.expense_audit_logs ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      actor_user_id: row.actor_user_id,
      event_type: row.event_type,
      old_value: row.old_value,
      new_value: row.new_value,
      remarks: row.remarks,
      payload_hash: row.payload_hash,
      created_at: asIso(row.created_at)
    }));
  }

  private async loadExpenseDocuments(client: PoolClient): Promise<ExpenseDocument[]> {
    const { rows } = await client.query("SELECT * FROM expenses.expense_documents ORDER BY uploaded_at, id");
    return rows.map((row) => ({ ...row, uploaded_at: asIso(row.uploaded_at) }));
  }

  private async loadPayments(client: PoolClient): Promise<ExpensePayment[]> {
    const { rows } = await client.query("SELECT * FROM expenses.expense_payments ORDER BY created_at, id");
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
      created_at: asIso(row.created_at)
    }));
  }

  private async loadDocuments(client: PoolClient): Promise<DocumentMetadata[]> {
    const { rows } = await client.query("SELECT * FROM documents.doc_metadata ORDER BY created_at, id");
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
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadDocumentVersions(client: PoolClient): Promise<DocumentVersionRecord[]> {
    const { rows } = await client.query("SELECT * FROM documents.doc_versions ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      document_id: row.document_id,
      version: row.version,
      storage_key: row.storage_key,
      file_name: row.file_name,
      size_bytes: Number(row.size_bytes),
      checksum_sha256: row.checksum_sha256,
      created_by_user_id: row.created_by_user_id,
      created_at: asIso(row.created_at)
    }));
  }

  private async loadDocumentAccessLogs(client: PoolClient): Promise<DocumentAccessLogRecord[]> {
    const { rows } = await client.query("SELECT * FROM documents.doc_access_logs ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      document_id: row.document_id,
      actor_user_id: row.actor_user_id,
      action: row.action,
      decision: row.decision,
      reason: row.reason,
      created_at: asIso(row.created_at)
    }));
  }

  private async loadOutbox(client: PoolClient): Promise<OutboxEvent[]> {
    const { rows } = await client.query("SELECT * FROM platform.outbox_events ORDER BY id");
    return rows.map((row) => ({
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
      last_error: row.last_error
    }));
  }

  private async loadAssets(client: PoolClient): Promise<AssetRecord[]> {
    const { rows } = await client.query("SELECT * FROM assets.assets ORDER BY created_at, asset_code");
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
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadAssetAssignments(client: PoolClient): Promise<AssetAssignmentRecord[]> {
    const { rows } = await client.query("SELECT * FROM assets.asset_assignments ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      asset_id: row.asset_id,
      assigned_to_user_id: row.assigned_to_user_id,
      assigned_by_user_id: row.assigned_by_user_id,
      assigned_at: asIso(row.assigned_at),
      returned_at: asIsoOrNull(row.returned_at),
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at)
    }));
  }

  private async loadAssetStateEvents(client: PoolClient): Promise<AssetStateEventRecord[]> {
    const { rows } = await client.query("SELECT * FROM assets.asset_state_events ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      asset_id: row.asset_id,
      actor_user_id: row.actor_user_id,
      event_type: row.event_type,
      payload: json(row.payload),
      created_at: asIso(row.created_at)
    }));
  }

  private async loadAssetRecoveryTickets(client: PoolClient): Promise<DataStore["assetRecoveryTickets"]> {
    const { rows } = await client.query("SELECT * FROM assets.asset_recovery_tickets ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      employee_user_id: row.employee_user_id,
      asset_id: row.asset_id,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at)
    }));
  }

  private async loadLicenseEntitlements(client: PoolClient): Promise<LicenseEntitlement[]> {
    const { rows } = await client.query("SELECT * FROM assets.license_entitlements ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      seat_count: row.seat_count,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at)
    }));
  }

  private async loadLicenseActivations(client: PoolClient): Promise<LicenseActivation[]> {
    const { rows } = await client.query("SELECT * FROM assets.license_activations ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      entitlement_id: row.entitlement_id,
      hardware_fingerprint_hash: row.hardware_fingerprint_hash,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at)
    }));
  }

  private async loadCompromisedKeys(client: PoolClient): Promise<DataStore["compromisedKeys"]> {
    const { rows } = await client.query("SELECT * FROM assets.compromised_keys ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      key_hash: row.key_hash,
      status: row.status,
      created_at: asIso(row.created_at)
    }));
  }

  private async loadWorkSegments(client: PoolClient): Promise<WorkSegment[]> {
    const { rows } = await client.query("SELECT * FROM timesheets.work_segments ORDER BY created_at, id");
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
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadWorkflowDefinitions(client: PoolClient): Promise<WorkflowDefinitionRecord[]> {
    const { rows } = await client.query("SELECT * FROM timesheets.workflow_definitions ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      module: row.module,
      definition: row.definition,
      version: row.version,
      status: row.status,
      created_at: asIso(row.created_at),
      updated_at: asIso(row.updated_at)
    }));
  }

  private async loadTimesheetSubmissions(client: PoolClient): Promise<TimesheetSubmission[]> {
    const { rows } = await client.query("SELECT * FROM timesheets.timesheet_submissions ORDER BY created_at, id");
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
      deleted_at: asIsoOrNull(row.deleted_at)
    }));
  }

  private async loadTimesheetActions(client: PoolClient): Promise<DataStore["timesheetActions"]> {
    const { rows } = await client.query("SELECT * FROM timesheets.timesheet_approval_actions ORDER BY created_at, id");
    return rows.map((row) => ({
      id: row.id,
      submission_id: row.submission_id,
      actor_user_id: row.actor_user_id,
      decision: row.decision,
      remarks: row.remarks,
      created_at: asIso(row.created_at)
    }));
  }

  private async flushCore(client: PoolClient): Promise<void> {
    for (const designation of this.store.designations) {
      await client.query(
        `INSERT INTO core.designations (id, designation_code, title, level, status, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
         SET designation_code = EXCLUDED.designation_code, title = EXCLUDED.title, level = EXCLUDED.level,
             status = EXCLUDED.status, deleted_at = EXCLUDED.deleted_at, updated_at = now()`,
        [designation.id, designation.designation_code, designation.title, designation.level, designation.status, designation.deleted_at]
      );
    }
    for (const department of this.store.departments) {
      await client.query(
        `INSERT INTO core.departments (id, department_code, name, director_user_id, status, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
         SET department_code = EXCLUDED.department_code, name = EXCLUDED.name,
             director_user_id = EXCLUDED.director_user_id, status = EXCLUDED.status,
             deleted_at = EXCLUDED.deleted_at, updated_at = now()`,
        [department.id, department.department_code, department.name, department.director_user_id, department.status, department.deleted_at]
      );
    }
    for (const user of this.store.users) {
      await client.query(
        `INSERT INTO core.users (
          id, employee_code, email, full_name, department_id, designation_id, manager_user_id,
          hierarchy_path, employment_status, timezone, joined_on, terminated_on, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::ltree, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE
        SET employee_code = EXCLUDED.employee_code, email = EXCLUDED.email, full_name = EXCLUDED.full_name,
            department_id = EXCLUDED.department_id, designation_id = EXCLUDED.designation_id,
            manager_user_id = EXCLUDED.manager_user_id, hierarchy_path = EXCLUDED.hierarchy_path,
            employment_status = EXCLUDED.employment_status, timezone = EXCLUDED.timezone,
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
          user.timezone,
          user.joined_on,
          user.terminated_on,
          user.deleted_at,
          user.version
        ]
      );
      await client.query("DELETE FROM core.user_roles WHERE user_id = $1", [user.id]);
      for (const role of user.roles) {
        await client.query(
          `INSERT INTO core.user_roles (user_id, role_key, status, effective_from)
           VALUES ($1, $2, 'active', '2026-01-01')`,
          [user.id, role]
        );
      }
    }
    for (const credential of this.store.userCredentials) {
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
          credential.deleted_at
        ]
      );
    }
  }

  private async flushPlatform(client: PoolClient): Promise<void> {
    for (const company of this.store.companyProfiles) {
      await client.query(
        `INSERT INTO platform.company_profiles (
          id, company_name, company_slug, timezone, locale, fiscal_year_start_month,
          status, bootstrap_completed_at, created_at, updated_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE
        SET company_name = EXCLUDED.company_name, timezone = EXCLUDED.timezone,
            locale = EXCLUDED.locale, fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
            status = EXCLUDED.status, bootstrap_completed_at = EXCLUDED.bootstrap_completed_at,
            updated_at = EXCLUDED.updated_at, version = EXCLUDED.version`,
        [
          company.id,
          company.company_name,
          company.company_slug,
          company.timezone,
          company.locale,
          company.fiscal_year_start_month,
          company.status,
          company.bootstrap_completed_at,
          company.created_at,
          company.updated_at,
          company.version
        ]
      );
    }
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
          preference.version
        ]
      );
    }
    for (const token of this.store.authTokens) {
      await client.query(
        `INSERT INTO platform.auth_tokens (
          id, token_hash, token_type, user_id, email, company_id, status, expires_at, used_at, created_at, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, used_at = EXCLUDED.used_at, metadata = EXCLUDED.metadata`,
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
          token.created_at,
          JSON.stringify(token.metadata)
        ]
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
          config.version
        ]
      );
    }
    for (const event of this.store.outbox) {
      await client.query(
        `INSERT INTO platform.outbox_events (
          id, event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key,
          status, retry_count, available_at, created_at, published_at, failed_at, last_error
        )
        OVERRIDING SYSTEM VALUE
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status, retry_count = EXCLUDED.retry_count,
            available_at = EXCLUDED.available_at, published_at = EXCLUDED.published_at,
            failed_at = EXCLUDED.failed_at, last_error = EXCLUDED.last_error`,
        [
          event.id,
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
          event.last_error
        ]
      );
    }
  }

  private async flushExpenses(client: PoolClient): Promise<void> {
    for (const mapping of this.store.managerBackupAssignments) {
      await client.query(
        `INSERT INTO expenses.employee_reviewer_mappings (
          id, employee_user_id, reviewer_user_id, assigned_by_user_id, effective_from,
          effective_to, status, created_at, updated_at, deleted_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE
        SET reviewer_user_id = EXCLUDED.reviewer_user_id, effective_to = EXCLUDED.effective_to,
            status = EXCLUDED.status, updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at, version = EXCLUDED.version`,
        [
          mapping.id,
          mapping.employee_user_id,
          mapping.backup_manager_user_id,
          mapping.assigned_by_user_id,
          mapping.effective_from,
          mapping.effective_to,
          mapping.status,
          mapping.created_at,
          mapping.updated_at,
          mapping.deleted_at,
          mapping.version
        ]
      );
    }
    for (const ticket of this.store.tickets) {
      await client.query(
        `INSERT INTO expenses.expense_tickets (
          id, ticket_no, requester_user_id, requester_role_snapshot, department_id, expense_type,
          expense_sub_type, project_code, client_name, task_title, task_description, location,
          start_date, end_date, estimated_amount, payment_type, advance_amount, advance_justification,
          assigned_reviewer_id, director_approver_id, finance_manager_id,
          manager_verifier_id, manager_backup_user_id, finance_approver_id,
          status, actual_amount, variance_amount, payment_reference_no, closure_remarks, context_payload, route_snapshot,
          policy_snapshot, version, created_at, updated_at, submitted_at, closed_at, deleted_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
          $30::jsonb, $31::jsonb, $32::jsonb, $33, $34, $35, $36, $37, $38
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
          ticket.deleted_at
        ]
      );
    }
    for (const item of this.store.lineItems) {
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
          item.vendor_name
        ]
      );
    }
    for (const approval of this.store.expenseApprovals) {
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
          approval.created_at
        ]
      );
    }
    for (const audit of this.store.auditLogs) {
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
          audit.created_at
        ]
      );
    }
    for (const document of this.store.expenseDocuments) {
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
          document.uploaded_at
        ]
      );
    }
    for (const payment of this.store.payments) {
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
          payment.created_at
        ]
      );
    }
  }

  private async flushDocuments(client: PoolClient): Promise<void> {
    for (const document of this.store.documents) {
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
          document.deleted_at
        ]
      );
    }
    for (const version of this.store.documentVersions) {
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
          version.created_at
        ]
      );
    }
    for (const log of this.store.documentAccessLogs) {
      await client.query(
        `INSERT INTO documents.doc_access_logs (id, document_id, actor_user_id, action, decision, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [log.id, log.document_id, log.actor_user_id, log.action, log.decision, log.reason, log.created_at]
      );
    }
  }

  private async flushAssets(client: PoolClient): Promise<void> {
    for (const asset of this.store.assets) {
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
          asset.version
        ]
      );
    }
    for (const assignment of this.store.assetAssignments) {
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
          assignment.updated_at
        ]
      );
    }
    for (const event of this.store.assetStateEvents) {
      await client.query(
        `INSERT INTO assets.asset_state_events (id, asset_id, actor_user_id, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (id) DO NOTHING`,
        [event.id, event.asset_id, event.actor_user_id, event.event_type, JSON.stringify(event.payload), event.created_at]
      );
    }
    for (const ticket of this.store.assetRecoveryTickets) {
      await client.query(
        `INSERT INTO assets.asset_recovery_tickets (id, employee_user_id, asset_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
        [ticket.id, ticket.employee_user_id, ticket.asset_id, ticket.status, ticket.created_at, ticket.updated_at]
      );
    }
    for (const entitlement of this.store.licenseEntitlements) {
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
          entitlement.updated_at
        ]
      );
    }
    for (const activation of this.store.licenseActivations) {
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
          activation.updated_at
        ]
      );
    }
    for (const key of this.store.compromisedKeys) {
      await client.query(
        `INSERT INTO assets.compromised_keys (id, key_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (key_hash) DO UPDATE
         SET status = EXCLUDED.status, updated_at = now()`,
        [key.id, key.key_hash, key.status, key.created_at]
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
          segment.deleted_at
        ]
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
          workflow.updated_at
        ]
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
          submission.deleted_at
        ]
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
          action.created_at
        ]
      );
    }
  }
}
