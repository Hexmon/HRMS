import { createFileRoute } from "@tanstack/react-router";
import { Crosshair } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminGeoMap } from "@/components/admin-geo/admin-geo-map";
import { GeofencePanel } from "@/components/admin-geo/geofence-panel";
import { PolicySimulatorPanel } from "@/components/admin-geo/policy-simulator-panel";
import { VersionPublishPanel } from "@/components/admin-geo/version-publish-panel";
import { WorkSitePanel } from "@/components/admin-geo/work-site-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AdminGeoCircleShape,
  AdminGeoPolygonShape,
  AdminGeoShapeType,
  AdminGeoVersion,
} from "@/domains/admin-geo/api";
import {
  EMPTY_CIRCLE_DRAFT,
  EMPTY_POLYGON_DRAFT,
  resetCircleDraft,
  resetPolygonDraft,
  type CircleDraft,
  type LngLat,
  type PolygonDraft,
} from "@/domains/admin-geo/geometry";
import { getMapProviderConfig } from "@/domains/admin-geo/map-config";
import {
  useAdminGeoGeofences,
  useAdminGeoVersions,
  useAdminGeoWorkSites,
} from "@/domains/admin-geo/queries";
import { useApiRouteEnabled } from "@/shared/api";

export const Route = createFileRoute("/_app/admin-settings/geo")({
  component: AdminGeoScreen,
});

type MapClickMode = "circle-center" | "polygon";

