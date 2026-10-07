import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expectNoDocumentHorizontalOverflow } from "../mobile-responsive/helpers";
import {
  getGeolocationCallCount,
  getWatchPositionCallCount,
  mockGeolocationPermissionDenied,
  mockGeolocationSuccess,
  SYNTHETIC_GEOLOCATION,
} from "../helpers/mock-geolocation";

test.setTimeout(120_000);

const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/qa/runs/geo-s14-017/screenshots");

const FIXED_ISO = "2026-01-15T04:05:06.000Z";
const WORK_DATE = "2026-01-15";
const REGULARIZATION_DATE = "2026-01-14";
const EMPLOYEE_DEVICE_ID = "00000000-0000-4000-8000-0000001042aa";
const ADMIN_DEVICE_ID = "00000000-0000-4000-8000-0000001042aa";
const ADMIN_SUSPENDED_DEVICE_ID = "00000000-0000-4000-8000-0000002043bb";

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

const GEO_POLICY = {
  attendance_mode: "geo_required",
  fallback_approval_mode: "approval_required",
  location_unavailable_action: "deny",
  permission_denied_action: "manual_fallback",
  outside_fence_action: "deny",
  boundary_uncertain_action: "manual_fallback",
  stale_evidence_action: "manual_fallback",
  accuracy_exceeded_action: "manual_fallback",
  max_location_age_ms: 60_000,
  max_accuracy_meters: 50,
  geofence_grace_meters: 25,
  effective_geofence_ids: ["geofence-bengaluru-main"],
};

type DocsRole = "employee" | "admin";
type AttendanceScenario = "manual" | "geoAccepted" | "geoFallback" | "regularization";

interface DocsMockOptions {
  role: DocsRole;
  attendanceScenario?: AttendanceScenario;
}

interface ApiRouteContext {
  url: URL;
  path: string;
  method: string;
}

test.beforeEach(async () => {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
});

test("01 manual attendance ready mobile", async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await mockGeolocationSuccess(page);
  await prepareDocsPage(page, { role: "employee", attendanceScenario: "manual" });

  await gotoApp(page, "/attendance");

  await expect(page.getByRole("button", { name: "Clock in", exact: true })).toBeVisible();
  await expect(page.getByText("Not started", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Work mode", { exact: true })).toBeVisible();
  await expect(page.getByText("Getting browser location", { exact: true })).toHaveCount(0);
  expect(await getGeolocationCallCount(page)).toBe(0);
  expect(await getWatchPositionCallCount(page)).toBe(0);
  await expectNoDocumentHorizontalOverflow(page, "/attendance");
  await expectEmployeeScreenshotSafe(page);

  await saveScreenshot(page, "01-manual-attendance-ready-mobile.png");
});

test("02 geo attendance accepted mobile", async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await mockGeolocationSuccess(page, {
    latitude: SYNTHETIC_GEOLOCATION.latitude,
    longitude: SYNTHETIC_GEOLOCATION.longitude,
    accuracy: 8,
    timestamp: Date.parse(FIXED_ISO),
    delayMs: 100,
  });
  await prepareDocsPage(page, { role: "employee", attendanceScenario: "geoAccepted" });

  await gotoApp(page, "/attendance");
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Clock-in recorded", { exact: true })).toBeVisible();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(page.getByText(/verified within an allowed work area/u)).toBeVisible();
  expect(await getGeolocationCallCount(page)).toBe(1);
  expect(await getWatchPositionCallCount(page)).toBe(0);
  await expectNoDocumentHorizontalOverflow(page, "/attendance");
  await expectEmployeeScreenshotSafe(page);

  await saveScreenshot(page, "02-geo-attendance-accepted-mobile.png");
});

