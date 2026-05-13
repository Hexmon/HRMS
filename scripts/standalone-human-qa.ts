import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedIds } from "../src/platform/data-store.js";
import { loadRuntimeEnv, requireEnv } from "./env.js";

type JsonRecord = Record<string, unknown>;
type StepStatus = "pass" | "fail" | "blocked";

interface QaStep {
  name: string;
  status: StepStatus;
  status_code?: number;
  evidence?: unknown;
  elapsed_ms: number;
}

interface HttpResult<T = unknown> {
  status: number;
  body: T;
  headers: Record<string, string>;
  elapsedMs: number;
}

export interface StandaloneHumanQaOptions {
  label?: string;
  reportDir?: string;
  outputFile?: string;
}

const iso = new Date().toISOString();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function qaDate(offsetDays: number): string {
  const baseDay = 1 + (Number(runId.split("-")[0]) % 300);
  return new Date(Date.UTC(2028, 0, baseDay + offsetDays)).toISOString().slice(0, 10);
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /X-Amz-|Signature=|token|Bearer /i.test(value)) {
      return "[redacted]";
    }
    return value;
  }
  const output: JsonRecord = {};
  for (const [key, raw] of Object.entries(value as JsonRecord)) {
    if (/token|secret|password|authorization|cookie|signed|url/i.test(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = redact(raw);
    }
  }
  return output;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headersFrom(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function getString(value: unknown, key: string): string {
  const candidate = value && typeof value === "object" ? (value as JsonRecord)[key] : undefined;
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error(`Expected string field ${key}`);
  }
  return candidate;
}

function getNumber(value: unknown, key: string): number {
  const candidate = value && typeof value === "object" ? (value as JsonRecord)[key] : undefined;
  if (typeof candidate !== "number") {
    throw new Error(`Expected number field ${key}`);
  }
  return candidate;
}

function getObject<T extends JsonRecord = JsonRecord>(value: unknown): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected object response body");
  }
  return value as T;
}

function items(value: unknown): JsonRecord[] {
  const object = getObject(value);
  return Array.isArray(object.items) ? (object.items as JsonRecord[]) : [];
}

