import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRuntimeEnv, requireEnv } from "./env.js";

loadRuntimeEnv();

const releaseDir = process.env.HRMS_REPORT_DIR ?? "docs/qa/runs/release-acceptance";
mkdirSync(releaseDir, { recursive: true });

interface UatStep {
  name: string;
  status: "pass" | "fail" | "blocked";
  evidence: string;
}

const steps: UatStep[] = [];

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
        if (/(token|secret|password|authorization|cookie)/iu.test(key)) {
          return [key, "[REDACTED]"];
        }
        return [key, redact(nestedValue)];
      })
    );
  }

  return value;
}

function summarize(value: unknown): string {
  const serialized = JSON.stringify(redact(value));
  return serialized.length > 1200 ? `${serialized.slice(0, 1200)}... [truncated]` : serialized;
}

function record(name: string, status: UatStep["status"], evidence: string): void {
  steps.push({ name, status, evidence });
}

function expectStatus(name: string, actual: number, expected: number, body: unknown): void {
  record(name, actual === expected ? "pass" : "fail", `expected ${expected}, received ${actual}: ${summarize(body)}`);
}

const apiBaseUrl = requireEnv("API_BASE_URL").replace(/\/$/u, "");
const runId = `${Date.now()}`;
const dayOffset = Math.floor(Date.now() / 1000) % 50000;

function addDays(base: Date, days: number): string {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

const timesheetStart = addDays(new Date(Date.UTC(2030, 0, 1)), dayOffset);
const timesheetEnd = addDays(new Date(`${timesheetStart}T00:00:00.000Z`), 6);

async function request<T>(
  method: string,
  path: string,
  token?: string,
  payload?: unknown
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(payload ? { "content-type": "application/json" } : {})
    },
    body: payload ? JSON.stringify(payload) : undefined
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body };
}

async function login(employeeCode: string): Promise<{ token: string; user: { id: string } }> {
  const response = await request<{ access_token: string; user: { id: string } }>("POST", "/api/v1/auth/login", undefined, {
    employee_code: employeeCode
  });
  expectStatus(`login ${employeeCode}`, response.status, 200, response.body);
  return { token: response.body.access_token, user: response.body.user };
}

const projectTravelPayload = {
  submit: true,
  expense_type: "Project",
  expense_sub_type: "Project Travel",
  project_code: "REL-PRJ-100",
  task_title: "Release acceptance travel",
  task_description: "Release acceptance project travel",
  location: "Mumbai",
  start_date: "2026-05-01",
  end_date: "2026-05-03",
  estimated_amount: "1000.00",
  payment_type: "Advance",
  advance_amount: "500.00",
  line_items: [
    { line_category: "travel", description: "Flight", line_total: "700.00" },
    { line_category: "lodging", description: "Hotel", line_total: "300.00" }
  ]
};