test("03 geo manual fallback mobile", async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await mockGeolocationPermissionDenied(page);
  await prepareDocsPage(page, { role: "employee", attendanceScenario: "geoFallback" });

  await gotoApp(page, "/attendance");
  await page.getByRole("button", { name: "Clock in", exact: true }).click();

  await expect(page.getByText("Review", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue manually" })).toBeVisible();
  await expect(page.getByText(/Location access is blocked/u)).toBeVisible();
  await expect(page.getByText("Clock-in recorded", { exact: true })).toHaveCount(0);
  await expectNoDocumentHorizontalOverflow(page, "/attendance");
  await expectEmployeeScreenshotSafe(page);

  await saveScreenshot(page, "03-geo-manual-fallback-mobile.png");
});

test("04 regularization entry mobile", async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await prepareDocsPage(page, { role: "employee", attendanceScenario: "regularization" });

  await gotoApp(page, `/attendance?regularizeDate=${REGULARIZATION_DATE}`);

  const form = page.getByTestId("attendance-regularization-form");
  await expect(form).toBeVisible();
  await page.getByLabel("Reason").fill("Missed checkout after an off-site client visit.");
  await page.getByTestId("regularization-event-type-1").click();
  await page.getByRole("option", { name: "Check-out" }).click();
  await page.getByTestId("regularization-time-1").fill("18:10");
  await expect(page.getByText("1 check-in/check-out punch found.", { exact: true })).toBeVisible();
  await form.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -20));
  await expectNoDocumentHorizontalOverflow(page, "/attendance");
  await expectEmployeeScreenshotSafe(page);

  await saveScreenshot(page, "04-regularization-entry-mobile.png");
});

test("05 admin geo geofence desktop", async ({ page }) => {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await prepareDocsPage(page, { role: "admin" });

  await gotoApp(page, "/admin-settings/geo");

  await expect(page.getByText("Admin Geo", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Bengaluru Office", { exact: true })).toBeVisible();
  await expect(page.getByText("Main office perimeter", { exact: true })).toBeVisible();
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
  await page.getByText("Work Sites", { exact: true }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -24));
  await expectNoDocumentHorizontalOverflow(page, "/admin-settings/geo");

  await saveScreenshot(page, "05-admin-geo-geofence-desktop.png");
});

test("06 employee registered devices mobile", async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await prepareDocsPage(page, { role: "employee" });

  await gotoApp(page, "/ems/profile");

  await expect(page.getByText("My devices", { exact: true })).toBeVisible();
  await expect(page.getByText("Device 1042AA", { exact: true })).toBeVisible();
  await page.getByText("My devices", { exact: true }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -24));
  await expect(page.locator("body")).not.toContainText(EMPLOYEE_DEVICE_ID);
  await expect(page.locator("body")).not.toContainText("installation_id_hash");
  await expectNoDocumentHorizontalOverflow(page, "/ems/profile");

  await saveScreenshot(page, "06-employee-devices-mobile.png");
});

test("07 admin device management desktop", async ({ page }) => {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await prepareDocsPage(page, { role: "admin" });

  await gotoApp(page, "/admin-settings/devices");

  const table = page.getByRole("table");
  await expect(page.getByText("Device management", { exact: true })).toBeVisible();
  await expect(table.getByText("Aarav Sharma", { exact: true }).first()).toBeVisible();
  await expect(table.getByText("Meera Iyer", { exact: true }).first()).toBeVisible();
  await expect(table.getByText("Device 1042AA", { exact: true }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(ADMIN_DEVICE_ID);
  await expect(page.locator("body")).not.toContainText(ADMIN_SUSPENDED_DEVICE_ID);
  await expect(page.locator("body")).not.toContainText("installation_id_hash");
  await expectNoDocumentHorizontalOverflow(page, "/admin-settings/devices");

  await saveScreenshot(page, "07-admin-device-management-desktop.png");
});

test("08 admin device policy desktop", async ({ page }) => {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await prepareDocsPage(page, { role: "admin" });

  await gotoApp(page, "/admin-settings/policies");

  await expect(page.getByText("Mobile attendance policy", { exact: true })).toBeVisible();
  await expect(page.getByText("Runtime enforcement active", { exact: true })).toBeVisible();
  await expect(page.getByText("Device Attestation", { exact: true })).toBeVisible();
  await expect(page.getByText("Not enforced", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Require registered device" })).toHaveCount(0);
  await page.getByText("Mobile attendance policy", { exact: true }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -24));
  await expectNoDocumentHorizontalOverflow(page, "/admin-settings/policies");

  await saveScreenshot(page, "08-admin-device-policy-desktop.png");
});

async function prepareDocsPage(page: Page, options: DocsMockOptions): Promise<void> {
  await installStableBrowserState(page, options.role);

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const context: ApiRouteContext = {
      url,
      path: url.pathname,
      method: request.method(),
    };

    if (await handleDocsApi(route, context, options)) return;
    await fulfillJson(route, emptyPage());
  });
}

async function installStableBrowserState(page: Page, role: DocsRole): Promise<void> {
  await page.addInitScript(
    ({ fixedIso, localRole, employee }) => {
      const fixedNow = Date.parse(fixedIso);
      const RealDate = Date;

      class FixedDate extends RealDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(fixedNow);
          } else {
            super(...args);
          }
        }

        static now() {
          return fixedNow;
        }
      }

      Object.defineProperty(globalThis, "Date", {
        configurable: true,
        value: FixedDate,
      });
      if (globalThis.performance?.now) {
        Object.defineProperty(globalThis.performance, "now", {
          configurable: true,
          value: () => 0,
        });
      }

      window.sessionStorage.setItem("hawkaii_api_access_token", "geo-s14-017-docs-token");
      window.localStorage.setItem(
        "hawkaii_session",
        JSON.stringify({ userId: employee.apiId, role: localRole }),
      );
      window.localStorage.setItem("hawkaii_company_setup", JSON.stringify(true));
      window.localStorage.setItem("hawkaii_employees_v2", JSON.stringify([employee]));
      window.localStorage.setItem(
        "hawkaii_departments_v1",
        JSON.stringify([{ id: "DEP-OPS", name: "Operations", head: "Aarav Sharma", headcount: 1 }]),
      );
      window.localStorage.setItem(
        "hawkaii_designations_v1",
        JSON.stringify([
          { id: "DSG-OPS", title: "Operations Associate", level: "Mid", department: "Operations" },
        ]),
      );
    },
    {
      fixedIso: FIXED_ISO,
      localRole: role === "admin" ? "main_admin" : "employee",
      employee: localEmployee(role),
    },
  );
}

