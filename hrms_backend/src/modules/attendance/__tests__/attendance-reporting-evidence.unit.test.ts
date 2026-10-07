import { describe, expect, it } from "vitest";
import {
  AttendanceApprovalKinds,
  AttendanceApprovalStates,
  AttendanceDayClassifications,
  AttendanceEvidenceStates,
  AttendancePresenceStates,
} from "#shared";
import {
  deriveAttendanceReportingEvidenceCategory,
  emptyAttendanceReportingEvidenceCounts,
  countAttendanceReportingEvidenceCategories,
} from "../reporting-evidence.js";

const verifiedDay = {
  day_classification: AttendanceDayClassifications.WorkingDay,
  presence_state: AttendancePresenceStates.Present,
  evidence_state: AttendanceEvidenceStates.Complete,
  approval_kind: AttendanceApprovalKinds.None,
  approval_state: AttendanceApprovalStates.NotRequired,
  regularization_status: null,
  first_check_in: "2026-07-20T09:00:00.000Z",
  last_check_out: "2026-07-20T17:00:00.000Z",
  work_seconds: 28_800,
};

describe("attendance reporting evidence category", () => {
  it("returns verified for finalized complete evidence", () => {
    expect(deriveAttendanceReportingEvidenceCategory({ day: verifiedDay })).toBe("verified");
  });

  it("returns warning for non-blocking evidence quality issues", () => {
    expect(deriveAttendanceReportingEvidenceCategory({
      day: {
        ...verifiedDay,
        evidence_state: AttendanceEvidenceStates.Partial,
      },
    })).toBe("warning");
  });

  it("allows provisional and rejected only from operative reporting signals", () => {
    expect(deriveAttendanceReportingEvidenceCategory({
      day: verifiedDay,
      signals: { provisional: true },
    })).toBe("provisional");
    expect(deriveAttendanceReportingEvidenceCategory({
      day: verifiedDay,
      signals: { operativeRejected: true },
    })).toBe("rejected");
  });

  it("puts review required above rejected, provisional, and warning", () => {
    expect(deriveAttendanceReportingEvidenceCategory({
      day: {
        ...verifiedDay,
        evidence_state: AttendanceEvidenceStates.Partial,
      },
      signals: {
        reviewRequired: true,
        operativeRejected: true,
        provisional: true,
      },
    })).toBe("review_required");
  });

  it("keeps non-evidentiary days null when no attendance evidence contributes", () => {
    expect(deriveAttendanceReportingEvidenceCategory({
      day: {
        ...verifiedDay,
        day_classification: AttendanceDayClassifications.Leave,
        presence_state: AttendancePresenceStates.NotApplicable,
        evidence_state: AttendanceEvidenceStates.NotApplicable,
        first_check_in: null,
        last_check_out: null,
        work_seconds: 0,
      },
    })).toBeNull();
  });

  it("does not let unrelated historical rejection reject a verified day", () => {
    expect(deriveAttendanceReportingEvidenceCategory({
      day: {
        ...verifiedDay,
        approval_kind: AttendanceApprovalKinds.Regularization,
        approval_state: AttendanceApprovalStates.Rejected,
        regularization_status: "rejected",
      },
    })).toBe("verified");
  });

  it("counts all categories with stable zero keys", () => {
    expect(countAttendanceReportingEvidenceCategories([
      "verified",
      "warning",
      null,
      "warning",
      "review_required",
    ])).toEqual({
      ...emptyAttendanceReportingEvidenceCounts(),
      verified: 1,
      warning: 2,
      review_required: 1,
    });
  });
});
