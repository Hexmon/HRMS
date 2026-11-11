import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";
import { withExpenseCommandKey } from "./command-key";

export interface ExpenseCommandResult {
  id: string;
  status: string;
  version: number;
}

export const expensesApi = {
  metadata() {
    return apiRequest<ApiRecord>("/api/v1/expenses/metadata");
  },
  dashboardSummary(query: Record<string, string | number | boolean | undefined> = {}) {
    return apiRequest<ApiRecord>("/api/v1/expenses/dashboard-summary", { query });
  },
  create(input: ApiRecord) {
    return withExpenseCommandKey("new", "create", input, (key) =>
      apiRequest<ExpenseCommandResult>("/api/v1/expenses", {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": key },
      }),
    );
  },
  listMine(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/expenses/my", { query });
  },
  get(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/expenses/${id}`);
  },
  update(id: string, input: ApiRecord) {
    return apiRequest<ApiRecord>(`/api/v1/expenses/${id}`, { method: "PATCH", body: input });
  },
  submit(id: string, input: ExpectedVersionBody) {
    return withExpenseCommandKey(id, "submit", input, (key) =>
      apiRequest<ExpenseCommandResult>(`/api/v1/expenses/${id}/submit`, {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": key },
      }),
    );
  },
  withdraw(id: string, input: ExpectedVersionBody) {
    return withExpenseCommandKey(id, "withdraw", input, (key) =>
      apiRequest<ExpenseCommandResult>(`/api/v1/expenses/${id}/withdraw`, {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": key },
      }),
    );
  },
  addClarification(id: string, input: ApiRecord) {
    return withExpenseCommandKey(id, "clarification", input, (key) =>
      apiRequest<ExpenseCommandResult>(`/api/v1/expenses/${id}/clarifications`, {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": key },
      }),
    );
  },
  managerQueue(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/expenses/queue/manager", { query });
  },
  managerHistory(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/reports/expenses/manager-history", {
      query,
    });
  },
  managerVerify(id: string, input: ExpectedVersionBody) {
    return withExpenseCommandKey(id, "manager.verify", input, (key) =>
      apiRequest<ExpenseCommandResult>(`/api/v1/expenses/${id}/manager/verify`, {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": key },
      }),
    );
  },
  financeQueue(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/expenses/queue/finance", { query });
  },
  financeDetail(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/expenses/${id}/finance-detail`);
  },
  financeApprove(id: string, input: ExpectedVersionBody) {
    return withExpenseCommandKey(id, "finance.approve", input, (key) =>
      apiRequest<ExpenseCommandResult>(`/api/v1/expenses/${id}/finance/approve`, {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": key },
      }),
    );
  },
  recordPayment(id: string, input: ExpectedVersionBody) {
    return withExpenseCommandKey(id, "finance.payment", input, (key) =>
      apiRequest<ExpenseCommandResult>(`/api/v1/expenses/${id}/finance/payment`, {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": key },
      }),
    );
  },
  submitBills(id: string, input: ApiRecord) {
    return withExpenseCommandKey(id, "bills", input, (key) =>
      apiRequest<ExpenseCommandResult>(`/api/v1/expenses/${id}/bills`, {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": key },
      }),
    );
  },
  verifyDocument(id: string, documentId: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/expenses/${id}/documents/${documentId}/verify`, {
      method: "POST",
      body: input,
    });
  },
  settle(id: string, input: ExpectedVersionBody) {
    return withExpenseCommandKey(id, "settlement", input, (key) =>
      apiRequest<ExpenseCommandResult>(`/api/v1/expenses/${id}/settlement`, {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": key },
      }),
    );
  },
  timeline(id: string) {
    return apiRequest<ApiRecord[]>(`/api/v1/expenses/${id}/timeline`);
  },
  audit(id: string, query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>(`/api/v1/expenses/${id}/audit`, { query });
  },
  financeAnalytics(query: PageQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/reports/expenses/finance-analytics", { query });
  },
  advanceAging(query: PageQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/reports/expenses/advance-aging", { query });
  },
  paymentReport(query: PageQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/reports/expenses/payments", { query });
  },
  auditReport(query: PageQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/reports/expenses/audit", { query });
  },
};