async function handleDocsApi(
  route: Route,
  context: ApiRouteContext,
  options: DocsMockOptions,
): Promise<boolean> {
  const { path: apiPath, method, url } = context;
  const attendanceScenario = options.attendanceScenario ?? "manual";

  if (apiPath === "/api/v1/auth/me") {
    await fulfillJson(route, authResponse(options.role));
    return true;
  }

  if (apiPath === "/api/v1/attendance/summary/my") {
    await fulfillJson(route, attendanceSummary(attendanceScenario));
    return true;
  }

  if (apiPath === "/api/v1/attendance/punches" && method === "POST") {
    await handlePunch(route, attendanceScenario);
    return true;
  }

  if (
    apiPath === "/api/v1/attendance/geo-fallbacks/geo-docs-fallback/submit" &&
    method === "POST"
  ) {
    await fulfillJson(route, {
      ...geoPolicyResponse({
        factualOutcome: "permission_denied",
        selectedAction: "manual_fallback",
        allowed: true,
        reasonCode: "geo_permission_denied",
        fallbackUsed: true,
      }),
      manual_fallback: {
        submitted: true,
        review_required: true,
        review_id: "geo-docs-review",
        status: "pending",
        version: 1,
      },
    });
    return true;
  }

  if (apiPath === "/api/v1/attendance/punches/my") {
    await fulfillJson(route, regularizationPunches());
    return true;
  }

  if (apiPath === "/api/v1/attendance/regularizations/my") {
    await fulfillJson(route, regularizationHistory());
    return true;
  }

  if (apiPath === "/api/v1/attendance/regularizations" && method === "POST") {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await fulfillJson(route, {
      id: "regularization-docs-1",
      work_date: body.work_date,
      reason: body.reason,
      status: "pending",
      version: 1,
      approver: { full_name: "Operations Manager" },
      items: [],
    });
    return true;
  }

  if (apiPath === "/api/v1/attendance/work-sites" && method === "GET") {
    await fulfillJson(route, { items: [workSite()] });
    return true;
  }

  if (apiPath === "/api/v1/attendance/work-sites/work-site-bengaluru/geofences") {
    await fulfillJson(route, { items: [geofence()] });
    return true;
  }

  if (apiPath === "/api/v1/attendance/geofences/geofence-bengaluru-main/versions") {
    await fulfillJson(route, { items: [geofenceVersion()] });
    return true;
  }

  if (apiPath === "/api/v1/attendance/geo/simulate" && method === "POST") {
    await fulfillJson(route, geoSimulationResponse());
    return true;
  }

  if (apiPath === "/api/v1/admin/policies" && method === "GET") {
    await fulfillJson(route, {
      items: [attendancePolicy()],
      policies: [attendancePolicy()],
      versions: { attendance: attendancePolicy().version },
    });
    return true;
  }

  if (apiPath === "/api/v1/platform/devices" && method === "GET") {
    await fulfillJson(route, { items: [employeeDevice()] });
    return true;
  }

  if (apiPath === "/api/v1/platform/admin/devices" && method === "GET") {
    await fulfillJson(route, adminDeviceList(url));
    return true;
  }

  if (apiPath === "/api/v1/ems/profile/me") {
    await fulfillJson(route, employeeProfile());
    return true;
  }

  if (apiPath === "/api/v1/ems/profile-change-requests/my") {
    await fulfillJson(route, emptyPage());
    return true;
  }

  if (apiPath === "/api/v1/core/users/profile-photo-policy") {
    await fulfillJson(route, profilePhotoPolicy());
    return true;
  }

  if (apiPath === "/api/v1/core/master-data/org-selectors") {
    await fulfillJson(route, {
      departments: [{ id: "DEP-OPS", name: "Operations" }],
      designations: [{ id: "DSG-OPS", title: "Operations Associate", level: 3 }],
      managers: [],
      roles: [],
    });
    return true;
  }

  if (apiPath === "/api/v1/core/users" && method === "GET") {
    await fulfillJson(route, {
      items: [coreUser("employee")],
      page: 1,
      page_size: 100,
      total: 1,
      total_pages: 1,
    });
    return true;
  }

  return false;
}

