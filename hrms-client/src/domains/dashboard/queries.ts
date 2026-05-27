import { useQuery } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { dashboardApi } from "./api";

export function useDashboardSummary(enabled = true) {
  return useQuery({
    queryKey: queryKeys.detail("dashboard", "summary", "current"),
    queryFn: () => dashboardApi.summary(),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
  });
}
