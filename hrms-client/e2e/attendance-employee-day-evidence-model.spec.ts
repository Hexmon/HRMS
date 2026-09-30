import { expect, test } from "@playwright/test";
import { employeeDayEvidenceView } from "../src/domains/attendance/employee-day-evidence-model";
import type { EmployeeAttendanceDayEvidence } from "../src/domains/attendance/api";

test.describe("employee day evidence model", () => {
  test("maps safe event evidence and drops unexpected sensitive fields", () => {
    const view = employeeDayEvidenceView({
      generated_at: "2026-07-18T08:30:00.000Z",
      date: "2026-07-18",
      day: {
        work_date: "2026-07-18",
        status: "present",
        day_classification: "working_day",
        presence_state: "present",
        punctuality_state: "on_time",
        evidence_state: "complete",
        approval_kind: "regularization",
        approval_state: "approved",
        payroll_state: "unprocessed",
        regularization_status: "approved",
        in_time: "09:10",
        out_time: "18:00",
        hours: "8h 50m",
        work_minutes: 530,
        break_minutes: 30,
        detail: "8h 50m",
      },
      summary_sources: [
        { type: "employee_punch", label: "Employee attendance punch" },
        { type: "approved_regularization", label: "Approved regularization" },
      ],
      events: [
        {
          event_type: "check_out",
          occurred_at: "2026-07-18T12:30:00.000Z",
          time: "18:00",
          source: "web_geo",
          origin: "employee_manual_now",
          work_mode: "office",
          decision: {
            outcome: "allowed",
            reason_codes: ["geo_inside_fence"],
            reason: null,
          },
          geo: {
            outcome: "inside_confident",
            reason_code: "geo_inside_fence",
            selected_action: "allow",
            work_site_name: "Bhubaneswar Office",
            work_site_type: "office",
          },
          regularization: null,
          latitude: 19.076,
          longitude: 72.8777,
          command_id: "internal-command",
        },
        {
          event_type: "check_in",
          occurred_at: "2026-07-18T03:40:00.000Z",
          time: "09:10",
          source: "admin",
          origin: "approved_regularization",
          work_mode: "office",
          decision: {
            outcome: "passed",
            reason_codes: ["unknown_future_reason"],
            reason: null,
          },
          geo: null,
          regularization: {
            status: "approved",
            operation: "add",
            relationship: "added",
            reason: "Missed check-in after client meeting.",
            decided_at: "2026-07-19T08:30:00.000Z",
            applied_at: "2026-07-19T08:30:00.000Z",
          },
        },
      ],
      regularizations: [
        {
          status: "approved",
          reason: "Missed check-in after client meeting.",
          created_at: "2026-07-19T04:30:00.000Z",
          updated_at: "2026-07-19T08:30:00.000Z",
          decided_at: "2026-07-19T08:30:00.000Z",
          operations: ["add"],
          items: [
            {
              operation: "add",
              event_type: "check_in",
              occurred_at: "2026-07-18T03:40:00.000Z",
              relationship: "applied",
            },
          ],
        },
      ],
      raw_payload: { coordinates: [72.8777, 19.076] },
    } as unknown as EmployeeAttendanceDayEvidence);

    expect(view?.summarySources.map((source) => source.label)).toEqual([
      "Employee attendance punch",
      "Approved regularization",
    ]);
    expect(view?.events.map((event) => event.eventLabel)).toEqual(["Check-in", "Check-out"]);
    expect(view?.events[0]).toMatchObject({
      decisionLabel: "Accepted",
      reasonCode: "unknown_future_reason",
      reasonText: "Attendance decision recorded.",
      regularizationLabel: "Added by Approved regularization",
    });
    expect(view?.events[1]).toMatchObject({
      sourceLabel: "Web attendance with location",
      reasonCode: "geo_inside_fence",
      reasonText: "Your location was verified within an allowed work area.",
      geoLabel: "Inside work area - Bhubaneswar Office",
    });
    expect(view?.regularizations[0]).toMatchObject({
      statusLabel: "Approved",
      operationsLabel: "Add missing punch",
    });

    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("19.076");
    expect(serialized).not.toContain("72.8777");
    expect(serialized).not.toContain("coordinates");
    expect(serialized).not.toContain("command_id");
    expect(serialized).not.toContain("raw_payload");
  });
});
