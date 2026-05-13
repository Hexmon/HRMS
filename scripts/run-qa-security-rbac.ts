import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRuntimeEnv } from "./env.js";

loadRuntimeEnv();

const reportDir = process.env.HRMS_REPORT_DIR ?? "docs/qa/runs/qa-readiness";
mkdirSync(reportDir, { recursive: true });

interface Step {
  name: string;
  status: "pass" | "fail";
  evidence: string;
}

const steps: Step[] = [];
const apiBaseUrl = (process.env.API_BASE_URL ?? "http://localhost:3101").replace(/\/$/u, "");
const runId = Date.now();

function scrub(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (typeof _key === "string" && /(token|secret|password|authorization|cookie)/iu.test(_key)) {
      return "[REDACTED]";
    }
    if (_key === "url" && typeof nested === "string") {
      return "[SIGNED_URL_REDACTED]";
    }
    if (typeof nested === "string" && nested.includes("X-Amz-")) {
      return "[SIGNED_URL_REDACTED]";
    }
    return nested;
  }).slice(0, 900);
}

function record(name: string, ok: boolean, evidence: unknown): void {
  steps.push({ name, status: ok ? "pass" : "fail", evidence: scrub(evidence) });
}

async function request<T>(method: string, path: string, token?: string, payload?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(payload ? { "content-type": "application/json" } : {})
    },
    body: payload ? JSON.stringify(payload) : undefined
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as T : {} as T };
}

async function login(employeeCode: string): Promise<{ token: string; user: { id: string } }> {
  const response = await request<{ access_token?: string; user?: { id: string } }>("POST", "/api/v1/auth/login", undefined, {
    employee_code: employeeCode
  });
  record(`login ${employeeCode}`, response.status === 200 && Boolean(response.body.access_token), response.body);
  return { token: response.body.access_token ?? "", user: response.body.user ?? { id: "" } };
}

try {
  const employee = await login("E1");
  const reviewer = await login("D1");
  const director = await login("S1");
  const finance = await login("N1");
  const admin = await login("ADM");
  const normalManager = await login("MGR");
  const hrManager = await login("HRM");

  const unauth = await request("GET", "/api/v1/reports/expenses/my?page=1&page_size=5");
  record("unauthenticated report access denied", unauth.status === 401, unauth.body);

  const financeDenied = await request("GET", "/api/v1/reports/expenses/finance-dashboard?page=1&page_size=5", employee.token);
  record("employee denied finance dashboard", financeDenied.status === 403, financeDenied.body);

  const reviewerQueue = await request<Record<string, unknown>>("GET", "/api/v1/expenses/queue/reviewer?page=1&page_size=25", reviewer.token);
  record("reviewer queue access granted", reviewerQueue.status === 200, reviewerQueue.body);

  const directorDashboard = await request("GET", "/api/v1/reports/expenses/director-dashboard?page=1&page_size=5", director.token);
  record("director dashboard access granted", directorDashboard.status === 200, directorDashboard.body);

  const financeDashboard = await request("GET", "/api/v1/reports/expenses/finance-dashboard?page=1&page_size=5", finance.token);
  record("finance dashboard access granted", financeDashboard.status === 200, financeDashboard.body);

  const ownTicket = await request<Record<string, unknown>>("POST", "/api/v1/expenses", director.token, {
    submit: true,
    expense_type: "Project",
    expense_sub_type: "Project Travel",
    project_code: `QA-SELF-${runId}`,
    task_title: "Self approval security test",
    task_description: "Direct API injection should be blocked",
    location: "Mumbai",
    start_date: "2026-07-01",
    end_date: "2026-07-02",
    estimated_amount: "100.00",
    payment_type: "Advance",
    advance_amount: "50.00",
    line_items: [{ line_category: "travel", description: "Taxi", line_total: "100.00" }]
  });
  const selfApprove = await request("POST", `/api/v1/expenses/${String(ownTicket.body.id)}/approve`, director.token, {
    decision: "approve",
    expected_version: 1
  });
  record("direct API self-approval blocked", selfApprove.status === 403, selfApprove.body);

  const restrictedUpload = await request<Record<string, unknown>>("POST", "/api/v1/documents", admin.token, {
    business_object_type: "employee",
    business_object_id: employee.user.id,
    classification: "compensation",
    document_type: "compensation_letter",
    file_name: "qa-compensation.pdf",
    mime_type: "application/pdf",
    size_bytes: 256
  });
  const documentId = String(restrictedUpload.body.id ?? "");
  const managerDenied = await request("POST", `/api/v1/documents/${documentId}/download-url`, normalManager.token);
  const hrAllowed = await request("POST", `/api/v1/documents/${documentId}/download-url`, hrManager.token);
  record("normal manager denied compensation document", managerDenied.status === 403, managerDenied.body);
  record("HR manager allowed compensation document", hrAllowed.status === 200, hrAllowed.body);
} catch (error) {
  record("QA security/RBAC runner", false, error instanceof Error ? error.stack ?? error.message : String(error));
}

const result = {
  timestamp: new Date().toISOString(),
  status: steps.every((step) => step.status === "pass") ? "pass" : "fail",
  steps
};

writeFileSync(join(reportDir, "qa-security-rbac-results.json"), `${JSON.stringify(result, null, 2)}\n`);

if (result.status === "fail") {
  console.error(`QA security/RBAC checks failed. See ${join(reportDir, "qa-security-rbac-results.json")}`);
  process.exit(1);
}

console.log("QA security/RBAC checks passed.");