async function handlePunch(route: Route, scenario: AttendanceScenario): Promise<void> {
  if (scenario === "geoAccepted") {
    await fulfillJson(
      route,
      geoPolicyResponse({
        factualOutcome: "inside_confident",
        selectedAction: "allow",
        allowed: true,
        reasonCode: "geo_inside_fence",
      }),
    );
    return;
  }

  if (scenario === "geoFallback") {
    await fulfillJson(
      route,
      geoDenialResponse({
        reasonCode: "geo_permission_denied",
        factualOutcome: "permission_denied",
        message: "Location verification requires manual fallback confirmation.",
      }),
      409,
    );
    return;
  }

  await fulfillJson(route, {});
}

async function gotoApp(page: Page, routePath: string): Promise<void> {
  await page.goto(routePath);
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });
  await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
}

async function saveScreenshot(page: Page, fileName: string): Promise<void> {
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, fileName),
    fullPage: false,
    animations: "disabled",
    caret: "hide",
  });
}

async function expectEmployeeScreenshotSafe(page: Page): Promise<void> {
  const body = page.locator("body");
  await expect(body).not.toContainText(String(SYNTHETIC_GEOLOCATION.latitude));
  await expect(body).not.toContainText(String(SYNTHETIC_GEOLOCATION.longitude));
  await expect(body).not.toContainText("client_event_id");
  await expect(body).not.toContainText("location evidence id");
  await expect(body).not.toContainText("installation_id_hash");
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function authResponse(role: DocsRole) {
  const backendRole = role === "admin" ? "Admin" : "Employee";
  const user = coreUser(role);
  return {
    user: {
      id: user.id,
      employee_code: user.employee_code,
      email: user.email,
      full_name: user.full_name,
      roles: [backendRole],
    },
    active_role: { key: backendRole, label: backendRole, is_active: true },
    available_roles: [{ key: backendRole, label: backendRole, is_active: true }],
    permissions: [],
    setup_required: false,
  };
}

function coreUser(role: DocsRole) {
  if (role === "admin") {
    return {
      id: "admin-geo-s14-017",
      employee_code: "ADM-017",
      email: "admin.geo.s14.017@example.test",
      full_name: "Nisha Rao",
      department_name: "Operations",
      designation_name: "HRMS Admin",
      roles: ["Admin"],
    };
  }
  return {
    id: "employee-aarav-sharma",
    employee_code: "EMP-1042",
    email: "aarav.sharma@example.test",
    full_name: "Aarav Sharma",
    department_name: "Operations",
    designation_name: "Operations Associate",
    roles: ["Employee"],
  };
}

function localEmployee(role: DocsRole) {
  const user = coreUser(role);
  const [firstName, ...rest] = user.full_name.split(" ");
  return {
    id: user.employee_code,
    apiId: user.id,
    version: 1,
    firstName,
    lastName: rest.join(" ") || "User",
    name: user.full_name,
    email: user.email,
    personalEmail: "",
    phone: "",
    designation: user.designation_name,
    department: user.department_name,
    manager: "Operations Manager",
    location: "Bengaluru Office",
    workMode: "office",
    status: "active",
    employmentType: "full_time",
    joinedAt: "2025-01-06",
    noticeDays: 30,
    shift: "General (09:30-18:30)",
    loginEnabled: true,
    systemRoles: [role === "admin" ? "main_admin" : "employee"],
    roleHistory: [],
    audit: [],
    documents: [],
  };
}

function attendanceSummary(scenario: AttendanceScenario) {
  const punchPolicy =
    scenario === "geoAccepted" || scenario === "geoFallback"
      ? GEO_POLICY
      : {
          attendance_mode: "manual_only",
          fallback_approval_mode: "disabled",
          max_location_age_ms: null,
          max_accuracy_meters: null,
        };

  return {
    generated_at: FIXED_ISO,
    today: {
      work_date: WORK_DATE,
      status: "absent",
      detail: "Not started",
      first_check_in: null,
      last_check_out: null,
      in_time: null,
      out_time: null,
      work_minutes: 0,
      break_minutes: 0,
      target_work_minutes: 480,
      next_allowed_actions: ["check_in"],
      work_mode: "office",
      punch_policy: {
        blocked_reason: null,
        blocked_action_reasons: {},
        ...punchPolicy,
      },
    },
    summary: {
      work_minutes: 2520,
      late: 1,
      absent: 0,
      target_work_minutes: 480,
    },
    week_records: [
      {
        work_date: "2026-01-12",
        in_time: "09:28",
        out_time: "18:04",
        hours: "8h 36m",
        status: "present",
      },
      {
        work_date: "2026-01-13",
        in_time: "09:36",
        out_time: "18:11",
        hours: "8h 35m",
        status: "late",
      },
    ],
    exception_history: [],
  };
}

function geoPolicyResponse(input: {
  factualOutcome: string;
  selectedAction?: string;
  allowed: boolean;
  reasonCode?: string;
  fallbackUsed?: boolean;
}) {
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

function geoDenialResponse(input: { reasonCode: string; factualOutcome: string; message: string }) {
  return {
    code: "ATTENDANCE_PUNCH_DENIED",
    message: input.message,
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
        reference: "geo-docs-fallback",
        reason_code: input.reasonCode,
      },
    },
  };
}

