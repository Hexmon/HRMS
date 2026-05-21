import { apiRequest } from "@/shared/api";
import type { ApiRecord, PageQuery, PaginatedResponse } from "@/shared/api";

export const coreApi = {
  listUsersPartial(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/core/users", { query });
  },
  getUserPartial(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/core/users/${id}`);
  },
  getUserSubtree(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/core/users/${id}/subtree`);
  },
};
