import { expect, test, type Locator, type Page } from "@playwright/test";
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

async function installTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((nextTheme) => {
    window.localStorage.setItem("hawkaii-theme", nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.dataset.resolvedTheme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
  }, theme);
}

async function applyTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((nextTheme) => {
    window.localStorage.setItem("hawkaii-theme", nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.dataset.resolvedTheme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
  }, theme);
}

async function expectContrastAtLeast(
  locator: Locator,
  label: string,
  minimumRatio = 4.5,
): Promise<number> {
  await expect(locator).toBeVisible();
  const result = await locator.evaluate((element) => {
    type Rgba = { r: number; g: number; b: number; a: number };

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    const parseAlpha = (value: string | undefined): number => {
      if (!value) return 1;
      const trimmed = value.trim();
      if (trimmed.endsWith("%")) return clamp(Number(trimmed.slice(0, -1)) / 100, 0, 1);
      return clamp(Number(trimmed), 0, 1);
    };

    const parseChannel = (value: string, scale: number): number => {
      const trimmed = value.trim();
      if (trimmed.endsWith("%"))
        return clamp((Number(trimmed.slice(0, -1)) / 100) * scale, 0, scale);
      return clamp(Number(trimmed), 0, scale);
    };

    const parseSignedChannel = (value: string, scale: number): number => {
      const trimmed = value.trim();
      if (trimmed.endsWith("%")) return (Number(trimmed.slice(0, -1)) / 100) * scale;
      return Number(trimmed);
    };

    const parseHue = (value: string): number => {
      const trimmed = value.trim();
      if (trimmed.endsWith("deg")) return Number(trimmed.slice(0, -3));
      if (trimmed.endsWith("rad")) return (Number(trimmed.slice(0, -3)) * 180) / Math.PI;
      if (trimmed.endsWith("turn")) return Number(trimmed.slice(0, -4)) * 360;
      return Number(trimmed);
    };

    const splitColorParts = (value: string): { channels: string[]; alpha?: string } => {
      const slashParts = value
        .replace(/\s*\/\s*/u, " / ")
        .trim()
        .split(/\s+/u);
      const slashIndex = slashParts.indexOf("/");
      if (slashIndex >= 0) {
        return {
          channels: slashParts.slice(0, slashIndex),
          alpha: slashParts[slashIndex + 1],
        };
      }
      return { channels: slashParts };
    };

    const linearToSrgb = (value: number): number => {
      const clamped = clamp(value, 0, 1);
      return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    };

    const oklabToRgb = (lightness: number, a: number, b: number, alpha: number): Rgba => {
      const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
      const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
      const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
      const l = lPrime ** 3;
      const m = mPrime ** 3;
      const s = sPrime ** 3;
      return {
        r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) * 255,
        g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) * 255,
        b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) * 255,
        a: alpha,
      };
    };

    const oklchToRgb = (lightness: number, chroma: number, hue: number, alpha: number): Rgba => {
      const hueRadians = (hue * Math.PI) / 180;
      return oklabToRgb(
        lightness,
        chroma * Math.cos(hueRadians),
        chroma * Math.sin(hueRadians),
        alpha,
      );
    };

    const parseCssColor = (value: string): Rgba => {
      const trimmed = value.trim().toLowerCase();
      if (trimmed === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

      const rgbMatch = /^rgba?\((.*)\)$/u.exec(trimmed);
      if (rgbMatch) {
        const body = rgbMatch[1];
        const parts = body.includes(",")
          ? body.split(",").map((part) => part.trim())
          : splitColorParts(body).channels;
        const alpha = body.includes(",")
          ? parseAlpha(parts[3])
          : parseAlpha(splitColorParts(body).alpha);
        return {
          r: parseChannel(parts[0], 255),
          g: parseChannel(parts[1], 255),
          b: parseChannel(parts[2], 255),
          a: alpha,
        };
      }

      const srgbMatch = /^color\(\s*srgb\s+(.*)\)$/u.exec(trimmed);
      if (srgbMatch) {
        const parts = splitColorParts(srgbMatch[1]);
        return {
          r: parseChannel(parts.channels[0], 1) * 255,
          g: parseChannel(parts.channels[1], 1) * 255,
          b: parseChannel(parts.channels[2], 1) * 255,
          a: parseAlpha(parts.alpha),
        };
      }

      const oklchMatch = /^oklch\((.*)\)$/u.exec(trimmed);
      if (oklchMatch) {
        const parts = splitColorParts(oklchMatch[1]);
        const lightness = parseChannel(parts.channels[0], 1);
        const chroma = parseChannel(parts.channels[1], 1);
        const hue = parseHue(parts.channels[2] ?? "0");
        return oklchToRgb(lightness, chroma, hue, parseAlpha(parts.alpha));
      }

      const oklabMatch = /^oklab\((.*)\)$/u.exec(trimmed);
      if (oklabMatch) {
        const parts = splitColorParts(oklabMatch[1]);
        return oklabToRgb(
          parseChannel(parts.channels[0], 1),
          parseSignedChannel(parts.channels[1], 1),
          parseSignedChannel(parts.channels[2], 1),
          parseAlpha(parts.alpha),
        );
      }

      throw new Error(`Unsupported computed color: ${value}`);
    };

    const composite = (foreground: Rgba, background: Rgba): Rgba => {
      const alpha = foreground.a + background.a * (1 - foreground.a);
      if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
        g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
        b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
        a: alpha,
      };
    };

    const effectiveBackground = (target: Element): Rgba => {
      const chain: Element[] = [];
      for (let current: Element | null = target; current; current = current.parentElement) {
        chain.unshift(current);
      }

      let background: Rgba = { r: 255, g: 255, b: 255, a: 1 };
      for (const item of chain) {
        const color = parseCssColor(window.getComputedStyle(item).backgroundColor);
        if (color.a > 0) background = composite(color, background);
      }
      return background;
    };

    const srgbToLinear = (value: number): number => {
      const normalized = value / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };

    const luminance = (color: Rgba): number =>
      0.2126 * srgbToLinear(color.r) +
      0.7152 * srgbToLinear(color.g) +
      0.0722 * srgbToLinear(color.b);

    const contrastRatio = (foreground: Rgba, background: Rgba): number => {
      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      const lighter = Math.max(foregroundLuminance, backgroundLuminance);
      const darker = Math.min(foregroundLuminance, backgroundLuminance);
      return (lighter + 0.05) / (darker + 0.05);
    };

    const style = window.getComputedStyle(element);
    const background = effectiveBackground(element);
    const foreground = composite(parseCssColor(style.color), background);
    return {
      background: style.backgroundColor,
      color: style.color,
      ratio: contrastRatio(foreground, background),
    };
  });

  expect(
    result.ratio,
    `${label} contrast (${result.color} on ${result.background})`,
  ).toBeGreaterThanOrEqual(minimumRatio);
  return result.ratio;
}

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

    await expect(page.getByText(/Location permission was not granted/u)).toBeVisible();
    await page.keyboard.press("Tab");
    const fallbackButton = page.getByRole("button", { name: "Use manual fallback" });
    await expect(fallbackButton).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(
      page.getByText("Manual fallback submitted for review", { exact: true }),
    ).toBeVisible();
    expect(fallbackRequests).toHaveLength(1);
  });

  test("employee attendance result contrast meets AA in light and dark themes", async ({
    page,
  }) => {
    await installTheme(page, "light");
    await prepareAttendancePage(page);
    await routeEmployeeAttendanceSummary(page);
    await page.route("**/api/v1/attendance/punches", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await openAttendance(page);
    await page.getByRole("button", { name: "Clock in", exact: true }).click();
    await expectContrastAtLeast(
      page.getByRole("status").filter({ hasText: "Clock-in recorded" }),
      "light accepted attendance result",
    );

    await applyTheme(page, "dark");
    await expectContrastAtLeast(
      page.getByRole("status").filter({ hasText: "Clock-in recorded" }),
      "dark accepted attendance result",
    );
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
    const requests = await prepareAttendanceReportPage(page);
    await page.setViewportSize({ width: 320, height: 568 });

    await page.goto("/reports/attendance", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Daily Attendance" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "From" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "To" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Department" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Employee" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Status" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Evidence state" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Source" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Site" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Approval" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Geo outcome" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Review type" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Reason" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Team" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Search attendance records" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Filters", exact: true })).toHaveCount(0);

    await page.getByRole("combobox", { name: "Evidence state" }).click();
    await page.getByRole("option", { name: "Provisional" }).click();
    await page.getByRole("combobox", { name: "Source" }).click();
    await page.getByRole("option", { name: "Geo evidence" }).click();
    await page.getByRole("combobox", { name: "Site" }).click();
    await page.getByRole("option", { name: "Bengaluru Office (Office)" }).click();
    await page.getByRole("combobox", { name: "Approval" }).click();
    await page.getByRole("option", { name: "Pending" }).click();
    await expect
      .poll(() => requests.reportRequests.at(-1) ?? "")
      .toContain("evidence_category=provisional");
    const latestReportRequest = requests.reportRequests.at(-1) ?? "";
    expect(latestReportRequest).toContain("source_category=geo");
    expect(latestReportRequest).toContain("work_site_id=00000000-0000-4000-8000-000000000a11");
    expect(latestReportRequest).toContain("approval_state=pending");
    await page.getByRole("button", { name: "Export CSV" }).click();
    await expect.poll(() => requests.exportRequests.length).toBe(1);
    expect(requests.exportRequests[0]).toMatchObject({
      format: "csv",
      filters: {
        evidence_category: "provisional",
        source_category: "geo",
        work_site_id: "00000000-0000-4000-8000-000000000a11",
        approval_state: "pending",
        report_mode: "daily",
      },
    });
    await expect(page.locator("body")).not.toContainText("12.974");
    await expect(page.locator("body")).not.toContainText("77.597");

    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByRole("combobox", { name: "Evidence state" })).toContainText(
      "All evidence states",
    );
    await expect(page.getByRole("combobox", { name: "Source" })).toContainText("All sources");
    await expect(page.getByRole("combobox", { name: "Site" })).toContainText("All sites");
    await expect(page.getByRole("combobox", { name: "Approval" })).toContainText("All approvals");
    await page.getByRole("button", { name: "Export CSV" }).click();
    await expect.poll(() => requests.exportRequests.length).toBe(2);
    expect(requests.exportRequests[1]).toMatchObject({
      format: "csv",
      filters: { report_mode: "daily" },
    });
    expect(requests.exportRequests[1]?.filters).not.toHaveProperty("evidence_category");
    expect(requests.exportRequests[1]?.filters).not.toHaveProperty("source_category");
    expect(requests.exportRequests[1]?.filters).not.toHaveProperty("work_site_id");
    expect(requests.exportRequests[1]?.filters).not.toHaveProperty("approval_state");
    await page.getByRole("tab", { name: "Late Arrivals" }).click();
    await page.getByRole("button", { name: "Export CSV" }).click();
    await expect.poll(() => requests.exportRequests.length).toBe(3);
    expect(requests.exportRequests[2]).toMatchObject({
      filters: { report_mode: "late" },
    });
    await page.getByRole("tab", { name: "Monthly Summary" }).click();
    await page.getByRole("button", { name: "Export CSV" }).click();
    await expect.poll(() => requests.exportRequests.length).toBe(4);
    expect(requests.exportRequests[3]).toMatchObject({
      filters: { report_mode: "monthly_summary" },
    });
    await expectNoDocumentHorizontalOverflow(page, "/reports/attendance accessibility");
  });

  test("attendance report status contrast meets AA in light and dark themes", async ({ page }) => {
    await installTheme(page, "light");
    await prepareAttendanceReportPage(page);

    await page.goto("/reports/attendance", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Daily Attendance" })).toBeVisible();
    await expectContrastAtLeast(
      page
        .locator("span:visible")
        .filter({ hasText: /^Present$/u })
        .first(),
      "light success status badge",
    );
    await expectContrastAtLeast(
      page.locator("span:visible").filter({ hasText: /^WFH$/u }).first(),
      "light info status badge",
    );
    await expectContrastAtLeast(
      page
        .locator("span:visible")
        .filter({ hasText: /^Absent$/u })
        .first(),
      "light destructive status badge",
    );

    await page.getByRole("tab", { name: "Monthly Summary" }).click();
    await expectContrastAtLeast(
      page.locator('[data-testid="attendance-monthly-percentage-success"]:visible').first(),
      "light monthly success percentage",
    );
    await expectContrastAtLeast(
      page.locator('[data-testid="attendance-monthly-percentage-destructive"]:visible').first(),
      "light monthly destructive percentage",
    );

    await applyTheme(page, "dark");
    await page.getByRole("tab", { name: "Daily Attendance" }).click();
    await expectContrastAtLeast(
      page
        .locator("span:visible")
        .filter({ hasText: /^Present$/u })
        .first(),
      "dark success status badge",
    );
    await expectContrastAtLeast(
      page.locator("span:visible").filter({ hasText: /^WFH$/u }).first(),
      "dark info status badge",
    );
    await expectContrastAtLeast(
      page
        .locator("span:visible")
        .filter({ hasText: /^Absent$/u })
        .first(),
      "dark destructive status badge",
    );

    await page.getByRole("tab", { name: "Monthly Summary" }).click();
    await expectContrastAtLeast(
      page.locator('[data-testid="attendance-monthly-percentage-success"]:visible').first(),
      "dark monthly success percentage",
    );
    await expectContrastAtLeast(
      page.locator('[data-testid="attendance-monthly-percentage-destructive"]:visible').first(),
      "dark monthly destructive percentage",
    );
  });

  test("manager attendance reports omit unavailable export action", async ({ page }) => {
    await prepareAttendanceReportPage(page, { roleKey: "Manager", roleLabel: "Manager" });
    await page.goto("/reports/attendance", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Daily Attendance" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Site" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Approval" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
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
    message: "Location check requires manual fallback review.",
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

async function prepareAttendanceReportPage(
  page: Page,
  role: { roleKey: string; roleLabel: string } = {
    roleKey: "Main Admin",
    roleLabel: "Main Admin",
  },
): Promise<{ reportRequests: string[]; exportRequests: Array<Record<string, unknown>> }> {
  const reportRequests: string[] = [];
  const exportRequests: Array<Record<string, unknown>> = [];
  const fixtureDate = previousLocalDate();
  await installRole(page, role.roleKey, role.roleLabel);
  await page.route("**/api/v1/reports/attendance/summary**", async (route) => {
    reportRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "attendance-report-a11y-1",
            employee_user_id: "employee-a11y-1",
            date: fixtureDate,
            employee: "Aarav Sharma",
            department: "Engineering",
            status: "present",
            reporting_evidence_category: "verified",
            attendance_channels: ["Web"],
            source_categories: ["web"],
            work_site_id: ["00000000-0000-4000-8000-000000000a11"],
            work_site_name: ["Bengaluru Office"],
            work_site_type: ["office"],
            approval_state: "pending",
            geo_outcome: ["inside_confident"],
            geo_action: ["allow"],
            review_type: ["geo_decision"],
            reason_codes: ["offline_sync.changed_body_conflict"],
            review_required: false,
            review_outcome: [],
            in_time: "09:00",
            out_time: "18:00",
            hours: 9,
            note: "Accessible filter fixture",
          },
          {
            id: "attendance-report-a11y-2",
            employee_user_id: "employee-a11y-2",
            date: fixtureDate,
            employee: "Info Contrast Employee",
            department: "Engineering",
            status: "wfh",
            reporting_evidence_category: "provisional",
            attendance_channels: ["Geo"],
            source_categories: ["geo"],
            work_site_id: ["00000000-0000-4000-8000-000000000a11"],
            work_site_name: ["Bengaluru Office"],
            work_site_type: ["office"],
            approval_state: "pending",
            geo_outcome: ["inside_confident"],
            geo_action: ["allow"],
            review_type: ["geo_decision"],
            reason_codes: ["geo_accuracy_exceeded"],
            review_required: true,
            review_outcome: [],
            in_time: "09:15",
            out_time: "18:10",
            hours: 8.9,
            note: "Info contrast fixture",
          },
          {
            id: "attendance-report-a11y-3",
            employee_user_id: "employee-a11y-3",
            date: fixtureDate,
            employee: "Destructive Contrast Employee",
            department: "Engineering",
            status: "absent",
            reporting_evidence_category: "rejected",
            attendance_channels: ["Geo"],
            source_categories: ["geo"],
            work_site_id: ["00000000-0000-4000-8000-000000000a11"],
            work_site_name: ["Bengaluru Office"],
            work_site_type: ["office"],
            approval_state: "rejected",
            geo_outcome: ["permission_denied"],
            geo_action: ["deny"],
            review_type: ["geo_decision"],
            reason_codes: ["geo_permission_denied"],
            review_required: false,
            review_outcome: ["rejected"],
            in_time: "",
            out_time: "",
            hours: 0,
            note: "Destructive contrast fixture",
          },
        ],
        evidence_categories: {
          verified: 1,
          warning: 0,
          provisional: 1,
          review_required: 0,
          rejected: 1,
        },
        site_options: [
          {
            id: "00000000-0000-4000-8000-000000000a11",
            label: "Bengaluru Office",
            type: "office",
          },
        ],
        page: 1,
        page_size: 100,
        total: 3,
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
  await page.route("**/api/v1/attendance/exports", async (route) => {
    exportRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "attendance-report-a11y-export",
        status: "queued",
        format: "csv",
        filters: {},
        columns: [],
        created_at: "2026-01-15T10:00:00.000Z",
      }),
    });
  });
  return { reportRequests, exportRequests };
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
