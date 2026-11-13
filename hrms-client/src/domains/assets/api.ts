import { apiRequest, ApiError } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";

const pendingAssetCommands = new Map<string, { key: string }>();

async function intentSlot(method: "POST" | "PATCH", path: string, body: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([method, path, body]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `hrms.asset.intent.${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function readIntent(slot: string): { key: string } | undefined {
  try {
    const value = window.sessionStorage.getItem(slot);
    if (value) return JSON.parse(value) as { key: string };
  } catch {
    /* Private browsing may disable storage; keep this tab's memory key. */
  }
  return pendingAssetCommands.get(slot);
}

function writeIntent(slot: string, value: { key: string }): void {
  pendingAssetCommands.set(slot, value);
  try {
    window.sessionStorage.setItem(slot, JSON.stringify(value));
  } catch {
    /* Memory fallback. */
  }
}

async function assetWrite<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const slot = await intentSlot(method, path, body);
  let intent = readIntent(slot);
  if (!intent) {
    intent = { key: crypto.randomUUID() };
    writeIntent(slot, intent);
  }
  try {
    const result = await apiRequest<T>(path, {
      method,
      body,
      headers: { "Idempotency-Key": intent.key },
    });
    // Concurrent submits shared the pending key; a confirmed later submit is
    // a new intent even when its body is identical.
    if (readIntent(slot)?.key === intent.key) {
      pendingAssetCommands.delete(slot);
      try {
        window.sessionStorage.removeItem(slot);
      } catch {
        /* Memory fallback. */
      }
    }
    return result;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status < 500 &&
      error.status !== 409 &&
      error.status !== 429
    ) {
      pendingAssetCommands.delete(slot);
      try {
        window.sessionStorage.removeItem(slot);
      } catch {
        /* Memory fallback. */
      }
    }
    throw error;
  }
}

export const assetsApi = {
  create(input: ApiRecord) {
    return assetWrite<ApiRecord>("/api/v1/assets/", "POST", input);
  },
  list(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/assets/", { query });
  },
  myAssets(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/assets/my", { query });
  },
  assignees(q = "") {
    return apiRequest<{ items: Array<{ id: string; full_name: string }>; has_more: boolean }>(
      "/api/v1/assets/assignees",
      { query: { q } },
    );
  },
  get(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/assets/${id}`);
  },
  assign(id: string, input: ExpectedVersionBody) {
    return assetWrite<ApiRecord>(`/api/v1/assets/${id}/assign`, "POST", input);
  },
  returnAsset(id: string, input: ExpectedVersionBody) {
    return assetWrite<ApiRecord>(`/api/v1/assets/${id}/return`, "POST", input);
  },
  scan(qrHash: string) {
    return apiRequest<ApiRecord>(`/api/v1/assets/scan/${encodeURIComponent(qrHash)}`, {
      method: "POST",
      auth: false,
    });
  },
  activateLicense(input: ApiRecord) {
    return assetWrite<ApiRecord>("/api/v1/assets/licenses/activate", "POST", input);
  },
  validateLicense(input: ApiRecord) {
    return apiRequest<ApiRecord>("/api/v1/assets/licenses/validate", {
      method: "POST",
      body: input,
    });
  },
  revokeLicense(input: ApiRecord) {
    return assetWrite<ApiRecord>("/api/v1/assets/licenses/revoke", "POST", input);
  },
  employeeTerminatedEvent(input: ApiRecord) {
    return assetWrite<ApiRecord>("/api/v1/assets/events/employee-terminated", "POST", input);
  },
  createRequest(input: ApiRecord) {
    return assetWrite<ApiRecord>("/api/v1/assets/requests", "POST", input);
  },
  myRequests(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/assets/requests/my", { query });
  },
  requestQueue(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { queue_counts?: ApiRecord }>(
      "/api/v1/assets/requests/queue",
      { query },
    );
  },
  decideRequest(id: string, input: ApiRecord) {
    return assetWrite<ApiRecord>(`/api/v1/assets/requests/${id}/decision`, "POST", input);
  },
  cancelRequest(id: string, input: ExpectedVersionBody) {
    return assetWrite<ApiRecord>(`/api/v1/assets/requests/${id}/cancel`, "POST", input);
  },
  acknowledge(id: string, input: ExpectedVersionBody & { acknowledgement_type: string }) {
    return assetWrite<ApiRecord>(`/api/v1/assets/${id}/acknowledgements`, "POST", input);
  },
  listMaintenance(id: string, query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>(`/api/v1/assets/${id}/maintenance`, {
      query,
    });
  },
  createMaintenance(id: string, input: ApiRecord) {
    return assetWrite<ApiRecord>(`/api/v1/assets/${id}/maintenance`, "POST", input);
  },
  vendors(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/assets/vendors", { query });
  },
  warrantyAlerts(query: PageQuery = {}) {
    return apiRequest<
      PaginatedResponse<ApiRecord> & {
        alert_window_days?: number;
        counts?: ApiRecord;
        generated_at?: string;
      }
    >("/api/v1/assets/warranty-alerts", { query });
  },
  createVendor(input: ApiRecord) {
    return assetWrite<ApiRecord>("/api/v1/assets/vendors", "POST", input);
  },
  updateVendor(id: string, input: ApiRecord) {
    return assetWrite<ApiRecord>(`/api/v1/assets/vendors/${id}`, "PATCH", input);
  },
  recoveryQueue(query: PageQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { totals?: ApiRecord }>(
      "/api/v1/assets/recovery-queue",
      { query },
    );
  },
  settleRecovery(id: string, input: ApiRecord) {
    return assetWrite<ApiRecord>(`/api/v1/assets/recovery-queue/${id}/settlement`, "POST", input);
  },
};
