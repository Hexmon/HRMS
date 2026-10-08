import { expect, test, type Page } from "@playwright/test";

type ExactLocationState = "available_authorized" | "available_restricted" | "unavailable";

interface PrepareOptions {
  state: ExactLocationState;
  revealStatus?: number;
}

test("manager review shows restricted exact-location state without revealing coordinates", async ({
  page,
}) => {
  const requests = await prepareManagerReviewPage(page, { state: "available_restricted" });

  await openReviewDetail(page);
  await expect(page.getByRole("heading", { name: "Evidence summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Exact location", exact: true })).toBeVisible();
  await expect(page.getByText("Permission required", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "View exact location" })).toHaveCount(0);
  await expect(page.getByText(/12\.974000|77\.597000|12\.974|77\.597/u)).toHaveCount(0);
  expect(requests.revealCalls).toBe(0);
});

test("manager review shows unavailable exact-location state without a reveal action", async ({
  page,
}) => {
  const requests = await prepareManagerReviewPage(page, { state: "unavailable" });

  await openReviewDetail(page);
  await expect(page.getByRole("heading", { name: "Exact location", exact: true })).toBeVisible();
  await expect(
    page.getByText("Exact coordinates are not available for this attendance evidence.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "View exact location" })).toHaveCount(0);
  expect(requests.revealCalls).toBe(0);
});

test("manager review reveals exact location only after confirmation and clears it on close", async ({
  page,
}) => {
  const requests = await prepareManagerReviewPage(page, { state: "available_authorized" });

  await openReviewDetail(page);
  await page.getByRole("button", { name: "View exact location" }).click();
  const dialog = page.getByRole("dialog", { name: "View exact location?" });
  await expect(dialog).toBeVisible();
  expect(requests.revealCalls).toBe(0);

  await dialog.getByRole("button", { name: "View exact location" }).click();
  await expect(dialog.getByText("12.974000", { exact: true })).toBeVisible();
  await expect(dialog.getByText("77.597000", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Sensitive attendance evidence - access audited")).toBeVisible();
  expect(requests.revealCalls).toBe(1);

  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(page.getByText("12.974000", { exact: true })).toHaveCount(0);
  await expect(page.getByText("77.597000", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "View exact location" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("12.974000", { exact: true })).toHaveCount(0);
  expect(requests.revealCalls).toBe(1);
});

test("manager review handles stale exact-location permission denial without showing coordinates", async ({
  page,
}) => {
  const requests = await prepareManagerReviewPage(page, {
    state: "available_authorized",
    revealStatus: 403,
  });

  await openReviewDetail(page);
  await page.getByRole("button", { name: "View exact location" }).click();
  const dialog = page.getByRole("dialog", { name: "View exact location?" });
  await dialog.getByRole("button", { name: "View exact location" }).click();

  await expect(dialog.getByText("Permission denied", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Outside - confident - Manual fallback")).toBeVisible();
  await expect(page.getByText(/12\.974000|77\.597000|12\.974|77\.597/u)).toHaveCount(0);
  expect(requests.revealCalls).toBe(1);
});

async function openReviewDetail(page: Page): Promise<void> {
  await page.goto("/attendance/approvals", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Manager review queue" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("row", { name: /Exact Location Employee EMP-GEO/u }).click();
  await expect(page.getByRole("heading", { name: "Exact Location Employee" })).toBeVisible();
}

async function prepareManagerReviewPage(
  page: Page,
  options: PrepareOptions,
): Promise<{ revealCalls: number }> {
  const requests = { revealCalls: 0 };

  await page.addInitScript(() => {
    window.sessionStorage.setItem("hawkaii_api_access_token", "manager-review-token");
  });

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === "/api/v1/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "reviewer-1",
            employee_code: "MGR-001",
            email: "reviewer@example.test",
            full_name: "Exact Location Reviewer",
            roles: ["Reviewer"],
          },
          active_role: { key: "Reviewer", label: "Reviewer", is_active: true },
          available_roles: [{ key: "Reviewer", label: "Reviewer", is_active: true }],
          permissions: [],
          setup_required: false,
        }),
      });
      return;
    }

    if (path === "/api/v1/attendance/regularizations/queue/manager" && method === "GET") {
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
      return;
    }

    if (path === "/api/v1/attendance/geo-fallbacks/queue/manager" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [geoFallbackReview(options.state)],
          page: 1,
          page_size: 20,
          total: 1,
          queue_counts: { total: 1, pending: 1, approved: 0, returned: 0, rejected: 0 },
        }),
      });
      return;
    }

    if (
      path === "/api/v1/attendance/geo-fallbacks/geo-review-1/exact-location" &&
      method === "POST"
    ) {
      requests.revealCalls += 1;
      if (options.revealStatus === 403) {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            code: "FORBIDDEN",
            message: "Exact attendance location access requires additional authorization.",
          }),
        });
        return;
      }
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
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  return requests;
}

function geoFallbackReview(state: ExactLocationState): Record<string, unknown> {
  return {
    id: "geo-review-1",
    kind: "geo_fallback",
    review_type: "manual_fallback",
    geo_outcome: "outside_confident",
    employee: {
      full_name: "Exact Location Employee",
      employee_code: "EMP-GEO",
    },
    employee_name: "Exact Location Employee",
    employee_code: "EMP-GEO",
    work_date: "2026-07-18",
    reason: "Manual attendance fallback after location verification failed.",
    status: "pending",
    version: 1,
    created_at: "2026-07-18T03:36:00.000Z",
    items: [
      {
        id: "geo-review-1:fallback",
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
    exact_location_access: { state },
  };
}
