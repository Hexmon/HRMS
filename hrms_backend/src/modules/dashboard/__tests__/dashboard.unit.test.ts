import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AttendanceDayRecord } from "#shared";
import {
  AttendanceApprovalKinds,
  AttendanceApprovalStates,
  AttendanceDayClassifications,
  AttendanceDayStatuses,
  AttendanceEvidenceStates,
  AttendancePayrollStates,
  AttendancePresenceStates,
  AttendancePunctualityStates,
  Roles,
} from "#shared";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { DashboardService } from "../service.js";

describe("dashboard summary scoping", () => {
  it("limits privileged dashboard metrics to the actor active company", () => {
    const store = createMemoryDataStore();
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const finance = addCompanyDepartment(store, "company-a", "FIN", "Finance");
    addCompanyDepartment(store, "company-a", "DESIGN", "Design");
    addCompanyDepartment(store, "company-b", "OPS", "Operations");
    admin.department_id = finance.id;
    store.userSessionPreferences = store.userSessionPreferences.filter(
      (preference) => preference.user_id !== admin.id,
    );
    store.userSessionPreferences.push({
      id: "pref-admin-company-a",
      user_id: admin.id,
      active_role: Roles.Admin,
      company_id: "company-a",
      landing_page: "/dashboard",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      version: 1
    });

    const summary = new DashboardService(store).summary(admin);

    expect(summary.scope).toMatchObject({
      employee_code: "ADM",
      visibility: "all"
    });
    expect(summary.workforce.visible_employees).toBe(1);
    expect(summary.workforce.active_employees).toBe(1);
    expect(summary.workforce.departments.map((department) => ({
      code: department.department_code,
      active_employees: department.active_employees
    }))).toEqual([
      { code: "DESIGN", active_employees: 0 },
      { code: "FIN", active_employees: 1 }
    ]);
    expect(summary.cards.find((card) => card.key === "active_employees")?.value).toBe(1);
    expect(summary.cards.find((card) => card.key === "attendance_exceptions")?.value).toBe(0);
    expect(summary.operations.assets_total).toBe(0);
    expect(summary.operations.notifications_pending).toBe(0);
    expect(summary.operations.outbox_pending).toBe(0);
  });

  it("uses reporting projection semantics for attendance evidence and source counts", () => {
    const store = createMemoryDataStore();
    const admin = store.users.find((user) => user.id === seedIds.admin)!;
    const companyId = store.companyProfiles[0]!.id;
    store.attendanceDayRecords.push(attendanceDay(companyId, seedIds.employee1));
    store.attendancePunches.push({
      id: randomUUID(),
      employee_user_id: seedIds.employee1,
      actor_user_id: seedIds.employee1,
      company_id: companyId,
      event_type: "check_in",
      occurred_at: "2026-10-20T09:00:00.000Z",
      work_mode: "office",
      source: "web_geo",
      origin: "employee_manual_now",
      regularization_request_id: null,
      metadata: {},
      created_at: "2026-10-20T09:00:00.000Z",
      deleted_at: null,
    });
    store.attendanceGeoFallbackReviews.push({
      id: randomUUID(),
      company_id: companyId,
      employee_user_id: seedIds.employee1,
      submitted_by_user_id: seedIds.employee1,
      current_approver_user_id: seedIds.manager,
      original_command_id: randomUUID(),
      original_decision_id: randomUUID(),
      fallback_command_id: randomUUID(),
      punch_event_id: null,
      event_type: "check_in",
      work_date: "2026-10-20",
      occurred_at: "2026-10-20T09:00:00.000Z",
      reason_code: "geo_outside_fence",
      reason_detail: null,
      geo_policy: {
        factual_outcome: "outside_confident",
        selected_action: "manual_fallback",
        work_site_name: "Mumbai HQ",
        work_site_type: "office",
      },
      status: "pending",
      decision_remarks: null,
      decided_by_user_id: null,
      decided_at: null,
      version: 1,
      created_at: "2026-10-20T09:00:00.000Z",
      updated_at: "2026-10-20T09:00:00.000Z",
      deleted_at: null,
    });

    const summary = new DashboardService(store).summary(admin);

    expect(summary.attendance.evidence_categories).toMatchObject({
      review_required: 1,
    });
    expect(summary.attendance.source_categories).toMatchObject({
      geo: 1,
      manual: 1,
    });
  });
});

function addCompanyDepartment(store: ReturnType<typeof createMemoryDataStore>, companyId: string, code: string, name: string) {
  const department = {
    id: `dept-${companyId}-${code}`,
    company_id: companyId,
    department_code: code,
    name,
    cost_center: null,
    parent_department_id: null,
    director_user_id: null,
    status: "active" as const,
    deleted_at: null,
    version: 1
  };
  store.departments.push(department);
  return department;
}

function attendanceDay(companyId: string, employeeUserId: string): AttendanceDayRecord {
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
    first_check_in: "2026-10-20T09:00:00.000Z",
    last_check_out: "2026-10-20T17:00:00.000Z",
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
    created_at: "2026-10-20T17:00:00.000Z",
    updated_at: "2026-10-20T17:00:00.000Z",
    deleted_at: null,
  };
}
