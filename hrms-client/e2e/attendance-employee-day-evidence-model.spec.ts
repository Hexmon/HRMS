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
        { type: "mobile_offline", label: "Mobile - captured offline" },
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
          event_type: "break_start",
          occurred_at: "2026-07-18T07:00:00.000Z",
          time: "12:30",
          source: "mobile_offline",
          origin: null,
          work_mode: "office",
          decision: null,
          geo: null,
          regularization: null,
          offline: {
            sync_status: "deferred",
            verification_status: "review_required",
            reason_code: "offline_sync.sequence_gap",
            reason: "Offline attendance evidence was received out of sequence and requires review.",
            server_received_at: "2026-07-18T07:05:00.000Z",
            payroll_eligible: false,
            processed_at: "2026-07-18T07:05:05.000Z",
          },
          client_event_id: "internal-client-event",
          registered_device_id: "internal-device",
          installation_id_hash: "internal-installation",
          raw_payload: { coordinates: [72.8777, 19.076] },
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
            {
              operation: "replace",
              event_type: "check_out",
              occurred_at: "2026-07-18T12:30:00.000Z",
              target_punch: {
                event_type: "check_out",
                occurred_at: "2026-07-18T12:45:00.000Z",
                latitude: 19.076,
              },
              relationship: "requested",
            },
            {
              operation: "void",
              event_type: null,
              occurred_at: null,
              target_punch: {
                event_type: "check_in",
                occurred_at: "2026-07-18T03:25:00.000Z",
                command_id: "internal-command",
              },
              relationship: "requested",
            },
          ],
        },
      ],
      raw_payload: { coordinates: [72.8777, 19.076] },
    } as unknown as EmployeeAttendanceDayEvidence);

    expect(view?.summarySources.map((source) => source.label)).toEqual([
      "Employee attendance punch",
      "Mobile - captured offline",
      "Approved regularization",
    ]);
    expect(view?.events.map((event) => event.eventLabel)).toEqual([
      "Check-in",
      "Break start",
      "Check-out",
    ]);
    expect(view?.events[0]).toMatchObject({
      decisionLabel: "Accepted",
      reasonCode: "unknown_future_reason",
      reasonText: "Attendance decision recorded.",
      regularizationLabel: "Added by Approved regularization",
    });
    expect(view?.events[1]).toMatchObject({
      sourceLabel: "Mobile - captured offline",
      badgeStatus: "review_required",
      decisionLabel: "Review required",
      reasonCode: "offline_sync.sequence_gap",
      reasonText: "Offline attendance evidence was received out of sequence and requires review.",
      offline: {
        syncStatus: "deferred",
        syncLabel: "Deferred",
        verificationStatus: "review_required",
        verificationLabel: "Review required",
      },
    });
    expect(view?.events[2]).toMatchObject({
      sourceLabel: "Web attendance with location",
      reasonCode: "geo_inside_fence",
      reasonText: "Your location was within an allowed work area.",
      geoLabel: "Inside work area - Bhubaneswar Office",
    });
    expect(view?.regularizations[0]).toMatchObject({
      statusLabel: "Approved",
      operationsLabel: "Add missing punch",
    });
    expect(view?.regularizations[0].items).toHaveLength(3);
    expect(view?.regularizations[0].items[0]).toMatchObject({
      operationLabel: "Add missing punch",
    });
    expect(view?.regularizations[0].items[1]).toMatchObject({
      operationLabel: "Replace punch",
    });
    expect(view?.regularizations[0].items[1].targetPunchLabel).toContain("Check-out");
    expect(view?.regularizations[0].items[1].requestedPunchLabel).toContain("Check-out");
    expect(view?.regularizations[0].items[2]).toMatchObject({
      operationLabel: "Remove punch",
      requestedPunchLabel: null,
    });
    expect(view?.regularizations[0].items[2].targetPunchLabel).toContain("Check-in");

    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("19.076");
    expect(serialized).not.toContain("72.8777");
    expect(serialized).not.toContain("coordinates");
    expect(serialized).not.toContain("command_id");
    expect(serialized).not.toContain("internal-command");
    expect(serialized).not.toContain("client_event_id");
    expect(serialized).not.toContain("internal-client-event");
    expect(serialized).not.toContain("registered_device_id");
    expect(serialized).not.toContain("internal-device");
    expect(serialized).not.toContain("installation_id_hash");
    expect(serialized).not.toContain("internal-installation");
    expect(serialized).not.toContain("payroll_eligible");
    expect(serialized).not.toContain("processed_at");
    expect(serialized).not.toContain("raw_payload");
  });
});
