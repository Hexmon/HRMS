import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";

export const coreApi = {
  orgSelectors() {
    return apiRequest<ApiRecord>("/api/v1/core/master-data/org-selectors");
  },
  listUsersPartial(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/core/users", { query });
  },
  createUser(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/core/users", { method: "POST", body: input });
  },
  getUserPartial(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/core/users/${id}`);
  },
  updateUser(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/core/users/${id}`, { method: "PATCH", body: input });
  },
  activateUser(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/core/users/${id}/activate`, {
      method: "POST",
      body: input,
    });
  },
  deactivateUser(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/core/users/${id}/deactivate`, {
      method: "POST",
      body: input,
    });
  },
  enableLogin(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/core/users/${id}/login/enable`, {
      method: "POST",
      body: input,
    });
  },
  disableLogin(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/core/users/${id}/login/disable`, {
      method: "POST",
      body: input,
    });
  },
  replaceRoles(id: string, input: ExpectedVersionBody & { roles: string[] }) {
    return apiRequest<ApiRecord>(`/api/v1/core/users/${id}/roles`, { method: "PUT", body: input });
  },
  getUserSubtree(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/core/users/${id}/subtree`);
  },
};
