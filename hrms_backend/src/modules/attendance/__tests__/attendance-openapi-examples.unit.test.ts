import { describe, expect, it } from "vitest";
import {
  attendanceGeoFallbackDecisionSchema,
  attendanceGeoFallbackSubmitSchema,
  attendanceLocationEvidenceSchema,
  attendancePunchCommandEnvelopeSchema,
  attendanceRegularizationCreateSchema,
  attendanceRegularizationDecisionSchema,
  errorResponseSchema,
} from "#shared";
import { attendanceOpenApiExamples } from "../attendance-openapi-examples.js";
import {
  attendanceOfflineBatchRequestSchema,
  attendanceOfflineSyncResponseSchema,
} from "../offline-sync-contract.js";

const coordinateKeys = new Set([
  "latitude",
  "longitude",
  "coordinates",
  "coordinate",
]);

describe("attendance OpenAPI examples", () => {
  it("keeps attendance command request examples aligned with Zod schemas", () => {
    expect(
      attendancePunchCommandEnvelopeSchema.safeParse(
        attendanceOpenApiExamples.requests.webPunch.value,
      ).success,
    ).toBe(true);
    expect(
      attendancePunchCommandEnvelopeSchema.safeParse(
        attendanceOpenApiExamples.requests.webGeoPunch.value,
      ).success,
    ).toBe(true);
    expect(
      attendancePunchCommandEnvelopeSchema.safeParse(
        attendanceOpenApiExamples.requests.webGeoPermissionDenied.value,
      ).success,
    ).toBe(true);
    expect(
      attendancePunchCommandEnvelopeSchema.safeParse(
        attendanceOpenApiExamples.requests.mobilePunch.value,
      ).success,
    ).toBe(true);
  });

  it("validates location evidence examples and keeps failure evidence coordinate-free", () => {
    expect(
      attendanceLocationEvidenceSchema.safeParse(
        attendanceOpenApiExamples.evidence.browserCoordinate,
      ).success,
    ).toBe(true);
    expect(
      attendanceLocationEvidenceSchema.safeParse(
        attendanceOpenApiExamples.evidence.browserPermissionDenied,
      ).success,
    ).toBe(true);
    expect(
      containsCoordinateKey(
        attendanceOpenApiExamples.evidence.browserPermissionDenied,
      ),
    ).toBe(false);
  });

  it("validates offline sync request and response examples", () => {
    expect(
      attendanceOfflineBatchRequestSchema.safeParse(
        attendanceOpenApiExamples.requests.offlineBatch.value,
      ).success,
    ).toBe(true);
    expect(
      attendanceOfflineSyncResponseSchema.safeParse(
        attendanceOpenApiExamples.responses.offlineSync.value,
      ).success,
    ).toBe(true);
  });

  it("validates normalized regularization and manager decision request examples", () => {
    for (const example of [
      attendanceOpenApiExamples.requests.regularizationAdd,
      attendanceOpenApiExamples.requests.regularizationReplace,
      attendanceOpenApiExamples.requests.regularizationVoid,
      attendanceOpenApiExamples.requests.regularizationMixed,
    ]) {
      expect(
        attendanceRegularizationCreateSchema.safeParse(example.value).success,
      ).toBe(true);
    }

    for (const example of [
      attendanceOpenApiExamples.requests.regularizationApprove,
      attendanceOpenApiExamples.requests.regularizationReturn,
      attendanceOpenApiExamples.requests.regularizationReject,
    ]) {
      expect(
        attendanceRegularizationDecisionSchema.safeParse(example.value).success,
      ).toBe(true);
      expect(
        attendanceGeoFallbackDecisionSchema.safeParse(example.value).success,
      ).toBe(true);
    }
  });

  it("validates the empty geo fallback submit request body", () => {
    expect(
      attendanceGeoFallbackSubmitSchema.safeParse(
        attendanceOpenApiExamples.requests.geoFallbackSubmit.value,
      ).success,
    ).toBe(true);
  });

  it("keeps routine safe evidence examples free of exact coordinate keys", () => {
    for (const value of [
      attendanceOpenApiExamples.responses.safeGeoEvidenceSummary.value,
      attendanceOpenApiExamples.responses.employeeSelfEvidenceDaily.value,
      attendanceOpenApiExamples.responses.regularization.value,
      attendanceOpenApiExamples.responses.geoFallbackQueue.value,
    ]) {
      expect(containsCoordinateKey(value)).toBe(false);
    }
  });

  it("keeps the exact reveal example minimal and explicitly coordinate-bearing", () => {
    expect(
      Object.keys(
        attendanceOpenApiExamples.responses.exactLocationReveal.value,
      ).sort(),
    ).toEqual([
      "accuracy_meters",
      "captured_at",
      "latitude",
      "longitude",
    ]);
  });

  it("keeps representative error examples on the canonical envelope", () => {
    for (const example of Object.values(attendanceOpenApiExamples.errors)) {
      expect(errorResponseSchema.safeParse(example.value).success).toBe(true);
    }
  });
});

function containsCoordinateKey(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(containsCoordinateKey);
  }
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) =>
      coordinateKeys.has(key.toLowerCase()) || containsCoordinateKey(nested),
  );
}
