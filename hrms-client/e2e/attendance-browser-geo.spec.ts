import { expect, test, type Page } from "@playwright/test";
import {
  attendanceSummary,
  openAttendance,
  prepareAttendancePage,
  transitionFor,
  type ManualSessionState,
} from "./attendance-regression.helpers";

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

type BrowserGeoMockKind = "success" | "permission_denied" | "timeout" | "unavailable";
type GeoWindow = Window & { __geoCalls?: number };

async function mockBrowserGeolocation(
  page: Page,
  kind: BrowserGeoMockKind,
  delayMs = 0,
): Promise<void> {
  await page.addInitScript(
    ({ resultKind, delay }) => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(success: PositionCallback, error?: PositionErrorCallback | null) {
            const target = window as GeoWindow;
            target.__geoCalls = (target.__geoCalls ?? 0) + 1;
            window.setTimeout(() => {
              if (resultKind === "success") {
                success({
                  coords: {
                    latitude: 12.972,
                    longitude: 77.595,
                    accuracy: 8,
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null,
                  },
                  timestamp: Date.now() - 30_000,
                });
                return;
              }

              const code =
                resultKind === "permission_denied" ? 1 : resultKind === "timeout" ? 3 : 2;
              error?.({
                code,
                message: resultKind,
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
              } as GeolocationPositionError);
            }, delay);
          },
        },
      });
    },
    { resultKind: kind, delay: delayMs },
  );
}

async function mockBlockedBrowserGeolocation(
  page: Page,
  kind: "insecure_context" | "permissions_policy_blocked",
): Promise<void> {
  await page.addInitScript(
    ({ resultKind }) => {
      if (resultKind === "insecure_context") {
        Object.defineProperty(window, "isSecureContext", {
          configurable: true,
          value: false,
        });
      }
      if (resultKind === "permissions_policy_blocked") {
        Object.defineProperty(document, "permissionsPolicy", {
          configurable: true,
          value: {
            allowsFeature: (feature: string) => feature !== "geolocation",
          },
        });
      }

      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition() {
            const target = window as GeoWindow;
            target.__geoCalls = (target.__geoCalls ?? 0) + 1;
          },
        },
      });
    },
    { resultKind: kind },
  );
}

async function geoCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as GeoWindow).__geoCalls ?? 0);
}

async function expectNoBrowserCoordinateRetention(page: Page): Promise<void> {
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

  expect(browserVisibleState).not.toContain("12.972");
  expect(browserVisibleState).not.toContain("77.595");
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

test("manual_only keeps web punches and does not request browser geolocation", async ({ page }) => {
  await mockBrowserGeolocation(page, "success");
  await prepareAttendancePage(page);
  let state: ManualSessionState = "not_started";
  let submittedBody: Record<string, unknown> | undefined;

  await routeAttendanceSummary(page, () => state);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    state = transitionFor(String(submittedBody.event_type));
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Clock-in recorded", { exact: true })).toBeVisible();
  expect(await geoCalls(page)).toBe(0);
  expect(submittedBody).toEqual({
    event_type: "check_in",
    source: "web",
    metadata: { source_view: "attendance_page" },
  });
});

test("geo policy requests one browser position after click and sends web_geo evidence", async ({
  page,
}) => {
  await mockBrowserGeolocation(page, "success", 100);
  await prepareAttendancePage(page);
  let state: ManualSessionState = "not_started";
  let submittedBody: Record<string, unknown> | undefined;

  await routeAttendanceSummary(page, () => state, GEO_POLICY);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    state = transitionFor(String(submittedBody.event_type));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ geo_policy: { factual_outcome: "inside_confident", allowed: true } }),
    });
  });

  await openAttendance(page);
  expect(await geoCalls(page)).toBe(0);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Getting browser location", { exact: true })).toBeVisible();
  await expect(page.getByText("Clock-in recorded", { exact: true })).toBeVisible();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(page.getByText(/verified within an allowed work area/u)).toBeVisible();
  expect(await geoCalls(page)).toBe(1);
  expect(submittedBody).toMatchObject({
    event_type: "check_in",
    source: "web_geo",
    metadata: {
      source_view: "attendance_page",
      browser_location_result: "success",
    },
    location: {
      latitude: 12.972,
      longitude: 77.595,
      accuracy_meters: 8,
      provider: "browser",
      permission_state: "granted",
    },
  });
  expect(typeof (submittedBody?.location as Record<string, unknown>).captured_at).toBe("string");
  await expectNoBrowserCoordinateRetention(page);
});

