import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import {
  platformApi,
  type PlatformAdminRegisteredDeviceListQuery,
  type PlatformDeviceLifecycleInput,
} from "./api";

export function useApiReady(enabled = true) {
  return useQuery({
    queryKey: queryKeys.action("platform", "health", "live"),
    queryFn: () => platformApi.versionedLive(),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
  });
}

export function useMyRegisteredDevices(enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("platform", "devices", "my"),
    queryFn: () => platformApi.listMyDevices(),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
  });
}

export function useAdminRegisteredDevices(
  query: PlatformAdminRegisteredDeviceListQuery,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.list("platform", "admin-devices", query),
    queryFn: () => platformApi.listAdminDevices(query),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
  });
}

export function useRevokeRegisteredDeviceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      deviceId,
      input,
    }: {
      deviceId: string;
      input?: PlatformDeviceLifecycleInput;
    }) => platformApi.revokeDevice(deviceId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.domain("platform") }),
  });
}
