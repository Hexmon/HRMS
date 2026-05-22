import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assetsApi, mapApiAssets } from "@/domains/assets";
import { isUuid, pageItems, useApiRouteEnabled, withApiFallback } from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";
import {
  ASSETS as SEED_ASSETS,
  ASSET_REQUESTS as SEED_REQS,
  type Asset,
  type AssetAuditEntry,
  type AssetRequest,
  type AssetStatus,
  type AssetCondition,
  type AssignmentEntry,
  type MaintenanceEntry,
  type RequestStatus,
} from "./mock/assets";

const A_KEY = "hawkaii_assets_v1";
const R_KEY = "hawkaii_asset_requests_v1";

interface Ctx {
  assets: Asset[];
  requests: AssetRequest[];
  loading: boolean;
  error: Error | null;
  isApiBacked: boolean;
  addAsset: (a: Asset, actor?: string) => void;
  updateAsset: (id: string, patch: Partial<Asset>, actor?: string, action?: string) => void;
  deleteAsset: (id: string) => void;
  assignAsset: (
    id: string,
    employee: string,
    employeeId: string | undefined,
    assignedOn: string,
    expectedReturn: string | undefined,
    condition: AssetCondition,
    remarks: string,
    actor?: string,
  ) => void;
  acknowledgeAssignment: (assetId: string, employee: string) => void;
  returnAsset: (
    id: string,
    returnedOn: string,
    conditionAtReturn: AssetCondition,
    remarks: string,
    actor?: string,
  ) => void;
  setStatus: (id: string, status: AssetStatus, actor?: string, remarks?: string) => void;
  addMaintenance: (id: string, entry: MaintenanceEntry, actor?: string) => void;
  // requests
  addRequest: (req: AssetRequest) => void;
  decideRequest: (id: string, status: RequestStatus, by: string, remarks?: string) => void;
  cancelRequest: (id: string) => void;
  reset: () => void;
}

const Ctx_ = React.createContext<Ctx | null>(null);

const ls = {
  get<T>(k: string, fb: T): T {
    if (typeof window === "undefined") return fb;
    try {
      const r = window.localStorage.getItem(k);
      return r ? (JSON.parse(r) as T) : fb;
    } catch {
      return fb;
    }
  },
  set(k: string, v: unknown) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(k, JSON.stringify(v));
  },
};

const audit = (actor: string, action: string, remarks?: string): AssetAuditEntry => ({
  id: "a_" + Math.random().toString(36).slice(2, 10),
  at: new Date().toISOString(),
  actor,
  action,
  remarks,
});

function assetCreateBody(asset: Asset) {
  return {
    asset_code: asset.id,
    asset_type: asset.type,
    name: `${asset.brand} ${asset.model}`.trim(),
    serial_no: asset.serial,
  };
}

