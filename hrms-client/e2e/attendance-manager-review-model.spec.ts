import { expect, test } from "@playwright/test";
import {
  attendanceDecisionRemarksError,
  parseAttendanceReviewQueue,
} from "../src/domains/attendance/manager-review-model";

test.describe("attendance manager review model", () => {
  test("maps normalized regularization items and queue metadata", () => {
    const queue = parseAttendanceReviewQueue({
      items: [
        {
          id: "reg-101",
          employee: {
            full_name: "Pratik Sharma",
            employee_code: "EMP-101",
          },
          work_date: "2026-07-18",
          reason: "The office check-out was not recorded.",
          status: "pending",
          version: 4,
          can_decide: true,
          allowed_decisions: ["approve", "return", "reject"],
          created_at: "2026-07-19T08:30:00.000Z",
          items: [
            {
              id: "item-2",
              ordinal: 2,
              operation: "replace",
              target_punch_event_id: "punch-private",
              target_punch: {
                event_type: "check_out",
                occurred_at: "2026-07-18T12:20:00.000Z",
                latitude: 19.076,
                command_id: "internal-command",
              },
              event_type: "check_out",
              occurred_at: "2026-07-18T12:30:00.000Z",
            },
            {
              id: "item-1",
              ordinal: 1,
              operation: "void",
              target_punch_event_id: "punch-duplicate",
              target_punch: {
                event_type: "check_in",
                occurred_at: "2026-07-18T03:42:00.000Z",
                longitude: 72.8777,
              },
            },
          ],
        },
      ],
      page: 1,
      page_size: 20,
      total: 1,
      queue_counts: {
        total: 7,
        pending: 1,
        approved: 3,
        returned: 2,
        rejected: 1,
      },
    });

    expect(queue).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      counts: {
        total: 7,
        pending: 1,
        approved: 3,
        returned: 2,
        rejected: 1,
      },
    });
    expect(queue.items[0]).toMatchObject({
      id: "reg-101",
      employeeName: "Pratik Sharma",
      employeeCode: "EMP-101",
      workDate: "2026-07-18",
      status: "pending",
      version: 4,
      canDecide: true,
      allowedDecisions: ["approve", "return", "reject"],
      exactLocationAccess: { state: "unavailable" },
    });
    expect(queue.items[0].regularizationItems).toHaveLength(2);
    expect(queue.items[0].regularizationItems[0]).toMatchObject({
      operation: "void",
      operationLabel: "Remove punch",
      requestedPunchLabel: null,
    });
    expect(queue.items[0].regularizationItems[0].targetPunchLabel).toContain("Check-in");
    expect(queue.items[0].regularizationItems[1]).toMatchObject({
      operation: "replace",
      operationLabel: "Replace punch",
    });
    expect(queue.items[0].regularizationItems[1].targetPunchLabel).toContain("Check-out");
    expect(queue.items[0].regularizationItems[1].requestedPunchLabel).toContain("Check-out");
    expect(queue.items[0].evidence).toEqual([
      expect.objectContaining({
        id: "item-1",
        operation: "void",
        title: "Remove punch",
        detail:
          "This punch remains in attendance history and is excluded from attendance calculations if approved.",
        occurredAt: null,
      }),
      expect.objectContaining({
        id: "item-2",
        operation: "replace",
        title: "Replace punch",
        detail: null,
        occurredAt: "2026-07-18T12:30:00.000Z",
      }),
    ]);
    const serialized = JSON.stringify(queue);
    expect(serialized).not.toContain("punch-private");
    expect(serialized).not.toContain("punch-duplicate");
    expect(serialized).not.toContain("19.076");
    expect(serialized).not.toContain("72.8777");
    expect(serialized).not.toContain("internal-command");
  });

  test("supports the legacy requested-punches contract", () => {
    const queue = parseAttendanceReviewQueue({
      items: [
        {
          id: "legacy-1",
          employee: "Legacy Employee",
          employee_code: "EMP-OLD",
          work_date: "2026-07-01",
          reason: "Missing check-in",
          status: "approved",
          version: 2,
          requested_punches: [
            {
              event_type: "check_in",
              occurred_at: "2026-07-01T03:30:00.000Z",
            },
          ],
        },
      ],
    });

    expect(queue.items[0]).toMatchObject({
      employeeName: "Legacy Employee",
      employeeCode: "EMP-OLD",
      status: "approved",
      canDecide: false,
      allowedDecisions: [],
    });
    expect(queue.items[0].regularizationItems[0]).toMatchObject({
      operation: "add",
      operationLabel: "Add missing punch",
    });
    expect(queue.items[0].evidence[0]).toMatchObject({
      operation: "add",
      title: "Add missing punch",
      occurredAt: "2026-07-01T03:30:00.000Z",
    });
  });

  test("uses explicit can_decide false instead of pending/version fallback", () => {
    const queue = parseAttendanceReviewQueue({
      items: [
        {
          id: "self-owned",
          employee: { full_name: "Self Reviewer", employee_code: "EMP-SELF" },
          work_date: "2026-07-18",
          reason: "Own pending correction",
          status: "pending",
          version: 4,
          can_decide: false,
          allowed_decisions: [],
          items: [
            {
              id: "item-1",
              ordinal: 1,
              operation: "add",
              event_type: "check_in",
              occurred_at: "2026-07-18T03:30:00.000Z",
            },
          ],
        },
      ],
    });

    expect(queue.items[0]).toMatchObject({
      status: "pending",
      version: 4,
      canDecide: false,
      allowedDecisions: [],
    });
    expect(queue.items[0].regularizationItems[0]).toMatchObject({
      operationLabel: "Add missing punch",
    });
  });

  test("completed regularization states are never actionable", () => {
    const queue = parseAttendanceReviewQueue({
      items: ["approved", "returned", "rejected"].map((status) => ({
        id: `completed-${status}`,
        employee: { full_name: "Completed Reviewer", employee_code: "EMP-DONE" },
        work_date: "2026-07-18",
        reason: `${status} correction`,
        status,
        version: 4,
        can_decide: true,
        allowed_decisions: ["approve", "return", "reject"],
        decision_remarks: "Decision note",
        items: [
          {
            id: `item-${status}`,
            ordinal: 1,
            operation: "add",
            event_type: "check_in",
            occurred_at: "2026-07-18T03:30:00.000Z",
          },
        ],
      })),
    });

    expect(queue.items.map((item) => item.status)).toEqual(["approved", "returned", "rejected"]);
    expect(queue.items.every((item) => item.canDecide === false)).toBe(true);
    expect(queue.items.every((item) => item.allowedDecisions.length === 0)).toBe(true);
  });

  test("whitelists location evidence and discards raw coordinates", () => {
    const queue = parseAttendanceReviewQueue({
      items: [
        {
          id: "geo-1",
          employee: { full_name: "Scoped Employee", employee_code: "EMP-GEO" },
          status: "pending",
          version: 1,
          latitude: 19.076,
          longitude: 72.8777,
          geo_evidence_summary: {
            source: "geo",
            outcome: "outside_confident",
            review_type: "manual_fallback",
            reason_code: "geo_boundary_uncertain",
            attendance_action: "check_in",
            captured_at: "2026-07-18T03:35:00.000Z",
            accuracy_meters: 86,
            evidence_age_ms: 72_000,
            signed_margin_meters: -35,
            work_site_name: "Bhubaneswar Office",
            latitude: 19.076,
            longitude: 72.8777,
            raw_coordinates: "19.076,72.8777",
          },
        },
      ],
    });

    expect(queue.items[0].evidence).toContainEqual({
      id: "geo-summary",
      operation: "geo",
      title: "Outside work area - Manual fallback",
      detail: "Reason: Geo Boundary Uncertain",
      detailLines: [
        "Action: Check-in",
        "The reported location was outside the configured attendance boundary.",
        "Reported accuracy: 86 m",
        "Evidence age: 1 min",
        "Boundary margin: -35 m",
        "Work site: Bhubaneswar Office",
      ],
      occurredAt: "2026-07-18T03:35:00.000Z",
    });
    expect(queue.items[0]).toMatchObject({
      geoReviewType: "manual_fallback",
      geoOutcome: "outside_confident",
    });

    const renderedModel = JSON.stringify(queue);
    expect(renderedModel).not.toContain("19.076");
    expect(renderedModel).not.toContain("72.8777");
    expect(renderedModel).not.toContain("raw_coordinates");
  });

  test("parses exact-location access capability without retaining coordinates", () => {
    const queue = parseAttendanceReviewQueue({
      items: [
        {
          id: "geo-authorized",
          kind: "geo_fallback",
          employee: { full_name: "Authorized Reviewer", employee_code: "EMP-AUTH" },
          status: "pending",
          version: 1,
          exact_location_access: {
            state: "available_authorized",
            latitude: 19.076,
            longitude: 72.8777,
          },
        },
        {
          id: "geo-restricted",
          kind: "geo_fallback",
          status: "pending",
          version: 1,
          exact_location_access: { state: "available_restricted" },
        },
        {
          id: "geo-unavailable",
          kind: "geo_fallback",
          status: "pending",
          version: 1,
          exact_location_access: { state: "unexpected", coordinates: "19.076,72.8777" },
        },
      ],
    });

    expect(queue.items.map((item) => item.exactLocationAccess.state)).toEqual([
      "available_authorized",
      "available_restricted",
      "unavailable",
    ]);
    const renderedModel = JSON.stringify(queue);
    expect(renderedModel).not.toContain("19.076");
    expect(renderedModel).not.toContain("72.8777");
    expect(renderedModel).not.toContain("coordinates");
  });

  test("fails closed for malformed rows and validates decision remarks", () => {
    const queue = parseAttendanceReviewQueue({
      items: [
        { employee: "Missing identifier", status: "pending", version: 1 },
        { id: "no-version", status: "unexpected-status", version: 0 },
      ],
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({
      id: "no-version",
      status: "pending",
      canDecide: false,
    });
    expect(attendanceDecisionRemarksError("approve", "")).toBeNull();
    expect(attendanceDecisionRemarksError("return", " ")).toContain("required");
    expect(attendanceDecisionRemarksError("reject", "Insufficient evidence")).toBeNull();
    expect(attendanceDecisionRemarksError("approve", "a".repeat(1001))).toContain("1,000");
  });
});
