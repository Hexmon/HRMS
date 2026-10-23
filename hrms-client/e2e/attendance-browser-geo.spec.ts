import { expect, test, type Page } from "@playwright/test";
import {
  attendanceSummary,
  expectCanonicalPunchBody,
  expectCanonicalPunchRequest,
  openAttendance,
  prepareAttendancePage,
  punchCommand,
  transitionFor,
  type CapturedPunch,
  type ManualSessionState,
} from "./attendance-regression.helpers";
import {
  getGeolocationCallCount,
  getLastGeolocationOptions,
  getWatchPositionCallCount,
  mockGeolocationBlocked,
  mockGeolocationPermissionDenied,
  mockGeolocationSuccess,
  mockGeolocationTimeout,
  mockGeolocationUnavailable,
  mockGeolocationUnsupported,
  SYNTHETIC_GEOLOCATION,
} from "./helpers/mock-geolocation";

test.setTimeout(120_000);

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
const OLD_LOCATION_TIMESTAMP = Date.UTC(2025, 11, 1, 3, 0, 0);
const LOW_ACCURACY_METERS = 250;

interface FallbackScenario {
  reasonCode: string;
  outcome: string;
  reference: string;
  policyPatch?: Record<string, unknown>;
  responseMessage?: string;
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

async function expectNoBrowserCoordinateRetention(
  page: Page,
  coordinates: { latitude: number; longitude: number } = SYNTHETIC_GEOLOCATION,
): Promise<void> {
  const browserVisibleState = await page.evaluate(() => {
    const storageEntries = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index) ?? "";
        return `${key}:${storage.getItem(key) ?? ""}`;
      });

    return [
      document.body.innerText,
      window.location.href,
      ...storageEntries(window.localStorage),
      ...storageEntries(window.sessionStorage),
    ].join("\n");
  });

  expect(browserVisibleState).not.toContain(String(coordinates.latitude));
  expect(browserVisibleState).not.toContain(String(coordinates.longitude));
}

function expectNoCoordinateEvidence(value: unknown): void {
  const evidence = value as Record<string, unknown>;
  expect(evidence).not.toHaveProperty("latitude");
  expect(evidence).not.toHaveProperty("longitude");
  expect(evidence).not.toHaveProperty("accuracy_meters");
}

function locationEvidence(body: Record<string, unknown>): Record<string, unknown> {
  return punchCommand(body).location as Record<string, unknown>;
}

function geoPolicyResponse(input: {
  factualOutcome: string;
  selectedAction?: string;
  allowed: boolean;
  reasonCode?: string;
  fallbackUsed?: boolean;
}): Record<string, unknown> {
  return {
    geo_policy: {
      factual_outcome: input.factualOutcome,
      selected_action: input.selectedAction,
      fallback_used: input.fallbackUsed ?? false,
      allowed: input.allowed,
      reason_code: input.reasonCode,
    },
  };
}

function geoDenialResponse(input: {
  reasonCode: string;
  factualOutcome: string;
  selectedAction?: string;
  message: string;
  manualFallback?: {
    reference: string;
    reviewRequired: boolean;
  };
}): Record<string, unknown> {
  return {
    code: "ATTENDANCE_PUNCH_DENIED",
    message: input.message,
    details: {
      reason_code: input.reasonCode,
      geo_policy: {
        factual_outcome: input.factualOutcome,
        selected_action: input.selectedAction ?? "deny",
        fallback_used: input.selectedAction === "manual_fallback",
        allowed: input.selectedAction === "manual_fallback",
        reason_code: input.reasonCode,
      },
      manual_fallback: input.manualFallback
        ? {
            available: true,
            review_required: input.manualFallback.reviewRequired,
            reference: input.manualFallback.reference,
            reason_code: input.reasonCode,
          }
        : { available: false, reason_code: input.reasonCode },
    },
  };
}

