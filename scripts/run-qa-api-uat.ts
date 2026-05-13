import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedIds } from "../src/platform/data-store.js";
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

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value.includes("X-Amz-") || value.includes("X-Amz-Signature") ? "[SIGNED_URL_REDACTED]" : value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        /(token|secret|password|authorization|cookie)/iu.test(key)
          ? "[REDACTED]"
          : key === "url" && typeof nested === "string"
            ? "[SIGNED_URL_REDACTED]"
            : redact(nested)
      ])
    );
  }
  return value;
}

function summarize(value: unknown): string {
  const text = JSON.stringify(redact(value));
  return text.length > 900 ? `${text.slice(0, 900)}... [truncated]` : text;
}

function record(name: string, ok: boolean, evidence: unknown): void {
  steps.push({ name, status: ok ? "pass" : "fail", evidence: summarize(evidence) });
}

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
  const unauth = await request("GET", "/api/v1/core/users?page=1&page_size=5");
  record("unauthenticated core access denied", unauth.status === 401, unauth.body);

  const requester = await login("E1");
  const finance = await login("N1");
  const admin = await login("ADM");
  const auditor = await login("AUD");
  const hrManager = await login("HRM");
  const normalManager = await login("MGR");
  const assetManager = await login("AST");

  const sales = await request<Record<string, unknown>>("POST", "/api/v1/expenses", requester.token, {
    submit: true,
    expense_type: "SalesPreSales",
    expense_sub_type: "Client Meeting",
    client_name: "QA Client",
    task_title: "QA client meeting",
    task_description: "Stakeholder UAT sales/pre-sales expense",
    location: "Mumbai",
    start_date: "2026-06-10",
    end_date: "2026-06-10",
    estimated_amount: "350.00",
    payment_type: "ReimbursementAccrued",
    line_items: [{ line_category: "meal", description: "Client meeting refreshments", line_total: "350.00" }]
  });
  record(
    "sales/pre-sales expense create and submit",
    sales.status === 200 && sales.body.status === "Pending Reviewer",
    sales.body
  );

  const employeeRegister = await request("GET", "/api/v1/reports/expenses/register?page=1&page_size=10", requester.token);
  record("employee blocked from finance register", employeeRegister.status === 403, employeeRegister.body);

  const financeRegister = await request("GET", "/api/v1/reports/expenses/register?page=1&page_size=10", finance.token);
  record("finance register access scoped", financeRegister.status === 200, financeRegister.body);

  const auditorAudit = await request("GET", "/api/v1/reports/expenses/audit?page=1&page_size=10", auditor.token);
  record("auditor audit report access", auditorAudit.status === 200, auditorAudit.body);

  const restrictedUpload = await request<Record<string, unknown>>("POST", "/api/v1/documents", admin.token, {
    business_object_type: "employee",
    business_object_id: requester.user.id,
    classification: "medical",
    document_type: "medical_record",
    file_name: "qa-medical.pdf",
    mime_type: "application/pdf",
    size_bytes: 128
  });
  record("restricted HR document upload by admin", restrictedUpload.status === 200, restrictedUpload.body);
  const documentId = String(restrictedUpload.body.id ?? "");

  const managerDenied = await request("POST", `/api/v1/documents/${documentId}/download-url`, normalManager.token);
  record("normal manager denied restricted document", managerDenied.status === 403, managerDenied.body);

  const hrAllowed = await request<Record<string, unknown>>("POST", `/api/v1/documents/${documentId}/download-url`, hrManager.token);
  record("HR manager allowed restricted document", hrAllowed.status === 200 && typeof hrAllowed.body.url === "string", hrAllowed.body);

  const accessLog = await request<Record<string, unknown>>("GET", `/api/v1/documents/${documentId}/access-log?page=1&page_size=20`, auditor.token);
  record("document access log recorded", accessLog.status === 200 && Number(accessLog.body.total ?? 0) >= 3, accessLog.body);

  const compromised = await request("POST", "/api/v1/assets/licenses/activate", assetManager.token, {
    product_id: seedIds.licenseProduct,
    entitlement_id: seedIds.entitlement,
    hardware_fingerprint: "qa-compromised-device"
  });
  record("compromised device activation blocked", compromised.status === 400, compromised.body);

  const mobileSmoke = await request("GET", "/api/v1/expenses/my?page=1&page_size=5", requester.token);
  record("mobile compact JSON smoke", mobileSmoke.status === 200 && summarize(mobileSmoke.body).length < 5000, mobileSmoke.body);
} catch (error) {
  record("QA API UAT runner", false, error instanceof Error ? error.stack ?? error.message : String(error));
}

const result = {
  timestamp: new Date().toISOString(),
  api_base_url: apiBaseUrl,
  status: steps.every((step) => step.status === "pass") ? "pass" : "fail",
  steps
};

writeFileSync(join(reportDir, "qa-api-uat-results.json"), `${JSON.stringify(result, null, 2)}\n`);

if (result.status === "fail") {
  console.error(`QA API UAT failed. See ${join(reportDir, "qa-api-uat-results.json")}`);
  process.exit(1);
}

console.log("QA API UAT checks passed.");