function regularizationPunches() {
  return {
    items: [
      {
        id: "docs-check-in",
        event_type: "check_in",
        occurred_at: `${REGULARIZATION_DATE}T03:45:00.000Z`,
        work_date: REGULARIZATION_DATE,
        source: "web",
        time: "09:15",
      },
    ],
    page: 1,
    page_size: 100,
    total: 1,
    total_pages: 1,
  };
}

function regularizationHistory() {
  return {
    items: [
      {
        id: "regularization-history-1",
        work_date: "2026-01-10",
        reason: "Missed check-in after an approved client visit.",
        status: "approved",
        version: 1,
        created_at: "2026-01-10T07:00:00.000Z",
        decided_at: "2026-01-10T10:00:00.000Z",
        items: [
          {
            id: "history-item-1",
            ordinal: 1,
            operation: "add",
            target_punch_event_id: null,
            target_punch: null,
            event_type: "check_in",
            occurred_at: "2026-01-10T03:45:00.000Z",
          },
        ],
      },
    ],
    page: 1,
    page_size: 10,
    total: 1,
    total_pages: 1,
  };
}

function workSite() {
  return {
    id: "work-site-bengaluru",
    siteCode: "BLR-OPS",
    name: "Bengaluru Office",
    siteType: "office",
    timezone: "Asia/Kolkata",
    isActive: true,
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: FIXED_ISO,
    deletedAt: null,
    version: 3,
  };
}

function geofence() {
  return {
    id: "geofence-bengaluru-main",
    workSiteId: "work-site-bengaluru",
    geofenceCode: "BLR-MAIN",
    name: "Main office perimeter",
    isActive: true,
    currentPublishedVersionId: "version-bengaluru-1",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: FIXED_ISO,
    deletedAt: null,
    version: 2,
  };
}

function geofenceVersion() {
  return {
    id: "version-bengaluru-1",
    geofenceId: "geofence-bengaluru-main",
    versionNumber: 1,
    versionStatus: "draft",
    shapeType: "circle",
    shape: {
      center: { longitude: 77.595, latitude: 12.972 },
      radiusMeters: 150,
    },
    shapeMetadata: { fixture: "geo-s14-017 synthetic" },
    effectiveFrom: null,
    effectiveUntil: null,
    canonicalHash: null,
    publishedAt: null,
    publishedByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdByUserId: "admin-geo-s14-017",
  };
}

