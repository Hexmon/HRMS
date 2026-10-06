import type { AttendanceLocationEvidenceInput, UUID } from "#shared";
import {
  ATTENDANCE_GEO_EVALUATOR_VERSION,
  type EffectiveGeofenceEvaluationResult,
} from "./command-repository.js";
import type { AttendanceGeoEvaluationInput } from "./geo-policy.js";
import type { EffectiveAttendancePolicy } from "./policy-config.js";

export type AttendanceGeoLocationStatus =
  AttendanceGeoEvaluationInput["locationStatus"];

export function hasCoordinateEvidence(
  location: AttendanceLocationEvidenceInput,
): location is AttendanceLocationEvidenceInput & {
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  captured_at: string;
} {
  return (
    "latitude" in location &&
    "longitude" in location &&
    "accuracy_meters" in location
  );
}

export function evidenceWideGeoEvaluation(input: {
  category: "stale_evidence" | "accuracy_exceeded";
  evidenceAgeMs: number;
  reportedAccuracyMeters: number;
  maxLocationAgeMs: number | null;
  maxAccuracyMeters: number | null;
}) {
  return {
    category: input.category,
    evaluator_version: ATTENDANCE_GEO_EVALUATOR_VERSION,
    evidence_age_ms: input.evidenceAgeMs,
    reported_accuracy_meters: input.reportedAccuracyMeters,
    max_location_age_ms: input.maxLocationAgeMs,
    max_accuracy_meters: input.maxAccuracyMeters,
  };
}

export function noEffectiveGeoEvaluation(input: {
  candidateCount: number;
  validCandidateCount: number;
}) {
  return {
    category: "no_effective_geofence" as const,
    evaluator_version: ATTENDANCE_GEO_EVALUATOR_VERSION,
    candidate_count: input.candidateCount,
    valid_candidate_count: input.validCandidateCount,
  };
}

export async function buildAttendanceGeoLocationStatus(input: {
  policy: Pick<
    EffectiveAttendancePolicy,
    | "effectiveGeofenceIds"
    | "geofenceGraceMeters"
    | "maxLocationAgeMs"
    | "maxAccuracyMeters"
  >;
  companyId: UUID;
  occurredAt: string;
  location?: AttendanceLocationEvidenceInput;
  evidenceAgeMs?: number | null;
  evaluateGeofence?: (input: {
    companyId: UUID;
    geofenceIds: UUID[];
    asOf: string;
    latitude: number;
    longitude: number;
    reportedAccuracyMeters: number;
    graceMeters: number;
  }) => Promise<EffectiveGeofenceEvaluationResult>;
}): Promise<AttendanceGeoLocationStatus> {
  if (!input.location) return { kind: "missing" };
  if (input.location.permission_state === "denied") {
    return { kind: "permission_denied" };
  }
  if (input.location.permission_state === "unavailable") {
    return { kind: "location_unavailable" };
  }
  if (!hasCoordinateEvidence(input.location)) {
    return { kind: "location_unavailable" };
  }

  const evidenceAgeMs =
    input.evidenceAgeMs ??
    ("age_ms" in input.location && typeof input.location.age_ms === "number"
      ? input.location.age_ms
      : Math.max(
          0,
          Date.parse(input.occurredAt) - Date.parse(input.location.captured_at),
        ));
  if (
    input.policy.maxLocationAgeMs !== null &&
    evidenceAgeMs > input.policy.maxLocationAgeMs
  ) {
    return {
      kind: "stale_evidence",
      evaluation: evidenceWideGeoEvaluation({
        category: "stale_evidence",
        evidenceAgeMs,
        reportedAccuracyMeters: input.location.accuracy_meters,
        maxLocationAgeMs: input.policy.maxLocationAgeMs,
        maxAccuracyMeters: input.policy.maxAccuracyMeters,
      }),
    };
  }
  if (
    input.policy.maxAccuracyMeters !== null &&
    input.location.accuracy_meters > input.policy.maxAccuracyMeters
  ) {
    return {
      kind: "accuracy_exceeded",
      evaluation: evidenceWideGeoEvaluation({
        category: "accuracy_exceeded",
        evidenceAgeMs,
        reportedAccuracyMeters: input.location.accuracy_meters,
        maxLocationAgeMs: input.policy.maxLocationAgeMs,
        maxAccuracyMeters: input.policy.maxAccuracyMeters,
      }),
    };
  }

  const fence =
    input.policy.effectiveGeofenceIds.length > 0 && input.evaluateGeofence
      ? await input.evaluateGeofence({
          companyId: input.companyId,
          geofenceIds: input.policy.effectiveGeofenceIds,
          asOf: input.occurredAt,
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          reportedAccuracyMeters: input.location.accuracy_meters,
          graceMeters: input.policy.geofenceGraceMeters,
        })
      : {
          configured: false as const,
          evaluation: noEffectiveGeoEvaluation({
            candidateCount: input.policy.effectiveGeofenceIds.length,
            validCandidateCount: 0,
          }),
        };

  if (fence.configured) {
    fence.evaluation.evidence_age_ms = evidenceAgeMs;
    fence.evaluation.max_location_age_ms = input.policy.maxLocationAgeMs;
    fence.evaluation.max_accuracy_meters = input.policy.maxAccuracyMeters;
  }
  return {
    kind: "coordinates",
    fence,
  };
}
