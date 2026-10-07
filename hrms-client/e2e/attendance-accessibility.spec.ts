import { expect, test, type Page } from "@playwright/test";
import {
  attendanceSummary,
  expectCanonicalPunchRequest,
  openAttendance,
  prepareAttendancePage,
  previousLocalDate,
  type CapturedPunch,
} from "./attendance-regression.helpers";
import { mockGeolocationPermissionDenied } from "./helpers/mock-geolocation";
import { expectNoDocumentHorizontalOverflow } from "./mobile-responsive/helpers";

const GEO_POLICY = {
  attendance_mode: "geo_required",
  fallback_approval_mode: "approval_required",
  location_unavailable_action: "deny",
  permission_denied_action: "manual_fallback",
  outside_fence_action: "deny",
  boundary_uncertain_action: "deny",
  stale_evidence_action: "deny",
  accuracy_exceeded_action: "deny",
  max_location_age_ms: 60_000,
  max_accuracy_meters: 50,
};

test.describe("attendance accessibility", () => {
  test("geo permission fallback can be completed with keyboard focus", async ({ page }) => {
    await prepareAttendancePage(page);
    await mockGeolocationPermissionDenied(page);
    await routeEmployeeAttendanceSummary(page, GEO_POLICY);

    const fallbackRequests: CapturedPunch[] = [];
    await page.route("**/api/v1/attendance/punches", async (route) => {
      const punch = {
        body: route.request().postDataJSON() as Record<string, unknown>,
        idempotencyKey: route.request().headers()["idempotency-key"],
      };
      expectCanonicalPunchRequest(punch, { event_type: "check_in", source: "web_geo" });
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify(
          geoDenialResponse({
            reasonCode: "geo_permission_denied",
            factualOutcome: "permission_denied",
            reference: "geo-a11y-fallback",
          }),
        ),
      });
    });
    await page.route(
      "**/api/v1/attendance/geo-fallbacks/geo-a11y-fallback/submit",
      async (route) => {
        fallbackRequests.push({
          body: route.request().postDataJSON() as Record<string, unknown>,
          idempotencyKey: route.request().headers()["idempotency-key"],
        });
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
              review_id: "geo-a11y-review",
              status: "pending",
              version: 1,
            },
          }),
        });
      },
    );

    await openAttendance(page);
    const clockIn = page.getByRole("button", { name: "Clock in", exact: true });
    await clockIn.focus();
    await expect(clockIn).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByText("Location access is blocked")).toBeVisible();
    await page.keyboard.press("Tab");
    const fallbackButton = page.getByRole("button", { name: "Continue manually" });
    await expect(fallbackButton).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByText("Submitted for review", { exact: true })).toBeVisible();
    expect(fallbackRequests).toHaveLength(1);
  });

  test("regularization controls are labeled and invalid fields receive focus", async ({ page }) => {
    const workDate = previousLocalDate();
    await prepareAttendancePage(page);
    await routeEmployeeAttendanceSummary(page);
    await routeRegularizationSupport(page, workDate);

    await openAttendance(page);
    await expect(page.getByLabel("Attendance date")).toBeVisible();
    await expect(page.getByLabel("Correction type")).toBeVisible();
    await expect(page.getByLabel("Reason")).toBeVisible();

    await page.getByLabel("Attendance date").fill(workDate);
    await page.getByLabel("Reason").fill("Forgot to correct the original punch.");
    await page.getByLabel("Correction type").click();
    await page.getByRole("option", { name: "Replace punch" }).click();
    await expect(page.getByLabel("Existing punch")).toBeVisible();
    await expect(page.getByLabel("Requested punch")).toBeVisible();
    await page.getByLabel("Requested time").fill("09:30");

    await page.getByRole("button", { name: "Submit request" }).click();

    const existingPunch = page.getByLabel("Existing punch");
    await expect(page.getByRole("alert")).toContainText("select a punch from the chosen date");
    await expect(existingPunch).toHaveAttribute("aria-invalid", "true");
    await expect(existingPunch).toHaveAttribute(
      "aria-describedby",
      /regularization-item-0-target-error/u,
    );
    await expect(page.locator("#regularization-item-0-target-error")).toContainText(
      "select a punch from the chosen date",
    );
    await expect(existingPunch).toBeFocused();
  });

  test("manager review actions have context and successful decisions restore queue focus", async ({
    page,
  }) => {
    const queueState = await prepareManagerReviewPage(page);
    const reviewDatePattern = String.raw`(?:Jan 15, 2026|15 Jan 2026)`;
    const reviewContextPattern = String.raw`attendance review for Aarav Sharma on ${reviewDatePattern}`;

    await page.goto("/attendance/approvals", { waitUntil: "domcontentloaded" });
    const queueHeading = page.getByRole("heading", { name: "Manager review queue" });
    await expect(queueHeading).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^Actions for ${reviewContextPattern}$`, "u"),
      }),
    ).toBeVisible();

    const row = page.getByRole("row", { name: /Aarav Sharma EMP-018/u });
    await row.focus();
    await expect(row).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { name: "Aarav Sharma" })).toBeVisible();
    const approve = page.getByRole("button", {
      name: new RegExp(`^Approve ${reviewContextPattern}$`, "u"),
    });
    await expect(approve).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^Return ${reviewContextPattern}$`, "u"),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^Reject ${reviewContextPattern}$`, "u"),
      }),
    ).toBeVisible();

    await approve.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Approve request" }).focus();
    await page.keyboard.press("Enter");

    await expect(queueHeading).toBeFocused();
    await expect(page.getByRole("status")).toContainText(
      new RegExp(`Attendance review for Aarav Sharma on ${reviewDatePattern} was approved.`, "u"),
    );
    expect(queueState.decisionRequests).toBe(1);
  });

  test("exact-location reveal has a labeled status result without changing authorization", async ({
    page,
  }) => {
    await prepareExactLocationPage(page);

    await page.goto("/attendance/approvals", { waitUntil: "domcontentloaded" });
    await page.getByRole("row", { name: /Exact Location Employee EMP-GEO/u }).click();
    await page.getByRole("button", { name: "View exact location" }).click();

    const dialog = page.getByRole("dialog", { name: "View exact location?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "View exact location" }).click();

    const result = dialog.getByRole("status", { name: "Exact location revealed" });
    await expect(result).toBeVisible();
    await expect(result).toContainText("12.974000");
    await expect(result).toContainText("77.597000");
  });

  test("attendance report filters and search expose programmatic labels at mobile width", async ({
    page,
  }) => {
    await prepareAttendanceReportPage(page);
    await page.setViewportSize({ width: 320, height: 568 });

    await page.goto("/reports/attendance", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Daily Attendance" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "From" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "To" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Department" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Employee" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Status" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Evidence state" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Team" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Search attendance records" })).toBeVisible();
    await expectNoDocumentHorizontalOverflow(page, "/reports/attendance accessibility");
  });
});

async function routeEmployeeAttendanceSummary(
  page: Page,
  punchPolicy: Record<string, unknown> = {},
): Promise<void> {
  await page.route("**/api/v1/attendance/summary/my**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attendanceSummary("not_started", punchPolicy)),
    });
  });
}

async function routeRegularizationSupport(page: Page, workDate: string): Promise<void> {
  await page.route("**/api/v1/attendance/punches/my**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "punch-a11y-1",
            event_type: "check_in",
            occurred_at: `${workDate}T03:30:00.000Z`,
            work_date: workDate,
            time: "09:00",
            source: "web",
          },
        ],
        page: 1,
        page_size: 100,
        total: 1,
        total_pages: 1,
      }),
    });
  });
  await page.route("**/api/v1/attendance/regularizations/my**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], page: 1, page_size: 10, total: 0, total_pages: 0 }),
    });
  });
}

function geoDenialResponse(input: {
  reasonCode: string;
  factualOutcome: string;
  reference: string;
}): Record<string, unknown> {
  return {
    code: "ATTENDANCE_PUNCH_DENIED",
    message: "Location verification requires manual fallback confirmation.",
    details: {
      reason_code: input.reasonCode,
      geo_policy: {
        factual_outcome: input.factualOutcome,
        selected_action: "manual_fallback",
        fallback_used: true,
        allowed: true,
        reason_code: input.reasonCode,
      },
      manual_fallback: {
        available: true,
        review_required: true,
        reference: input.reference,
        reason_code: input.reasonCode,
      },
    },
  };
}

async function installRole(page: Page, roleKey: string, roleLabel: string): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("hawkaii_api_access_token", "attendance-a11y-token");
  });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "attendance-a11y-user",
            employee_code: "A11Y-001",
            email: "attendance-a11y@example.test",
            full_name: "Attendance A11y User",
            roles: [roleLabel],
          },
          active_role: { key: roleKey, label: roleLabel, is_active: true },
          available_roles: [{ key: roleKey, label: roleLabel, is_active: true }],
          permissions: [],
          setup_required: false,
        }),
      });
      return;
    }

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
}

async function prepareManagerReviewPage(page: Page): Promise<{ decisionRequests: number }> {
  await installRole(page, "Reviewer", "Reviewer");
  const state = { includeReview: true, decisionRequests: 0 };

  await page.route("**/api/v1/attendance/regularizations/queue/manager**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(managerRegularizationQueue(state.includeReview)),
    });
  });
  await page.route("**/api/v1/attendance/geo-fallbacks/queue/manager**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyQueue()),
    });
  });
  await page.route("**/api/v1/attendance/regularizations/a11y-review-1/decision", async (route) => {
    state.decisionRequests += 1;
    state.includeReview = false;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...managerRegularizationItem(),
        status: "approved",
        decided_at: "2026-01-15T10:00:00.000Z",
      }),
    });
  });

  return state;
}

async function prepareExactLocationPage(page: Page): Promise<void> {
  await installRole(page, "Reviewer", "Reviewer");

  await page.route("**/api/v1/attendance/regularizations/queue/manager**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyQueue()),
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
        total_pages: 1,
        queue_counts: { total: 1, pending: 1, approved: 0, returned: 0, rejected: 0 },
      }),
    });
  });
  await page.route(
    "**/api/v1/attendance/geo-fallbacks/geo-review-a11y/exact-location",
    async (route) => {
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
}

async function prepareAttendanceReportPage(page: Page): Promise<void> {
  await installRole(page, "Main Admin", "Main Admin");
  await page.route("**/api/v1/reports/attendance/summary**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "attendance-report-a11y-1",
            employee_user_id: "employee-a11y-1",
            date: "2026-01-15",
            employee: "Aarav Sharma",
            department: "Engineering",
            status: "present",
            reporting_evidence_category: "verified",
            attendance_channels: ["Web"],
            work_site_name: ["Bengaluru Office"],
            work_site_type: ["office"],
            geo_outcome: ["inside_confident"],
            geo_action: ["allow"],
            reason_codes: ["offline_sync.changed_body_conflict"],
            review_required: false,
            review_outcome: [],
            in_time: "09:00",
            out_time: "18:00",
            hours: 9,
            note: "Accessible filter fixture",
          },
        ],
        evidence_categories: {
          verified: 1,
          warning: 0,
          provisional: 0,
          review_required: 0,
          rejected: 0,
        },
        page: 1,
        page_size: 100,
        total: 1,
        total_pages: 1,
      }),
    });
  });
  await page.route("**/api/v1/attendance/calendar/daily**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });
}

function managerRegularizationQueue(includeReview: boolean): Record<string, unknown> {
  return {
    items: includeReview ? [managerRegularizationItem()] : [],
    page: 1,
    page_size: 20,
    total: includeReview ? 1 : 0,
    total_pages: includeReview ? 1 : 0,
    queue_counts: {
      total: includeReview ? 1 : 0,
      pending: includeReview ? 1 : 0,
      approved: 0,
      returned: 0,
      rejected: 0,
    },
  };
}

function managerRegularizationItem(): Record<string, unknown> {
  return {
    id: "a11y-review-1",
    employee: {
      full_name: "Aarav Sharma",
      employee_code: "EMP-018",
    },
    work_date: "2026-01-15",
    reason: "Accessibility review fixture correction.",
    status: "pending",
    version: 3,
    can_decide: true,
    allowed_decisions: ["approve", "return", "reject"],
    created_at: "2026-01-15T04:00:00.000Z",
    items: [
      {
        id: "a11y-item-1",
        ordinal: 1,
        operation: "add",
        target_punch_event_id: null,
        event_type: "check_in",
        occurred_at: "2026-01-15T03:30:00.000Z",
      },
    ],
  };
}

function geoFallbackReview(): Record<string, unknown> {
  return {
    id: "geo-review-a11y",
    kind: "geo_fallback",
    review_type: "manual_fallback",
    geo_outcome: "outside_confident",
    employee: {
      full_name: "Exact Location Employee",
      employee_code: "EMP-GEO",
    },
    work_date: "2026-07-18",
    reason: "Manual attendance fallback after location verification failed.",
    status: "pending",
    version: 1,
    can_decide: true,
    allowed_decisions: ["approve", "return", "reject"],
    created_at: "2026-07-18T03:36:00.000Z",
    items: [
      {
        id: "geo-review-a11y:fallback",
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
      work_site_name: "Bengaluru Office",
    },
    exact_location_access: { state: "available_authorized" },
  };
}

function emptyQueue(): Record<string, unknown> {
  return {
    items: [],
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 0,
    queue_counts: { total: 0, pending: 0, approved: 0, returned: 0, rejected: 0 },
  };
}