test("permission denial sends denied evidence and renders a provisional decision", async ({
  page,
}) => {
  await mockBrowserGeolocation(page, "permission_denied");
  await prepareAttendancePage(page);
  let submittedBody: Record<string, unknown> | undefined;

  await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ geo_policy: { factual_outcome: "permission_denied", allowed: true } }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
  await expect(page.getByText("Clock-in recorded provisionally", { exact: true })).toBeVisible();
  await expect(page.getByText(/Location access is blocked/u)).toBeVisible();
  expect(submittedBody).toMatchObject({
    source: "web_geo",
    location: { permission_state: "denied", provider: "browser" },
  });
});

test("timeout sends unavailable evidence and renders timeout-specific UI", async ({ page }) => {
  await mockBrowserGeolocation(page, "timeout");
  await prepareAttendancePage(page);
  let submittedBody: Record<string, unknown> | undefined;

  await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        geo_policy: { factual_outcome: "location_unavailable", allowed: true },
      }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
  await expect(page.getByText(/Your location could not be determined/u)).toBeVisible();
  expect(submittedBody).toMatchObject({
    source: "web_geo",
    location: { permission_state: "unavailable", provider: "browser" },
  });
});

test("policy allow with low accuracy renders a provisional reason", async ({ page }) => {
  await mockBrowserGeolocation(page, "success");
  await prepareAttendancePage(page);

  await routeAttendanceSummary(page, () => "not_started", {
    ...GEO_POLICY,
    accuracy_exceeded_action: "allow",
  });
  await page.route("**/api/v1/attendance/punches", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        geo_policy: {
          factual_outcome: "accuracy_exceeded",
          selected_action: "allow",
          fallback_used: false,
          allowed: true,
          reason_code: "geo_accuracy_exceeded",
        },
      }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
  await expect(page.getByText("Clock-in recorded provisionally", { exact: true })).toBeVisible();
  await expect(page.getByText(/Location accuracy was too low/u)).toBeVisible();
});

test("backend denial preserves timeout-specific UI and renders rejected decision", async ({
  page,
}) => {
  await mockBrowserGeolocation(page, "timeout");
  await prepareAttendancePage(page);
  let submittedBody: Record<string, unknown> | undefined;

  await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        code: "ATTENDANCE_PUNCH_DENIED",
        message: "Location unavailable; denied by policy.",
        details: {
          reason_code: "geo_location_unavailable",
          geo_policy: {
            factual_outcome: "location_unavailable",
            selected_action: "deny",
            allowed: false,
          },
        },
      }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("Location request timed out", { exact: true })).toBeVisible();
  await expect(page.getByText(/Attendance was not recorded.*timed out/u)).toBeVisible();
  await expect(page.getByText(/Your location could not be determined/u)).toBeVisible();
  await expect(page.getByText("Location unavailable", { exact: true })).toBeHidden();
  expect(submittedBody).toMatchObject({
    source: "web_geo",
    metadata: {
      browser_location_result: "timeout",
    },
    location: { permission_state: "unavailable", provider: "browser" },
  });
});

test("backend stale evidence rejection renders a stale-location state", async ({ page }) => {
  await mockBrowserGeolocation(page, "success");
  await prepareAttendancePage(page);

  await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        code: "ATTENDANCE_PUNCH_DENIED",
        message: "Location evidence is stale; denied by policy.",
        details: {
          reason_code: "geo_stale_evidence",
          geo_policy: {
            factual_outcome: "stale_evidence",
            selected_action: "deny",
            allowed: false,
          },
        },
      }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("Clock-in was not recorded", { exact: true })).toBeVisible();
  await expect(page.getByText(/captured location was too old/u)).toBeVisible();
});

test("backend boundary uncertainty denial renders rejected reason", async ({ page }) => {
  await mockBrowserGeolocation(page, "success");
  await prepareAttendancePage(page);

  await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        code: "ATTENDANCE_PUNCH_DENIED",
        message: "Boundary is uncertain; denied by policy.",
        details: {
          reason_code: "geo_boundary_uncertain",
          geo_policy: {
            factual_outcome: "boundary_uncertain",
            selected_action: "deny",
            allowed: false,
          },
        },
      }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(page.getByText(/near the work-area boundary/u)).toBeVisible();
});

test("backend manual fallback outcome renders the review state", async ({ page }) => {
  await mockBrowserGeolocation(page, "success");
  await prepareAttendancePage(page);

  await routeAttendanceSummary(page, () => "not_started", {
    ...GEO_POLICY,
    outside_fence_action: "manual_fallback",
    fallback_approval_mode: "approval_required",
  });
  await page.route("**/api/v1/attendance/punches", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        geo_policy: {
          factual_outcome: "outside_confident",
          selected_action: "manual_fallback",
          fallback_used: true,
          allowed: true,
          reason_code: "geo_outside_fence",
        },
      }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Review", { exact: true })).toBeVisible();
  await expect(page.getByText("Manual fallback recorded", { exact: true })).toBeVisible();
  await expect(page.getByText(/needs review/u)).toBeVisible();
  await expect(page.getByText(/outside the allowed work area/u)).toBeVisible();
});

