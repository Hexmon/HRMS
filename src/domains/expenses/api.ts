import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";

export const expensesApi = {
  create(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/expenses", { method: "POST", body: input });
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
    return apiRequest<ApiRecord>(`/api/v1/expenses/${id}/submit`, { method: "POST", body: input });
  },
  managerQueue(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/expenses/queue/manager", { query });
  },
  managerVerify(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/expenses/${id}/manager/verify`, {
      method: "POST",
      body: input,
    });
  },
  financeQueue(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/expenses/queue/finance", { query });
  },
  financeDetail(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/expenses/${id}/finance-detail`);
  },
  financeApprove(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/expenses/${id}/finance/approve`, {
      method: "POST",
      body: input,
    });
  },
  recordPayment(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/expenses/${id}/finance/payment`, {
      method: "POST",
      body: input,
    });
  },
  submitBills(id: string, input: ApiRecord) {
    return apiRequest<ApiRecord>(`/api/v1/expenses/${id}/bills`, { method: "POST", body: input });
  },
  verifyDocument(id: string, documentId: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/expenses/${id}/documents/${documentId}/verify`, {
      method: "POST",
      body: input,
    });
  },
  settle(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/expenses/${id}/settlement`, {
      method: "POST",
      body: input,
    });
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
