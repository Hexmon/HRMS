import type { AttendanceDayRecord } from "#shared";
import {
  AttendanceApprovalKinds,
  AttendanceApprovalStates,
  AttendanceDayClassifications,
  AttendanceEvidenceStates,
  AttendancePresenceStates,
  AttendanceRegularizationStatuses,
} from "#shared";

export const AttendanceReportingEvidenceCategories = {
  Verified: "verified",
  Warning: "warning",
  Provisional: "provisional",
  ReviewRequired: "review_required",
  Rejected: "rejected",
} as const;

export const AttendanceReportingEvidenceCategoryValues = [
  AttendanceReportingEvidenceCategories.Verified,
  AttendanceReportingEvidenceCategories.Warning,
  AttendanceReportingEvidenceCategories.Provisional,
  AttendanceReportingEvidenceCategories.ReviewRequired,
  AttendanceReportingEvidenceCategories.Rejected,
] as const;

export type AttendanceReportingEvidenceCategory =
  (typeof AttendanceReportingEvidenceCategoryValues)[number];

export type AttendanceReportingEvidenceCounts = Record<
  AttendanceReportingEvidenceCategory,
  number
>;

export interface AttendanceReportingEvidenceSignals {
  reviewRequired?: boolean;
  operativeRejected?: boolean;
  provisional?: boolean;
  warning?: boolean;
  hasContributingEvidence?: boolean;
}

type AttendanceReportingEvidenceDay = Pick<
  AttendanceDayRecord,
  | "day_classification"
  | "presence_state"
  | "evidence_state"
  | "approval_kind"
  | "approval_state"
  | "regularization_status"
  | "first_check_in"
  | "last_check_out"
  | "work_seconds"
>;

export function deriveAttendanceReportingEvidenceCategory(input: {
  day: AttendanceReportingEvidenceDay;
  signals?: AttendanceReportingEvidenceSignals;
}): AttendanceReportingEvidenceCategory | null {
  const { day } = input;
  const signals = input.signals ?? {};
  const hasEvidence = signals.hasContributingEvidence ?? hasContributingAttendanceEvidence(day);

  if (isNonEvidentiaryDay(day) && !hasEvidence && !hasExplicitEvidenceSignal(signals)) {
    return null;
  }

  if (isReviewRequired(day, signals)) {
    return AttendanceReportingEvidenceCategories.ReviewRequired;
  }

  if (signals.operativeRejected) {
    return AttendanceReportingEvidenceCategories.Rejected;
  }

  if (signals.provisional) {
    return AttendanceReportingEvidenceCategories.Provisional;
  }

  if (signals.warning || hasEvidenceQualityWarning(day)) {
    return AttendanceReportingEvidenceCategories.Warning;
  }

  if (isVerified(day)) {
    return AttendanceReportingEvidenceCategories.Verified;
  }

  return AttendanceReportingEvidenceCategories.Warning;
}

export function emptyAttendanceReportingEvidenceCounts(): AttendanceReportingEvidenceCounts {
  return {
    verified: 0,
    warning: 0,
    provisional: 0,
    review_required: 0,
    rejected: 0,
  };
}

export function countAttendanceReportingEvidenceCategories(
  categories: readonly (AttendanceReportingEvidenceCategory | null | undefined)[],
): AttendanceReportingEvidenceCounts {
  const counts = emptyAttendanceReportingEvidenceCounts();
  for (const category of categories) {
    if (category && category in counts) {
      counts[category] += 1;
    }
  }
  return counts;
}

export function isAttendanceReportingEvidenceCategory(
  value: unknown,
): value is AttendanceReportingEvidenceCategory {
  return (
    typeof value === "string" &&
    AttendanceReportingEvidenceCategoryValues.includes(
      value as AttendanceReportingEvidenceCategory,
    )
  );
}

function isNonEvidentiaryDay(day: AttendanceReportingEvidenceDay): boolean {
  return (
    day.day_classification === AttendanceDayClassifications.Future ||
    day.day_classification === AttendanceDayClassifications.Weekend ||
    day.day_classification === AttendanceDayClassifications.Holiday ||
    day.day_classification === AttendanceDayClassifications.Leave
  );
}

function hasContributingAttendanceEvidence(day: AttendanceReportingEvidenceDay): boolean {
  return Boolean(
    day.first_check_in ||
      day.last_check_out ||
      day.work_seconds > 0 ||
      day.presence_state === AttendancePresenceStates.Present ||
      day.presence_state === AttendancePresenceStates.Partial ||
      day.presence_state === AttendancePresenceStates.Incomplete,
  );
}

function hasExplicitEvidenceSignal(signals: AttendanceReportingEvidenceSignals): boolean {
  return Boolean(
    signals.reviewRequired ||
      signals.operativeRejected ||
      signals.provisional ||
      signals.warning ||
      signals.hasContributingEvidence,
  );
}

function isReviewRequired(
  day: AttendanceReportingEvidenceDay,
  signals: AttendanceReportingEvidenceSignals,
): boolean {
  if (signals.reviewRequired) {
    return true;
  }
  if (
    day.regularization_status === AttendanceRegularizationStatuses.Pending ||
    day.regularization_status === AttendanceRegularizationStatuses.Returned
  ) {
    return true;
  }
  return (
    day.approval_kind === AttendanceApprovalKinds.Regularization &&
    (day.approval_state === AttendanceApprovalStates.Pending ||
      day.approval_state === AttendanceApprovalStates.Returned)
  );
}

function hasEvidenceQualityWarning(day: AttendanceReportingEvidenceDay): boolean {
  return (
    day.evidence_state === AttendanceEvidenceStates.Partial ||
    day.evidence_state === AttendanceEvidenceStates.Missing ||
    day.evidence_state === AttendanceEvidenceStates.Disputed ||
    day.evidence_state === AttendanceEvidenceStates.Unknown ||
    day.approval_state === AttendanceApprovalStates.Mixed ||
    day.approval_state === AttendanceApprovalStates.Unknown
  );
}

function isVerified(day: AttendanceReportingEvidenceDay): boolean {
  if (
    day.evidence_state === AttendanceEvidenceStates.Complete ||
    day.approval_state === AttendanceApprovalStates.Approved
  ) {
    return true;
  }
  return (
    day.evidence_state === AttendanceEvidenceStates.NotApplicable &&
    !isNonEvidentiaryDay(day)
  );
}