function AdminGeoScreen() {
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const mapConfig = useMemo(() => getMapProviderConfig(), []);
  const [selectedWorkSiteId, setSelectedWorkSiteId] = useState<string | null>(null);
  const [selectedGeofenceId, setSelectedGeofenceId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [shapeType, setShapeType] = useState<AdminGeoShapeType>("circle");
  const [clickMode, setClickMode] = useState<MapClickMode>("circle-center");
  const [circleDraft, setCircleDraft] = useState<CircleDraft>(EMPTY_CIRCLE_DRAFT);
  const [polygonDraft, setPolygonDraft] = useState<PolygonDraft>(EMPTY_POLYGON_DRAFT);
  const [fitRequestKey, setFitRequestKey] = useState(0);
  const [simulationPoint, setSimulationPoint] = useState<LngLat | null>(null);
  const [simulationAccuracyMeters, setSimulationAccuracyMeters] = useState(25);
  const [simulationPickMode, setSimulationPickMode] = useState(false);
  const [simulationVerdict, setSimulationVerdict] = useState<string | null>(null);

  const workSitesQuery = useAdminGeoWorkSites(apiEnabled);
  const geofencesQuery = useAdminGeoGeofences(selectedWorkSiteId, apiEnabled);
  const versionsQuery = useAdminGeoVersions(selectedGeofenceId, apiEnabled);
  const workSites = useMemo(() => workSitesQuery.data?.items ?? [], [workSitesQuery.data?.items]);
  const geofences = useMemo(() => geofencesQuery.data?.items ?? [], [geofencesQuery.data?.items]);
  const versions = useMemo(() => versionsQuery.data?.items ?? [], [versionsQuery.data?.items]);
  const selectedWorkSite = workSites.find((site) => site.id === selectedWorkSiteId) ?? null;
  const selectedGeofence = geofences.find((geofence) => geofence.id === selectedGeofenceId) ?? null;
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null;

  useEffect(() => {
    setSelectedGeofenceId(null);
    setSelectedVersionId(null);
  }, [selectedWorkSiteId]);

  useEffect(() => {
    setSelectedVersionId(null);
  }, [selectedGeofenceId]);

  useEffect(() => {
    if (selectedWorkSiteId && !workSites.some((site) => site.id === selectedWorkSiteId)) {
      setSelectedWorkSiteId(null);
    }
  }, [selectedWorkSiteId, workSites]);

  useEffect(() => {
    if (selectedGeofenceId && !geofences.some((geofence) => geofence.id === selectedGeofenceId)) {
      setSelectedGeofenceId(null);
    }
  }, [geofences, selectedGeofenceId]);

  useEffect(() => {
    if (!selectedVersion) return;
    applyVersionShape(selectedVersion, {
      setCircleDraft,
      setPolygonDraft,
      setShapeType,
      setClickMode,
    });
  }, [selectedVersion]);

  function handleMapClick(coordinate: LngLat) {
    if (simulationPickMode) {
      setSimulationPoint(coordinate);
      setSimulationPickMode(false);
      setSimulationVerdict(null);
      return;
    }
    if (clickMode === "circle-center") {
      setShapeType("circle");
      setCircleDraft((current) => ({ ...current, center: coordinate }));
      return;
    }
    setShapeType("polygon");
    setPolygonDraft((current) => ({ vertices: [...current.vertices, coordinate] }));
  }

  if (!apiEnabled) {
    return (
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Admin Geo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
            Backend API mode is required for geo CRUD and publishing. No mock geo data is shown on
            this page.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-lg">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Admin Geo</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage company work sites, geofences, draft geometry, and effective-dated
                publishing.
              </p>
              <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
                Geo attendance policies use a one-time location result when an employee submits
                attendance. Published work-site settings help evaluate that action; routine reports
                use privacy-safe site and evidence labels, and exact-location access remains
                separately restricted.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Badge
                variant={selectedVersion?.versionStatus === "published" ? "default" : "outline"}
              >
                {selectedVersion ? selectedVersion.versionStatus : "new draft"}
              </Badge>
              <Button
                type="button"
                variant="outline"
                className="min-h-10 w-full whitespace-normal sm:w-auto"
                onClick={() => setFitRequestKey((key) => key + 1)}
              >
                <Crosshair className="h-4 w-4" />
                Fit shape
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AdminGeoMap
            circleDraft={circleDraft}
            clickMode={clickMode}
            config={mapConfig}
            fitRequestKey={fitRequestKey}
            onMapClick={handleMapClick}
            polygonDraft={polygonDraft}
            simulationAccuracyMeters={simulationPoint ? simulationAccuracyMeters : null}
            simulationPoint={simulationPoint}
            simulationVerdict={simulationVerdict}
          />
        </CardContent>
      </Card>

      <PolicySimulatorPanel
        circleDraft={circleDraft}
        currentGeofence={selectedGeofence}
        currentWorkSiteId={selectedWorkSiteId}
        currentWorkSiteName={selectedWorkSite?.name ?? null}
        draftShapeType={shapeType}
        onAccuracyChange={setSimulationAccuracyMeters}
        onPickModeChange={setSimulationPickMode}
        onResultChange={(result) =>
          setSimulationVerdict(result?.verdict ? String(result.verdict) : null)
        }
        onSimulationPointChange={(point) => {
          setSimulationPoint(point);
          setSimulationVerdict(null);
        }}
        polygonDraft={polygonDraft}
        simulationPoint={simulationPoint}
      />

      <div className="grid gap-6 xl:grid-cols-[360px_360px_minmax(0,1fr)]">
        <WorkSitePanel
          error={workSitesQuery.error}
          items={workSites}
          loading={workSitesQuery.isLoading}
          onSelectedIdChange={setSelectedWorkSiteId}
          selectedId={selectedWorkSiteId}
        />
        <GeofencePanel
          error={geofencesQuery.error}
          items={geofences}
          loading={geofencesQuery.isLoading}
          onSelectedIdChange={setSelectedGeofenceId}
          selectedId={selectedGeofenceId}
          workSiteId={selectedWorkSiteId}
        />
        <VersionPublishPanel
          circleDraft={circleDraft}
          error={versionsQuery.error}
          geofenceId={selectedGeofenceId}
          items={versions}
          loading={versionsQuery.isLoading}
          onCircleDraftChange={setCircleDraft}
          onFit={() => setFitRequestKey((key) => key + 1)}
          onPolygonDraftChange={setPolygonDraft}
          onSelectedIdChange={setSelectedVersionId}
          onShapeTypeChange={(nextShapeType) => {
            setShapeType(nextShapeType);
            setClickMode(nextShapeType === "circle" ? "circle-center" : "polygon");
          }}
          onUseCircleMapClicks={() => {
            setShapeType("circle");
            setClickMode("circle-center");
          }}
          onUsePolygonMapClicks={() => {
            setShapeType("polygon");
            setClickMode("polygon");
          }}
          polygonDraft={polygonDraft}
          selectedId={selectedVersionId}
          shapeType={shapeType}
        />
      </div>
    </div>
  );
}

function applyVersionShape(
  version: AdminGeoVersion,
  setters: {
    setCircleDraft: (draft: CircleDraft) => void;
    setPolygonDraft: (draft: PolygonDraft) => void;
    setShapeType: (shapeType: AdminGeoShapeType) => void;
    setClickMode: (mode: MapClickMode) => void;
  },
) {
  setters.setShapeType(version.shapeType);
  setters.setClickMode(version.shapeType === "circle" ? "circle-center" : "polygon");
  if (version.shapeType === "circle") {
    if (isCircleShape(version.shape)) {
      setters.setCircleDraft({
        center: [version.shape.center.longitude, version.shape.center.latitude],
        radiusMeters: version.shape.radiusMeters,
      });
    } else {
      setters.setCircleDraft(resetCircleDraft());
    }
    setters.setPolygonDraft(resetPolygonDraft());
    return;
  }
  setters.setPolygonDraft({
    vertices: isPolygonShape(version.shape) ? version.shape.vertices : [],
  });
  setters.setCircleDraft(resetCircleDraft());
}

function isCircleShape(shape: AdminGeoVersion["shape"]): shape is AdminGeoCircleShape {
  const center = "center" in shape ? shape.center : null;
  return (
    typeof center === "object" &&
    center !== null &&
    "longitude" in center &&
    "latitude" in center &&
    typeof center.longitude === "number" &&
    typeof center.latitude === "number"
  );
}

function isPolygonShape(shape: AdminGeoVersion["shape"]): shape is AdminGeoPolygonShape {
  return Array.isArray(shape.vertices);
}
