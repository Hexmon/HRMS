import { expect, test } from "@playwright/test";
import {
  circlePreviewRing,
  closedPreviewRing,
  distinctVertexCount,
  draftBounds,
  EMPTY_CIRCLE_DRAFT,
  EMPTY_POLYGON_DRAFT,
  EMPTY_WORK_SITE_DRAFT,
  isCircleReady,
  isPolygonReady,
  isValidLatitude,
  isValidLngLat,
  isValidLongitude,
  isValidRadiusMeters,
  resetCircleDraft,
  removeLastVertex,
  resetPolygonDraft,
  resetWorkSiteDraft,
  type LngLat,
} from "../src/domains/admin-geo/geometry";

test.describe("admin geo draft geometry", () => {
  test("validates longitude and latitude boundaries", () => {
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180.01)).toBe(false);
    expect(isValidLongitude(180.01)).toBe(false);
    expect(isValidLongitude(Number.NaN)).toBe(false);

    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(-90.01)).toBe(false);
    expect(isValidLatitude(90.01)).toBe(false);
    expect(isValidLatitude("12")).toBe(false);
  });

  test("validates lng/lat tuples", () => {
    expect(isValidLngLat([77.5946, 12.9716])).toBe(true);
    expect(isValidLngLat([12.9716, 77.5946])).toBe(true);
    expect(isValidLngLat([77.5946, 91])).toBe(false);
    expect(isValidLngLat([181, 12.9716])).toBe(false);
  });

  test("requires at least three distinct valid vertices for polygon readiness", () => {
    const twoVertices: LngLat[] = [
      [77, 12],
      [78, 12],
    ];
    const duplicateVertices: LngLat[] = [
      [77, 12],
      [77, 12],
      [78, 12],
    ];
    const readyVertices: LngLat[] = [
      [77, 12],
      [78, 12],
      [78, 13],
    ];

    expect(isPolygonReady(twoVertices)).toBe(false);
    expect(isPolygonReady(duplicateVertices)).toBe(false);
    expect(distinctVertexCount(duplicateVertices)).toBe(2);
    expect(isPolygonReady(readyVertices)).toBe(true);
  });

  test("validates circle drafts and builds a closed preview ring", () => {
    expect(isValidRadiusMeters(1)).toBe(true);
    expect(isValidRadiusMeters(0)).toBe(false);
    expect(isValidRadiusMeters(Number.NaN)).toBe(false);
    expect(isCircleReady({ center: [77.5946, 12.9716], radiusMeters: 150 })).toBe(true);
    expect(isCircleReady({ center: null, radiusMeters: 150 })).toBe(false);

    const ring = circlePreviewRing({ center: [77.5946, 12.9716], radiusMeters: 150 }, 8);

    expect(ring).toHaveLength(9);
    expect(ring[0]).toEqual(ring.at(-1));
    expect(resetCircleDraft()).toEqual(EMPTY_CIRCLE_DRAFT);
  });

  test("closes preview rings without mutating the underlying vertices", () => {
    const vertices: LngLat[] = [
      [77, 12],
      [78, 12],
      [78, 13],
    ];

    const ring = closedPreviewRing(vertices);

    expect(ring).toEqual([
      [77, 12],
      [78, 12],
      [78, 13],
      [77, 12],
    ]);
    expect(vertices).toEqual([
      [77, 12],
      [78, 12],
      [78, 13],
    ]);
  });

  test("removes last vertex and resets empty draft shapes", () => {
    expect(
      removeLastVertex({
        vertices: [
          [77, 12],
          [78, 12],
        ],
      }),
    ).toEqual({
      vertices: [[77, 12]],
    });
    expect(resetPolygonDraft()).toEqual(EMPTY_POLYGON_DRAFT);
    expect(resetWorkSiteDraft()).toEqual(EMPTY_WORK_SITE_DRAFT);
  });

  test("calculates bounds from valid draft geometry", () => {
    const bounds = draftBounds({
      circle: { center: [79, 14], radiusMeters: 100 },
      workSite: { longitude: 77.5, latitude: 12.5 },
      polygon: {
        vertices: [
          [77, 12],
          [78, 13],
          [77.2, 12.7],
        ],
      },
    });

    expect(bounds?.west).toBe(77);
    expect(bounds?.south).toBe(12);
    expect(bounds?.east).toBeCloseTo(79.0009, 4);
    expect(bounds?.north).toBeCloseTo(14.0009, 4);
    expect(draftBounds({ polygon: { vertices: [] } })).toBeNull();
  });
});
