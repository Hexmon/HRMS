import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import type { PageQuery } from "@/shared/api";
import { documentsApi } from "./api";

export function useDocuments(query: PageQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("documents", "documents", query),
    queryFn: () => documentsApi.list(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useDocumentDetail(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.detail("documents", "document", id ?? "missing"),
    queryFn: () => documentsApi.get(id as string),
    enabled: enabled && Boolean(id),
    staleTime: queryTimings.detailStaleMs,
  });
}

export function useDocumentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: documentsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("documents") }),
  });
}

export function useDocumentDeleteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: documentsApi.deleteDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("documents") }),
  });
}
