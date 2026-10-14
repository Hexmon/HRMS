import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  attendanceSummary,
  expectCanonicalPunchBody,
  openAttendance,
  prepareAttendancePage,
  punchCommand,
  transitionFor,
  type AttendanceTestRole,
  type ManualSessionState,
} from "./attendance-regression.helpers";
import {
  getGeolocationCallCount,
  getWatchPositionCallCount,
  mockGeolocationPermissionDenied,
  mockGeolocationSuccess,
  mockGeolocationUnsupported,
  SYNTHETIC_GEOLOCATION,
} from "./helpers/mock-geolocation";

test.setTimeout(180_000);

const GEO_POLICY = {
  attendance_mode: "geo_required",
  fallback_approval_mode: "disabled",
  location_unavailable_action: "deny",
  permission_denied_action: "deny",
  outside_fence_action: "deny",
  boundary_uncertain_action: "deny",
  stale_evidence_action: "deny",
  accuracy_exceeded_action: "deny",
  max_location_age_ms: 60_000,
  max_accuracy_meters: 50,
};

const FIXED_SUCCESS = {
  latitude: SYNTHETIC_GEOLOCATION.latitude,
  longitude: SYNTHETIC_GEOLOCATION.longitude,
  accuracy: 9,
  timestamp: Date.UTC(2026, 0, 15, 4, 5, 6),
};

