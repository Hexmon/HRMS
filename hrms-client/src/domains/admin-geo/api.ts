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

export type GeoSimulationPolicySource =
  | { mode: "effective_employee" }
  | { mode: "persisted_policy"; policy_id: string; version_id?: string }
  | { mode: "draft_policy"; config: ApiRecord };

export type GeoSimulationGeofenceSource =
  | { mode: "policy_effective" }
  | { mode: "persisted"; geofence_ids: string[] }
  | {
      mode: "draft";
      geofences: Array<
        | {
            id?: string;
            geofence_id?: string;
            work_site_id?: string;
            name?: string;
            work_site_name?: string;
            shape_type: "circle";
            center: { longitude: number; latitude: number };
            radius_meters: number;
          }
        | {
            id?: string;
            geofence_id?: string;
            work_site_id?: string;
            name?: string;
            work_site_name?: string;
            shape_type: "polygon";
            vertices: LngLat[];
          }
      >;
    };

export type GeoSimulationScenario =
  | {
      type: "coordinates";
      latitude: number;
      longitude: number;
      accuracy_meters: number;
      evidence_age_ms?: number;
    }
  | { type: "permission_denied"; evidence_age_ms?: number }
  | { type: "location_unavailable"; evidence_age_ms?: number }
  | { type: "missing" };

export interface GeoPolicySimulationInput extends ApiRecord {
  employee_user_id: string;
  event_at: string;
  policy_source: GeoSimulationPolicySource;
  geofence_source: GeoSimulationGeofenceSource;
  scenario: GeoSimulationScenario;
}

export interface GeoPolicySimulationResponse extends ApiRecord {
  simulation: ApiRecord & {
    verdict?: string;
    allowed?: boolean;
    factual_outcome?: string;
    selected_action?: string;
    fallback_used?: boolean;
    review_required?: boolean;
    reason_code?: string;
    reason_detail?: string;
    evaluation?: ApiRecord | null;
    policy?: ApiRecord;
    geofence_source?: string;
    work_site?: ApiRecord | null;
  };
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
    return apiRequest<{ geofence: AdminGeoGeofence }>(`/api/v1/attendance/geofences/${geofenceId}`);
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
  simulateGeoPolicy(input: GeoPolicySimulationInput) {
    return apiRequest<GeoPolicySimulationResponse>("/api/v1/attendance/geo/simulate", {
      method: "POST",
      body: input,
    });
  },
};
