import { createFileRoute } from "@tanstack/react-router";
import { Crosshair, MapPin, MousePointer2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminGeoMap } from "@/components/admin-geo/admin-geo-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  distinctVertexCount,
  EMPTY_POLYGON_DRAFT,
  EMPTY_WORK_SITE_DRAFT,
  isPolygonReady,
  isValidLatitude,
  isValidLongitude,
  removeLastVertex,
  resetPolygonDraft,
  resetWorkSiteDraft,
  type LngLat,
  type PolygonDraft,
  type WorkSiteDraft,
  workSiteDraftToLngLat,
} from "@/domains/admin-geo/geometry";
import { getMapProviderConfig } from "@/domains/admin-geo/map-config";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin-settings/geo")({
  component: AdminGeoScreen,
});

type MapClickMode = "work-site" | "polygon";

function AdminGeoScreen() {
  const mapConfig = useMemo(() => getMapProviderConfig(), []);
  const [clickMode, setClickMode] = useState<MapClickMode>("work-site");
  const [workSiteDraft, setWorkSiteDraft] = useState<WorkSiteDraft>(EMPTY_WORK_SITE_DRAFT);
  const [polygonDraft, setPolygonDraft] = useState<PolygonDraft>(EMPTY_POLYGON_DRAFT);
  const [vertexLongitude, setVertexLongitude] = useState("");
  const [vertexLatitude, setVertexLatitude] = useState("");
  const [fitRequestKey, setFitRequestKey] = useState(0);

  const workSiteCoordinate = workSiteDraftToLngLat(workSiteDraft);
  const polygonReady = isPolygonReady(polygonDraft.vertices);
  const vertexInput = parseCoordinateInput(vertexLongitude, vertexLatitude);
  const canAddVertex = Boolean(vertexInput);
  const distinctCount = distinctVertexCount(polygonDraft.vertices);

  const handleMapClick = (coordinate: LngLat) => {
    if (clickMode === "work-site") {
      setWorkSiteDraft({ longitude: coordinate[0], latitude: coordinate[1] });
      return;
    }
    setPolygonDraft((current) => ({ vertices: [...current.vertices, coordinate] }));
  };

  const addInputVertex = () => {
    if (!vertexInput) return;
    setPolygonDraft((current) => ({ vertices: [...current.vertices, vertexInput] }));
    setVertexLongitude("");
    setVertexLatitude("");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="rounded-lg">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Geo Draft Map</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Local preview for work-site markers and polygon geofence drafts.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={clickMode === "work-site" ? "default" : "outline"}
                onClick={() => setClickMode("work-site")}
              >
                <MapPin className="h-4 w-4" />
                Work site
              </Button>
              <Button
                type="button"
                variant={clickMode === "polygon" ? "default" : "outline"}
                onClick={() => setClickMode("polygon")}
              >
                <MousePointer2 className="h-4 w-4" />
                Polygon
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFitRequestKey((key) => key + 1)}
              >
                <Crosshair className="h-4 w-4" />
                Fit draft
              </Button>
            </div>
          </div>
          <div className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
            Draft only. Backend validation, persistence, publishing, policies, and attendance
            decisions remain server-owned.
          </div>
        </CardHeader>
        <CardContent>
          <AdminGeoMap
            clickMode={clickMode}
            config={mapConfig}
            fitRequestKey={fitRequestKey}
            onMapClick={handleMapClick}
            polygonDraft={polygonDraft}
            workSiteDraft={workSiteDraft}
          />
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Work Site Location</CardTitle>
              <Badge variant={workSiteCoordinate ? "default" : "outline"}>
                {workSiteCoordinate ? "Marker set" : "Empty"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <CoordinateInputs
              latitude={workSiteDraft.latitude}
              latitudeId="work-site-latitude"
              longitude={workSiteDraft.longitude}
              longitudeId="work-site-longitude"
              onLatitudeChange={(latitude) =>
                setWorkSiteDraft((current) => ({ ...current, latitude }))
              }
              onLongitudeChange={(longitude) =>
                setWorkSiteDraft((current) => ({ ...current, longitude }))
              }
            />
            <CoordinateStatus coordinate={workSiteCoordinate} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setClickMode("work-site")}>
                <MapPin className="h-4 w-4" />
                Use map clicks
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setWorkSiteDraft(resetWorkSiteDraft())}
              >
                <RotateCcw className="h-4 w-4" />
                Clear marker
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Polygon Geofence</CardTitle>
              <Badge variant={polygonReady ? "default" : "outline"}>
                {polygonReady ? "Ready" : "Incomplete"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="polygon-longitude">Longitude</Label>
                <Input
                  id="polygon-longitude"
                  inputMode="decimal"
                  onChange={(event) => setVertexLongitude(event.target.value)}
                  placeholder="77.5946"
                  value={vertexLongitude}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="polygon-latitude">Latitude</Label>
                <Input
                  id="polygon-latitude"
                  inputMode="decimal"
                  onChange={(event) => setVertexLatitude(event.target.value)}
                  placeholder="12.9716"
                  value={vertexLatitude}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!canAddVertex} onClick={addInputVertex}>
                Add vertex
              </Button>
              <Button type="button" variant="outline" onClick={() => setClickMode("polygon")}>
                <MousePointer2 className="h-4 w-4" />
                Use map clicks
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={polygonDraft.vertices.length === 0}
                onClick={() => setPolygonDraft((current) => removeLastVertex(current))}
              >
                <Undo2 className="h-4 w-4" />
                Remove last
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={polygonDraft.vertices.length === 0}
                onClick={() => setPolygonDraft(resetPolygonDraft())}
              >
                <Trash2 className="h-4 w-4" />
                Reset polygon
              </Button>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="font-medium">{polygonDraft.vertices.length}</span> vertices,{" "}
              <span className="font-medium">{distinctCount}</span> distinct valid points.
            </div>
            <ol className="max-h-56 space-y-2 overflow-auto pr-1" data-testid="polygon-vertex-list">
              {polygonDraft.vertices.length === 0 ? (
                <li className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                  No vertices yet.
                </li>
              ) : (
                polygonDraft.vertices.map(([longitude, latitude], index) => (
                  <li
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm",
                      !isValidLongitude(longitude) || !isValidLatitude(latitude)
                        ? "border-destructive/40 text-destructive"
                        : "border-border",
                    )}
                    key={`${longitude}:${latitude}:${index}`}
                  >
                    <span className="font-medium">#{index + 1}</span>
                    <span className="font-mono text-xs">
                      {formatCoordinate(longitude)}, {formatCoordinate(latitude)}
                    </span>
                  </li>
                ))
              )}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface CoordinateInputsProps {
  longitude: number | null;
  latitude: number | null;
  longitudeId: string;
  latitudeId: string;
  onLongitudeChange: (value: number | null) => void;
  onLatitudeChange: (value: number | null) => void;
}

