import { apiBlobRequest, apiRequest } from "@/shared/api";
import type { ApiRecord, PageQuery, PaginatedResponse } from "@/shared/api";

export const documentsApi = {
  uploadPolicy() {
    return apiRequest<DocumentUploadPolicy>("/api/v1/documents/upload-policy");
  },
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
  async createDownloadUrl(id: string) {
    const blob = await apiBlobRequest(`/api/v1/documents/${id}/content`);
    const url = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { document_id: id, url, expires_in_seconds: 60 };
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

export interface DocumentUploadPolicy {
  max_bytes: number;
  image_max_width: number;
  image_max_height: number;
  image_jpeg_quality: number;
  allowed_mime_types: string[];
  image_output_mime_type: "image/jpeg";
  company_logo?: {
    max_bytes: number;
    image_max_width: number;
    image_max_height: number;
    image_jpeg_quality: number;
    allowed_mime_types: string[];
    image_output_mime_type: "image/jpeg";
  };
}
