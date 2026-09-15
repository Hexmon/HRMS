export type LngLat = [longitude: number, latitude: number];

export interface WorkSiteDraft {
  longitude: number | null;
  latitude: number | null;
}

export interface PolygonDraft {
  vertices: LngLat[];
}

export interface DraftBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const EMPTY_WORK_SITE_DRAFT: WorkSiteDraft = {
  longitude: null,
  latitude: null,
};

export const EMPTY_POLYGON_DRAFT: PolygonDraft = {
  vertices: [],
};

export function isValidLongitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidLatitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLngLat(value: unknown): value is LngLat {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isValidLongitude(value[0]) &&
    isValidLatitude(value[1])
  );
}

export function workSiteDraftToLngLat(draft: WorkSiteDraft): LngLat | null {
  if (!isValidLongitude(draft.longitude) || !isValidLatitude(draft.latitude)) return null;
  return [draft.longitude, draft.latitude];
}

export function distinctVertexCount(vertices: readonly LngLat[]): number {
  return new Set(
    vertices
      .filter(isValidLngLat)
      .map(([longitude, latitude]) => `${longitude.toFixed(7)},${latitude.toFixed(7)}`),
  ).size;
}

export function isPolygonReady(vertices: readonly LngLat[]): boolean {
  return vertices.length >= 3 && distinctVertexCount(vertices) >= 3;
}

export function closedPreviewRing(vertices: readonly LngLat[]): LngLat[] {
  const validVertices = vertices.filter(isValidLngLat);
  if (validVertices.length === 0) return [];
  const first = validVertices[0]!;
  const last = validVertices.at(-1)!;
  if (first[0] === last[0] && first[1] === last[1]) return [...validVertices];
  return [...validVertices, [first[0], first[1]]];
}

export function removeLastVertex(draft: PolygonDraft): PolygonDraft {
  return {
    vertices: draft.vertices.slice(0, -1),
  };
}

export function resetWorkSiteDraft(): WorkSiteDraft {
  return { ...EMPTY_WORK_SITE_DRAFT };
}

export function resetPolygonDraft(): PolygonDraft {
  return { vertices: [] };
}

export function draftBounds(input: {
  workSite?: WorkSiteDraft | null;
  polygon?: PolygonDraft | null;
}): DraftBounds | null {
  const coordinates: LngLat[] = [];
  const workSite = input.workSite ? workSiteDraftToLngLat(input.workSite) : null;
  if (workSite) coordinates.push(workSite);
  if (input.polygon) coordinates.push(...input.polygon.vertices.filter(isValidLngLat));
  if (coordinates.length === 0) return null;

  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  };
}