function geoSimulationResponse() {
  return {
    simulation: {
      verdict: "accepted",
      allowed: true,
      factual_outcome: "inside_confident",
      selected_action: "allow",
      fallback_used: false,
      review_required: false,
      reason_code: "geo_inside_fence",
      reason_detail: "Synthetic evidence is inside the configured Bengaluru Office geofence.",
      evaluation: {
        reported_accuracy_meters: 25,
        max_accuracy_meters: 50,
        evidence_age_ms: 0,
        max_location_age_ms: 60_000,
        signed_margin_meters: 118,
        distance_meters: 32,
        grace_meters: 25,
      },
    },
  };
}

function attendancePolicy() {
  return {
    id: "policy-attendance-docs",
    policy_key: "attendance",
    key: "attendance",
    module: "attendance",
    label: "Attendance policy",
    status: "active",
    active: true,
    config: {
      graceMinutes: 10,
      halfDayAfterMinutes: 240,
      autoMarkAbsentMinutes: 480,
      allowRegularization: true,
      fullDayPunchWindow: true,
      punchInStart: "09:00",
      punchInEnd: "11:00",
      punchOutStart: "17:00",
      punchOutEnd: "23:59",
      autoPunchOutEnabled: true,
      autoPunchOutTime: "23:59",
      allowOffDayPunches: false,
      attendance_mode: "geo_required",
      max_location_age_ms: 60_000,
      max_accuracy_meters: 50,
      geofence_grace_meters: 25,
      fallback_approval_mode: "approval_required",
    },
    updated_at: FIXED_ISO,
    version: 7,
  };
}

function employeeDevice() {
  return {
    registered_device_id: EMPLOYEE_DEVICE_ID,
    platform: "android",
    status: "registered",
    created_at: "2026-01-09T03:40:00.000Z",
    status_changed_at: "2026-01-09T03:40:00.000Z",
    updated_at: "2026-01-09T03:40:00.000Z",
  };
}

function adminDeviceList(url: URL) {
  const allItems = [
    {
      registered_device_id: ADMIN_DEVICE_ID,
      platform: "android",
      status: "registered",
      created_at: "2026-01-09T03:40:00.000Z",
      status_changed_at: "2026-01-09T03:40:00.000Z",
      updated_at: "2026-01-09T03:40:00.000Z",
      owner: { employee_code: "EMP-1042", full_name: "Aarav Sharma" },
    },
    {
      registered_device_id: ADMIN_SUSPENDED_DEVICE_ID,
      platform: "android",
      status: "suspended",
      created_at: "2026-01-10T03:40:00.000Z",
      status_changed_at: "2026-01-12T04:15:00.000Z",
      updated_at: "2026-01-12T04:15:00.000Z",
      owner: { employee_code: "EMP-1043", full_name: "Meera Iyer" },
    },
  ];
  const status = url.searchParams.get("status");
  const platform = url.searchParams.get("platform");
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const items = allItems.filter((item) => {
    if (status && item.status !== status) return false;
    if (platform && item.platform !== platform) return false;
    if (q && !`${item.owner.employee_code} ${item.owner.full_name}`.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
  return {
    items,
    page: Number(url.searchParams.get("page") ?? 1),
    page_size: Number(url.searchParams.get("page_size") ?? 25),
    total: items.length,
    total_pages: 1,
  };
}

function employeeProfile() {
  return {
    profile: {
      user: {
        id: "employee-aarav-sharma",
        employee_code: "EMP-1042",
        full_name: "Aarav Sharma",
        email: "aarav.sharma@example.test",
      },
      manager: null,
      department: { name: "Operations" },
      designation: { name: "Operations Associate" },
      joined_on: "2025-01-06",
      employment_status: "active",
      personal_email: "",
      phone: "",
      alternate_phone: "",
      current_address: "",
      permanent_address: "",
      city: "Bengaluru",
      country: "India",
      emergency_contact: {},
      personal_details: {},
      work_preferences: { work_mode: "Office" },
      version: 1,
    },
    summaries: {},
  };
}

function profilePhotoPolicy() {
  return {
    max_bytes: 2_097_152,
    max_width: 512,
    max_height: 512,
    jpeg_quality: 0.82,
    allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    output_mime_type: "image/jpeg",
  };
}

function emptyPage() {
  return {
    items: [],
    notifications: [],
    unread_count: 0,
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 0,
  };
}
