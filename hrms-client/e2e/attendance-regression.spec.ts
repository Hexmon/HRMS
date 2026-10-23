import { expect, test, type Page } from "@playwright/test";
import {
  attendanceSummary,
  expectCanonicalPunchRequest,
  managerQueueResponse,
  openAttendance,
  prepareAttendancePage,
  previousLocalDate,
  punchCommand,
  transitionFor,
  type CapturedPunch,
  type ManualSessionState,
} from "./attendance-regression.helpers";

test.setTimeout(120_000);

test("completes check-in, break, resume, and check-out using server context", async ({ page }) => {
  await prepareAttendancePage(page);
  let state: ManualSessionState = "not_started";
  const punches: CapturedPunch[] = [];

  await page.route("**/api/v1/attendance/summary/my**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attendanceSummary(state)),
    });
  });
  await page.route("**/api/v1/attendance/punches", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    punches.push({
      body,
      idempotencyKey: route.request().headers()["idempotency-key"],
    });
    state = transitionFor(String(punchCommand(body).event_type));
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await openAttendance(page);

  await completeAction(page, "Clock in", "Clock-in recorded", "Start break");
  await completeAction(page, "Start break", "Break started", "Resume work");
  await completeAction(page, "Resume work", "Work resumed", "Clock out");
  await page.getByRole("button", { name: "Clock out" }).click();

  await expect(page.getByText("Clock-out recorded", { exact: true })).toBeVisible();
  await expect(page.getByText("Your work session has ended.", { exact: true })).toBeVisible();
  expect(punches.map(({ body }) => punchCommand(body))).toEqual([
    punchCommandBody("check_in"),
    punchCommandBody("break_start"),
    punchCommandBody("break_end"),
    punchCommandBody("check_out"),
  ]);
  punches.forEach((punch) => expectCanonicalPunchRequest(punch));
  expect(punches.every(({ idempotencyKey }) => Boolean(idempotencyKey))).toBe(true);
  expect(new Set(punches.map(({ idempotencyKey }) => idempotencyKey)).size).toBe(4);
});

test("retries an uncertain punch with the same request identity", async ({ page }) => {
  await prepareAttendancePage(page);
  let state: ManualSessionState = "not_started";
  const punches: CapturedPunch[] = [];

  await page.route("**/api/v1/attendance/summary/my**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attendanceSummary(state)),
    });
  });
  await page.route("**/api/v1/attendance/punches", async (route) => {
    punches.push({
      body: route.request().postDataJSON() as Record<string, unknown>,
      idempotencyKey: route.request().headers()["idempotency-key"],
    });
    if (punches.length === 1) {
      await route.abort("connectionfailed");
      return;
    }
    state = "open";
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in" }).click();

  await expect(page.getByText("Outcome not confirmed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry same action" }).click();
  await expect(page.getByText("Clock-in recorded", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start break" })).toBeVisible();
  expect(punches).toHaveLength(2);
  expect(punches[1]).toEqual(punches[0]);
  expectCanonicalPunchRequest(punches[0], punchCommandBody("check_in"));
});

test("shows a deterministic punch rejection and keeps the valid action available", async ({
  page,
}) => {
  await prepareAttendancePage(page);
  let requests = 0;

  await page.route("**/api/v1/attendance/summary/my**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attendanceSummary("not_started")),
    });
  });
  await page.route("**/api/v1/attendance/punches", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        code: "PUNCH_WINDOW_CLOSED",
        message: "The configured clock-in window is closed.",
      }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in" }).click();

  await expect(page.getByText("Clock-in was not recorded", { exact: true })).toBeVisible();
  await expect(page.getByText("The configured clock-in window is closed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clock in" })).toBeEnabled();
  expect(requests).toBe(1);
});

