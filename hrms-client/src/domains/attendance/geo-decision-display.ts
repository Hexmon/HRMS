export type EmployeeGeoDecision = "accepted" | "provisional" | "review" | "rejected";

type AttendanceGeoFactualOutcome =
  | "inside_confident"
  | "not_required"
  | "outside_confident"
  | "boundary_uncertain"
  | "stale_evidence"
  | "accuracy_exceeded"
  | "missing"
  | "permission_denied"
  | "location_unavailable"
  | "fence_not_configured";

type AttendanceGeoPolicyAction = "allow" | "deny" | "manual_fallback";

type AttendanceGeoReasonCode =
  | "geo_not_required"
  | "geo_inside_fence"
  | "geo_evidence_missing"
  | "geo_permission_denied"
  | "geo_location_unavailable"
  | "geo_fence_not_configured"
  | "geo_outside_fence"
  | "geo_boundary_uncertain"
  | "geo_stale_evidence"
  | "geo_accuracy_exceeded"
  | "geo_manual_fallback_allowed"
  | "geo_manual_fallback_disallowed"
  | "geo_policy_mode_unknown"
  | "geo_action_unknown";

export interface EmployeeGeoDecisionDisplay {
  decision: EmployeeGeoDecision;
  title: string;
  description: string;
  reasonCode?: string;
  reasonDescription?: string;
}

const ACCEPTED_OUTCOMES = new Set<AttendanceGeoFactualOutcome>([
  "inside_confident",
  "not_required",
]);

const FACTUAL_REASON_CODES: Record<AttendanceGeoFactualOutcome, AttendanceGeoReasonCode> = {
  inside_confident: "geo_inside_fence",
  not_required: "geo_not_required",
  outside_confident: "geo_outside_fence",
  boundary_uncertain: "geo_boundary_uncertain",
  stale_evidence: "geo_stale_evidence",
  accuracy_exceeded: "geo_accuracy_exceeded",
  missing: "geo_evidence_missing",
  permission_denied: "geo_permission_denied",
  location_unavailable: "geo_location_unavailable",
  fence_not_configured: "geo_fence_not_configured",
};

const REASON_DESCRIPTIONS: Record<AttendanceGeoReasonCode, string> = {
  geo_not_required: "Location verification is not required for this punch.",
  geo_inside_fence: "Your location was verified within an allowed work area.",
  geo_evidence_missing: "Location evidence could not be obtained for this punch.",
  geo_permission_denied:
    "Location access is blocked. Allow location permission in your browser and try again.",
  geo_location_unavailable:
    "Your location could not be determined. Check location services and try again.",
  geo_fence_not_configured: "Your attendance work location is not currently configured.",
  geo_outside_fence: "Your location appears to be outside the allowed work area.",
  geo_boundary_uncertain:
    "Your location is near the work-area boundary and could not be verified confidently.",
  geo_stale_evidence: "The captured location was too old to verify this punch.",
  geo_accuracy_exceeded: "Location accuracy was too low to verify this punch.",
  geo_manual_fallback_allowed:
    "Your punch was recorded and requires review because location could not be verified.",
  geo_manual_fallback_disallowed:
    "Location could not be verified and fallback punching is not available.",
  geo_policy_mode_unknown:
    "Location verification is not configured correctly for this punch. Contact HR if this continues.",
  geo_action_unknown:
    "Location verification is not configured correctly for this punch. Contact HR if this continues.",
};

const DECISION_COPY: Record<EmployeeGeoDecision, { title: string; description: string }> = {
  accepted: {
    title: "Accepted",
    description: "Your punch was recorded.",
  },
  provisional: {
    title: "Provisional",
    description: "Your punch was recorded, but location evidence was not fully verified.",
  },
  review: {
    title: "Review",
    description: "Your punch was recorded and needs review.",
  },
  rejected: {
    title: "Rejected",
    description: "Your punch was not recorded.",
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function factualOutcome(value: unknown): AttendanceGeoFactualOutcome | "" {
  const raw = text(value);
  return raw in FACTUAL_REASON_CODES ? (raw as AttendanceGeoFactualOutcome) : "";
}

function policyAction(value: unknown): AttendanceGeoPolicyAction | "" {
  const raw = text(value);
  if (raw === "allow" || raw === "deny" || raw === "manual_fallback") return raw;
  return "";
}

export function hasEmployeeGeoPolicySnapshot(value: unknown): boolean {
  return Object.keys(asRecord(value)).length > 0;
}

export function employeeGeoReasonDescription(reasonCode: string | undefined): string {
  if (!reasonCode) return "";
  if (reasonCode in REASON_DESCRIPTIONS) {
    return REASON_DESCRIPTIONS[reasonCode as AttendanceGeoReasonCode];
  }
  return "Location verification could not be completed for this punch.";
}

export function employeeGeoDecisionDisplay(
  geoPolicyValue: unknown,
  fallbackDecision: EmployeeGeoDecision,
  fallbackReasonCode = "",
): EmployeeGeoDecisionDisplay {
  const geoPolicy = asRecord(geoPolicyValue);
  const allowed = booleanValue(geoPolicy.allowed);
  const outcome = factualOutcome(geoPolicy.factual_outcome);
  const selectedAction = policyAction(geoPolicy.selected_action);
  const reasonCode =
    text(geoPolicy.reason_code) ||
    fallbackReasonCode ||
    (outcome ? FACTUAL_REASON_CODES[outcome] : "");
  let decision = fallbackDecision;

  if (allowed === false) {
    decision = "rejected";
  } else if (geoPolicy.fallback_used === true || selectedAction === "manual_fallback") {
    decision = "review";
  } else if (allowed === true) {
    decision = outcome && ACCEPTED_OUTCOMES.has(outcome) ? "accepted" : "provisional";
  }

  const copy = DECISION_COPY[decision];
  const reasonDescription = employeeGeoReasonDescription(reasonCode);

  return {
    decision,
    title: copy.title,
    description: copy.description,
    reasonCode: reasonCode || undefined,
    reasonDescription: reasonDescription || undefined,
  };
}
