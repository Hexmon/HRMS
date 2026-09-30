export type LngLat = [longitude: number, latitude: number];

export interface WorkSiteDraft {
  longitude: number | null;
  latitude: number | null;
}

export interface PolygonDraft {
  vertices: LngLat[];
}

export interface CircleDraft {
  center: LngLat | null;
  radiusMeters: number | null;
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

export const EMPTY_CIRCLE_DRAFT: CircleDraft = {
  center: null,
  radiusMeters: 150,
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

export function isValidRadiusMeters(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isCircleReady(draft: CircleDraft): boolean {
  return isValidLngLat(draft.center) && isValidRadiusMeters(draft.radiusMeters);
}

export function circlePreviewRing(draft: CircleDraft, steps = 64): LngLat[] {
  if (!isCircleReady(draft)) return [];
  const center = draft.center;
  const radiusMeters = draft.radiusMeters;
  if (!center || !radiusMeters) return [];

  const earthRadiusMeters = 6_371_008.8;
  const angularDistance = radiusMeters / earthRadiusMeters;
  const centerLongitude = toRadians(center[0]);
  const centerLatitude = toRadians(center[1]);
  const ring: LngLat[] = [];

  for (let index = 0; index <= steps; index += 1) {
    const bearing = (2 * Math.PI * index) / steps;
    const latitude = Math.asin(
      Math.sin(centerLatitude) * Math.cos(angularDistance) +
        Math.cos(centerLatitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const longitude =
      centerLongitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLatitude),
        Math.cos(angularDistance) - Math.sin(centerLatitude) * Math.sin(latitude),
      );
    ring.push([normalizeLongitude(toDegrees(longitude)), toDegrees(latitude)]);
  }

  return ring;
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

export function resetCircleDraft(): CircleDraft {
  return { center: null, radiusMeters: 150 };
}

export function draftBounds(input: {
  workSite?: WorkSiteDraft | null;
  polygon?: PolygonDraft | null;
  circle?: CircleDraft | null;
}): DraftBounds | null {
  const coordinates: LngLat[] = [];
  const workSite = input.workSite ? workSiteDraftToLngLat(input.workSite) : null;
  if (workSite) coordinates.push(workSite);
  if (input.polygon) coordinates.push(...input.polygon.vertices.filter(isValidLngLat));
  if (input.circle) {
    const circleRing = circlePreviewRing(input.circle, 16);
    if (circleRing.length > 0) coordinates.push(...circleRing);
    else if (input.circle.center && isValidLngLat(input.circle.center)) {
      coordinates.push(input.circle.center);
    }
  }
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

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function normalizeLongitude(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}