for (const path of ["/attendance", "/dashboard"]) {
  for (const geoPolicy of [
    { allowed: true, factual_outcome: "not_required", reason_code: "geo_not_required" },
    { allowed: true, factual_outcome: "inside_confident", reason_code: "geo_inside_fence" },
    {
      allowed: true,
      factual_outcome: "missing",
      selected_action: "manual_fallback",
      fallback_used: true,
      reason_code: "geo_manual_fallback_allowed",
    },
  ]) {
    test(`shows the attendance conflict despite ${geoPolicy.reason_code} on ${path}`, async ({
      page,
    }) => {
      await prepareAttendancePage(page);
      let state: ManualSessionState = "not_started";
      let requests = 0;
      await page.route("**/api/v1/attendance/summary/my**", async (route) => {
        await route.fulfill({ json: attendanceSummary(state) });
      });
      await page.route("**/api/v1/attendance/punches", async (route) => {
        requests += 1;
        state = "open";
        await route.fulfill({
          status: 409,
          json: {
            code: "CONFLICT",
            message: "The employee already has an open attendance session.",
            details: {
              reason_code: "already_checked_in",
              next_allowed_actions: ["break_start", "check_out"],
              geo_policy: geoPolicy,
            },
          },
        });
      });

      await openAttendance(page, path);
      await page.getByRole("button", { name: "Clock in", exact: true }).click();

      const result = page.getByRole("alert").filter({ hasText: "Clock-in was not recorded" });
      await expect(result).toBeVisible();
      await expect(result).toContainText("The employee already has an open attendance session.");
      await expect(result.getByText("Rejected", { exact: true })).toBeVisible();
      await expect(result).not.toContainText("Your punch was recorded");
      await expect(page.getByRole("button", { name: "Clock in", exact: true })).toBeHidden();
      await expect(page.getByRole("button", { name: "Clock out", exact: true })).toBeEnabled();
      expect(requests).toBe(1);
    });
  }
}

