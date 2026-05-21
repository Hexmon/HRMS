import { apiRequest } from "@/shared/api";
import type { ApiRecord } from "@/shared/api";

export const reportsApi = {
  createExport(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/reports/exports", { method: "POST", body: input });
  },
};