export function AssetsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const apiEnabled = useApiRouteEnabled(["/dashboard", "/assets", "/reports"]);
  const [assets, setAssets] = React.useState<Asset[]>(SEED_ASSETS);
  const [requests, setRequests] = React.useState<AssetRequest[]>(SEED_REQS);

  React.useEffect(() => {
    setAssets(ls.get(A_KEY, SEED_ASSETS));
    setRequests(ls.get(R_KEY, SEED_REQS));
  }, []);

  const persistA = (next: Asset[]) => {
    setAssets(next);
    ls.set(A_KEY, next);
  };
  const persistR = (next: AssetRequest[]) => {
    setRequests(next);
    ls.set(R_KEY, next);
  };

  const apiAssetsQuery = useQuery({
    queryKey: queryKeys.list("assets", "inventory", { page_size: 100 }),
    queryFn: () =>
      withApiFallback(
        async () => {
          const response = await assetsApi.list({ page_size: 100 });
          return mapApiAssets(pageItems(response), assets);
        },
        () => assets,
      ),
    enabled: apiEnabled,
    staleTime: queryTimings.listStaleMs,
  });

  const createAssetMutation = useMutation({
    mutationFn: (asset: Asset) => assetsApi.create(assetCreateBody(asset)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("assets") }),
  });

  const assignAssetMutation = useMutation({
    mutationFn: ({
      id,
      employeeId,
      expectedVersion,
    }: {
      id: string;
      employeeId: string;
      expectedVersion: number;
    }) =>
      assetsApi.assign(id, { assigned_to_user_id: employeeId, expected_version: expectedVersion }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.domain("assets") });
      queryClient.invalidateQueries({
        queryKey: queryKeys.detail("assets", "asset", variables.id),
      });
    },
  });

  const returnAssetMutation = useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
      assetsApi.returnAsset(id, { expected_version: expectedVersion }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.domain("assets") });
      queryClient.invalidateQueries({
        queryKey: queryKeys.detail("assets", "asset", variables.id),
      });
    },
  });

  const hasApiResult = apiAssetsQuery.data !== undefined;
  const visibleAssets = React.useMemo(() => {
    if (!apiEnabled) return assets;
    if (!hasApiResult) return [];
    return apiAssetsQuery.data ?? [];
  }, [apiAssetsQuery.data, apiEnabled, assets, hasApiResult]);
  const apiError =
    apiEnabled && !hasApiResult && apiAssetsQuery.error instanceof Error
      ? apiAssetsQuery.error
      : null;
  const loading = apiEnabled && !hasApiResult && apiAssetsQuery.isLoading;

  const addAsset: Ctx["addAsset"] = (a, actor = "Marco Rossi") => {
    const next = { ...a, audit: [audit(actor, "Asset registered"), ...(a.audit ?? [])] };
    persistA([next, ...assets]);
    if (apiEnabled) createAssetMutation.mutate(next);
  };

  const updateAsset: Ctx["updateAsset"] = (
    id,
    patch,
    actor = "Marco Rossi",
    action = "Asset updated",
  ) => {
    persistA(
      assets.map((x) =>
        x.id === id ? { ...x, ...patch, audit: [audit(actor, action), ...x.audit] } : x,
      ),
    );
  };

  const deleteAsset: Ctx["deleteAsset"] = (id) => persistA(assets.filter((x) => x.id !== id));

  const assignAsset: Ctx["assignAsset"] = (
    id,
    employee,
    employeeId,
    assignedOn,
    expectedReturn,
    condition,
    remarks,
    actor = "Marco Rossi",
  ) => {
    persistA(
      visibleAssets.map((x) => {
        if (x.id !== id) return x;
        const entry: AssignmentEntry = {
          id: "h_" + Math.random().toString(36).slice(2, 8),
          employee,
          employeeId,
          assignedOn,
          conditionAtHandover: condition,
          remarks,
          acknowledged: false,
        };
        return {
          ...x,
          status: "assigned",
          assignedTo: employee,
          assignedToId: employeeId,
          assignedOn,
          expectedReturn,
          history: [entry, ...x.history],
          audit: [audit(actor, "Asset assigned", `to ${employee}`), ...x.audit],
        };
      }),
    );
    if (apiEnabled && isUuid(id) && employeeId && isUuid(employeeId)) {
      const current = visibleAssets.find((asset) => asset.id === id);
      assignAssetMutation.mutate({ id, employeeId, expectedVersion: current?.version ?? 1 });
    }
  };

  const acknowledgeAssignment: Ctx["acknowledgeAssignment"] = (assetId, employee) => {
    persistA(
      assets.map((x) => {
        if (x.id !== assetId) return x;
        const [latest, ...rest] = x.history;
        if (!latest) return x;
        return {
          ...x,
          history: [{ ...latest, acknowledged: true }, ...rest],
          audit: [audit(employee, "Receipt acknowledged"), ...x.audit],
        };
      }),
    );
  };

  const returnAsset: Ctx["returnAsset"] = (
    id,
    returnedOn,
    conditionAtReturn,
    remarks,
    actor = "Marco Rossi",
  ) => {
    persistA(
      visibleAssets.map((x) => {
        if (x.id !== id) return x;
        const [latest, ...rest] = x.history;
        const updatedLatest = latest
          ? { ...latest, returnedOn, conditionAtReturn, remarks: remarks || latest.remarks }
          : latest;
        return {
          ...x,
          status: "available",
          assignedTo: undefined,
          assignedToId: undefined,
          assignedOn: undefined,
          expectedReturn: undefined,
          condition: conditionAtReturn,
          history: latest ? [updatedLatest!, ...rest] : x.history,
          audit: [audit(actor, "Asset returned", remarks), ...x.audit],
        };
      }),
    );
    if (apiEnabled && isUuid(id)) {
      const current = visibleAssets.find((asset) => asset.id === id);
      returnAssetMutation.mutate({ id, expectedVersion: current?.version ?? 1 });
    }
  };

  const setStatus: Ctx["setStatus"] = (id, status, actor = "Marco Rossi", remarks) => {
    persistA(
      assets.map((x) =>
        x.id === id
          ? {
              ...x,
              status,
              audit: [audit(actor, `Status → ${status}`, remarks), ...x.audit],
            }
          : x,
      ),
    );
  };

  const addMaintenance: Ctx["addMaintenance"] = (id, entry, actor = "Marco Rossi") => {
    persistA(
      assets.map((x) =>
        x.id === id
          ? {
              ...x,
              maintenance: [entry, ...x.maintenance],
              audit: [audit(actor, "Maintenance logged", entry.notes), ...x.audit],
            }
          : x,
      ),
    );
  };

  const addRequest: Ctx["addRequest"] = (req) => persistR([req, ...requests]);

  const decideRequest: Ctx["decideRequest"] = (id, status, by, remarks) => {
    persistR(
      requests.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              decisionBy: by,
              decisionAt: new Date().toISOString(),
              decisionRemarks: remarks,
            }
          : r,
      ),
    );
  };

  const cancelRequest: Ctx["cancelRequest"] = (id) => persistR(requests.filter((r) => r.id !== id));

  const reset = () => {
    persistA(SEED_ASSETS);
    persistR(SEED_REQS);
  };

  return (
    <Ctx_.Provider
      value={{
        assets: visibleAssets,
        requests,
        loading,
        error: apiError,
        isApiBacked: apiEnabled && hasApiResult,
        addAsset,
        updateAsset,
        deleteAsset,
        assignAsset,
        acknowledgeAssignment,
        returnAsset,
        setStatus,
        addMaintenance,
        addRequest,
        decideRequest,
        cancelRequest,
        reset,
      }}
    >
      {children}
    </Ctx_.Provider>
  );
}

export function useAssets() {
  const c = React.useContext(Ctx_);
  if (!c) throw new Error("useAssets must be used inside AssetsProvider");
  return c;
}

export function nextAssetId(existing: Asset[]): string {
  const max = existing.reduce((m, a) => {
    const n = parseInt(a.id.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 7700);
  return `AST-${max + 1}`;
}

export function nextRequestId(existing: AssetRequest[]): string {
  const max = existing.reduce((m, r) => {
    const n = parseInt(r.id.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 400);
  return `REQ-${max + 1}`;
}

export function warrantyDaysLeft(date: string): number {
  const ms = new Date(date).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export const ASSET_ADMIN_ROLES = ["main_admin", "asset_admin"] as const;

export type { Asset, AssetRequest, AssetStatus, AssetCondition };