async function setupFallbackScenario(
  page: Page,
  scenario: FallbackScenario,
): Promise<{
  punches: CapturedPunch[];
  fallbackRequests: CapturedPunch[];
}> {
  const punches: CapturedPunch[] = [];
  const fallbackRequests: CapturedPunch[] = [];

  await routeAttendanceSummary(page, () => "not_started", {
    ...GEO_POLICY,
    fallback_approval_mode: "approval_required",
    ...scenario.policyPatch,
  });
  await page.route("**/api/v1/attendance/punches", async (route) => {
    const punch = {
      body: route.request().postDataJSON() as Record<string, unknown>,
      idempotencyKey: route.request().headers()["idempotency-key"],
    };
    punches.push(punch);
    expectCanonicalPunchRequest(punch, { event_type: "check_in", source: "web_geo" });
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify(
        geoDenialResponse({
          reasonCode: scenario.reasonCode,
          factualOutcome: scenario.outcome,
          selectedAction: "manual_fallback",
          message: scenario.responseMessage ?? "Location check requires manual fallback review.",
          manualFallback: {
            reference: scenario.reference,
            reviewRequired: true,
          },
        }),
      ),
    });
  });
  await page.route(
    `**/api/v1/attendance/geo-fallbacks/${scenario.reference}/submit`,
    async (route) => {
      fallbackRequests.push({
        body: route.request().postDataJSON() as Record<string, unknown>,
        idempotencyKey: route.request().headers()["idempotency-key"],
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...geoPolicyResponse({
            factualOutcome: scenario.outcome,
            selectedAction: "manual_fallback",
            allowed: true,
            reasonCode: scenario.reasonCode,
            fallbackUsed: true,
          }),
          manual_fallback: {
            submitted: true,
            review_required: true,
            review_id: `${scenario.reference}-review`,
            status: "pending",
            version: 1,
          },
        }),
      });
    },
  );

  return { punches, fallbackRequests };
}

async function expectManualFallbackFor(page: Page, expectedReason: RegExp): Promise<void> {
  await openAttendance(page);
  await expect(
    page.getByText(/policy may offer manual fallback that is submitted for review/u),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("Your punch was recorded", { exact: false })).toBeHidden();
  await expect(page.getByRole("button", { name: "Use manual fallback" })).toBeVisible();
  await expect(page.getByText(expectedReason)).toBeVisible();
}

test.describe("manual-only regression", () => {
  test("manual_only keeps web punches and does not request browser geolocation", async ({
    page,
  }) => {
    await mockGeolocationSuccess(page);
    await prepareAttendancePage(page);
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
    await expect(page.getByText(/No browser location check is required/u)).toBeVisible();
    await expect(
      page.getByText(/Regularization is a separate request for correcting an earlier attendance/u),
    ).toBeVisible();
    await expect(page.getByText(/does not start continuous background tracking/u)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Learn about attendance privacy" }),
    ).toHaveAttribute("href", "/attendance/privacy");
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
  });
});

test.describe("browser geolocation capture", () => {
  test("geo policy requests one browser position and sends deterministic web_geo evidence", async ({
    page,
  }) => {
    await mockGeolocationSuccess(page, { ...FIXED_SUCCESS, delayMs: 100 });
    await prepareAttendancePage(page);
    let state: ManualSessionState = "not_started";
    let submittedBody: Record<string, unknown> | undefined;

    await routeAttendanceSummary(page, () => state, GEO_POLICY);
    await page.route("**/api/v1/attendance/punches", async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      state = transitionFor(String(punchCommand(submittedBody).event_type));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          geoPolicyResponse({ factualOutcome: "inside_confident", allowed: true }),
        ),
      });
    });

    await openAttendance(page);
    await expect(page.getByText("Location required for attendance", { exact: true })).toBeVisible();
    await expect(page.getByText(/requires a one-time location check/u)).toBeVisible();
    expect(await getGeolocationCallCount(page)).toBe(0);
    await page.getByRole("button", { name: "Clock in", exact: true }).click();

    await expect(page.getByText("Getting browser location", { exact: true })).toBeVisible();
    await expect(page.getByText("Clock-in recorded", { exact: true })).toBeVisible();
    await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
    await expect(page.getByText(/within an allowed work area/u)).toBeVisible();
    expect(await getGeolocationCallCount(page)).toBe(1);
    expect(await getWatchPositionCallCount(page)).toBe(0);
    expect(await getLastGeolocationOptions(page)).toEqual({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10_000,
    });
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
    await expectNoBrowserCoordinateRetention(page, FIXED_SUCCESS);
  });

  test("check-out uses the same one-shot browser geo evidence path", async ({ page }) => {
    await mockGeolocationSuccess(page, { ...FIXED_SUCCESS });
    await prepareAttendancePage(page);
    let state: ManualSessionState = "open";
    let submittedBody: Record<string, unknown> | undefined;

    await routeAttendanceSummary(page, () => state, GEO_POLICY);
    await page.route("**/api/v1/attendance/punches", async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      state = transitionFor(String(punchCommand(submittedBody).event_type));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          geoPolicyResponse({
            factualOutcome: "inside_confident",
            selectedAction: "allow",
            allowed: true,
            reasonCode: "geo_inside_fence",
          }),
        ),
      });
    });

    await openAttendance(page);
    await page.getByRole("button", { name: "Clock out", exact: true }).click();

    await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
    await expect(page.getByText("Clock-out recorded", { exact: true })).toBeVisible();
    expect(await getGeolocationCallCount(page)).toBe(1);
    expect(await getWatchPositionCallCount(page)).toBe(0);
    expectCanonicalPunchBody(submittedBody ?? {}, {
      event_type: "check_out",
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
  });
});

