import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, LngLatLike, Map as MapLibreMap } from "maplibre-gl";
import type { MapProviderConfig } from "@/domains/admin-geo/map-config";
import {
  circlePreviewRing,
  closedPreviewRing,
  draftBounds,
  type CircleDraft,
  isPolygonReady,
  isValidLngLat,
  type LngLat,
  type PolygonDraft,
} from "@/domains/admin-geo/geometry";
import { cn } from "@/lib/utils";

type MapClickMode = "circle-center" | "polygon";
type DraftGeoJson = Exclude<Parameters<GeoJSONSource["setData"]>[0], string>;

interface AdminGeoMapProps {
  config: MapProviderConfig | null;
  circleDraft: CircleDraft;
  polygonDraft: PolygonDraft;
  clickMode: MapClickMode;
  fitRequestKey: number;
  simulationPoint?: LngLat | null;
  simulationAccuracyMeters?: number | null;
  simulationVerdict?: string | null;
  onMapClick: (coordinate: LngLat) => void;
}

type MapStatus = "missing-config" | "loading" | "ready" | "error";

const DRAFT_POLYGON_SOURCE_ID = "admin-geo-draft-polygon";
const DRAFT_VERTEX_SOURCE_ID = "admin-geo-draft-vertices";
const DRAFT_CIRCLE_SOURCE_ID = "admin-geo-draft-circle";
const SIMULATION_POINT_SOURCE_ID = "admin-geo-simulation-point";
const SIMULATION_ACCURACY_SOURCE_ID = "admin-geo-simulation-accuracy";
const DEFAULT_CENTER: LngLat = [78.9629, 20.5937];

export function AdminGeoMap({
  config,
  circleDraft,
  polygonDraft,
  clickMode,
  fitRequestKey,
  simulationPoint = null,
  simulationAccuracyMeters = null,
  simulationVerdict = null,
  onMapClick,
}: AdminGeoMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const polygonDraftRef = useRef(polygonDraft);
  const circleDraftRef = useRef(circleDraft);
  const simulationPointRef = useRef(simulationPoint);
  const simulationAccuracyMetersRef = useRef(simulationAccuracyMeters);
  const [status, setStatus] = useState<MapStatus>(config ? "loading" : "missing-config");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  onMapClickRef.current = onMapClick;
  polygonDraftRef.current = polygonDraft;
  circleDraftRef.current = circleDraft;
  simulationPointRef.current = simulationPoint;
  simulationAccuracyMetersRef.current = simulationAccuracyMeters;

  const hint = useMemo(
    () =>
      clickMode === "circle-center"
        ? "Map clicks set the circle center."
        : "Map clicks append polygon vertices.",
    [clickMode],
  );

  useEffect(() => {
    if (!config) {
      setStatus("missing-config");
      return;
    }
    if (typeof window === "undefined" || !containerRef.current) return;

    let disposed = false;
    let map: MapLibreMap | null = null;
    const mapConfig = config;

    async function mountMap() {
      try {
        setStatus("loading");
        setErrorMessage(null);
        await import("maplibre-gl/dist/maplibre-gl.css");
        const [maplibre, workerModule] = await Promise.all([
          import("maplibre-gl"),
          import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
        ]);
        if (disposed || !containerRef.current) return;

        maplibre.setWorkerUrl((workerModule as { default: string }).default);
        const initialBounds = draftBounds({
          circle: circleDraftRef.current,
          polygon: polygonDraftRef.current,
        });
        const initialCenter = initialBounds
          ? ([
              (initialBounds.west + initialBounds.east) / 2,
              (initialBounds.south + initialBounds.north) / 2,
            ] as LngLat)
          : DEFAULT_CENTER;
        map = new maplibre.Map({
          attributionControl: { compact: true },
          center: initialCenter,
          container: containerRef.current,
          maxZoom: mapConfig.maxZoom ?? undefined,
          minZoom: mapConfig.minZoom ?? undefined,
          style: mapConfig.styleUrl,
          zoom: initialBounds ? 14 : 4,
        });
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

        map.on("load", () => {
          if (!map || disposed) return;
          ensureDraftLayers(map);
          ensureSimulationLayers(map);
          updateDraftSources(map, polygonDraftRef.current, circleDraftRef.current);
          updateSimulationSources(
            map,
            simulationPointRef.current,
            simulationAccuracyMetersRef.current,
          );
          setStatus("ready");
        });
        map.on("click", (event) => {
          onMapClickRef.current([event.lngLat.lng, event.lngLat.lat]);
        });
        map.on("error", (event) => {
          const message =
            event.error instanceof Error
              ? event.error.message
              : "Map provider failed to load. Draft controls remain available.";
          setErrorMessage(message);
          setStatus("error");
        });
      } catch (error) {
        if (disposed) return;
        setErrorMessage(error instanceof Error ? error.message : "MapLibre failed to initialize.");
        setStatus("error");
      }
    }

    void mountMap();

    return () => {
      disposed = true;
      map?.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [config]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status === "missing-config") return;
    if (!map.isStyleLoaded()) return;
    updateDraftSources(map, polygonDraft, circleDraft);
  }, [circleDraft, polygonDraft, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status === "missing-config") return;
    if (!map.isStyleLoaded()) return;
    updateSimulationSources(map, simulationPoint, simulationAccuracyMeters);
  }, [simulationAccuracyMeters, simulationPoint, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitRequestKey === 0) return;
    fitToDraft(map, circleDraft, polygonDraft);
  }, [circleDraft, fitRequestKey, polygonDraft]);

  if (!config) {
    return (
      <div
        className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center"
        data-testid="admin-geo-map-missing"
      >
        <div className="max-w-md space-y-2">
          <p className="text-sm font-semibold">Map provider is not configured</p>
          <p className="text-sm text-muted-foreground">
            Add VITE_MAP_STYLE_URL to enable the visual map. Local draft coordinate controls remain
            available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={cn(
          "relative min-h-[420px] overflow-hidden rounded-lg border border-border bg-muted",
          status === "error" && "ring-1 ring-destructive/40",
        )}
        data-testid="admin-geo-map"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{status === "loading" ? "Initializing map provider..." : hint}</span>
        <span className="flex items-center gap-2">
          {simulationPoint ? (
            <span data-testid="geo-simulation-map-state">
              Simulation point active{simulationVerdict ? ` - ${simulationVerdict}` : ""}
            </span>
          ) : null}
          {config.attribution ? <span>{config.attribution}</span> : null}
        </span>
      </div>
      {status === "error" ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage ?? "Map provider failed to load. Draft controls remain available."}
        </div>
      ) : null}
    </div>
  );
}