function CoordinateInputs({
  longitude,
  latitude,
  longitudeId,
  latitudeId,
  onLongitudeChange,
  onLatitudeChange,
}: CoordinateInputsProps) {
  const [longitudeText, setLongitudeText] = useState(longitude === null ? "" : String(longitude));
  const [latitudeText, setLatitudeText] = useState(latitude === null ? "" : String(latitude));

  useEffect(() => {
    if (longitude === null) {
      setLongitudeText("");
    } else if (Number.isFinite(longitude)) {
      setLongitudeText(String(longitude));
    }
  }, [longitude]);

  useEffect(() => {
    if (latitude === null) {
      setLatitudeText("");
    } else if (Number.isFinite(latitude)) {
      setLatitudeText(String(latitude));
    }
  }, [latitude]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={longitudeId}>Longitude</Label>
        <Input
          aria-invalid={longitude !== null && !isValidLongitude(longitude)}
          id={longitudeId}
          inputMode="decimal"
          onChange={(event) => {
            setLongitudeText(event.target.value);
            onLongitudeChange(parseNumberInput(event.target.value));
          }}
          placeholder="77.5946"
          value={longitudeText}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={latitudeId}>Latitude</Label>
        <Input
          aria-invalid={latitude !== null && !isValidLatitude(latitude)}
          id={latitudeId}
          inputMode="decimal"
          onChange={(event) => {
            setLatitudeText(event.target.value);
            onLatitudeChange(parseNumberInput(event.target.value));
          }}
          placeholder="12.9716"
          value={latitudeText}
        />
      </div>
    </div>
  );
}

function CoordinateStatus({ coordinate }: { coordinate: LngLat | null }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
      {coordinate ? (
        <span>
          Preview marker at{" "}
          <span className="font-mono">
            {formatCoordinate(coordinate[0])}, {formatCoordinate(coordinate[1])}
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground">
          Enter valid longitude and latitude, or set the marker from the map.
        </span>
      )}
    </div>
  );
}

function parseNumberInput(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseCoordinateInput(longitudeText: string, latitudeText: string): LngLat | null {
  const longitude = parseNumberInput(longitudeText);
  const latitude = parseNumberInput(latitudeText);
  if (!isValidLongitude(longitude) || !isValidLatitude(latitude)) return null;
  return [longitude, latitude];
}

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : "Invalid";
}
