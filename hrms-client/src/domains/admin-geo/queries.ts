import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import {
  adminGeoApi,
  type GeofenceInput,
  type GeofenceUpdateInput,
  type GeofenceVersionInput,
  type GeoPolicySimulationInput,
  type PublishVersionInput,
  type WorkSiteInput,
  type WorkSiteUpdateInput,
} from "./api";

export function useAdminGeoWorkSites(enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("admin-geo", "work-sites"),
    queryFn: () => adminGeoApi.listWorkSites(),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAdminGeoGeofences(workSiteId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("admin-geo", "geofences", { workSiteId }),
    queryFn: () => adminGeoApi.listGeofences(workSiteId as string),
    enabled: enabled && Boolean(workSiteId),
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useAdminGeoVersions(geofenceId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("admin-geo", "versions", { geofenceId }),
    queryFn: () => adminGeoApi.listVersions(geofenceId as string),
    enabled: enabled && Boolean(geofenceId),
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useWorkSiteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: WorkSiteInput | WorkSiteUpdateInput }) =>
      id
        ? adminGeoApi.updateWorkSite(id, input as WorkSiteUpdateInput)
        : adminGeoApi.createWorkSite(input as WorkSiteInput),
    onSuccess: (response) => {
      queryClient.setQueryData(
        queryKeys.detail("admin-geo", "work-site", response.workSite.id),
        response,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.list("admin-geo", "work-sites") });
    },
  });
}

export function useDeleteWorkSiteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
      adminGeoApi.deleteWorkSite(id, expectedVersion),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.list("admin-geo", "work-sites") });
      queryClient.invalidateQueries({
        queryKey: queryKeys.list("admin-geo", "geofences", { workSiteId: response.workSite.id }),
      });
    },
  });
}

export function useGeofenceMutation(workSiteId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: GeofenceInput | GeofenceUpdateInput }) =>
      id
        ? adminGeoApi.updateGeofence(id, input as GeofenceUpdateInput)
        : adminGeoApi.createGeofence(workSiteId as string, input as GeofenceInput),
    onSuccess: (response) => {
      queryClient.setQueryData(
        queryKeys.detail("admin-geo", "geofence", response.geofence.id),
        response,
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.list("admin-geo", "geofences", {
          workSiteId: response.geofence.workSiteId,
        }),
      });
    },
  });
}

export function useDeleteGeofenceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
      adminGeoApi.deleteGeofence(id, expectedVersion),
    onSuccess: (response) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.list("admin-geo", "geofences", {
          workSiteId: response.geofence.workSiteId,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.list("admin-geo", "versions", { geofenceId: response.geofence.id }),
      });
    },
  });
}

export function useGeofenceVersionMutation(geofenceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: GeofenceVersionInput }) =>
      id
        ? adminGeoApi.updateVersion(geofenceId as string, id, input)
        : adminGeoApi.createVersion(geofenceId as string, input),
    onSuccess: (response) => {
      queryClient.setQueryData(
        queryKeys.detail("admin-geo", "version", response.version.id),
        response,
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.list("admin-geo", "versions", {
          geofenceId: response.version.geofenceId,
        }),
      });
    },
  });
}

export function useDeleteGeofenceVersionMutation(geofenceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => adminGeoApi.deleteVersion(geofenceId as string, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.list("admin-geo", "versions", { geofenceId }),
      });
    },
  });
}

export function usePublishGeofenceVersionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      geofenceId,
      versionId,
      input,
    }: {
      geofenceId: string;
      versionId: string;
      input: PublishVersionInput;
    }) => adminGeoApi.publishVersion(geofenceId, versionId, input),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.list("admin-geo", "versions", {
          geofenceId: variables.geofenceId,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.detail("admin-geo", "geofence", variables.geofenceId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.domain("admin-geo") });
    },
  });
}

export function useGeoPolicySimulationMutation() {
  return useMutation({
    mutationFn: (input: GeoPolicySimulationInput) => adminGeoApi.simulateGeoPolicy(input),
  });
}
