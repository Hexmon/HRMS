import { apiRequest, type ApiRecord } from "@/shared/api";
import type { LngLat } from "./geometry";

export type AdminGeoSiteType = "office" | "client" | "temporary";
export type AdminGeoVersionStatus = "draft" | "published";
export type AdminGeoShapeType = "circle" | "polygon";

export interface AdminGeoWorkSite extends ApiRecord {
  id: string;
  siteCode: string;
  name: string;
  siteType: string;
  timezone: string;
  isActive: boolean;
  metadata: ApiRecord;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface AdminGeoGeofence extends ApiRecord {
  id: string;
  workSiteId: string;
  geofenceCode: string;
  name: string;
  isActive: boolean;
  currentPublishedVersionId: string | null;
  metadata: ApiRecord;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface AdminGeoCircleShape extends ApiRecord {
  center: { longitude: number; latitude: number };
  radiusMeters: number | null;
}

export interface AdminGeoPolygonShape extends ApiRecord {
  vertices: LngLat[];
  geometryType?: string | null;
}

export interface AdminGeoVersion extends ApiRecord {
  id: string;
  geofenceId: string;
  versionNumber: number;
  versionStatus: AdminGeoVersionStatus;
  shapeType: AdminGeoShapeType;
  shape: AdminGeoCircleShape | AdminGeoPolygonShape;
  shapeMetadata: ApiRecord;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  canonicalHash: string | null;
  publishedAt: string | null;
  publishedByUserId: string | null;
  createdAt: string;
  createdByUserId?: string | null;
}

export interface WorkSiteInput extends ApiRecord {
  siteCode: string;
  name: string;
  siteType: string;
  timezone: string;
  isActive?: boolean;
  metadata?: ApiRecord;
}

export interface WorkSiteUpdateInput extends Partial<WorkSiteInput> {
  expectedVersion: number;
}

export interface GeofenceInput extends ApiRecord {
  geofenceCode: string;
  name: string;
  isActive?: boolean;
  metadata?: ApiRecord;
}

export interface GeofenceUpdateInput extends Partial<GeofenceInput> {
  expectedVersion: number;
}

export type GeofenceVersionInput =
  | {
      shapeType: "circle";
      center: { longitude: number; latitude: number };
      radiusMeters: number;
      shapeMetadata?: ApiRecord;
    }
  | {
      shapeType: "polygon";
      vertices: LngLat[];
      shapeMetadata?: ApiRecord;
    };

export interface PublishVersionInput extends ApiRecord {
  effectiveFrom: string;
  effectiveUntil?: string | null;
}

export const SITE_TYPE_OPTIONS: Array<{ value: AdminGeoSiteType; label: string }> = [
  { value: "office", label: "Office" },
  { value: "client", label: "Client site" },
  { value: "temporary", label: "Temporary site" },
];

export const adminGeoApi = {
  listWorkSites() {
    return apiRequest<{ items: AdminGeoWorkSite[] }>("/api/v1/attendance/work-sites");
  },
  getWorkSite(workSiteId: string) {
    return apiRequest<{ workSite: AdminGeoWorkSite }>(
      `/api/v1/attendance/work-sites/${workSiteId}`,
    );
  },
  createWorkSite(input: WorkSiteInput) {
    return apiRequest<{ workSite: AdminGeoWorkSite }>("/api/v1/attendance/work-sites", {
      method: "POST",
      body: input,
    });
  },
  updateWorkSite(workSiteId: string, input: WorkSiteUpdateInput) {
    return apiRequest<{ workSite: AdminGeoWorkSite }>(
      `/api/v1/attendance/work-sites/${workSiteId}`,
      { method: "PATCH", body: input },
    );
  },
  deleteWorkSite(workSiteId: string, expectedVersion: number) {
    return apiRequest<{ workSite: AdminGeoWorkSite }>(
      `/api/v1/attendance/work-sites/${workSiteId}`,
      { method: "DELETE", body: { expectedVersion } },
    );
  },
  listGeofences(workSiteId: string) {
    return apiRequest<{ items: AdminGeoGeofence[] }>(
      `/api/v1/attendance/work-sites/${workSiteId}/geofences`,
    );
  },
  getGeofence(geofenceId: string) {
    return apiRequest<{ geofence: AdminGeoGeofence }>(
      `/api/v1/attendance/geofences/${geofenceId}`,
    );
  },
  createGeofence(workSiteId: string, input: GeofenceInput) {
    return apiRequest<{ geofence: AdminGeoGeofence }>(
      `/api/v1/attendance/work-sites/${workSiteId}/geofences`,
      { method: "POST", body: input },
    );
  },
  updateGeofence(geofenceId: string, input: GeofenceUpdateInput) {
    return apiRequest<{ geofence: AdminGeoGeofence }>(
      `/api/v1/attendance/geofences/${geofenceId}`,
      { method: "PATCH", body: input },
    );
  },
  deleteGeofence(geofenceId: string, expectedVersion: number) {
    return apiRequest<{ geofence: AdminGeoGeofence }>(
      `/api/v1/attendance/geofences/${geofenceId}`,
      { method: "DELETE", body: { expectedVersion } },
    );
  },
  listVersions(geofenceId: string) {
    return apiRequest<{ items: AdminGeoVersion[] }>(
      `/api/v1/attendance/geofences/${geofenceId}/versions`,
    );
  },
  getVersion(geofenceId: string, versionId: string) {
    return apiRequest<{ version: AdminGeoVersion }>(
      `/api/v1/attendance/geofences/${geofenceId}/versions/${versionId}`,
    );
  },
  createVersion(geofenceId: string, input: GeofenceVersionInput) {
    return apiRequest<{ version: AdminGeoVersion }>(
      `/api/v1/attendance/geofences/${geofenceId}/versions`,
      { method: "POST", body: input },
    );
  },
  updateVersion(geofenceId: string, versionId: string, input: GeofenceVersionInput) {
    return apiRequest<{ version: AdminGeoVersion }>(
      `/api/v1/attendance/geofences/${geofenceId}/versions/${versionId}`,
      { method: "PATCH", body: input },
    );
  },
  deleteVersion(geofenceId: string, versionId: string) {
    return apiRequest<{ deleted: true; versionId: string }>(
      `/api/v1/attendance/geofences/${geofenceId}/versions/${versionId}`,
      { method: "DELETE" },
    );
  },
  publishVersion(geofenceId: string, versionId: string, input: PublishVersionInput) {
    return apiRequest<ApiRecord>(
      `/api/v1/attendance/geofences/${geofenceId}/versions/${versionId}/publish`,
      { method: "POST", body: input },
    );
  },
};