test.describe("browser geolocation failures", () => {
  test("permission denial sends denied evidence without coordinate fields", async ({ page }) => {
    await mockGeolocationPermissionDenied(page);
    await prepareAttendancePage(page);
    let submittedBody: Record<string, unknown> | undefined;

    await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
    await page.route("**/api/v1/attendance/punches", async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          geoPolicyResponse({
            factualOutcome: "permission_denied",
            allowed: true,
            reasonCode: "geo_permission_denied",
          }),
        ),
      });
    });

    await openAttendance(page);
    await page.getByRole("button", { name: "Clock in", exact: true }).click();

    await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
    await expect(page.getByText("Clock-in recorded provisionally", { exact: true })).toBeVisible();
    await expect(page.getByText(/Location permission was not granted/u)).toBeVisible();
    expect(await getGeolocationCallCount(page)).toBe(1);
    expectCanonicalPunchBody(submittedBody ?? {}, {
      event_type: "check_in",
      source: "web_geo",
      metadata: { browser_location_result: "permission_denied" },
      location: { permission_state: "denied", provider: "browser" },
    });
    expectNoCoordinateEvidence(locationEvidence(submittedBody ?? {}));
  });

  test("timeout sends unavailable evidence immediately and preserves timeout-specific UI", async ({
    page,
  }) => {
    await mockGeolocationTimeout(page);
    await prepareAttendancePage(page);
    let submittedBody: Record<string, unknown> | undefined;

    await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
    await page.route("**/api/v1/attendance/punches", async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify(
          geoDenialResponse({
            reasonCode: "geo_location_unavailable",
            factualOutcome: "location_unavailable",
            message: "Location unavailable; denied by policy.",
          }),
        ),
      });
    });

    await openAttendance(page);
    await page.getByRole("button", { name: "Clock in", exact: true }).click();

    await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
    await expect(page.getByText("Location check took too long", { exact: true })).toBeVisible();
    await expect(page.getByText(/Attendance was not recorded.*too long/u)).toBeVisible();
    await expect(
      page.getByText(/Your location could not be checked for this attendance action/u),
    ).toBeVisible();
    await expect(page.getByText("Location unavailable", { exact: true })).toBeHidden();
    expect(await getLastGeolocationOptions(page)).toMatchObject({ timeout: 10_000 });
    expectCanonicalPunchBody(submittedBody ?? {}, {
      event_type: "check_in",
      source: "web_geo",
      metadata: {
        browser_location_result: "timeout",
      },
      location: { permission_state: "unavailable", provider: "browser" },
    });
    expectNoCoordinateEvidence(locationEvidence(submittedBody ?? {}));
  });

  test("position unavailable sends unavailable evidence without coordinate fields", async ({
    page,
  }) => {
    await mockGeolocationUnavailable(page);
    await prepareAttendancePage(page);
    let submittedBody: Record<string, unknown> | undefined;

    await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
    await page.route("**/api/v1/attendance/punches", async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          geoPolicyResponse({
            factualOutcome: "location_unavailable",
            allowed: true,
            reasonCode: "geo_location_unavailable",
          }),
        ),
      });
    });

    await openAttendance(page);
    await page.getByRole("button", { name: "Clock in", exact: true }).click();

    await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Your location could not be checked for this attendance action/u),
    ).toBeVisible();
    expectCanonicalPunchBody(submittedBody ?? {}, {
      event_type: "check_in",
      source: "web_geo",
      metadata: { browser_location_result: "position_unavailable" },
      location: { permission_state: "unavailable", provider: "browser" },
    });
    expectNoCoordinateEvidence(locationEvidence(submittedBody ?? {}));
  });

  test("unsupported geolocation submits unavailable evidence without calling browser location", async ({
    page,
  }) => {
    await mockGeolocationUnsupported(page);
    await prepareAttendancePage(page);
    let submittedBody: Record<string, unknown> | undefined;

    await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
    await page.route("**/api/v1/attendance/punches", async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          geoPolicyResponse({
            factualOutcome: "location_unavailable",
            allowed: true,
            reasonCode: "geo_location_unavailable",
          }),
        ),
      });
    });

    await openAttendance(page);
    await page.getByRole("button", { name: "Clock in", exact: true }).click();

    await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
    expect(await getGeolocationCallCount(page)).toBe(0);
    expectCanonicalPunchBody(submittedBody ?? {}, {
      event_type: "check_in",
      source: "web_geo",
      metadata: { browser_location_result: "unsupported" },
      location: { permission_state: "unavailable", provider: "browser" },
    });
    expectNoCoordinateEvidence(locationEvidence(submittedBody ?? {}));
  });

  test("insecure context sends unavailable evidence without invoking geolocation", async ({
    page,
  }) => {
    await mockGeolocationBlocked(page, "insecure_context");
    await prepareAttendancePage(page);
    let submittedBody: Record<string, unknown> | undefined;

    await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
    await page.route("**/api/v1/attendance/punches", async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          geoPolicyResponse({
            factualOutcome: "location_unavailable",
            allowed: true,
            reasonCode: "geo_location_unavailable",
          }),
        ),
      });
    });

    await openAttendance(page);
    await page.getByRole("button", { name: "Clock in", exact: true }).click();

    await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Your location could not be checked for this attendance action/u),
    ).toBeVisible();
    expect(await getGeolocationCallCount(page)).toBe(0);
    expectCanonicalPunchBody(submittedBody ?? {}, {
      event_type: "check_in",
      source: "web_geo",
      metadata: {
        browser_location_result: "insecure_context",
      },
      location: { permission_state: "unavailable", provider: "browser" },
    });
  });

  test("permissions policy denial sends unavailable evidence without invoking geolocation", async ({
    page,
  }) => {
    await mockGeolocationBlocked(page, "permissions_policy_blocked");
    await prepareAttendancePage(page);
    let submittedBody: Record<string, unknown> | undefined;

    await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
    await page.route("**/api/v1/attendance/punches", async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          geoPolicyResponse({
            factualOutcome: "location_unavailable",
            allowed: true,
            reasonCode: "geo_location_unavailable",
          }),
        ),
      });
    });

    await openAttendance(page);
    await page.getByRole("button", { name: "Clock in", exact: true }).click();

    await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Your location could not be checked for this attendance action/u),
    ).toBeVisible();
    expect(await getGeolocationCallCount(page)).toBe(0);
    expectCanonicalPunchBody(submittedBody ?? {}, {
      event_type: "check_in",
      source: "web_geo",
      metadata: {
        browser_location_result: "permissions_policy_blocked",
      },
      location: { permission_state: "unavailable", provider: "browser" },
    });
  });
});