function ensureSimulationLayers(map: MapLibreMap): void {
  if (!map.getSource(SIMULATION_ACCURACY_SOURCE_ID)) {
    map.addSource(SIMULATION_ACCURACY_SOURCE_ID, {
      data: emptyFeatureCollection(),
      type: "geojson",
    });
  }
  if (!map.getLayer("admin-geo-simulation-accuracy-fill")) {
    map.addLayer({
      id: "admin-geo-simulation-accuracy-fill",
      paint: {
        "fill-color": "#f59e0b",
        "fill-opacity": 0.12,
      },
      source: SIMULATION_ACCURACY_SOURCE_ID,
      type: "fill",
    });
  }
  if (!map.getLayer("admin-geo-simulation-accuracy-line")) {
    map.addLayer({
      id: "admin-geo-simulation-accuracy-line",
      paint: {
        "line-color": "#d97706",
        "line-dasharray": [2, 2],
        "line-width": 2,
      },
      source: SIMULATION_ACCURACY_SOURCE_ID,
      type: "line",
    });
  }
  if (!map.getSource(SIMULATION_POINT_SOURCE_ID)) {
    map.addSource(SIMULATION_POINT_SOURCE_ID, {
      data: emptyFeatureCollection(),
      type: "geojson",
    });
  }
  if (!map.getLayer("admin-geo-simulation-point")) {
    map.addLayer({
      id: "admin-geo-simulation-point",
      paint: {
        "circle-color": "#f59e0b",
        "circle-radius": 7,
        "circle-stroke-color": "#111827",
        "circle-stroke-width": 2,
      },
      source: SIMULATION_POINT_SOURCE_ID,
      type: "circle",
    });
  }
}

function ensureDraftLayers(map: MapLibreMap): void {
  if (!map.getSource(DRAFT_CIRCLE_SOURCE_ID)) {
    map.addSource(DRAFT_CIRCLE_SOURCE_ID, {
      data: emptyFeatureCollection(),
      type: "geojson",
    });
  }
  if (!map.getLayer("admin-geo-draft-circle-fill")) {
    map.addLayer({
      id: "admin-geo-draft-circle-fill",
      paint: {
        "fill-color": "#2563eb",
        "fill-opacity": 0.14,
      },
      source: DRAFT_CIRCLE_SOURCE_ID,
      type: "fill",
    });
  }
  if (!map.getLayer("admin-geo-draft-circle-line")) {
    map.addLayer({
      id: "admin-geo-draft-circle-line",
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#2563eb",
        "line-width": 2,
      },
      source: DRAFT_CIRCLE_SOURCE_ID,
      type: "line",
    });
  }
  if (!map.getSource(DRAFT_POLYGON_SOURCE_ID)) {
    map.addSource(DRAFT_POLYGON_SOURCE_ID, {
      data: emptyFeatureCollection(),
      type: "geojson",
    });
  }
  if (!map.getLayer("admin-geo-draft-fill")) {
    map.addLayer({
      id: "admin-geo-draft-fill",
      paint: {
        "fill-color": "#0f766e",
        "fill-opacity": 0.16,
      },
      source: DRAFT_POLYGON_SOURCE_ID,
      type: "fill",
    });
  }
  if (!map.getLayer("admin-geo-draft-line")) {
    map.addLayer({
      id: "admin-geo-draft-line",
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#0f766e",
        "line-width": 2,
      },
      source: DRAFT_POLYGON_SOURCE_ID,
      type: "line",
    });
  }
  if (!map.getSource(DRAFT_VERTEX_SOURCE_ID)) {
    map.addSource(DRAFT_VERTEX_SOURCE_ID, {
      data: emptyFeatureCollection(),
      type: "geojson",
    });
  }
  if (!map.getLayer("admin-geo-draft-vertices")) {
    map.addLayer({
      id: "admin-geo-draft-vertices",
      paint: {
        "circle-color": "#14b8a6",
        "circle-radius": 5,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
      source: DRAFT_VERTEX_SOURCE_ID,
      type: "circle",
    });
  }
}

