import { expect, test, type Page } from "@playwright/test";
import {
  attendanceSummary,
  openAttendance,
  prepareAttendancePage,
  punchCommand,
} from "./attendance-regression.helpers";
import { mockGeolocationPermissionDenied } from "./helpers/mock-geolocation";

test.describe("attendance mobile responsive polish", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("employee punch denial fallback and regularization stay usable on mobile", async ({
    page,
  }) => {
    await prepareAttendancePage(page);
    await mockGeolocationPermissionDenied(page);
    const workDate = previousLocalDate();
    let punchBody: Record<string, unknown> | undefined;
    let fallbackCalls = 0;
    let regularizationBody: Record<string, unknown> | undefined;

    await page.route("**/api/v1/attendance/summary/my**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          attendanceSummary("not_started", {
            attendance_mode: "geo_required",
            fallback_approval_mode: "approval_required",
            permission_denied_action: "manual_fallback",
            location_unavailable_action: "manual_fallback",
            outside_fence_action: "deny",
            max_location_age_ms: 60_000,
            max_accuracy_meters: 50,
          }),
        ),
      });
    });
    await page.route("**/api/v1/attendance/punches", async (route) => {
      punchBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          code: "ATTENDANCE_PUNCH_DENIED",
          message: "Location permission requires manual fallback review.",
          details: {
            reason_code: "geo_permission_denied",
            geo_policy: {
              factual_outcome: "permission_denied",
              selected_action: "manual_fallback",
              fallback_used: true,
              allowed: true,
              reason_code: "geo_permission_denied",
            },
            manual_fallback: {
              available: true,
              review_required: true,
              reference: "mobile-permission-denied",
              reason_code: "geo_permission_denied",
            },
          },
        }),
      });
    });
    await page.route(
      "**/api/v1/attendance/geo-fallbacks/mobile-permission-denied/submit",
      async (route) => {
        fallbackCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            geo_policy: {
              factual_outcome: "permission_denied",
              selected_action: "manual_fallback",
              fallback_used: true,
              allowed: true,
              reason_code: "geo_permission_denied",
            },
            manual_fallback: {
              submitted: true,
              review_required: true,
              review_id: "mobile-permission-denied-review",
            },
          }),
        });
      },
    );
    await page.route("**/api/v1/attendance/regularizations", async (route) => {
      regularizationBody = route.request().postDataJSON() as Record<string, unknown>;
      const items = regularizationBody.items as Array<Record<string, unknown>>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "mobile-regularization-created",
          work_date: regularizationBody.work_date,
          reason: regularizationBody.reason,
          status: "pending",
          version: 1,
          approver: { full_name: "Reporting Manager" },
          items: items.map((item, index) => ({
            ...item,
            id: `mobile-created-item-${index + 1}`,
            ordinal: index + 1,
            target_punch_event_id: null,
          })),
        }),
      });
    });

    await openAttendance(page);
    await expectNoHorizontalOverflow(page, "employee attendance initial");
    await page.getByRole("button", { name: "Clock in" }).click();
    await expect(page.getByRole("button", { name: "Continue manually" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "employee permission denied fallback");

    expect(punchBody).toBeDefined();
    const location = punchCommand(punchBody as Record<string, unknown>).location as Record<
      string,
      unknown
    >;
    expect(location).toMatchObject({ permission_state: "denied", provider: "browser" });
    expect(location).not.toHaveProperty("latitude");
    expect(location).not.toHaveProperty("longitude");

    await page.getByRole("button", { name: "Continue manually" }).click();
    await expect(page.getByText("Submitted for review", { exact: true })).toBeVisible();
    expect(fallbackCalls).toBe(1);
    await expectNoHorizontalOverflow(page, "employee manual fallback submitted");

    await page.getByLabel("Attendance date").fill(workDate);
    await page
      .getByLabel("Reason")
      .fill("Missed check-in after a client visit with an unusually long explanation.");
    await page.getByTestId("regularization-time-1").fill("09:15");
    await page.getByTestId("attendance-regularization-submit").click();
    await expect(page.getByTestId("attendance-regularization-submitted")).toBeVisible();
    await expectNoHorizontalOverflow(page, "employee regularization submitted");
    expect(regularizationBody).toMatchObject({
      work_date: workDate,
      reason: "Missed check-in after a client visit with an unusually long explanation.",
    });
  });

  test("employee calendar evidence wraps on mobile without raw coordinates", async ({ page }) => {
    await prepareAttendancePage(page);
    const workDate = localIsoDate(new Date());
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
          self_evidence: employeeEvidence(workDate),
        }),
      });
    });

    await openAttendance(page, "/attendance/calendar");
    const selectedDay = page.locator('[aria-pressed="true"]').first();
    await expect(selectedDay).toHaveAttribute("aria-current", "date");
    await expect(page.getByTestId("employee-day-evidence")).toBeVisible();
    await expect(
      page.getByText(
        "Location check: Inside work area - Bhubaneswar Office With An Extra Long Worksite Name",
      ),
    ).toBeVisible();
    await expect(page.getByText("2. Replace punch", { exact: true })).toBeVisible();
    await expect(page.getByText("3. Remove punch", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, "employee calendar evidence");

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/latitude|longitude|coordinates/i);
    expect(bodyText).not.toContain("19.076");
    expect(bodyText).not.toContain("72.8777");
  });

  test("manager mobile review sheet and exact-location dialog avoid overflow", async ({ page }) => {
    await prepareAttendancePage(page, "Reviewer");
    let revealCalls = 0;

    await page.route("**/api/v1/attendance/regularizations/queue/manager**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [],
          page: 1,
          page_size: 20,
          total: 0,
          queue_counts: { total: 0, pending: 0, approved: 0, returned: 0, rejected: 0 },
        }),
      });
    });
    await page.route("**/api/v1/attendance/geo-fallbacks/queue/manager**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [geoFallbackReview()],
          page: 1,
          page_size: 20,
          total: 1,
          queue_counts: { total: 1, pending: 1, approved: 0, returned: 0, rejected: 0 },
        }),
      });
    });
    await page.route(
      "**/api/v1/attendance/geo-fallbacks/mobile-geo-review/exact-location",
      async (route) => {
        revealCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            latitude: 12.974,
            longitude: 77.597,
            captured_at: "2026-07-18T03:35:00.000Z",
            accuracy_meters: 8,
          }),
        });
      },
    );

    await openAttendance(page, "/attendance/approvals");
    await page.getByText("Mobile Exact Employee").first().click();
    await expect(page.getByRole("dialog", { name: "Mobile Exact Employee" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "manager review sheet");
    await expect(page.getByText(/12\.974000|77\.597000|12\.974|77\.597/u)).toHaveCount(0);

    await page.getByRole("button", { name: "View exact location" }).click();
    const dialog = page.getByRole("dialog", { name: "View exact location?" });
    await expect(dialog).toBeVisible();
    await expectNoHorizontalOverflow(page, "exact location confirmation");
    expect(revealCalls).toBe(0);

    await dialog.getByRole("button", { name: "View exact location" }).click();
    await expect(dialog.getByText("12.974000", { exact: true })).toBeVisible();
    await expect(dialog.getByText("77.597000", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, "exact location revealed");
    expect(revealCalls).toBe(1);

    await dialog.getByRole("button", { name: "Close" }).first().click();
    await expect(page.getByText("12.974000", { exact: true })).toHaveCount(0);
    await expect(page.getByText("77.597000", { exact: true })).toHaveCount(0);
  });

  test("admin attendance overview, exceptions, and reports do not overflow on mobile", async ({
    page,
  }) => {
    await prepareAdminPage(page);
    await page.route("**/api/v1/attendance/summary/team**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(teamSummaryResponse()),
      });
    });
    await page.route("**/api/v1/attendance/exceptions**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(exceptionsResponse()),
      });
    });
    await page.route("**/api/v1/reports/attendance/summary**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(attendanceReportResponse()),
      });
    });

    await page.goto("/attendance", { waitUntil: "domcontentloaded" });
    await waitForWorkspace(page);
    await expect(page.getByText("Evidence state", { exact: true })).toBeVisible();
    await expect(page.getByText("Review required", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, "admin attendance overview");

    await page.goto("/attendance/exceptions", { waitUntil: "domcontentloaded" });
    await waitForWorkspace(page);
    await page.getByRole("tab", { name: "Missing punch-out" }).click();
    await expect(
      page.getByRole("button", {
        name: /Approve attendance exception for Mobile Exception Employee/u,
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "attendance exceptions");

    await page.goto("/reports/attendance", { waitUntil: "domcontentloaded" });
    await waitForWorkspace(page);
    await expect(page.getByRole("heading", { name: "Daily Attendance" })).toBeVisible();
    await expect(page.getByText("Mobile Report Employee").first()).toBeVisible();
    await expect(page.getByText("Review required", { exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, "attendance reports");
  });
});

async function prepareAdminPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("hawkaii_api_access_token", "attendance-mobile-admin-token");
  });
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        notifications: [],
        unread_count: 0,
        page: 1,
        page_size: 20,
        total: 0,
        total_pages: 0,
      }),
    });
  });
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "mobile-admin",
          employee_code: "ADM-001",
          email: "admin@example.test",
          full_name: "Mobile Admin",
          roles: ["Main Admin"],
        },
        active_role: { key: "Main Admin", label: "Main Admin", is_active: true },
        available_roles: [{ key: "Main Admin", label: "Main Admin", is_active: true }],
        permissions: [],
        setup_required: false,
      }),
    });
  });
}

