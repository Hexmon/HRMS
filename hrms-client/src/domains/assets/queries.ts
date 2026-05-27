import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import type { ExpectedVersionBody, PageQuery } from "@/shared/api";
import { assetsApi } from "./api";
import { mapApiAssetVendors, mapApiRecoveryTickets, mapApiWarrantyAlerts } from "./mapper";

export function useAssetsList(query: PageQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("assets", "inventory", query),
    queryFn: () => assetsApi.list(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAssetDetail(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.detail("assets", "asset", id ?? "missing"),
    queryFn: () => assetsApi.get(id as string),
    enabled: enabled && Boolean(id),
    staleTime: queryTimings.detailStaleMs,
  });
}

export function useAssetWorkflowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      input,
    }: {
      id: string;
      action: "assign" | "return";
      input: ExpectedVersionBody;
    }) => (action === "assign" ? assetsApi.assign(id, input) : assetsApi.returnAsset(id, input)),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.domain("assets") });
      queryClient.invalidateQueries({
        queryKey: queryKeys.detail("assets", "asset", variables.id),
      });
    },
  });
}

export function useAssetVendors(query: PageQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("assets", "vendors", query),
    queryFn: async () => {
      const response = await assetsApi.vendors(query);
      return { ...response, items: mapApiAssetVendors(response.items) };
    },
    enabled,
    staleTime: queryTimings.referenceStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAssetWarrantyAlerts(query: PageQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("assets", "warranty-alerts", query),
    queryFn: async () => {
      const response = await assetsApi.warrantyAlerts(query);
      return { ...response, items: mapApiWarrantyAlerts(response.items) };
    },
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAssetVendorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id?: string;
      input: {
        name?: string;
        contact_email?: string | null;
        phone?: string | null;
        status?: "active" | "inactive";
        expected_version?: number;
      };
    }) => (id ? assetsApi.updateVendor(id, input) : assetsApi.createVendor(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("assets") }),
  });
}

export function useAssetRecoveryQueue(query: PageQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("assets", "recovery-queue", query),
    queryFn: async () => {
      const response = await assetsApi.recoveryQueue(query);
      return { ...response, items: mapApiRecoveryTickets(response.items) };
    },
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAssetRecoverySettlementMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: {
        settlement_status: "recovered" | "deduction" | "waived" | "lost_damaged";
        settlement_amount?: string | null;
        remarks?: string | null;
        expected_version: number;
      };
    }) => assetsApi.settleRecovery(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("assets") }),
  });
}
