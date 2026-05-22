import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { projectsApi, type ProjectQuery } from "./api";

export function useProjectsList(query: ProjectQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("projects", "portfolio", query),
    queryFn: () => projectsApi.list(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useProjectDetail(id: string | undefined, query: ProjectQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.detail("projects", "project", id ?? "missing", query),
    queryFn: () => projectsApi.get(id as string, query),
    enabled: enabled && Boolean(id),
    staleTime: queryTimings.detailStaleMs,
  });
}

export function useTeamUtilizationSummary(query: ProjectQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("projects", "team-utilization", query),
    queryFn: () => projectsApi.teamUtilizationSummary(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useProjectsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("projects") }),
  });
}