test("submits a normalized historical regularization request", async ({ page }) => {
  await prepareAttendancePage(page);
  const workDate = previousLocalDate();
  let submittedBody: Record<string, unknown> | undefined;
  const targetPunches = [
    {
      id: "punch-check-in",
      event_type: "check_in",
      occurred_at: `${workDate}T03:42:00.000Z`,
      work_date: workDate,
      time: "09:12",
      source: "web",
    },
    {
      id: "punch-check-out",
      event_type: "check_out",
      occurred_at: `${workDate}T12:20:00.000Z`,
      work_date: workDate,
      time: "17:50",
      source: "web",
    },
  ];

  await page.route("**/api/v1/attendance/summary/my**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attendanceSummary("not_started")),
    });
  });
  await page.route("**/api/v1/attendance/punches/my**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: targetPunches,
        page: 1,
        page_size: 100,
        total: targetPunches.length,
      }),
    });
  });
  await page.route("**/api/v1/attendance/regularizations", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    const items = submittedBody.items as Array<Record<string, unknown>>;
    const targetSummaryById = new Map(
      targetPunches.map((punch) => [
        punch.id,
        { event_type: punch.event_type, occurred_at: punch.occurred_at },
      ]),
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "regularization-created-1",
        work_date: submittedBody.work_date,
        reason: submittedBody.reason,
        status: "pending",
        version: 1,
        approver: { full_name: "Reporting Manager" },
        items: items.map((item, index) => ({
          ...item,
          id: `created-item-${index + 1}`,
          ordinal: index + 1,
          target_punch_event_id: item.target_punch_event_id ?? null,
          target_punch: item.target_punch_event_id
            ? targetSummaryById.get(String(item.target_punch_event_id))
            : null,
        })),
      }),
    });
  });

  await openAttendance(page);
  await page.getByLabel("Attendance date").fill(workDate);
  await page.getByLabel("Reason").fill("Missed check-in after an approved client visit.");
  await page.getByTestId("regularization-time-1").fill("09:15");
  await page.getByRole("button", { name: "Add action" }).click();
  await page.getByTestId("regularization-operation-2").click();
  await page.getByRole("option", { name: "Replace punch" }).click();
  await page.getByTestId("regularization-target-2").click();
  await page.getByRole("option", { name: /Check-in at 09:12/u }).click();
  await page.getByTestId("regularization-time-2").fill("09:00");
  await page.getByRole("button", { name: "Add action" }).click();
  await page.getByTestId("regularization-operation-3").click();
  await page.getByRole("option", { name: "Remove punch" }).click();
  await page.getByTestId("regularization-target-3").click();
  await page.getByRole("option", { name: /Check-out at 17:50/u }).click();
  await page.getByTestId("attendance-regularization-submit").click();

  const submittedPanel = page.getByTestId("attendance-regularization-submitted");
  await expect(submittedPanel).toBeVisible();
  await expect(
    submittedPanel.getByRole("heading", { name: "Regularization request submitted" }),
  ).toBeVisible();
  expect(submittedBody).toBeDefined();
  const requestBody = submittedBody as Record<string, unknown>;
  expect(requestBody).toMatchObject({
    work_date: workDate,
    reason: "Missed check-in after an approved client visit.",
    items: [
      { operation: "add", event_type: "check_in" },
      {
        operation: "replace",
        target_punch_event_id: "punch-check-in",
        event_type: "check_in",
      },
      { operation: "void", target_punch_event_id: "punch-check-out" },
    ],
  });
  expect(requestBody).not.toHaveProperty("requested_punches");
  const submittedItems = requestBody.items as Array<Record<string, unknown>>;
  expect(String(submittedItems[0].occurred_at)).toContain(workDate);
  expect(String(submittedItems[1].occurred_at)).toContain(workDate);
  expect(submittedItems[2]).not.toHaveProperty("event_type");
  expect(submittedItems[2]).not.toHaveProperty("occurred_at");
  await expect(submittedPanel.getByText("1. Add missing punch", { exact: true })).toBeVisible();
  await expect(submittedPanel.getByText("2. Replace punch", { exact: true })).toBeVisible();
  await expect(submittedPanel.getByText("3. Remove punch", { exact: true })).toBeVisible();
  await expect(submittedPanel.getByText("Original").first()).toBeVisible();
  await expect(submittedPanel.getByText("Requested").first()).toBeVisible();
});