test("check-out uses the same browser geo evidence path and accepted decision", async ({
  page,
}) => {
  await mockBrowserGeolocation(page, "success");
  await prepareAttendancePage(page);
  let state: ManualSessionState = "open";
  let submittedBody: Record<string, unknown> | undefined;

  await routeAttendanceSummary(page, () => state, GEO_POLICY);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    state = transitionFor(String(submittedBody.event_type));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        geo_policy: {
          factual_outcome: "inside_confident",
          selected_action: "allow",
          fallback_used: false,
          allowed: true,
          reason_code: "geo_inside_fence",
        },
      }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock out", exact: true }).click();

  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(page.getByText("Clock-out recorded", { exact: true })).toBeVisible();
  expect(await geoCalls(page)).toBe(1);
  expect(submittedBody).toMatchObject({
    event_type: "check_out",
    source: "web_geo",
    metadata: {
      source_view: "attendance_page",
      browser_location_result: "success",
    },
    location: {
      latitude: 12.972,
      longitude: 77.595,
      accuracy_meters: 8,
      provider: "browser",
      permission_state: "granted",
    },
  });
});

test("rapid interaction does not duplicate geolocation or punch requests", async ({ page }) => {
  await mockBrowserGeolocation(page, "success", 250);
  await prepareAttendancePage(page);
  let punchRequests = 0;

  await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    punchRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ geo_policy: { factual_outcome: "inside_confident", allowed: true } }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  await expect(page.getByText("Clock-in recorded", { exact: true })).toBeVisible();
  expect(await geoCalls(page)).toBe(1);
  expect(punchRequests).toBe(1);
});

test("uncertain geo punch retry reuses the same request identity and evidence", async ({
  page,
}) => {
  await mockBrowserGeolocation(page, "success");
  await prepareAttendancePage(page);
  let state: ManualSessionState = "not_started";
  const punches: Array<{ body: Record<string, unknown>; idempotencyKey: string | undefined }> = [];

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
      body: JSON.stringify({ geo_policy: { factual_outcome: "inside_confident", allowed: true } }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Outcome not confirmed", { exact: true })).toBeVisible();
  expect(await geoCalls(page)).toBe(1);

  await page.getByRole("button", { name: "Retry same action" }).click();

  await expect(page.getByText("Clock-in recorded", { exact: true })).toBeVisible();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start break" })).toBeVisible();
  expect(await geoCalls(page)).toBe(1);
  expect(punches).toHaveLength(2);
  expect(punches[1]).toEqual(punches[0]);
  expect(punches[0]?.body).toMatchObject({
    source: "web_geo",
    metadata: {
      browser_location_result: "success",
    },
    location: {
      latitude: 12.972,
      longitude: 77.595,
      accuracy_meters: 8,
      provider: "browser",
      permission_state: "granted",
    },
  });

  await page.getByRole("button", { name: "Start break" }).click();

  await expect(page.getByText("Break started", { exact: true })).toBeVisible();
  expect(await geoCalls(page)).toBe(2);
  expect(punches).toHaveLength(3);
  expect(punches[2]?.idempotencyKey).not.toBe(punches[0]?.idempotencyKey);
  expect(punches[2]?.body).toMatchObject({
    event_type: "break_start",
    source: "web_geo",
    metadata: {
      browser_location_result: "success",
    },
  });
});

test("insecure context sends unavailable evidence without invoking geolocation", async ({
  page,
}) => {
  await mockBlockedBrowserGeolocation(page, "insecure_context");
  await prepareAttendancePage(page);
  let submittedBody: Record<string, unknown> | undefined;

  await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        geo_policy: { factual_outcome: "location_unavailable", allowed: true },
      }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
  await expect(page.getByText(/Your location could not be determined/u)).toBeVisible();
  expect(await geoCalls(page)).toBe(0);
  expect(submittedBody).toMatchObject({
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
  await mockBlockedBrowserGeolocation(page, "permissions_policy_blocked");
  await prepareAttendancePage(page);
  let submittedBody: Record<string, unknown> | undefined;

  await routeAttendanceSummary(page, () => "not_started", GEO_POLICY);
  await page.route("**/api/v1/attendance/punches", async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        geo_policy: { factual_outcome: "location_unavailable", allowed: true },
      }),
    });
  });

  await openAttendance(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
  await expect(page.getByText(/Your location could not be determined/u)).toBeVisible();
  expect(await geoCalls(page)).toBe(0);
  expect(submittedBody).toMatchObject({
    source: "web_geo",
    metadata: {
      browser_location_result: "permissions_policy_blocked",
    },
    location: { permission_state: "unavailable", provider: "browser" },
  });
});
