import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";

export const assetsApi = {
  create(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/assets/", { method: "POST", body: input });
  },
  list(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/assets/", { query });
  },
  get(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/assets/${id}`);
  },
  assign(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/assets/${id}/assign`, { method: "POST", body: input });
  },
  returnAsset(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/assets/${id}/return`, { method: "POST", body: input });
  },
  scan(qrHash: string) {
    return apiRequest<ApiRecord>(`/api/v1/assets/scan/${encodeURIComponent(qrHash)}`, {
      method: "POST",
      auth: false,
    });
  },
  activateLicense(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/assets/licenses/activate", {
      method: "POST",
      body: input,
    });
  },
  validateLicense(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/assets/licenses/validate", {
      method: "POST",
      body: input,
    });
  },
  revokeLicense(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/assets/licenses/revoke", { method: "POST", body: input });
  },
  employeeTerminatedEvent(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/assets/events/employee-terminated", {
      method: "POST",
      body: input,
    });
  },
};
