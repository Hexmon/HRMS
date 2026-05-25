import { apiRequest } from "@/shared/api";
import type { ApiRecord, PageQuery, PaginatedResponse } from "@/shared/api";

export const documentsApi = {
  create(input: ApiRecord | FormData) {
    return apiRequest<ApiRecord>("/api/v1/documents", { method: "POST", body: input });
  },
  list(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/documents", { query });
  },
  attachToExpense(expenseId: string, input: ApiRecord | FormData) {
    return apiRequest<ApiRecord>(`/api/v1/expenses/${expenseId}/documents`, {
      method: "POST",
      body: input,
    });
  },
  get(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/documents/${id}`);
  },
  deleteDocument(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/documents/${id}`, { method: "DELETE" });
  },
  createDownloadUrl(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/documents/${id}/download-url`, { method: "POST" });
  },
  verify(id: string, input: ApiRecord) {
    return apiRequest<ApiRecord>(`/api/v1/documents/${id}/verify`, { method: "POST", body: input });
  },
  accessLog(id: string, query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>(`/api/v1/documents/${id}/access-log`, {
      query,
    });
  },
};
