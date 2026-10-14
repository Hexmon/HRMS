import { apiRequest } from "@/shared/api";
import type { ApiRecord, PageQuery, PaginatedResponse } from "@/shared/api";

export type PlatformRegisteredDeviceStatus = "registered" | "suspended" | "revoked";
export type PlatformRegisteredDevicePlatform = "ios" | "android";
export type PlatformDeviceLifecycleReason =
  | "lost"
  | "replaced"
  | "user_requested"
  | "security"
  | "administrative";

export interface PlatformRegisteredDevice {
  registered_device_id: string;
  platform: PlatformRegisteredDevicePlatform;
  status: PlatformRegisteredDeviceStatus;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
}

export interface PlatformRegisteredDeviceListResponse {
  items: PlatformRegisteredDevice[];
}

export interface PlatformAdminRegisteredDevice extends PlatformRegisteredDevice {
  owner: {
    employee_code: string;
    full_name: string;
  };
}

export interface PlatformAdminRegisteredDeviceListQuery extends PageQuery {
  status?: PlatformRegisteredDeviceStatus;
  platform?: PlatformRegisteredDevicePlatform;
  sort?: "updated_at_desc" | "status_changed_at_desc" | "employee_code_asc";
}

export interface PlatformDeviceLifecycleInput {
  reason?: PlatformDeviceLifecycleReason;
}

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
  listMyDevices() {
    return apiRequest<PlatformRegisteredDeviceListResponse>("/api/v1/platform/devices");
  },
  listAdminDevices(query: PlatformAdminRegisteredDeviceListQuery = {}) {
    return apiRequest<PaginatedResponse<PlatformAdminRegisteredDevice>>(
      "/api/v1/platform/admin/devices",
      { query },
    );
  },
  revokeDevice(deviceId: string, input: PlatformDeviceLifecycleInput = {}) {
    return apiRequest<PlatformRegisteredDevice>(
      `/api/v1/platform/devices/${encodeURIComponent(deviceId)}/revoke`,
      { method: "POST", body: input },
    );
  },
};