function updateDraftSources(
  map: MapLibreMap,
  polygonDraft: PolygonDraft,
  circleDraft: CircleDraft,
): void {
  const circleSource = map.getSource(DRAFT_CIRCLE_SOURCE_ID) as GeoJSONSource | undefined;
  const polygonSource = map.getSource(DRAFT_POLYGON_SOURCE_ID) as GeoJSONSource | undefined;
  const vertexSource = map.getSource(DRAFT_VERTEX_SOURCE_ID) as GeoJSONSource | undefined;
  circleSource?.setData(circleFeatureCollection(circleDraft));
  polygonSource?.setData(polygonFeatureCollection(polygonDraft));
  vertexSource?.setData(vertexFeatureCollection(polygonDraft.vertices));
}

function updateSimulationSources(
  map: MapLibreMap,
  point: LngLat | null,
  accuracyMeters: number | null,
): void {
  const pointSource = map.getSource(SIMULATION_POINT_SOURCE_ID) as GeoJSONSource | undefined;
  const accuracySource = map.getSource(SIMULATION_ACCURACY_SOURCE_ID) as GeoJSONSource | undefined;
  if (!point) {
    pointSource?.setData(emptyFeatureCollection());
    accuracySource?.setData(emptyFeatureCollection());
    return;
  }
  pointSource?.setData({
    features: [
      {
        geometry: { coordinates: point, type: "Point" },
        properties: {},
        type: "Feature",
      },
    ],
    type: "FeatureCollection",
  } as DraftGeoJson);
  const ring = circlePreviewRing({
    center: point,
    radiusMeters: accuracyMeters && accuracyMeters > 0 ? accuracyMeters : null,
  });
  accuracySource?.setData(
    ring.length > 0
      ? ({
          features: [
            {
              geometry: { coordinates: [ring], type: "Polygon" },
              properties: {},
              type: "Feature",
            },
          ],
          type: "FeatureCollection",
        } as DraftGeoJson)
      : emptyFeatureCollection(),
  );
}

function fitToDraft(map: MapLibreMap, circleDraft: CircleDraft, polygonDraft: PolygonDraft): void {
  const bounds = draftBounds({ circle: circleDraft, polygon: polygonDraft });
  if (!bounds) return;
  if (bounds.west === bounds.east && bounds.south === bounds.north) {
    map.flyTo({ center: [bounds.west, bounds.south] as LngLatLike, zoom: 15 });
    return;
  }
  map.fitBounds(
    [
      [bounds.west, bounds.south],
      [bounds.east, bounds.north],
    ],
    { duration: 450, padding: 48 },
  );
}

function circleFeatureCollection(circleDraft: CircleDraft): DraftGeoJson {
  const ring = circlePreviewRing(circleDraft);
  if (ring.length === 0) return emptyFeatureCollection();
  return {
    features: [
      {
        geometry: {
          coordinates: [ring],
          type: "Polygon",
        },
        properties: {},
        type: "Feature",
      },
    ],
    type: "FeatureCollection",
  };
}

function polygonFeatureCollection(polygonDraft: PolygonDraft): DraftGeoJson {
  if (!isPolygonReady(polygonDraft.vertices)) return emptyFeatureCollection();
  return {
    features: [
      {
        geometry: {
          coordinates: [closedPreviewRing(polygonDraft.vertices)],
          type: "Polygon",
        },
        properties: {},
        type: "Feature",
      },
    ],
    type: "FeatureCollection",
  };
}

function vertexFeatureCollection(vertices: readonly LngLat[]): DraftGeoJson {
  return {
    features: vertices.filter(isValidLngLat).map((coordinate, index) => ({
      geometry: {
        coordinates: coordinate,
        type: "Point",
      },
      properties: { index },
      type: "Feature",
    })),
    type: "FeatureCollection",
  } as DraftGeoJson;
}

function emptyFeatureCollection(): DraftGeoJson {
  return { features: [], type: "FeatureCollection" } as DraftGeoJson;
}