export async function runStandaloneHumanQa(options: StandaloneHumanQaOptions = {}): Promise<void> {
  loadRuntimeEnv();
  const apiBaseUrl = requireEnv("API_BASE_URL").replace(/\/$/, "");
  const reportDir = options.reportDir ?? process.env.HRMS_REPORT_DIR ?? "docs/qa/runs/standalone-full-human-qa";
  const outputFile = options.outputFile ?? "standalone-full-human-qa-results.json";
  const steps: QaStep[] = [];

  function record(name: string, status: StepStatus, evidence: unknown, elapsedMs = 0, statusCode?: number): void {
    steps.push({ name, status, status_code: statusCode, evidence: redact(evidence), elapsed_ms: elapsedMs });
  }

  async function request<T = unknown>(method: string, path: string, token?: string, payload?: unknown, extraHeaders: Record<string, string> = {}): Promise<HttpResult<T>> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const startedAt = Date.now();
      const headers: Record<string, string> = { accept: "application/json", ...extraHeaders };
      if (payload !== undefined) {
        headers["content-type"] = "application/json";
      }
      if (token) {
        headers.authorization = `Bearer ${token}`;
      }
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload)
      });
      const contentType = response.headers.get("content-type") ?? "";
      const text = await response.text();
      let body: unknown = text;
      if (contentType.includes("application/json") && text.length > 0) {
        body = JSON.parse(text) as unknown;
      }
      const elapsedMs = Date.now() - startedAt;
      if (path === "/api/v1/auth/login" && response.status === 429 && attempt === 0) {
        const details = body && typeof body === "object" ? (body as JsonRecord).details : undefined;
        const retryAfter = details && typeof details === "object" && typeof (details as JsonRecord).retry_after_seconds === "number"
          ? Number((details as JsonRecord).retry_after_seconds)
          : 60;
        record("auth login rate-limit backoff", "blocked", { retry_after_seconds: retryAfter }, elapsedMs, response.status);
        await sleep((retryAfter + 1) * 1000);
        continue;
      }
      return {
        status: response.status,
        body: body as T,
        headers: headersFrom(response.headers),
        elapsedMs
      };
    }
    throw new Error("Auth login rate-limit retry did not return a response");
  }

  async function expectStatus<T = unknown>(name: string, call: Promise<HttpResult<T>>, expected: number | number[], critical = true): Promise<HttpResult<T>> {
    try {
      const result = await call;
      const allowed = Array.isArray(expected) ? expected : [expected];
      const ok = allowed.includes(result.status);
      record(name, ok ? "pass" : "fail", result.body, result.elapsedMs, result.status);
      if (!ok && critical) {
        throw new Error(`${name} returned ${result.status}, expected ${allowed.join(", ")}`);
      }
      return result;
    } catch (error) {
      record(name, "fail", { error: error instanceof Error ? error.message : String(error) });
      if (critical) {
        throw error;
      }
      return { status: 0, body: {} as T, headers: {}, elapsedMs: 0 };
    }
  }

  async function login(employeeCode: string): Promise<{ token: string; user: JsonRecord }> {
    const result = await expectStatus(`auth login ${employeeCode}`, request("POST", "/api/v1/auth/login", undefined, { employee_code: employeeCode }), 200);
    const body = getObject(result.body);
    return { token: getString(body, "access_token"), user: getObject(body.user) };
  }

  async function optionalLogin(employeeCode: string): Promise<{ token: string; user: JsonRecord } | null> {
    const result = await request("POST", "/api/v1/auth/login", undefined, { employee_code: employeeCode });
    if (result.status !== 200) {
      record(`optional auth login ${employeeCode}`, "blocked", result.body, result.elapsedMs, result.status);
      return null;
    }
    record(`optional auth login ${employeeCode}`, "pass", result.body, result.elapsedMs, result.status);
    const body = getObject(result.body);
    return { token: getString(body, "access_token"), user: getObject(body.user) };
  }

  function expensePayload(kind: string): JsonRecord {
    return {
      submit: true,
      expense_type: "Project",
      expense_sub_type: "Project Travel",
      project_code: `QA-${runId}-${kind}`,
      task_title: `Standalone QA ${kind} travel`,
      task_description: "Standalone backend assurance run",
      location: "Mumbai",
      start_date: "2026-06-15",
      end_date: "2026-06-16",
      estimated_amount: "2400.00",
      payment_type: "Advance",
      advance_amount: "1200.00",
      line_items: [
        {
          line_category: "travel",
          description: `Ticket ${kind}`,
          line_total: "2400.00"
        }
      ]
    };
  }

  async function createExpense(employeeToken: string, kind: string): Promise<JsonRecord> {
    const result = await expectStatus(`expense create ${kind}`, request("POST", "/api/v1/expenses", employeeToken, expensePayload(kind)), 200);
    return getObject(result.body);
  }

  async function managerVerify(managerToken: string, expenseId: string, decision: "approve" | "reject" | "return", version: number, remarks?: string): Promise<JsonRecord> {
    const result = await expectStatus(
      `manager ${decision} ${expenseId}`,
      request("POST", `/api/v1/expenses/${expenseId}/manager/verify`, managerToken, { decision, remarks, expected_version: version }),
      200
    );
    return getObject(result.body);
  }

  async function uploadExpenseDoc(employeeToken: string, expenseId: string, documentType: string): Promise<JsonRecord> {
    const result = await expectStatus(
      `expense upload document ${documentType}`,
      request("POST", `/api/v1/expenses/${expenseId}/documents`, employeeToken, {
        classification: "finance",
        document_type: documentType,
        file_name: `${documentType}-${runId}.pdf`,
        mime_type: "application/pdf",
        size_bytes: 1024,
        checksum_sha256: "a".repeat(64)
      }),
      200
    );
    return getObject(result.body);
  }

  function findItemById(collection: JsonRecord[], id: string): boolean {
    return collection.some((item) => item.id === id || item.ticket_id === id || item.expense_id === id);
  }

  const summary: JsonRecord = {
    label: options.label ?? "standalone-full-human-qa",
    run_id: runId,
    started_at: iso,
    api_base_url: apiBaseUrl
  };

  try {
    await expectStatus("runtime live health", request("GET", "/health/live"), 200);
    await expectStatus("runtime ready health", request("GET", "/health/ready"), 200);
    const openapi = await expectStatus<JsonRecord>("openapi available", request("GET", "/api/v1/openapi.json"), 200);
    const paths = getObject(openapi.body).paths as JsonRecord;
    const operationCount = Object.values(paths).reduce<number>((total, pathItem) => {
      const methods = getObject(pathItem);
      return total + ["get", "post", "put", "patch", "delete"].filter((method) => methods[method]).length;
    }, 0);
    record("openapi operation count", operationCount >= 68 ? "pass" : "fail", { operation_count: operationCount });
    await expectStatus("swagger docs available", request("GET", "/docs"), [200, 302]);
    await expectStatus("missing bearer rejected", request("GET", "/api/v1/core/users"), 401);
    await expectStatus("invalid credentials rejected", request("POST", "/api/v1/auth/login", undefined, { email: "nobody@example.test", password: "bad" }), 401);

    const emailLogin = await expectStatus<JsonRecord>("email password login", request("POST", "/api/v1/auth/login", undefined, { email: "finance@example.test", password: "LocalDev@123" }), 200);
    const employee = await login("E1");
    const manager = await login("D1");
    const seniorManager = await login("S1");
    const finance = await login("N1");
    const admin = await login("ADM");
    const assetManager = await login("AST");
    const auditor = await login("AUD");
    const hrManager: { token: string; user: JsonRecord } | null = null;
    const normalManager = manager;
    record("optional HR manager persona unavailable", "blocked", { reason: "release seed does not include HRM" });
    record("optional normal manager persona unavailable", "blocked", { reason: "release seed does not include MGR" });
    const cookie = emailLogin.headers["set-cookie"];
    await expectStatus("auth me bearer", request("GET", "/api/v1/auth/me", employee.token), 200);
    if (cookie) {
      await expectStatus("auth me cookie", request("GET", "/api/v1/auth/me", undefined, undefined, { cookie }), 200, false);
    }
    await expectStatus("logout idempotent", request("POST", "/api/v1/auth/logout"), 200);

    const users = await expectStatus<JsonRecord>("core users pagination", request("GET", "/api/v1/core/users?page=1&limit=5", admin.token), 200);
    record("core users has page items", items(users.body).length > 0 ? "pass" : "fail", { count: items(users.body).length });
    await expectStatus("core user detail", request("GET", `/api/v1/core/users/${getString(employee.user, "id")}`, admin.token), 200);
    await expectStatus("core manager subtree", request("GET", `/api/v1/core/users/${getString(manager.user, "id")}/subtree`, manager.token), 200);
    await expectStatus("core unauthorized subtree denied", request("GET", `/api/v1/core/users/${getString(seniorManager.user, "id")}/subtree`, employee.token), 403);

    const mainExpense = await createExpense(employee.token, "main");
    const mainId = getString(mainExpense, "id");
    await expectStatus("old reviewer queue absent", request("GET", "/api/v1/expenses/queue/reviewer", manager.token), 404);
    await expectStatus("old director queue absent", request("GET", "/api/v1/expenses/queue/director", finance.token), 404);
    await expectStatus("old review action absent", request("POST", `/api/v1/expenses/${mainId}/review`, manager.token, { decision: "approve", expected_version: 1 }), 404);
    await expectStatus("old approve action absent", request("POST", `/api/v1/expenses/${mainId}/approve`, finance.token, { decision: "approve", expected_version: 1 }), 404);
    await expectStatus("old director report absent", request("GET", "/api/v1/reports/expenses/director-dashboard", finance.token), 404);
    await expectStatus("employee cannot access finance queue", request("GET", "/api/v1/expenses/queue/finance", employee.token), 403);
    await expectStatus("finance cannot approve before manager", request("POST", `/api/v1/expenses/${mainId}/finance/approve`, finance.token, { decision: "verify", expected_version: 1 }), 403);

    const managerQueue = await expectStatus<JsonRecord>("manager queue contains submitted expense", request("GET", "/api/v1/expenses/queue/manager?page=1&limit=50", manager.token), 200);
    record("main expense visible in manager queue", findItemById(items(managerQueue.body), mainId) ? "pass" : "fail", { expense_id: mainId });

    const returned = await createExpense(employee.token, "return");
    await expectStatus("manager return requires remarks", request("POST", `/api/v1/expenses/${getString(returned, "id")}/manager/verify`, manager.token, { decision: "return", expected_version: 1 }), 400);
    const returnedTicket = await managerVerify(manager.token, getString(returned, "id"), "return", 1, "Need client name on itinerary");
    await expectStatus("employee resubmits returned expense", request("POST", `/api/v1/expenses/${getString(returnedTicket, "id")}/submit`, employee.token, { expected_version: getNumber(returnedTicket, "version") }), 200);

    const rejected = await createExpense(employee.token, "reject");
    await expectStatus("manager reject requires remarks", request("POST", `/api/v1/expenses/${getString(rejected, "id")}/manager/verify`, manager.token, { decision: "reject", expected_version: 1 }), 400);
    await managerVerify(manager.token, getString(rejected, "id"), "reject", 1, "Out of policy");

    const managerVerified = await managerVerify(manager.token, mainId, "approve", 1, "Manager verified business travel");
    await expectStatus("finance stale version conflict", request("POST", `/api/v1/expenses/${mainId}/finance/approve`, finance.token, { decision: "verify", expected_version: 1 }), 409);
    const financeQueue = await expectStatus<JsonRecord>("finance queue contains manager verified expense", request("GET", "/api/v1/expenses/queue/finance?page=1&limit=50", finance.token), 200);
    record("main expense visible in finance queue", findItemById(items(financeQueue.body), mainId) ? "pass" : "fail", { expense_id: mainId });
    await expectStatus("finance detail available", request("GET", `/api/v1/expenses/${mainId}/finance-detail`, finance.token), 200);

    const financeHold = await createExpense(employee.token, "finance-hold");
    const financeHoldVerified = await managerVerify(manager.token, getString(financeHold, "id"), "approve", 1, "Ok");
    await expectStatus("finance hold requires remarks", request("POST", `/api/v1/expenses/${getString(financeHoldVerified, "id")}/finance/approve`, finance.token, { decision: "hold", expected_version: getNumber(financeHoldVerified, "version") }), 400);
    await expectStatus("finance hold accepted", request("POST", `/api/v1/expenses/${getString(financeHoldVerified, "id")}/finance/approve`, finance.token, { decision: "hold", remarks: "Awaiting vendor GST clarification", expected_version: getNumber(financeHoldVerified, "version") }), 200);

    const governance = await expectStatus<JsonRecord>("finance governance readable", request("GET", "/api/v1/platform/finance-governance", admin.token), 200);
    const governanceConfig = getObject(getObject(governance.body).config);
    await expectStatus(
      "finance governance backup precondition",
      request("PUT", "/api/v1/platform/finance-governance", admin.token, {
        primary_finance_manager_user_id: getString(finance.user, "id"),
        manager_backup_user_id: getString(seniorManager.user, "id"),
        finance_approval_backup_user_id: getString(admin.user, "id"),
        effective_from: typeof governanceConfig.effective_from === "string" ? governanceConfig.effective_from : "2026-01-01",
        effective_to: null,
        status: "active",
        expected_version: getNumber(governanceConfig, "version")
      }),
      200
    );

    const financeSelf = await createExpense(finance.token, "finance-self");
    const financeSelfVerified = await managerVerify(seniorManager.token, getString(financeSelf, "id"), "approve", 1, "Senior manager verified");
    await expectStatus("finance requester self approval blocked", request("POST", `/api/v1/expenses/${getString(financeSelfVerified, "id")}/finance/approve`, finance.token, { decision: "verify", expected_version: getNumber(financeSelfVerified, "version") }), 403);
    await expectStatus("finance admin backup approval works", request("POST", `/api/v1/expenses/${getString(financeSelfVerified, "id")}/finance/approve`, admin.token, { decision: "verify", remarks: "Backup approval", expected_version: getNumber(financeSelfVerified, "version") }), 200);

    const financeApproved = await expectStatus<JsonRecord>("finance approves main expense", request("POST", `/api/v1/expenses/${mainId}/finance/approve`, finance.token, { decision: "verify", remarks: "Approved for payment", expected_version: getNumber(managerVerified, "version") }), 200);
    await expectStatus("settlement blocked before payment", request("POST", `/api/v1/expenses/${mainId}/settlement`, finance.token, { actual_amount: "1200.00", expected_version: getNumber(financeApproved.body, "version") }), 400);
    const paymentReleased = await expectStatus<JsonRecord>("finance releases payment", request("POST", `/api/v1/expenses/${mainId}/finance/payment`, finance.token, { payment_date: "2026-06-20", amount: "1200.00", payment_mode: "bank_transfer", reference_no: `PAY-${runId}`, expected_version: getNumber(financeApproved.body, "version") }), 200);
    const docTicket = await uploadExpenseDoc(employee.token, mainId, "travel_ticket");
    const docBoarding = await uploadExpenseDoc(employee.token, mainId, "boarding_pass");
    const docReceipt = await uploadExpenseDoc(employee.token, mainId, "receipt");
    const billsSubmitted = await expectStatus<JsonRecord>("employee submits bills", request("POST", `/api/v1/expenses/${mainId}/bills`, employee.token, { bill_reference: `BILL-${runId}`, submitted_at: "2026-06-22T10:00:00.000Z", expected_version: getNumber(paymentReleased.body, "version") }), 200);
    await expectStatus("settlement blocked before document verification", request("POST", `/api/v1/expenses/${mainId}/settlement`, finance.token, { actual_amount: "1200.00", expected_version: getNumber(billsSubmitted.body, "version") }), 400);
    for (const doc of [docTicket, docBoarding, docReceipt]) {
      const expenseDocumentId = typeof doc.document_id === "string" ? doc.document_id : getString(doc, "id");
      await expectStatus("manager verifies expense document", request("POST", `/api/v1/expenses/${mainId}/documents/${expenseDocumentId}/verify`, manager.token, { remarks: "Verified against uploaded bill" }), 200);
    }
    const closed = await expectStatus<JsonRecord>("finance settles and closes", request("POST", `/api/v1/expenses/${mainId}/settlement`, finance.token, { actual_amount: "1200.00", expected_version: getNumber(billsSubmitted.body, "version") }), 200);
    await expectStatus("closed ticket read-only", request("POST", `/api/v1/expenses/${mainId}/submit`, employee.token, { expected_version: getNumber(closed.body, "version") }), [400, 409]);
    await expectStatus("expense timeline", request("GET", `/api/v1/expenses/${mainId}/timeline`, employee.token), 200);
    await expectStatus("expense audit", request("GET", `/api/v1/expenses/${mainId}/audit`, auditor.token), 200);
    await expectStatus("employee expense list", request("GET", "/api/v1/expenses/my?page=1&limit=10", employee.token), 200);

    const document = await expectStatus<JsonRecord>("document metadata upload", request("POST", "/api/v1/documents", admin.token, {
      business_object_type: "employee",
      business_object_id: getString(employee.user, "id"),
      classification: "medical",
      document_type: "medical_record",
      file_name: `medical-${runId}.pdf`,
      mime_type: "application/pdf",
      size_bytes: 2048,
      checksum_sha256: "b".repeat(64)
    }), 200);
    const documentId = getString(document.body, "id");
    await expectStatus("document restricted denied", request("GET", `/api/v1/documents/${documentId}`, normalManager.token), 403);
    await expectStatus("document restricted allowed", request("GET", `/api/v1/documents/${documentId}`, (hrManager ?? admin).token), 200);
    await expectStatus("document list pagination", request("GET", "/api/v1/documents?page=1&limit=10", admin.token), 200);
    await expectStatus("document download url", request("POST", `/api/v1/documents/${documentId}/download-url`, admin.token), 200);
    await expectStatus("document verification", request("POST", `/api/v1/documents/${documentId}/verify`, admin.token, { decision: "verify", remarks: "Metadata verified" }), 200);
    await expectStatus("document access log", request("GET", `/api/v1/documents/${documentId}/access-log`, auditor.token), 200);
    await expectStatus("invalid document metadata rejected", request("POST", "/api/v1/documents", admin.token, { title: "bad" }), 400);

    const createdAsset = await expectStatus<JsonRecord>("asset create", request("POST", "/api/v1/assets", assetManager.token, {
      asset_code: `QA-ASSET-${runId}`,
      asset_type: "Laptop",
      name: `QA Laptop ${runId}`,
      serial_no: `SN-${runId}`
    }), 200);
    const assetId = getString(createdAsset.body, "id");
    await expectStatus("asset list", request("GET", "/api/v1/assets?page=1&limit=10", assetManager.token), 200);
    await expectStatus("asset detail", request("GET", `/api/v1/assets/${assetId}`, assetManager.token), 200);
    await expectStatus<JsonRecord>("asset assign", request("POST", `/api/v1/assets/${assetId}/assign`, assetManager.token, { assigned_to_user_id: getString(employee.user, "id"), expected_version: 1 }), 200);
    await expectStatus("asset qr safe scan", request("POST", `/api/v1/assets/scan/${encodeURIComponent(getString(createdAsset.body, "qr_hash"))}`), 200);
    await expectStatus("asset termination recovery event", request("POST", "/api/v1/assets/events/employee-terminated", admin.token, { employee_user_id: getString(employee.user, "id") }), 200);
    const postTerminationAsset = await expectStatus<JsonRecord>("asset detail after termination event", request("GET", `/api/v1/assets/${assetId}`, assetManager.token), 200);
    await expectStatus("asset return", request("POST", `/api/v1/assets/${assetId}/return`, assetManager.token, { expected_version: getNumber(postTerminationAsset.body, "version") }), 200);
    await expectStatus("license activate", request("POST", "/api/v1/assets/licenses/activate", assetManager.token, { product_id: seedIds.licenseProduct, entitlement_id: seedIds.entitlement, hardware_fingerprint: `qa-${runId}` }), 200);
    await expectStatus("license validate", request("POST", "/api/v1/assets/licenses/validate", assetManager.token, { product_id: seedIds.licenseProduct, hardware_fingerprint: `qa-${runId}` }), 200);
    await expectStatus("license revoke", request("POST", "/api/v1/assets/licenses/revoke", assetManager.token, { hardware_fingerprint: `qa-${runId}`, reason: "QA complete" }), 200);
    await expectStatus("license compromised/revoked fingerprint blocked", request("POST", "/api/v1/assets/licenses/activate", assetManager.token, { product_id: seedIds.licenseProduct, entitlement_id: seedIds.entitlement, hardware_fingerprint: `qa-${runId}` }), 400);

    const workDate = qaDate(0);
    await expectStatus("timesheet work segment create", request("POST", "/api/v1/timesheets/work-segments", employee.token, { work_date: workDate, project_code: `TS-${runId}`, hours: "8.00", description: "QA implementation" }), 200);
    await expectStatus("timesheet work segment list", request("GET", "/api/v1/timesheets/work-segments?page=1&limit=10", employee.token), 200);
    const submission = await expectStatus<JsonRecord>("timesheet submit", request("POST", "/api/v1/timesheets/submissions", employee.token, { cycle_start: workDate, cycle_end: workDate }), 200);
    const submissionId = getString(submission.body, "id");
    await expectStatus("timesheet approver queue", request("GET", "/api/v1/timesheets/queue/approver?page=1&limit=10", manager.token), 200);
    await expectStatus("timesheet stale OCC", request("POST", `/api/v1/timesheets/submissions/${submissionId}/approve`, manager.token, { decision: "approve", expected_version: 2 }), 409);
    await expectStatus("timesheet approve", request("POST", `/api/v1/timesheets/submissions/${submissionId}/approve`, manager.token, { decision: "approve", remarks: "Approved", expected_version: 1 }), 200);
    await expectStatus("timesheet my submissions", request("GET", "/api/v1/timesheets/submissions/my?page=1&limit=10", employee.token), 200);
    await expectStatus("timesheet invalid workflow payload", request("POST", "/api/v1/timesheets/workflow-definitions", admin.token, { scope: "company" }), 400);

    await expectStatus("report employee", request("GET", "/api/v1/reports/expenses/my?page=1&limit=10", employee.token), 200);
    await expectStatus("report manager queue", request("GET", "/api/v1/reports/expenses/manager-queue?page=1&limit=10", manager.token), 200);
    await expectStatus("report manager history", request("GET", "/api/v1/reports/expenses/manager-history?page=1&limit=10", manager.token), 200);
    await expectStatus("report finance dashboard", request("GET", "/api/v1/reports/expenses/finance-dashboard", finance.token), 200);
    await expectStatus("report finance history", request("GET", "/api/v1/reports/expenses/finance-history?page=1&limit=10", finance.token), 200);
    await expectStatus("report finance analytics", request("GET", "/api/v1/reports/expenses/finance-analytics", finance.token), 200);
    await expectStatus("report register", request("GET", "/api/v1/reports/expenses/register?page=1&limit=10", finance.token), 200);
    await expectStatus("report aging", request("GET", "/api/v1/reports/expenses/advance-aging?page=1&limit=10", finance.token), 200);
    await expectStatus("report payments", request("GET", "/api/v1/reports/expenses/payments?page=1&limit=10", finance.token), 200);
    await expectStatus("report audit", request("GET", "/api/v1/reports/expenses/audit?page=1&limit=10", auditor.token), 200);
    await expectStatus("report export", request("POST", "/api/v1/reports/exports", finance.token, { report: "register", format: "csv" }), 200);
  } catch (error) {
    record("standalone human qa aborted", "fail", { error: error instanceof Error ? error.message : String(error) });
  } finally {
    const failed = steps.filter((step) => step.status === "fail");
    const artifact = {
      ...summary,
      finished_at: new Date().toISOString(),
      status: failed.length === 0 ? "pass" : "fail",
      totals: {
        steps: steps.length,
        passed: steps.filter((step) => step.status === "pass").length,
        blocked: steps.filter((step) => step.status === "blocked").length,
        failed: failed.length
      },
      steps
    };
    mkdirSync(reportDir, { recursive: true });
    const outputPath = join(reportDir, outputFile);
    writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(JSON.stringify({ status: artifact.status, output: outputPath, totals: artifact.totals }, null, 2));
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  }
}
