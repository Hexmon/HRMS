import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import type { ExpectedVersionBody, PageQuery } from "@/shared/api";
import { assetsApi } from "./api";

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
