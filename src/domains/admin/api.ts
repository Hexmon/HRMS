import { apiRequest } from "@/shared/api";
import type { ApiRecord } from "@/shared/api";

export const adminApi = {
  getFinanceGovernance() {
    return apiRequest<ApiRecord>("/api/v1/platform/finance-governance");
  },
  updateFinanceGovernance(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/platform/finance-governance", {
      method: "PUT",
      body: input,
    });
  },
  listManagerBackups() {
    return apiRequest<ApiRecord[]>("/api/v1/manager-backups");
  },
  createManagerBackup(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/manager-backups", {
      method: "POST",
      body: input,
    });
  },
  deleteManagerBackup(id: string) {
    return apiRequest<void>(`/api/v1/manager-backups/${id}`, { method: "DELETE" });
  },
  createTimesheetWorkflowDefinition(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/timesheets/workflow-definitions", {
      method: "POST",
      body: input,
    });
  },
};