async function waitForWorkspace(page: Page): Promise<void> {
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const result = await page.evaluate(() => ({
    rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(result.rootOverflow, `${label} root horizontal overflow`).toBeLessThanOrEqual(1);
  expect(result.bodyOverflow, `${label} body horizontal overflow`).toBeLessThanOrEqual(1);
}

function employeeEvidence(workDate: string): Record<string, unknown> {
  return {
    generated_at: new Date().toISOString(),
    date: workDate,
    day: {
      work_date: workDate,
      status: "present",
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
      {
        type: "approved_regularization",
        label: "Approved regularization with a long explanatory source label",
      },
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
          work_site_name: "Bhubaneswar Office With An Extra Long Worksite Name",
          work_site_type: "office",
        },
        regularization: null,
      },
    ],
    regularizations: [
      {
        status: "approved",
        reason: "Missed check-in after a client meeting with a long mobile wrapping reason.",
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
  };
}

function geoFallbackReview(): Record<string, unknown> {
  return {
    id: "mobile-geo-review",
    kind: "geo_fallback",
    review_type: "manual_fallback",
    geo_outcome: "outside_confident",
    employee: {
      full_name: "Mobile Exact Employee",
      employee_code: "EMP-MOB-GEO",
    },
    employee_name: "Mobile Exact Employee",
    employee_code: "EMP-MOB-GEO",
    work_date: "2026-07-18",
    reason:
      "Manual attendance fallback after location verification failed with a long manager review reason.",
    status: "pending",
    version: 1,
    created_at: "2026-07-18T03:36:00.000Z",
    items: [
      {
        id: "mobile-geo-review:fallback",
        ordinal: 0,
        operation: "add",
        target_punch_event_id: null,
        event_type: "check_in",
        occurred_at: "2026-07-18T03:35:00.000Z",
      },
    ],
    geo_evidence_summary: {
      source: "geo",
      review_type: "manual_fallback",
      outcome: "outside_confident",
      reason_code: "geo_outside_fence",
      reason: "Location was outside the configured work area.",
      captured_at: "2026-07-18T03:35:00.000Z",
      event_time: "2026-07-18T03:35:00.000Z",
      attendance_action: "check_in",
      selected_action: "manual_fallback",
      accuracy_meters: 8,
      distance_meters: 120,
      work_site_name: "Bengaluru Office With Long Name",
    },
    exact_location_access: { state: "available_authorized" },
  };
}

function teamSummaryResponse(): Record<string, unknown> {
  return {
    totals: {
      total: 2,
      present: 1,
      absent: 1,
      late: 1,
      early_out: 0,
      wfh: 0,
      on_leave: 0,
    },
    evidence_categories: {
      verified: 1,
      warning: 1,
      provisional: 1,
      review_required: 1,
      rejected: 0,
    },
    department_summary: [
      {
        department_id: "dept-mobile",
        name: "Mobile Operations Department With Long Name",
        present: 1,
        strength: 2,
        attendance_percent: 50,
      },
    ],
    exceptions: [
      {
        id: "mobile-exception-overview",
        employee: "Mobile Exception Employee",
        detail: "Missing punch-out with a very long description for wrapping",
        status: "pending",
      },
    ],
  };
}

function exceptionsResponse(): Record<string, unknown> {
  return {
    items: [
      {
        id: "EX-MOBILE-1",
        request_id: "regularization-mobile-exception",
        employee: "Mobile Exception Employee",
        date: previousLocalDate(),
        detail: "Missing punch-out after a client visit with a long row detail",
        status: "pending",
        exception_type: "missing_punch",
        expected_version: 1,
        can_decide: true,
      },
    ],
    totals: { late: 0, missing_punch: 1, absent: 0, correction: 0 },
    page: 1,
    page_size: 100,
    total: 1,
  };
}

function attendanceReportResponse(): Record<string, unknown> {
  return {
    items: [
      {
        id: "attendance-report-mobile-1",
        date: previousLocalDate(),
        employee: "Mobile Report Employee",
        department: "Mobile Reporting Department With Long Name",
        status: "late",
        reporting_evidence_category: "review_required",
        in_time: "09:42",
        out_time: "18:05",
        hours: 8.4,
        note: "Late with review-required evidence",
      },
    ],
    evidence_categories: {
      verified: 0,
      warning: 0,
      provisional: 0,
      review_required: 1,
      rejected: 0,
    },
    page: 1,
    page_size: 100,
    total: 1,
  };
}

function previousLocalDate(): string {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  return localIsoDate(value);
}

function localIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