test.describe("evidence quality", () => {
  test("stale evidence uses an explicit old timestamp while backend provides the stale verdict", async ({
    page,
  }) => {
    await mockGeolocationSuccess(page, {
      ...FIXED_SUCCESS,
      timestamp: OLD_LOCATION_TIMESTAMP,
    });
    await prepareAttendancePage(page);
    let submittedBody: Record<string, unknown> | undefined;

    await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
    await page.route("**/api/v1/attendance/punches", async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify(
          geoDenialResponse({
            reasonCode: "geo_stale_evidence",
            factualOutcome: "stale_evidence",
            message: "Location evidence is stale; denied by policy.",
          }),
        ),
      });
    });

    await openAttendance(page);
    await page.getByRole("button", { name: "Clock in", exact: true }).click();

    await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
    await expect(page.getByText("Clock-in was not recorded", { exact: true })).toBeVisible();
    await expect(page.getByText(/location result is too old/u)).toBeVisible();
    expectCanonicalPunchBody(submittedBody ?? {}, {
      event_type: "check_in",
      source: "web_geo",
      metadata: { browser_location_result: "success" },
    });
    expect(locationEvidence(submittedBody ?? {})).toMatchObject({
      latitude: FIXED_SUCCESS.latitude,
      longitude: FIXED_SUCCESS.longitude,
      accuracy_meters: FIXED_SUCCESS.accuracy,
      captured_at: new Date(OLD_LOCATION_TIMESTAMP).toISOString(),
    });
    await expectNoBrowserCoordinateRetention(page, FIXED_SUCCESS);
  });

  test("low accuracy submits explicit accuracy while backend provides the accuracy verdict", async ({
    page,
  }) => {
    await mockGeolocationSuccess(page, {
      ...FIXED_SUCCESS,
      accuracy: LOW_ACCURACY_METERS,
    });
    await prepareAttendancePage(page);
    let submittedBody: Record<string, unknown> | undefined;

    await routeAttendanceSummary(page, () => "not_started", {
      ...GEO_POLICY,
      accuracy_exceeded_action: "allow",
    });
    await page.route("**/api/v1/attendance/punches", async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          geoPolicyResponse({
            factualOutcome: "accuracy_exceeded",
            selectedAction: "allow",
            allowed: true,
            reasonCode: "geo_accuracy_exceeded",
          }),
        ),
      });
    });

    await openAttendance(page);
    await page.getByRole("button", { name: "Clock in", exact: true }).click();

    await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
    await expect(page.getByText("Clock-in recorded provisionally", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/not accurate enough for the current attendance policy/u),
    ).toBeVisible();
    expectCanonicalPunchBody(submittedBody ?? {}, {
      event_type: "check_in",
      source: "web_geo",
      metadata: { browser_location_result: "success" },
    });
    expect(locationEvidence(submittedBody ?? {})).toMatchObject({
      latitude: FIXED_SUCCESS.latitude,
      longitude: FIXED_SUCCESS.longitude,
      accuracy_meters: LOW_ACCURACY_METERS,
      captured_at: new Date(FIXED_SUCCESS.timestamp).toISOString(),
    });
    await expectNoBrowserCoordinateRetention(page, FIXED_SUCCESS);
  });
});

