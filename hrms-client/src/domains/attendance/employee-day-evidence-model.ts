import type {
  EmployeeAttendanceDayEvidence,
  EmployeeAttendanceEvidenceEvent,
  EmployeeAttendanceEvidenceRegularizationRequest,
  EmployeeAttendanceSummarySource,
} from "./api";
import { employeeGeoReasonDescription } from "./geo-decision-display";
import {
  regularizationItemDisplays,
  regularizationOperationLabel,
  type RegularizationItemDisplay,
} from "./regularization-form-model";

export interface EmployeeDayEvidenceView {
  generatedAt: string | null;
  date: string;
  summarySources: EmployeeDayEvidenceSourceView[];
  events: EmployeeDayEvidenceEventView[];
  regularizations: EmployeeDayEvidenceRegularizationView[];
}

export interface EmployeeDayEvidenceSourceView {
  type: string;
  label: string;
}

export interface EmployeeDayEvidenceEventView {
  key: string;
  eventLabel: string;
  occurredAt: string;
  timeLabel: string;
  sourceLabel: string | null;
  workModeLabel: string | null;
  decisionLabel: string;
  decisionDescription: string;
  reasonCode: string | null;
  reasonText: string | null;
  geoLabel: string | null;
  regularizationLabel: string | null;
}

export interface EmployeeDayEvidenceRegularizationView {
  key: string;
  status: string;
  statusLabel: string;
  reason: string;
  decidedAtLabel: string | null;
  operationsLabel: string;
  items: RegularizationItemDisplay[];
}

const EVENT_LABELS: Record<string, string> = {
  check_in: "Check-in",
  break_start: "Break start",
  break_end: "Break end",
  check_out: "Check-out",
};

const SOURCE_LABELS: Record<string, string> = {
  web: "Web attendance",
  web_geo: "Web attendance with location",
  mobile: "Mobile attendance",
  mobile_foreground: "Mobile attendance",
  mobile_offline: "Mobile offline attendance",
  kiosk: "Kiosk attendance",
  admin: "Assisted attendance",
  auto_geofence: "Automatic geofence attendance",
};

const SUMMARY_SOURCE_LABELS: Record<string, string> = {
  employee_punch: "Employee attendance punch",
  manager_assisted_punch: "Assisted attendance punch",
  historical_correction: "Historical correction",
  approved_regularization: "Approved regularization",
  system_daily_summary: "Daily attendance processing",
};

const DECISION_LABELS: Record<string, { label: string; description: string }> = {
  allowed: {
    label: "Accepted",
    description: "This attendance event was accepted.",
  },
  passed: {
    label: "Accepted",
    description: "This attendance event passed attendance checks.",
  },
  denied: {
    label: "Not recorded",
    description: "This attendance event was not applied to the day summary.",
  },
  failed: {
    label: "Not recorded",
    description: "This attendance event failed attendance checks.",
  },
  indeterminate: {
    label: "Review needed",
    description: "The attendance decision needs review.",
  },
  not_applicable: {
    label: "Not applicable",
    description: "No attendance decision was required.",
  },
  recorded: {
    label: "Recorded",
    description: "Attendance decision details were recorded.",
  },
};

const REASON_DESCRIPTIONS: Record<string, string> = {
  already_checked_in: "You were already checked in.",
  no_open_session: "No active attendance session was open.",
  break_already_started: "A break was already active.",
  no_open_break: "No active break was open.",
  open_break_must_end: "End your break before clocking out.",
  attendance_cycle_completed: "The attendance cycle was already completed.",
  session_ownership_invalid: "The attendance session could not be matched to your user.",
  policy_window_rejected: "This punch was outside the allowed attendance window.",
  invalid_chronology: "This punch time conflicts with another attendance event.",
  invalid_state_transition: "This punch could not be applied to the current attendance state.",
};

export function employeeDayEvidenceView(
  evidence: EmployeeAttendanceDayEvidence | null | undefined,
): EmployeeDayEvidenceView | null {
  if (!evidence) return null;
  const events = [...(evidence.events ?? [])]
    .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at))
    .map(eventView);
  const regularizations = (evidence.regularizations ?? []).map(regularizationView);

  return {
    generatedAt: isoString(evidence.generated_at),
    date: evidence.date || evidence.day?.work_date || "",
    summarySources: (evidence.summary_sources ?? []).map(summarySourceView),
    events,
    regularizations,
  };
}

