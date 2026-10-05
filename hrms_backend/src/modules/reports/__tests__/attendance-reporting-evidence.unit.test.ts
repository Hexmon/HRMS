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
} from "#shared";
import type { AttendanceDayRecord } from "#shared";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { ReportService } from "../service.js";

const companyId = "00000000-0000-4000-8000-00000000a015";

function attendanceDay(
  employeeUserId: string,
  overrides: Partial<AttendanceDayRecord> = {},
): AttendanceDayRecord {
  const now = "2026-07-20T18:00:00.000Z";
  return {
    id: randomUUID(),
    employee_user_id: employeeUserId,
    company_id: companyId,
    work_date: "2026-07-20",
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

describe("attendance report evidence categories", () => {
  it("exposes status and reporting evidence category independently", () => {
    const store = createMemoryDataStore();
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    store.attendanceDayRecords.push(
      attendanceDay(seedIds.employee1),
      attendanceDay(seedIds.employee2, {
        evidence_state: AttendanceEvidenceStates.Partial,
      }),
    );

    const result = new ReportService(store).attendanceSummary(admin, {
      page: 1,
      page_size: 20,
      status: AttendanceDayStatuses.Present,
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: AttendanceDayStatuses.Present,
          reporting_evidence_category: "verified",
        }),
        expect.objectContaining({
          status: AttendanceDayStatuses.Present,
          reporting_evidence_category: "warning",
        }),
      ]),
    );
    expect(result.evidence_categories).toMatchObject({
      verified: 1,
      warning: 1,
      provisional: 0,
      review_required: 0,
      rejected: 0,
    });
  });

  it("filters evidence category separately from attendance status", () => {
    const store = createMemoryDataStore();
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    store.attendanceDayRecords.push(
      attendanceDay(seedIds.employee1),
      attendanceDay(seedIds.employee2, {
        evidence_state: AttendanceEvidenceStates.Partial,
      }),
    );

    const result = new ReportService(store).attendanceSummary(admin, {
      page: 1,
      page_size: 20,
      status: AttendanceDayStatuses.Present,
      evidence_category: "warning",
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      employee_user_id: seedIds.employee2,
      status: AttendanceDayStatuses.Present,
      reporting_evidence_category: "warning",
    });
  });

  it("uses safe offline provisional outbox status when it matches the reporting day", () => {
    const store = createMemoryDataStore();
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const attendanceEventId = randomUUID();
    store.attendanceDayRecords.push(attendanceDay(seedIds.employee1));
    store.outbox.push({
      id: 15,
      event_id: randomUUID(),
      aggregate_type: "attendance",
      aggregate_id: attendanceEventId,
      event_type: "attendance.provisional.recorded",
      payload: {
        company_id: companyId,
        subject_employee_user_id: seedIds.employee1,
        attendance_event_id: attendanceEventId,
        verification_status: "unverified",
        captured_at: "2026-07-20T09:00:00.000Z",
      },
      idempotency_key: `attendance.provisional.recorded:${attendanceEventId}`,
      status: "pending",
      retry_count: 0,
      available_at: "2026-07-20T09:00:00.000Z",
      created_at: "2026-07-20T09:00:00.000Z",
      published_at: null,
      failed_at: null,
      last_error: null,
    });

    const result = new ReportService(store).attendanceSummary(admin, {
      page: 1,
      page_size: 20,
      evidence_category: "provisional",
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      employee_user_id: seedIds.employee1,
      reporting_evidence_category: "provisional",
    });
  });

  it("intersects manager filter with actor hierarchy visibility", () => {
    const store = createMemoryDataStore();
    const manager = store.users.find((user) => user.id === seedIds.manager)!;
    store.attendanceDayRecords.push(
      attendanceDay(seedIds.employee1),
      attendanceDay(seedIds.alternateFinance),
    );

    const ownTeam = new ReportService(store).attendanceSummary(manager, {
      page: 1,
      page_size: 20,
      manager_user_id: seedIds.manager,
    });
    const unrelatedTeam = new ReportService(store).attendanceSummary(manager, {
      page: 1,
      page_size: 20,
      manager_user_id: seedIds.financeManager,
    });

    expect(ownTeam.items.map((row) => row.employee_user_id)).toEqual([seedIds.employee1]);
    expect(unrelatedTeam.items).toHaveLength(0);
  });
});