test.describe("manual fallback", () => {
  test("permission denied fallback submits reference without coordinates or location reacquisition", async ({
    page,
  }) => {
    await mockGeolocationPermissionDenied(page);
    await prepareAttendancePage(page);
    const { punches, fallbackRequests } = await setupFallbackScenario(page, {
      reasonCode: "geo_permission_denied",
      outcome: "permission_denied",
      reference: "geo-denied-fallback",
      policyPatch: { permission_denied_action: "manual_fallback" },
    });

    await expectManualFallbackFor(page, /Location permission was not granted/u);
    await page.getByRole("button", { name: "Use manual fallback" }).click();

    await expect(
      page.getByText("Manual fallback submitted for review", { exact: true }),
    ).toBeVisible();
    expect(await getGeolocationCallCount(page)).toBe(1);
    expect(punches).toHaveLength(1);
    expect(fallbackRequests).toHaveLength(1);
    expectNoCoordinateEvidence(locationEvidence(punches[0].body));
    expect(fallbackRequests[0].body).toEqual({});
    expect(fallbackRequests[0].idempotencyKey).toBeTruthy();
    expect(fallbackRequests[0].idempotencyKey).not.toBe(punches[0].idempotencyKey);
    await expectNoBrowserCoordinateRetention(page);
  });

  test("timeout fallback is backend-driven and does not reacquire browser location", async ({
    page,
  }) => {
    await mockGeolocationTimeout(page);
    await prepareAttendancePage(page);
    const { punches, fallbackRequests } = await setupFallbackScenario(page, {
      reasonCode: "geo_location_unavailable",
      outcome: "location_unavailable",
      reference: "geo-timeout-fallback",
      policyPatch: { location_unavailable_action: "manual_fallback" },
    });

    await expectManualFallbackFor(
      page,
      /Your location could not be checked for this attendance action/u,
    );
    await page.getByRole("button", { name: "Use manual fallback" }).click();

    await expect(
      page.getByText("Manual fallback submitted for review", { exact: true }),
    ).toBeVisible();
    expect(await getGeolocationCallCount(page)).toBe(1);
    expect(fallbackRequests).toHaveLength(1);
    expect(fallbackRequests[0].idempotencyKey).toBeTruthy();
    expect(fallbackRequests[0].idempotencyKey).not.toBe(punches[0].idempotencyKey);
    expectNoCoordinateEvidence(locationEvidence(punches[0].body));
  });

  test("stale and low-accuracy fallback availability comes from backend responses", async ({
    page,
  }) => {
    await mockGeolocationSuccess(page, {
      ...FIXED_SUCCESS,
      timestamp: OLD_LOCATION_TIMESTAMP,
    });
    await prepareAttendancePage(page);
    const { punches } = await setupFallbackScenario(page, {
      reasonCode: "geo_stale_evidence",
      outcome: "stale_evidence",
      reference: "geo-stale-fallback",
      policyPatch: { stale_evidence_action: "manual_fallback" },
    });

    await expectManualFallbackFor(page, /location result is too old/u);
    expect(locationEvidence(punches[0].body)).toMatchObject({
      captured_at: new Date(OLD_LOCATION_TIMESTAMP).toISOString(),
    });
  });

  test("low accuracy fallback displays backend-provided fallback CTA", async ({ page }) => {
    await mockGeolocationSuccess(page, {
      ...FIXED_SUCCESS,
      accuracy: LOW_ACCURACY_METERS,
    });
    await prepareAttendancePage(page);
    const { punches } = await setupFallbackScenario(page, {
      reasonCode: "geo_accuracy_exceeded",
      outcome: "accuracy_exceeded",
      reference: "geo-accuracy-fallback",
      policyPatch: { accuracy_exceeded_action: "manual_fallback" },
    });

    await expectManualFallbackFor(page, /not accurate enough for the current attendance policy/u);
    expect(locationEvidence(punches[0].body)).toMatchObject({
      accuracy_meters: LOW_ACCURACY_METERS,
    });
    await expectNoBrowserCoordinateRetention(page, FIXED_SUCCESS);
  });

  test("fallback unavailable does not show CTA or submit fallback reference", async ({ page }) => {
    await mockGeolocationPermissionDenied(page);
    await prepareAttendancePage(page);
    let fallbackRequests = 0;

    await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
    await page.route("**/api/v1/attendance/punches", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify(
          geoDenialResponse({
            reasonCode: "geo_permission_denied",
            factualOutcome: "permission_denied",
            message: "Location permission denied; fallback unavailable.",
          }),
        ),
      });
    });
    await page.route("**/api/v1/attendance/geo-fallbacks/**/submit", async (route) => {
      fallbackRequests += 1;
      await route.fulfill({ status: 500, body: "{}" });
    });

    await openAttendance(page);
    await page.getByRole("button", { name: "Clock in", exact: true }).click();

    await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
    await expect(page.getByText(/Location permission was not granted/u)).toBeVisible();
    await expect(page.getByRole("button", { name: "Use manual fallback" })).toHaveCount(0);
    expect(fallbackRequests).toBe(0);
  });

  test("rapid duplicate fallback clicks submit only one fallback request", async ({ page }) => {
    await mockGeolocationPermissionDenied(page);
    await prepareAttendancePage(page);
    const { fallbackRequests } = await setupFallbackScenario(page, {
      reasonCode: "geo_permission_denied",
      outcome: "permission_denied",
      reference: "geo-duplicate-fallback",
      policyPatch: { permission_denied_action: "manual_fallback" },
    });

    await expectManualFallbackFor(page, /Location permission was not granted/u);
    await page.getByRole("button", { name: "Use manual fallback" }).evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await expect(
      page.getByText("Manual fallback submitted for review", { exact: true }),
    ).toBeVisible();
    expect(fallbackRequests).toHaveLength(1);
    expect(await getGeolocationCallCount(page)).toBe(1);
  });
});

