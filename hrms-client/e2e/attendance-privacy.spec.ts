import { expect, test, type Page } from "@playwright/test";
import { openAttendance, prepareAttendancePage } from "./attendance-regression.helpers";

test.describe("attendance privacy notice", () => {
  test("is reachable from employee Attendance navigation without geolocation side effects", async ({
    page,
  }) => {
    await installGeolocationCounters(page);
    await prepareAttendancePage(page);
    await mockPrivacy(page, privacySummary({ attendanceMode: "manual_only" }));

    await openAttendance(page);
    await expect(page.getByRole("tab", { name: "Privacy" })).toBeVisible();
    await page.getByRole("tab", { name: "Privacy" }).click();

    await expect(page).toHaveURL(/\/attendance\/privacy$/u);
    await expect(
      page.getByRole("heading", { name: "Attendance Privacy & Location" }),
    ).toBeVisible();
    await expect(page.getByText("one-time browser location request")).toBeVisible();
    await expect(page.getByText("does not start background tracking")).toBeVisible();
    await expect(page.getByText("Your current policy does not require location")).toBeVisible();
    await expectGeoCalls(page, { getCurrentPosition: 0, watchPosition: 0 });
  });

  test("renders manual-only and geo policy facts from the privacy API", async ({ page }) => {
    await prepareAttendancePage(page);
    await mockPrivacy(page, privacySummary({ attendanceMode: "manual_only" }));

    await openAttendance(page, "/attendance/privacy");

    await expect(page.getByText("Manual only")).toBeVisible();
    await expect(page.getByText("Not requested")).toBeVisible();
    await expect(page.getByText("Location freshness")).toHaveCount(0);
    await expect(page.getByText("30 days")).toBeVisible();

    await mockPrivacy(
      page,
      privacySummary({
        attendanceMode: "geo_required",
        retentionSeconds: 43_200,
        retentionClass: "short",
        maxLocationAgeMs: 120_000,
        maxAccuracyMeters: 75,
        permissionDeniedAction: "manual_fallback",
        locationUnavailableAction: "deny",
      }),
    );
    await page.reload();

    await expect(page.getByText("Geo required")).toBeVisible();
    await expect(page.getByText("Policy controlled")).toBeVisible();
    await expect(page.getByText("2 minutes")).toBeVisible();
    await expect(page.getByText("75 meters")).toBeVisible();
    await expect(page.getByText("12 hours")).toBeVisible();
    await expect(page.getByText("short")).toBeVisible();
    await expect(page.getByText("Manual fallback", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Denied", { exact: true }).first()).toBeVisible();
  });

  test("states access, offline, retention, and real employee action links", async ({ page }) => {
    await prepareAttendancePage(page);
    await mockPrivacy(
      page,
      privacySummary({ attendanceMode: "geo_preferred", retentionSeconds: 604_800 }),
    );

    await openAttendance(page, "/attendance/privacy");

    await expect(page.getByText("7 days")).toBeVisible();
    await expect(page.getByText("background retention worker")).toBeVisible();
    await expect(page.getByText("ordinary attendance records")).toBeVisible();
    await expect(page.getByText("Routine reports and exports")).toBeVisible();
    await expect(
      page.getByText("Successful authorized exact-coordinate reveals are audited."),
    ).toBeVisible();
    await expect(page.getByText("registered eligible device")).toBeVisible();
    await expect(page.getByText("not payroll-final")).toBeVisible();

    await expect(page.getByRole("link", { name: /Review attendance evidence/u })).toHaveAttribute(
      "href",
      "/attendance/calendar",
    );
    await expect(page.getByRole("link", { name: /Correct attendance/u })).toHaveAttribute(
      "href",
      "/attendance",
    );
    await expect(page.getByRole("link", { name: /Manage registered devices/u })).toHaveAttribute(
      "href",
      "/ems/profile",
    );
    await expect(
      page.getByRole("button", { name: /disable|delete|retention|consent|opt out/iu }),
    ).toHaveCount(0);
  });

  test("does not fabricate policy values when the privacy API fails", async ({ page }) => {
    await prepareAttendancePage(page);
    await page.route("**/api/v1/attendance/privacy", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "privacy unavailable" } }),
      });
    });

    await openAttendance(page, "/attendance/privacy");

    await expect(page.getByText("Current policy details are unavailable.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByText("30 days")).toHaveCount(0);
    await expect(page.getByText("Manual only")).toHaveCount(0);
  });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
  ]) {
    test(`fits mobile viewport ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await prepareAttendancePage(page);
      await mockPrivacy(page, privacySummary({ attendanceMode: "geo_required" }));

      await openAttendance(page, "/attendance/privacy");

      await expect(
        page.getByRole("heading", { name: "Attendance Privacy & Location" }),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

async function mockPrivacy(page: Page, response: Record<string, unknown>): Promise<void> {
  await page.route("**/api/v1/attendance/privacy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

function privacySummary(input: {
  attendanceMode: "manual_only" | "geo_optional" | "geo_preferred" | "geo_required";
  retentionSeconds?: number;
  retentionClass?: string;
  maxLocationAgeMs?: number | null;
  maxAccuracyMeters?: number | null;
  permissionDeniedAction?: "allow" | "deny" | "manual_fallback";
  locationUnavailableAction?: "allow" | "deny" | "manual_fallback";
}): Record<string, unknown> {
  const geoMode = input.attendanceMode !== "manual_only";
  return {
    generated_at: "2026-10-07T10:30:00.000Z",
    as_of: "2026-10-07T10:30:00.000Z",
    effective_policy: {
      attendance_mode: input.attendanceMode,
      policy_source: input.attendanceMode === "manual_only" ? "built_in" : "assignment",
      effective_from: input.attendanceMode === "manual_only" ? null : "2026-01-01T00:00:00.000Z",
      effective_until: null,
      location_requirement:
        input.attendanceMode === "manual_only"
          ? "not_requested"
          : input.attendanceMode === "geo_optional"
            ? "requested_optional"
            : "requested_policy_controlled",
      fallback_approval_mode: "approval_required",
      regularization_mode: "approval_required",
      max_location_age_ms: geoMode ? (input.maxLocationAgeMs ?? 90_000) : null,
      max_accuracy_meters: geoMode ? (input.maxAccuracyMeters ?? 50) : null,
      geofence: { configured: geoMode, grace_meters: geoMode ? 25 : 0 },
      actions: {
        permission_denied: input.permissionDeniedAction ?? "allow",
        location_unavailable: input.locationUnavailableAction ?? "manual_fallback",
        outside_fence: "deny",
        boundary_uncertain: "allow",
        stale_evidence: "manual_fallback",
        accuracy_exceeded: "manual_fallback",
      },
    },
    manual_fallback: {
      approval_mode: "approval_required",
      available_when_policy_selects_manual_fallback: true,
      explicit_submission_required: true,
      review_required: true,
    },
    regularization: { mode: "approval_required", correction_path: "/attendance" },
    retention: {
      coordinate_retention_class: input.retentionClass ?? "standard",
      coordinate_retention_seconds: input.retentionSeconds ?? 2_592_000,
      applies_to_new_coordinate_evidence: true,
      historical_evidence_uses_recorded_expiry: true,
      purge: {
        eligibility: "eligible_after_retention_duration",
        processing: "background_worker",
        immediate_at_expiry: false,
      },
    },
    evidence_access: {
      routine_evidence: {
        employee_self_view: "sanitized_own_evidence",
        manager_view: "scoped_sanitized_evidence",
        hr_admin_auditor_view: "role_scoped_sanitized_evidence",
        reports_exclude_exact_coordinates: true,
      },
      exact_location: {
        employee_can_view_exact_coordinates: false,
        requires_record_visibility: true,
        requires_permission: "attendance:view_exact_location",
        successful_authorized_reveals_audited: true,
        denied_reveals_not_guaranteed_in_exact_coordinate_audit: true,
        available_only_while_unexpired_unpurged: true,
      },
    },
    offline_mobile: {
      registered_device_required: true,
      offline_supported_for_registered_devices: true,
      offline_evidence_may_include_location: true,
      accepted_offline_events_are_provisional: true,
      payroll_eligible_from_offline_sync: false,
    },
    employee_controls: {
      browser_permission_control: "browser_or_os_settings",
      review_attendance_path: "/attendance/calendar",
      correct_attendance_path: "/attendance",
      manage_devices_path: "/ems/profile",
    },
  };
}

async function installGeolocationCounters(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counters = { getCurrentPosition: 0, watchPosition: 0 };
    Object.defineProperty(window, "__attendancePrivacyGeoCounters", {
      configurable: true,
      value: counters,
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: () => {
          counters.getCurrentPosition += 1;
        },
        watchPosition: () => {
          counters.watchPosition += 1;
          return 1;
        },
        clearWatch: () => undefined,
      },
    });
  });
}

async function expectGeoCalls(
  page: Page,
  expected: { getCurrentPosition: number; watchPosition: number },
): Promise<void> {
  const counters = await page.evaluate(() => {
    return (window as unknown as { __attendancePrivacyGeoCounters: typeof expected })
      .__attendancePrivacyGeoCounters;
  });
  expect(counters).toEqual(expected);
}
