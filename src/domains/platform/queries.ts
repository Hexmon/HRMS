import { useQuery } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { platformApi } from "./api";

export function useApiReady(enabled = true) {
  return useQuery({
    queryKey: queryKeys.action("platform", "health", "ready"),
    queryFn: () => platformApi.versionedReady(),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
  });
}
