import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  AttendanceApprovalKinds,
  AttendanceApprovalStates,
  AttendanceDayClassifications,
  AttendanceDayStatuses,
  AttendanceEvidenceStates,
  AttendancePayrollStates,
  AttendancePresenceStates,
  AttendancePunctualityStates,
  EmploymentStatuses,
} from "#shared";
import type { AttendanceDayRecord } from "#shared";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { AttendanceService } from "../service.js";

function dayRecord(
  companyId: string,
  employeeUserId: string,
  overrides: Partial<AttendanceDayRecord> = {},
): AttendanceDayRecord {
  const now = "2026-07-20T18:00:00.000Z";
  return {
    id: randomUUID(),
    employee_user_id: employeeUserId,
    company_id: companyId,
    work_date: "2026-10-20",
    status: AttendanceDayStatuses.Present,
    day_classification: AttendanceDayClassifications.WorkingDay,
    presence_state: AttendancePresenceStates.Present,
    punctuality_state: AttendancePunctualityStates.OnTime,
    evidence_state: AttendanceEvidenceStates.Complete,
    approval_kind: AttendanceApprovalKinds.None,
    approval_state: AttendanceApprovalStates.NotRequired,
    payroll_state: AttendancePayrollStates.Unprocessed,
    first_check_in: "2026-07-20T09:00:00.000Z",
    last_check_out: "2026-07-20T17:00:00.000Z",
    work_minutes: 480,
    break_minutes: 0,
    late_minutes: 0,
    early_out_minutes: 0,
    work_seconds: 28_800,
    break_seconds: 0,
    scheduled_seconds: 28_800,
    late_seconds: 0,
    early_departure_seconds: 0,
    work_mode: "office",
    note: null,
    exception_type: null,
    regularization_status: null,
    version: 1,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...overrides,
  };
}

describe("AttendanceService team summary reporting evidence", () => {
  it("returns evidence category counts without changing attendance totals", () => {
    const store = createMemoryDataStore();
    const companyId = store.companyProfiles[0]!.id;
    for (const user of store.users) {
      user.employment_status = EmploymentStatuses.Inactive;
    }
    store.users.find((user) => user.id === seedIds.admin)!.employment_status =
      EmploymentStatuses.Active;
    store.users.find((user) => user.id === seedIds.employee1)!.employment_status =
      EmploymentStatuses.Active;
    store.users.find((user) => user.id === seedIds.employee2)!.employment_status =
      EmploymentStatuses.Active;
    store.attendanceDayRecords.push(
      dayRecord(companyId, seedIds.admin),
      dayRecord(companyId, seedIds.employee1),
      dayRecord(companyId, seedIds.employee2, {
        evidence_state: AttendanceEvidenceStates.Partial,
      }),
    );

    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const summary = new AttendanceService(store).teamSummary(admin, {
      page: 1,
      page_size: 20,
      date_from: "2026-10-20",
    });

    expect(summary.totals).toMatchObject({
      total: 3,
      present: 3,
    });
    expect(summary.evidence_categories).toEqual({
      verified: 2,
      warning: 1,
      provisional: 0,
      review_required: 0,
      rejected: 0,
    });
  });
});