test("shows employee day evidence on the attendance calendar without raw coordinates", async ({
  page,
}) => {
  await prepareAttendancePage(page);
  const today = new Date();
  const workDate = localIsoDate(today);
  const month = workDate.slice(0, 7);
  const dayRecord = {
    work_date: workDate,
    status: "present",
    in_time: "09:10",
    out_time: "18:00",
    hours: "8h 50m",
    work_minutes: 530,
    detail: "8h 50m",
  };

  await page.route("**/api/v1/attendance/calendar/monthly**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        month,
        calendar_days: [dayRecord],
        summary: { present: 1, wfh: 0, late: 0, absent: 0, leave: 0, holiday: 0 },
      }),
    });
  });
  await page.route("**/api/v1/attendance/calendar/daily**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [dayRecord],
        page: 1,
        page_size: 1,
        total: 1,
        self_evidence: {
          generated_at: new Date().toISOString(),
          date: workDate,
          day: {
            ...dayRecord,
            day_classification: "working_day",
            presence_state: "present",
            punctuality_state: "on_time",
            evidence_state: "complete",
            approval_kind: "regularization",
            approval_state: "approved",
            payroll_state: "unprocessed",
            regularization_status: "approved",
            break_minutes: 30,
          },
          summary_sources: [
            { type: "employee_punch", label: "Employee attendance punch" },
            { type: "approved_regularization", label: "Approved regularization" },
          ],
          events: [
            {
              event_type: "check_in",
              occurred_at: `${workDate}T03:40:00.000Z`,
              time: "09:10",
              source: "admin",
              origin: "approved_regularization",
              work_mode: "office",
              decision: { outcome: "passed", reason_codes: ["geo_not_required"], reason: null },
              geo: {
                outcome: "not_required",
                reason_code: "geo_not_required",
                selected_action: "allow",
                work_site_name: null,
                work_site_type: null,
              },
              regularization: {
                status: "approved",
                operation: "add",
                relationship: "added",
                reason: "Missed check-in after client meeting.",
                decided_at: `${workDate}T08:30:00.000Z`,
                applied_at: `${workDate}T08:30:00.000Z`,
              },
            },
            {
              event_type: "check_out",
              occurred_at: `${workDate}T12:30:00.000Z`,
              time: "18:00",
              source: "web_geo",
              origin: "employee_manual_now",
              work_mode: "office",
              decision: { outcome: "allowed", reason_codes: ["geo_inside_fence"], reason: null },
              geo: {
                outcome: "inside_confident",
                reason_code: "geo_inside_fence",
                selected_action: "allow",
                work_site_name: "Bhubaneswar Office",
                work_site_type: "office",
              },
              regularization: null,
            },
          ],
          regularizations: [
            {
              status: "approved",
              reason: "Missed check-in after client meeting.",
              created_at: `${workDate}T04:30:00.000Z`,
              updated_at: `${workDate}T08:30:00.000Z`,
              decided_at: `${workDate}T08:30:00.000Z`,
              operations: ["add"],
              items: [
                {
                  operation: "add",
                  event_type: "check_in",
                  occurred_at: `${workDate}T03:40:00.000Z`,
                  relationship: "applied",
                },
                {
                  operation: "replace",
                  event_type: "check_out",
                  occurred_at: `${workDate}T12:30:00.000Z`,
                  target_punch: {
                    event_type: "check_out",
                    occurred_at: `${workDate}T12:45:00.000Z`,
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
                    occurred_at: `${workDate}T03:25:00.000Z`,
                    longitude: 72.8777,
                  },
                  relationship: "requested",
                },
              ],
            },
          ],
        },
      }),
    });
  });

  await openAttendance(page, "/attendance/calendar");

  const panel = page.getByTestId("employee-day-evidence");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Employee attendance punch", { exact: true })).toBeVisible();
  await expect(panel.getByText("Approved regularization", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText("Check-in", { exact: true })).toBeVisible();
  await expect(panel.getByText("Reason code: geo_not_required")).toBeVisible();
  await expect(panel.getByText("Check-out", { exact: true })).toBeVisible();
  await expect(panel.getByText("Reason code: geo_inside_fence")).toBeVisible();
  await expect(
    panel.getByText("Location check: Inside work area - Bhubaneswar Office"),
  ).toBeVisible();
  await expect(panel.getByText("1. Add missing punch", { exact: true })).toBeVisible();
  await expect(panel.getByText("2. Replace punch", { exact: true })).toBeVisible();
  await expect(panel.getByText("3. Remove punch", { exact: true })).toBeVisible();
  await expect(panel.getByText("Original").first()).toBeVisible();
  await expect(panel.getByText("Requested").first()).toBeVisible();

  const rendered = await page.locator("body").innerText();
  expect(rendered).not.toMatch(/latitude|longitude|coordinates/i);
  expect(rendered).not.toContain("19.076");
  expect(rendered).not.toContain("72.8777");
  expect(rendered).not.toContain("command_id");
});