test.describe("network uncertainty", () => {
  test("uncertain geo punch retry reuses request identity and does not show fallback", async ({
    page,
  }) => {
    await mockGeolocationSuccess(page, { ...FIXED_SUCCESS });
    await prepareAttendancePage(page);
    let state: ManualSessionState = "not_started";
    const punches: CapturedPunch[] = [];

    await routeAttendanceSummary(page, () => state, GEO_POLICY);
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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          geoPolicyResponse({ factualOutcome: "inside_confident", allowed: true }),
        ),
      });
    });

    await openAttendance(page);
    await page.getByRole("button", { name: "Clock in", exact: true }).click();

    await expect(page.getByText("Outcome not confirmed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use manual fallback" })).toHaveCount(0);
    expect(await getGeolocationCallCount(page)).toBe(1);

    await page.getByRole("button", { name: "Retry same action" }).click();

    await expect(page.getByText("Clock-in recorded", { exact: true })).toBeVisible();
    await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start break" })).toBeVisible();
    expect(await getGeolocationCallCount(page)).toBe(1);
    expect(punches).toHaveLength(2);
    expect(punches[1]).toEqual(punches[0]);
    expectCanonicalPunchRequest(punches[0], {
      event_type: "check_in",
      source: "web_geo",
      metadata: {
        browser_location_result: "success",
      },
      location: {
        latitude: FIXED_SUCCESS.latitude,
        longitude: FIXED_SUCCESS.longitude,
        accuracy_meters: FIXED_SUCCESS.accuracy,
        provider: "browser",
        permission_state: "granted",
      },
    });
    expect(punches[1].body.client_event_id).toBe(punches[0].body.client_event_id);
    expect(punches[1].body.captured_at).toBe(punches[0].body.captured_at);
    expect(punchCommand(punches[1].body)).toEqual(punchCommand(punches[0].body));
    expect(locationEvidence(punches[1].body)).toEqual(locationEvidence(punches[0].body));
    expect(punches[0].idempotencyKey).toBe(punches[0].body.client_event_id);
    expect(punches[1].idempotencyKey).toBe(punches[1].body.client_event_id);

    await page.getByRole("button", { name: "Start break" }).click();

    await expect(page.getByText("Break started", { exact: true })).toBeVisible();
    expect(await getGeolocationCallCount(page)).toBe(2);
    expect(punches).toHaveLength(3);
    expect(punches[2].idempotencyKey).not.toBe(punches[0].idempotencyKey);
    expectCanonicalPunchRequest(punches[2], {
      event_type: "break_start",
      source: "web_geo",
      metadata: {
        browser_location_result: "success",
      },
    });
  });

  test("rapid interaction does not duplicate geolocation or punch requests", async ({ page }) => {
    await mockGeolocationSuccess(page, { ...FIXED_SUCCESS, delayMs: 250 });
    await prepareAttendancePage(page);
    let punchRequests = 0;

    await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
    await page.route("**/api/v1/attendance/punches", async (route) => {
      punchRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          geoPolicyResponse({ factualOutcome: "inside_confident", allowed: true }),
        ),
      });
    });

    await openAttendance(page);
    await page.getByRole("button", { name: "Clock in", exact: true }).evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await expect(page.getByText("Clock-in recorded", { exact: true })).toBeVisible();
    expect(await getGeolocationCallCount(page)).toBe(1);
    expect(punchRequests).toBe(1);
  });
});