function eventView(
  event: EmployeeAttendanceEvidenceEvent,
  index: number,
): EmployeeDayEvidenceEventView {
  const reasonCode = firstReasonCode(event);
  const decision = decisionCopy(event.decision?.outcome);
  const reasonText = reasonCode ? reasonDescription(reasonCode) : (event.decision?.reason ?? null);
  const geoLabel = event.geo
    ? [geoOutcomeLabel(event.geo.outcome), event.geo.work_site_name].filter(Boolean).join(" - ")
    : null;

  return {
    key: `${event.occurred_at || "event"}:${event.event_type || "unknown"}:${index}`,
    eventLabel: eventLabel(event.event_type),
    occurredAt: event.occurred_at,
    timeLabel: event.time || formatTime(event.occurred_at),
    sourceLabel: sourceLabel(event.source, event.origin),
    workModeLabel: event.work_mode ? humanize(event.work_mode) : null,
    decisionLabel: decision.label,
    decisionDescription: event.decision?.reason || decision.description,
    reasonCode,
    reasonText,
    geoLabel: geoLabel || null,
    regularizationLabel: event.regularization
      ? regularizationRelationshipLabel(
          event.regularization.relationship,
          event.regularization.status,
        )
      : null,
  };
}

function summarySourceView(source: EmployeeAttendanceSummarySource): EmployeeDayEvidenceSourceView {
  const type = String(source.type || "");
  return {
    type,
    label: source.label || SUMMARY_SOURCE_LABELS[type] || humanize(type) || "Attendance source",
  };
}

function regularizationView(
  regularization: EmployeeAttendanceEvidenceRegularizationRequest,
  index: number,
): EmployeeDayEvidenceRegularizationView {
  const status = String(regularization.status || "pending");
  const operations = regularization.operations.length
    ? regularization.operations.map(regularizationOperationLabel)
    : ["Historical correction"];

  return {
    key: `${regularization.created_at || "regularization"}:${index}`,
    status,
    statusLabel: humanize(status),
    reason: regularization.reason || "No reason supplied.",
    decidedAtLabel: regularization.decided_at ? formatDateTime(regularization.decided_at) : null,
    operationsLabel: operations.join(", "),
    items: regularizationItemDisplays(regularization.items),
  };
}

function firstReasonCode(event: EmployeeAttendanceEvidenceEvent): string | null {
  const codes = event.decision?.reason_codes ?? [];
  const code = codes.find((value) => typeof value === "string" && value.trim());
  return code?.trim() || event.geo?.reason_code || null;
}

function reasonDescription(reasonCode: string): string {
  if (reasonCode.startsWith("geo_")) return employeeGeoReasonDescription(reasonCode);
  return REASON_DESCRIPTIONS[reasonCode] || "Attendance decision recorded.";
}

function decisionCopy(value: string | undefined | null): { label: string; description: string } {
  const key = String(value || "").toLowerCase();
  return (
    DECISION_LABELS[key] ?? {
      label: "Decision details unavailable",
      description: "Decision details are unavailable for this event.",
    }
  );
}

function eventLabel(value: string | null | undefined): string {
  const key = String(value || "");
  return EVENT_LABELS[key] || humanize(key) || "Attendance event";
}

function sourceLabel(source: string | null, origin: string | null): string | null {
  if (origin === "approved_regularization") return "Approved regularization";
  if (origin === "historical_correction") return "Historical correction";
  if (origin === "manager_assisted_now") return "Assisted attendance";
  if (!source) return null;
  return SOURCE_LABELS[source] || humanize(source);
}

function regularizationRelationshipLabel(relationship: string, status: string): string {
  const statusLabel = humanize(status);
  if (relationship === "replacement") return `Replacement from ${statusLabel} regularization`;
  if (relationship === "corrected_original")
    return `Original corrected by ${statusLabel} regularization`;
  if (relationship === "voided") return `Removed by ${statusLabel} regularization`;
  if (relationship === "added") return `Added by ${statusLabel} regularization`;
  return `${statusLabel} regularization`;
}

function geoOutcomeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value === "inside_confident") return "Inside work area";
  if (value === "outside_confident") return "Outside work area";
  if (value === "boundary_uncertain") return "Boundary uncertain";
  if (value === "not_required") return "Location not required";
  if (value === "permission_denied") return "Location permission denied";
  if (value === "location_unavailable") return "Location unavailable";
  if (value === "accuracy_exceeded") return "Low location accuracy";
  if (value === "stale_evidence") return "Stale location";
  if (value === "fence_not_configured") return "Work area unavailable";
  if (value === "missing") return "Location missing";
  return humanize(value);
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "Time unavailable";
  return parsed.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isoString(value: string | null | undefined): string | null {
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function humanize(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

export function regularizationEventLabel(value: string | null | undefined): string {
  return eventLabel(value);
}