test("manager reviews and approves an assigned correction", async ({ page }) => {
  await prepareAttendancePage(page, "Reviewer");
  let includeRequest = true;
  let decisionBody: Record<string, unknown> | undefined;

  await page.route("**/api/v1/attendance/regularizations/queue/manager**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(managerQueueResponse(includeRequest)),
    });
  });
  await page.route(
    "**/api/v1/attendance/regularizations/regularization-review-1/decision",
    async (route) => {
      decisionBody = route.request().postDataJSON() as Record<string, unknown>;
      includeRequest = false;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "regularization-review-1", status: "approved", version: 5 }),
      });
    },
  );

  await openAttendance(page, "/attendance/approvals");
  await expect(page.getByRole("heading", { name: "Manager review queue" })).toBeVisible();
  await page
    .getByRole("table")
    .getByText("Missed check-in after client meeting", { exact: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Scoped Employee" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Requested corrections" })).toBeVisible();
  await expect(page.getByText("1. Add missing punch", { exact: true })).toBeVisible();
  await expect(page.getByText("2. Replace punch", { exact: true })).toBeVisible();
  await expect(page.getByText("3. Remove punch", { exact: true })).toBeVisible();
  await expect(page.getByText("Original").first()).toBeVisible();
  await expect(page.getByText("Requested").first()).toBeVisible();
  await page
    .getByRole("button", {
      name: /^Approve attendance review for Scoped Employee on .+$/u,
    })
    .click();
  await page.getByRole("button", { name: "Approve request", exact: true }).click();

  await expect(page.getByText("Approve request completed", { exact: true })).toBeVisible();
  expect(decisionBody).toEqual({ decision: "approve", expected_version: 4 });
  await expect(
    page.getByRole("table").getByText("Missed check-in after client meeting", { exact: true }),
  ).toHaveCount(0);
});

test("manager detail hides decisions when can_decide is false", async ({ page }) => {
  await prepareAttendancePage(page, "Reviewer");
  const workDate = previousLocalDate();

  await page.route("**/api/v1/attendance/regularizations/queue/manager**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "self-owned-review",
            employee: {
              full_name: "Scoped Employee",
              employee_code: "EMP-SELF",
            },
            work_date: workDate,
            reason: "Own pending correction",
            status: "pending",
            version: 4,
            can_decide: false,
            allowed_decisions: [],
            created_at: new Date().toISOString(),
            items: [
              {
                id: "self-owned-item-1",
                ordinal: 1,
                operation: "add",
                target_punch_event_id: null,
                event_type: "check_in",
                occurred_at: `${workDate}T03:30:00.000Z`,
                target_punch: null,
              },
            ],
          },
        ],
        page: 1,
        page_size: 20,
        total: 1,
        queue_counts: { total: 1, pending: 1, approved: 0, returned: 0, rejected: 0 },
      }),
    });
  });

  await openAttendance(page, "/attendance/approvals");
  await page.getByRole("table").getByText("Own pending correction", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Scoped Employee" })).toBeVisible();
  await expect(page.getByText("Add missing punch", { exact: true })).toBeVisible();
  await expect(page.getByText("Decision actions are unavailable for this request.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve attendance review/u })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Return attendance review/u })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Reject attendance review/u })).toHaveCount(0);
});

test("manager queue exposes a recoverable loading error", async ({ page }) => {
  await prepareAttendancePage(page, "Reviewer");
  let requests = 0;
  await page.route("**/api/v1/attendance/regularizations/queue/manager**", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "ATTENDANCE_QUEUE_UNAVAILABLE",
        message: "The attendance review queue is temporarily unavailable.",
      }),
    });
  });

  await openAttendance(page, "/attendance/approvals");

  await expect(page.getByText("Review queue unavailable", { exact: true })).toBeVisible();
  await expect(
    page.getByText("The attendance review queue is temporarily unavailable."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => requests).toBeGreaterThan(1);
});

async function completeAction(
  page: Page,
  action: string,
  result: string,
  nextAction: string,
): Promise<void> {
  await page.getByRole("button", { name: action, exact: true }).click();
  await expect(page.getByText(result, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: nextAction, exact: true })).toBeVisible();
}

function punchCommandBody(eventType: string): Record<string, unknown> {
  return {
    event_type: eventType,
    source: "web",
    metadata: { source_view: "attendance_page" },
  };
}

function localIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