test.describe("attendance browser compatibility smoke", () => {
  test("covers manual, geo, fallback, unsupported, responsive and manager UI flows", async ({
    browser,
  }, testInfo) => {
    await withAttendancePage(browser, testInfo, {}, async (page) => {
      await verifyManualOnly(page);
    });

    await withAttendancePage(browser, testInfo, {}, async (page) => {
      await verifyGeoSuccess(page);
    });

    await withAttendancePage(browser, testInfo, {}, async (page) => {
      await verifyPermissionDeniedFallback(page);
    });

    await withAttendancePage(browser, testInfo, {}, async (page) => {
      await verifyUnsupportedGeolocation(page);
    });

    await withAttendancePage(
      browser,
      testInfo,
      { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true },
      async (page) => {
        await verifyResponsiveFallbackAndDateTime(page);
      },
    );

    await withAttendancePage(
      browser,
      testInfo,
      { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      async (page) => {
        await verifyManagerSheetAndDialog(page);
      },
      "Reviewer",
    );
  });
});

async function withAttendancePage(
  browser: Browser,
  testInfo: TestInfo,
  options: BrowserContextOptions,
  callback: (page: Page) => Promise<void>,
  role: AttendanceTestRole = "Employee",
): Promise<void> {
  const baseURL = String(testInfo.project.use.baseURL ?? "http://localhost:5173");
  const context = await browser.newContext({ baseURL, ...options });
  const page = await context.newPage();

  try {
    await prepareAttendancePage(page, role);
    await callback(page);
  } finally {
    await page.close();
    await context.close();
  }
}

async function verifyManualOnly(page: Page): Promise<void> {
  await mockGeolocationSuccess(page);
  let state: ManualSessionState = "not_started";
  let submittedBody: Record<string, unknown> | undefined;

  await routeAttendanceSummary(page, () => state);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    state = transitionFor(String(punchCommand(submittedBody).event_type));
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await openAttendance(page);
  await expect(page.getByText("Manual attendance policy", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Clock-in recorded", { exact: true })).toBeVisible();
  expect(await getGeolocationCallCount(page)).toBe(0);
  expect(await getWatchPositionCallCount(page)).toBe(0);
  expectCanonicalPunchBody(submittedBody ?? {}, {
    event_type: "check_in",
    source: "web",
    metadata: { source_view: "attendance_page" },
  });
  await expect(page.getByRole("button", { name: "Use manual fallback" })).toHaveCount(0);
}

async function verifyGeoSuccess(page: Page): Promise<void> {
  await mockGeolocationSuccess(page, FIXED_SUCCESS);
  let state: ManualSessionState = "not_started";
  let submittedBody: Record<string, unknown> | undefined;

  await expectBrowserApiSurface(page);
  await routeAttendanceSummary(page, () => state, GEO_POLICY);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    state = transitionFor(String(punchCommand(submittedBody).event_type));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(geoPolicyResponse("inside_confident", true)),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Clock-in recorded", { exact: true })).toBeVisible();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
  expect(await getGeolocationCallCount(page)).toBe(1);
  expect(await getWatchPositionCallCount(page)).toBe(0);
  expectCanonicalPunchBody(submittedBody ?? {}, {
    event_type: "check_in",
    source: "web_geo",
    metadata: {
      source_view: "attendance_page",
      browser_location_result: "success",
    },
    location: {
      latitude: FIXED_SUCCESS.latitude,
      longitude: FIXED_SUCCESS.longitude,
      accuracy_meters: FIXED_SUCCESS.accuracy,
      captured_at: new Date(FIXED_SUCCESS.timestamp).toISOString(),
      provider: "browser",
      permission_state: "granted",
    },
  });
}

async function verifyPermissionDeniedFallback(page: Page): Promise<void> {
  await mockGeolocationPermissionDenied(page);
  let fallbackRequests = 0;
  let submittedBody: Record<string, unknown> | undefined;

  await routeAttendanceSummary(page, () => "not_started", {
    ...GEO_POLICY,
    fallback_approval_mode: "approval_required",
    permission_denied_action: "manual_fallback",
  });
  await page.route("**/api/v1/attendance/punches", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify(geoDenialResponse("geo-compat-denied")),
    });
  });
  await page.route("**/api/v1/attendance/geo-fallbacks/geo-compat-denied/submit", async (route) => {
    fallbackRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...geoPolicyResponse("permission_denied", true, "manual_fallback"),
        manual_fallback: {
          submitted: true,
          review_required: true,
          review_id: "geo-compat-denied-review",
        },
      }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Review", { exact: true })).toBeVisible();
  await expect(page.getByText(/Location permission was not granted/u)).toBeVisible();
  const fallbackButton = page.getByRole("button", { name: "Use manual fallback" });
  await expect(fallbackButton).toBeVisible();

  await fallbackButton.evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  await expect(
    page.getByText("Manual fallback submitted for review", { exact: true }),
  ).toBeVisible();
  expect(fallbackRequests).toBe(1);
  expect(await getGeolocationCallCount(page)).toBe(1);
  expect(await getWatchPositionCallCount(page)).toBe(0);
  expectNoCoordinateEvidence(
    punchCommand(submittedBody ?? {}).location as Record<string, unknown> | undefined,
  );
}

async function verifyUnsupportedGeolocation(page: Page): Promise<void> {
  await mockGeolocationUnsupported(page);
  let submittedBody: Record<string, unknown> | undefined;

  await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(geoPolicyResponse("location_unavailable", true)),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
  expect(await getGeolocationCallCount(page)).toBe(0);
  expect(await getWatchPositionCallCount(page)).toBe(0);
  expectCanonicalPunchBody(submittedBody ?? {}, {
    event_type: "check_in",
    source: "web_geo",
    metadata: { browser_location_result: "unsupported" },
    location: { permission_state: "unavailable", provider: "browser" },
  });
}

async function verifyResponsiveFallbackAndDateTime(page: Page): Promise<void> {
  await mockGeolocationPermissionDenied(page);

  await routeAttendanceSummary(page, () => "not_started", {
    ...GEO_POLICY,
    fallback_approval_mode: "approval_required",
    permission_denied_action: "manual_fallback",
  });
  await page.route("**/api/v1/attendance/punches", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify(geoDenialResponse("geo-compat-responsive")),
    });
  });

  await openAttendance(page);
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Use manual fallback" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const workDate = localIsoDate(new Date());
  const dateInput = page.getByLabel("Attendance date");
  await expect(dateInput).toBeVisible();
  await dateInput.fill(workDate);
  await expect(dateInput).toHaveValue(workDate);

  const timeInput = page.getByTestId("regularization-time-1");
  await expect(timeInput).toBeVisible();
  await timeInput.fill("09:15");
  await expect(timeInput).toHaveValue("09:15");
}

