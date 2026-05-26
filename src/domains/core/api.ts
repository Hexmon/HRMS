import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";
import type { ProfilePhotoPolicy } from "@/shared/uploads/profile-photo";

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
  profilePhotoPolicy() {
    return apiRequest<ProfilePhotoPolicy>("/api/v1/core/users/profile-photo-policy");
  },
  uploadProfilePhoto(id: string, input: FormData) {
    return apiRequest<ApiRecord>(`/api/v1/core/users/${id}/profile-photo`, {
      method: "POST",
      body: input,
    });
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
  getUserRoleHistory(id: string, query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>(`/api/v1/core/users/${id}/roles/history`, {
      query,
    });
  },
  getUserAudit(
    id: string,
    query: PageQuery & { event_type?: string; date_from?: string; date_to?: string } = {},
  ) {
    return apiRequest<PaginatedResponse<ApiRecord>>(`/api/v1/core/users/${id}/audit`, { query });
  },
  createUserImport(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/core/users/imports", { method: "POST", body: input });
  },
  getUserImport(jobId: string) {
    return apiRequest<ApiRecord>(`/api/v1/core/users/imports/${jobId}`);
  },
  createUserExport(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/core/users/exports", { method: "POST", body: input });
  },
  getUserSubtree(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/core/users/${id}/subtree`);
  },
};