try {
  const health = await request("GET", "/health/live");
  expectStatus("api health", health.status, 200, health.body);

  const employee = await login("E1");
  const reviewer = await login("D1");
  const director = await login("S1");
  const finance = await login("N1");
  const assetManager = await login("AST");
  const admin = await login("ADM");

  const create = await request<any>("POST", "/api/v1/expenses", employee.token, projectTravelPayload);
  expectStatus("expense submit routes to reviewer", create.status, 200, create.body);
  const ticketId = create.body.id as string;
  record(
    "expense initial status",
    create.body.status === "Pending Reviewer" ? "pass" : "fail",
    `status=${create.body.status}`
  );

  const reviewReturn = await request<any>("POST", `/api/v1/expenses/${ticketId}/review`, reviewer.token, {
    decision: "return",
    remarks: "Need clarification",
    expected_version: 1
  });
  expectStatus("reviewer return requires remarks and succeeds", reviewReturn.status, 200, reviewReturn.body);

  const resubmit = await request<any>("POST", `/api/v1/expenses/${ticketId}/submit`, employee.token, {
    expected_version: 2
  });
  expectStatus("requester resubmits returned ticket", resubmit.status, 200, resubmit.body);

  const review = await request<any>("POST", `/api/v1/expenses/${ticketId}/review`, reviewer.token, {
    decision: "approve",
    expected_version: 3
  });
  expectStatus("reviewer approve", review.status, 200, review.body);

  const staleDirector = await request<any>("POST", `/api/v1/expenses/${ticketId}/approve`, director.token, {
    decision: "approve",
    expected_version: 3
  });
  expectStatus("expense OCC conflict returns 409", staleDirector.status, 409, staleDirector.body);

  const directorApprove = await request<any>("POST", `/api/v1/expenses/${ticketId}/approve`, director.token, {
    decision: "approve",
    expected_version: 4
  });
  expectStatus("director approve", directorApprove.status, 200, directorApprove.body);

  const prematureSettlement = await request<any>("POST", `/api/v1/expenses/${ticketId}/settlement`, finance.token, {
    actual_amount: "500.00",
    expected_version: 5
  });
  expectStatus("settlement blocked before payment release", prematureSettlement.status, 400, prematureSettlement.body);

  const financeVerify = await request<any>("POST", `/api/v1/expenses/${ticketId}/finance/verify`, finance.token, {
    decision: "verify",
    expected_version: 5
  });
  expectStatus("finance verify", financeVerify.status, 200, financeVerify.body);

  const payment = await request<any>("POST", `/api/v1/expenses/${ticketId}/finance/payment`, finance.token, {
    payment_date: "2026-05-04",
    amount: "500.00",
    payment_mode: "NEFT",
    reference_no: `REL-PAY-${runId}`,
    expected_version: 6
  });
  expectStatus("payment release", payment.status, 200, payment.body);

  const missingDocsSettlement = await request<any>("POST", `/api/v1/expenses/${ticketId}/settlement`, finance.token, {
    actual_amount: "500.00",
    expected_version: 7
  });
  expectStatus("required documents block closure", missingDocsSettlement.status, 400, missingDocsSettlement.body);

  const uploadedDocuments: Array<{ id: string; document_type: string }> = [];
  for (const document_type of ["travel_ticket", "boarding_pass", "receipt"]) {
    const upload = await request<any>("POST", `/api/v1/expenses/${ticketId}/documents`, employee.token, {
      classification: "finance",
      document_type,
      file_name: `${document_type}.pdf`,
      mime_type: "application/pdf",
      size_bytes: 2000
    });
    expectStatus(`expense document upload ${document_type}`, upload.status, 200, upload.body);
    uploadedDocuments.push({ id: upload.body.id, document_type });
  }

  const blockedPendingVerification = await request<any>("POST", `/api/v1/expenses/${ticketId}/settlement`, finance.token, {
    actual_amount: "500.00",
    expected_version: 7
  });
  expectStatus("pending reviewer document verification blocks closure", blockedPendingVerification.status, 400, blockedPendingVerification.body);

  for (const document of uploadedDocuments) {
    const verify = await request<any>("POST", `/api/v1/expenses/${ticketId}/documents/${document.id}/verify`, reviewer.token);
    expectStatus(`reviewer document verification ${document.document_type}`, verify.status, 200, verify.body);
  }

  const settlement = await request<any>("POST", `/api/v1/expenses/${ticketId}/settlement`, finance.token, {
    actual_amount: "500.00",
    expected_version: 7
  });
  expectStatus("settlement closes ticket", settlement.status, 200, settlement.body);
  record("closed ticket status", settlement.body.status === "Closed" ? "pass" : "fail", `status=${settlement.body.status}`);

  const audit = await request<any>("GET", `/api/v1/expenses/${ticketId}/audit?page=1&page_size=50`, finance.token);
  expectStatus("audit report available", audit.status, 200, audit.body);
  record("audit events present", audit.body.total >= 8 ? "pass" : "fail", `total=${audit.body.total}`);

  const rejectTicket = await request<any>("POST", "/api/v1/expenses", employee.token, {
    ...projectTravelPayload,
    project_code: `REL-REJECT-${runId}`
  });
  const reject = await request<any>("POST", `/api/v1/expenses/${rejectTicket.body.id}/review`, reviewer.token, {
    decision: "reject",
    remarks: "Not allowed",
    expected_version: 1
  });
  expectStatus("reviewer reject path", reject.status, 200, reject.body);

  const directorTicket = await request<any>("POST", "/api/v1/expenses", employee.token, {
    ...projectTravelPayload,
    project_code: `REL-DIR-RETURN-${runId}`
  });
  await request("POST", `/api/v1/expenses/${directorTicket.body.id}/review`, reviewer.token, {
    decision: "approve",
    expected_version: 1
  });
  const directorReturn = await request<any>("POST", `/api/v1/expenses/${directorTicket.body.id}/approve`, director.token, {
    decision: "return",
    remarks: "Revise",
    expected_version: 2
  });
  expectStatus("director return path", directorReturn.status, 200, directorReturn.body);

  const directorOwn = await request<any>("POST", "/api/v1/expenses", director.token, {
    ...projectTravelPayload,
    project_code: `REL-DIR-OWN-${runId}`
  });
  const selfApproval = await request<any>("POST", `/api/v1/expenses/${directorOwn.body.id}/approve`, director.token, {
    decision: "approve",
    expected_version: 1
  });
  expectStatus("self-approval prevention", selfApproval.status, 403, selfApproval.body);

  const financeOwn = await request<any>("POST", "/api/v1/expenses", finance.token, {
    ...projectTravelPayload,
    project_code: `REL-FIN-OWN-${runId}`
  });
  const financeSelfSettle = await request<any>("POST", `/api/v1/expenses/${financeOwn.body.id}/settlement`, finance.token, {
    actual_amount: "500.00",
    expected_version: 1
  });
  expectStatus("finance self-settlement prevention", financeSelfSettle.status, 403, financeSelfSettle.body);

  const restrictedDoc = await request<any>("POST", "/api/v1/documents", admin.token, {
    business_object_type: "employee",
    business_object_id: employee.user.id,
    classification: "medical",
    document_type: "medical_record",
    file_name: "medical.pdf",
    mime_type: "application/pdf",
    size_bytes: 1000
  });
  expectStatus("restricted document upload by admin", restrictedDoc.status, 200, restrictedDoc.body);
  const restrictedDenied = await request<any>("POST", `/api/v1/documents/${restrictedDoc.body.id}/download-url`, director.token);
  expectStatus("document classification RBAC denies director", restrictedDenied.status, 403, restrictedDenied.body);

  const assets = await request<any>("GET", "/api/v1/assets?page=1&page_size=10", assetManager.token);
  expectStatus("asset list", assets.status, 200, assets.body);
  let asset = assets.body.items.find((candidate: { status: string }) => candidate.status === "In Stock");
  if (!asset) {
    const createdAsset = await request<any>("POST", "/api/v1/assets", assetManager.token, {
      asset_code: `REL-UAT-${runId}`,
      asset_type: "Laptop",
      name: "Release UAT Laptop",
      serial_no: `REL-UAT-SN-${runId}`
    });
    expectStatus("asset create assignable", createdAsset.status, 200, createdAsset.body);
    asset = createdAsset.body;
  }
  const assign = await request<any>("POST", `/api/v1/assets/${asset.id}/assign`, assetManager.token, {
    assigned_to_user_id: employee.user.id,
    expected_version: asset.version
  });
  expectStatus("asset assignment", assign.status, 200, assign.body);
  const scan = await request<any>("POST", `/api/v1/assets/scan/${asset.qr_hash}`);
  expectStatus("asset QR scan", scan.status, 200, scan.body);
  record(
    "asset QR scan does not leak internal fields",
    scan.body.id === undefined && !JSON.stringify(scan.body).includes("procurement_cost") ? "pass" : "fail",
    summarize(scan.body)
  );
  const recovery = await request<any>("POST", "/api/v1/assets/events/employee-terminated", assetManager.token, {
    employee_user_id: employee.user.id
  });
  expectStatus("termination recovery event", recovery.status, 200, recovery.body);

  const segment = await request<any>("POST", "/api/v1/timesheets/work-segments", employee.token, {
    work_date: timesheetStart,
    project_code: `REL-PRJ-${runId}`,
    hours: "8.00",
    billable: true
  });
  expectStatus("timesheet work segment", segment.status, 200, segment.body);
  const submission = await request<any>("POST", "/api/v1/timesheets/submissions", employee.token, {
    cycle_start: timesheetStart,
    cycle_end: timesheetEnd
  });
  expectStatus("timesheet submission", submission.status, 200, submission.body);
  const tsApproval = await request<any>("POST", `/api/v1/timesheets/submissions/${submission.body.id}/approve`, reviewer.token, {
    decision: "approve",
    expected_version: 1
  });
  expectStatus("timesheet approval", tsApproval.status, 200, tsApproval.body);
  const tsStale = await request<any>("POST", `/api/v1/timesheets/submissions/${submission.body.id}/approve`, reviewer.token, {
    decision: "approve",
    expected_version: 1
  });
  expectStatus("timesheet OCC conflict", tsStale.status, 409, tsStale.body);
} catch (error) {
  record("UAT runner", "fail", error instanceof Error ? error.stack ?? error.message : String(error));
}

const result = {
  timestamp: new Date().toISOString(),
  api_base_url: apiBaseUrl,
  status: steps.every((step) => step.status === "pass") ? "pass" : "fail",
  steps
};

writeFileSync(join(releaseDir, "business-uat-results.json"), `${JSON.stringify(result, null, 2)}\n`);

if (result.status === "fail") {
  console.error(`Release UAT failed. See ${join(releaseDir, "business-uat-results.json")}`);
  process.exit(1);
}

console.log("Release UAT API flows passed.");