async function verifyManagerSheetAndDialog(page: Page): Promise<void> {
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
    "**/api/v1/attendance/geo-fallbacks/geo-compat-review/exact-location",
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
  await page.getByText("Compatibility Review Employee").first().click();
  await expect(page.getByRole("dialog", { name: "Compatibility Review Employee" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page.getByText(/12\.974000|77\.597000|12\.974|77\.597/u)).toHaveCount(0);

  await page.getByRole("button", { name: "View exact location" }).click();
  const dialog = page.getByRole("dialog", { name: "View exact location?" });
  await expect(dialog).toBeVisible();
  expect(revealCalls).toBe(0);
}

async function routeAttendanceSummary(
  page: Page,
  state: () => ManualSessionState,
  punchPolicy: Record<string, unknown> = {},
): Promise<void> {
  await page.route("**/api/v1/attendance/summary/my**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attendanceSummary(state(), punchPolicy)),
    });
  });
}

async function expectBrowserApiSurface(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__attendanceBrowserCompatApiSurface", {
      configurable: true,
      value: {
        secure: window.isSecureContext,
        geolocation: typeof navigator.geolocation?.getCurrentPosition === "function",
        randomUUID: typeof globalThis.crypto?.randomUUID === "function",
      },
    });
  });

  await page.goto("/attendance", { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.evaluate(() => window.__attendanceBrowserCompatApiSurface ?? null))
    .toEqual({ secure: true, geolocation: true, randomUUID: true });
}

function geoPolicyResponse(
  factualOutcome: string,
  allowed: boolean,
  selectedAction = "allow",
): Record<string, unknown> {
  return {
    geo_policy: {
      factual_outcome: factualOutcome,
      selected_action: selectedAction,
      fallback_used: selectedAction === "manual_fallback",
      allowed,
      reason_code:
        factualOutcome === "inside_confident" ? "geo_inside_fence" : "geo_permission_denied",
    },
  };
}

function geoDenialResponse(reference: string): Record<string, unknown> {
  return {
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
        reference,
        reason_code: "geo_permission_denied",
      },
    },
  };
}

function expectNoCoordinateEvidence(evidence: Record<string, unknown> | undefined): void {
  expect(evidence).toBeDefined();
  expect(evidence).not.toHaveProperty("latitude");
  expect(evidence).not.toHaveProperty("longitude");
  expect(evidence).not.toHaveProperty("accuracy_meters");
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const result = await page.evaluate(() => ({
    rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(result.rootOverflow).toBeLessThanOrEqual(1);
  expect(result.bodyOverflow).toBeLessThanOrEqual(1);
}

function geoFallbackReview(): Record<string, unknown> {
  return {
    id: "geo-compat-review",
    kind: "geo_fallback",
    review_type: "manual_fallback",
    geo_outcome: "outside_confident",
    employee: {
      full_name: "Compatibility Review Employee",
      employee_code: "EMP-COMPAT",
    },
    employee_name: "Compatibility Review Employee",
    employee_code: "EMP-COMPAT",
    work_date: "2026-07-18",
    reason: "Manual attendance fallback after location verification failed.",
    status: "pending",
    version: 1,
    created_at: "2026-07-18T03:36:00.000Z",
    items: [
      {
        id: "geo-compat-review:fallback",
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
      work_site_name: "Compatibility Demo Office",
    },
    exact_location_access: { state: "available_authorized" },
  };
}

function localIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

declare global {
  interface Window {
    __attendanceBrowserCompatApiSurface?: {
      secure: boolean;
      geolocation: boolean;
      randomUUID: boolean;
    };
  }
}
