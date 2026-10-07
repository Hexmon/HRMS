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
import type { AttendanceDayRecord, AttendanceGeoFallbackReview } from "#shared";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { ReportService } from "../service.js";

const companyId = "00000000-0000-4000-8000-00000000a015";
const mumbaiSiteId = "00000000-0000-4000-8000-000000000a51";
const delhiSiteId = "00000000-0000-4000-8000-000000000a52";

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

function geoReview(
  employeeUserId: string,
  overrides: Partial<AttendanceGeoFallbackReview> = {},
): AttendanceGeoFallbackReview {
  const now = "2026-07-20T09:03:00.000Z";
  return {
    id: randomUUID(),
    company_id: companyId,
    employee_user_id: employeeUserId,
    submitted_by_user_id: seedIds.employee1,
    current_approver_user_id: seedIds.manager,
    original_command_id: randomUUID(),
    original_decision_id: randomUUID(),
    fallback_command_id: null,
    punch_event_id: null,
    event_type: "check_in",
    work_date: "2026-07-20",
    occurred_at: now,
    reason_code: "geo_outside_fence",
    reason_detail: null,
    geo_policy: {
      factual_outcome: "outside_confident",
      selected_action: "fallback_review",
      work_site_id: mumbaiSiteId,
      work_site_name: "Mumbai HQ",
      work_site_type: "office",
    },
    status: "pending",
    decision_remarks: null,
    decided_by_user_id: null,
    decided_at: null,
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
      attendance_channels: ["Mobile - captured offline"],
    });
  });

  it("projects safe geo review fields without exact coordinates", () => {
    const store = createMemoryDataStore();
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    store.attendanceDayRecords.push(attendanceDay(seedIds.employee1));
    store.attendancePunches.push({
      id: randomUUID(),
      employee_user_id: seedIds.employee1,
      actor_user_id: seedIds.employee1,
      company_id: companyId,
      event_type: "check_in",
      occurred_at: "2026-07-20T09:00:00.000Z",
      work_mode: "office",
      source: "web_geo",
      origin: "employee_manual_now",
      regularization_request_id: null,
      metadata: {},
      created_at: "2026-07-20T09:00:00.000Z",
      deleted_at: null,
    });
    store.attendanceGeoFallbackReviews.push(geoReview(seedIds.employee1));

    const result = new ReportService(store).attendanceSummary(admin, {
      page: 1,
      page_size: 20,
      evidence_category: "review_required",
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      reporting_evidence_category: "review_required",
      attendance_channels: ["Web + location"],
      source_categories: ["geo"],
      work_site_id: [mumbaiSiteId],
      work_site_name: ["Mumbai HQ"],
      work_site_type: ["office"],
      geo_outcome: ["outside_confident"],
      geo_action: ["fallback_review"],
      review_type: ["geo_decision"],
      reason_codes: ["geo_outside_fence"],
      review_required: true,
      review_outcome: ["pending"],
    });
    expect(result.items[0]).not.toHaveProperty("latitude");
    expect(result.items[0]).not.toHaveProperty("longitude");
    expect(result.items[0]).not.toHaveProperty("exact_location");
  });

  it("combines evidence state, source, geo, review type, channel, and reason filters", () => {
    const store = createMemoryDataStore();
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    store.attendanceDayRecords.push(
      attendanceDay(seedIds.employee1),
      attendanceDay(seedIds.employee2),
    );
    for (const employeeUserId of [seedIds.employee1, seedIds.employee2]) {
      store.attendancePunches.push({
        id: randomUUID(),
        employee_user_id: employeeUserId,
        actor_user_id: employeeUserId,
        company_id: companyId,
        event_type: "check_in",
        occurred_at: "2026-07-20T09:00:00.000Z",
        work_mode: "office",
        source: "web_geo",
        origin: "employee_manual_now",
        regularization_request_id: null,
        metadata: {},
        created_at: "2026-07-20T09:00:00.000Z",
        deleted_at: null,
      });
    }
    store.attendanceGeoFallbackReviews.push(
      geoReview(seedIds.employee1, { fallback_command_id: randomUUID() }),
      geoReview(seedIds.employee2),
    );

    const result = new ReportService(store).attendanceSummary(admin, {
      page: 1,
      page_size: 20,
      evidence_category: "review_required",
      source_category: "manual",
      work_site_id: mumbaiSiteId,
      geo_outcome: "outside_confident",
      review_type: "manual_fallback",
      attendance_channel: "Web + location",
      reason_code: "geo_outside_fence",
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      employee_user_id: seedIds.employee1,
      reporting_evidence_category: "review_required",
      attendance_channels: ["Web + location"],
      source_categories: ["geo", "manual"],
      work_site_id: [mumbaiSiteId],
      geo_outcome: ["outside_confident"],
      review_type: ["manual_fallback"],
      reason_codes: ["geo_outside_fence"],
    });
    expect(result.source_categories).toMatchObject({
      geo: 1,
      manual: 1,
    });
  });

  it("downgrades device eligibility evidence to warning when accepted evidence exists", () => {
    const store = createMemoryDataStore() as ReturnType<typeof createMemoryDataStore> & {
      attendanceMobileEvidenceWarnings: Array<{
        company_id: string;
        employee_user_id: string;
        work_date: string;
        source: "mobile";
        captured_at: string;
        server_received_at: string;
        reason_code: string;
        category: string;
        evidence_status: string;
      }>;
    };
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    store.attendanceMobileEvidenceWarnings = [
      {
        company_id: companyId,
        employee_user_id: seedIds.employee1,
        work_date: "2026-07-20",
        source: "mobile",
        captured_at: "2026-07-20T08:59:00.000Z",
        server_received_at: "2026-07-20T08:59:05.000Z",
        reason_code: "mobile_registered_device_required",
        category: "device_eligibility",
        evidence_status: "registered_device_required",
      },
      {
        company_id: companyId,
        employee_user_id: seedIds.employee2,
        work_date: "2026-07-20",
        source: "mobile",
        captured_at: "2026-07-20T08:58:00.000Z",
        server_received_at: "2026-07-20T08:58:05.000Z",
        reason_code: "mobile_registered_device_required",
        category: "device_eligibility",
        evidence_status: "registered_device_required",
      },
    ];
    store.attendanceDayRecords.push(
      attendanceDay(seedIds.employee1),
      attendanceDay(seedIds.employee2, {
        status: AttendanceDayStatuses.Absent,
        presence_state: AttendancePresenceStates.Absent,
        evidence_state: AttendanceEvidenceStates.Missing,
        first_check_in: null,
        last_check_out: null,
        work_seconds: 0,
        work_minutes: 0,
      }),
    );

    const result = new ReportService(store).attendanceSummary(admin, {
      page: 1,
      page_size: 20,
    });
    const byEmployee = new Map(result.items.map((row) => [row.employee_user_id, row]));

    expect(byEmployee.get(seedIds.employee1)).toMatchObject({
      reporting_evidence_category: "warning",
      attendance_channels: ["Mobile"],
      reason_codes: ["mobile_registered_device_required"],
    });
    expect(byEmployee.get(seedIds.employee2)).toMatchObject({
      reporting_evidence_category: "rejected",
      attendance_channels: ["Mobile"],
      reason_codes: ["mobile_registered_device_required"],
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

  it("filters site and approval state independently from evidence state", () => {
    const store = createMemoryDataStore();
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    store.attendanceDayRecords.push(
      attendanceDay(seedIds.employee1, {
        approval_kind: AttendanceApprovalKinds.Regularization,
        approval_state: AttendanceApprovalStates.Pending,
      }),
      attendanceDay(seedIds.employee2, {
        approval_kind: AttendanceApprovalKinds.Leave,
        approval_state: AttendanceApprovalStates.Approved,
      }),
    );
    store.attendanceGeoFallbackReviews.push(
      geoReview(seedIds.employee1),
      geoReview(seedIds.employee2, {
        geo_policy: {
          factual_outcome: "outside_confident",
          selected_action: "fallback_review",
          work_site_id: delhiSiteId,
          work_site_name: "Delhi Office",
          work_site_type: "office",
        },
      }),
    );

    const result = new ReportService(store).attendanceSummary(admin, {
      page: 1,
      page_size: 20,
      date_from: "2026-07-20",
      date_to: "2026-07-20",
      evidence_category: "review_required",
      work_site_id: mumbaiSiteId,
      approval_state: AttendanceApprovalStates.Pending,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      employee_user_id: seedIds.employee1,
      reporting_evidence_category: "review_required",
      approval_state: AttendanceApprovalStates.Pending,
      work_site_id: [mumbaiSiteId],
      work_site_name: ["Mumbai HQ"],
    });
    expect(result.site_options).toEqual([
      { id: mumbaiSiteId, label: "Mumbai HQ", type: "office" },
    ]);
  });

  it("scopes site options to manager-visible attendance rows", () => {
    const store = createMemoryDataStore();
    const manager = store.users.find((user) => user.id === seedIds.manager)!;
    store.attendanceDayRecords.push(
      attendanceDay(seedIds.employee1),
      attendanceDay(seedIds.alternateFinance),
    );
    store.attendanceGeoFallbackReviews.push(
      geoReview(seedIds.employee1),
      geoReview(seedIds.alternateFinance, {
        geo_policy: {
          factual_outcome: "outside_confident",
          selected_action: "fallback_review",
          work_site_id: delhiSiteId,
          work_site_name: "Delhi Office",
          work_site_type: "office",
        },
      }),
    );

    const result = new ReportService(store).attendanceSummary(manager, {
      page: 1,
      page_size: 20,
    });

    expect(result.items.map((row) => row.employee_user_id)).toEqual([seedIds.employee1]);
    expect(result.site_options).toEqual([
      { id: mumbaiSiteId, label: "Mumbai HQ", type: "office" },
    ]);
  });
});
