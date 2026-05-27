import { apiRequest } from "@/shared/api";
import type { ApiRecord } from "@/shared/api";

export const platformApi = {
  live() {
    return apiRequest<{ status: string }>("/health/live", { auth: false });
  },
  ready() {
    return apiRequest<{ status: string }>("/health/ready", { auth: false });
  },
  versionedLive() {
    return apiRequest<{ status: string }>("/api/v1/health/live", { auth: false });
  },
  versionedReady() {
    return apiRequest<{ status: string }>("/api/v1/health/ready", { auth: false });
  },
  openapi() {
    return apiRequest<ApiRecord>("/api/v1/openapi.json", { auth: false });
  },
};
