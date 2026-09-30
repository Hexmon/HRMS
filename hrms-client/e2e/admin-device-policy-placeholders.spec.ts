import { expect, test, type Page } from "@playwright/test";

const PLACEHOLDER_POLICY_KEYS = [
  "registeredDeviceRequired",
  "registered_device_required",
  "offlineAllowed",
  "offline_allowed",
  "attestationPolicy",
  "attestation_policy",
] as const;

test("admin attendance policies show read-only mobile device placeholders without payload leakage", async ({
  page,
}) => {
  const requests = await prepareAdminPoliciesPage(page);

  await page.goto("/admin-settings/policies");
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });

  await expect(page.getByRole("tab", { name: "Attendance" })).toBeVisible();
  await expect(page.getByText("Mobile attendance policy", { exact: true })).toBeVisible();
  await expect(page.getByText("Mobile backend pending", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "These settings define the planned mobile attendance policy. They are currently read-only and are not saved or enforced from this admin page.",
      { exact: true },
    ),
  ).toBeVisible();

  const registeredDevice = page.getByRole("switch", { name: "Require registered device" });
  await expect(registeredDevice).toBeVisible();
  await expect(registeredDevice).toBeDisabled();
  await expect(registeredDevice).toBeChecked();

  const offlineCapture = page.getByRole("switch", { name: "Allow offline attendance capture" });
  await expect(offlineCapture).toBeVisible();
  await expect(offlineCapture).toBeDisabled();

  const attestation = page.getByRole("combobox", { name: "Device attestation" });
  await expect(attestation).toBeVisible();
  await expect(attestation).toBeDisabled();
  await expect(attestation).toContainText("Disabled");
  await expect(page.getByText("Disabled and Preferred", { exact: false })).toBeVisible();

  await expect.poll(() => requests.policyUpdates.length).toBe(0);

  await page
    .getByText("Grace minutes (no late mark)", { exact: true })
    .locator("xpath=following-sibling::input")
    .fill("12");
  await page.getByRole("button", { name: "Save policy" }).click();

  await expect.poll(() => requests.policyUpdates.length).toBe(1);
  const payload = requests.policyUpdates[0];
  expect(payload.config).toMatchObject({ graceMinutes: 12 });
  for (const key of PLACEHOLDER_POLICY_KEYS) {
    expect(JSON.stringify(payload), `${key} must not be submitted`).not.toContain(`"${key}"`);
  }
});

async function prepareAdminPoliciesPage(page: Page): Promise<{
  policyUpdates: Array<{ expected_version?: number; config?: Record<string, unknown> }>;
}> {
  const policyUpdates: Array<{ expected_version?: number; config?: Record<string, unknown> }> = [];

  await page.addInitScript(() => {
    window.sessionStorage.setItem("hawkaii_api_access_token", "admin-device-policy-token");
    window.localStorage.setItem(
      "hawkaii_session",
      JSON.stringify({
        user: { id: "admin-device-policy-main-admin" },
        role: "main_admin",
      }),
    );
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
            id: "admin-device-policy-main-admin",
            employee_code: "ADM-012",
            email: "admin-device-policy@example.test",
            full_name: "Admin Device Policy",
            roles: ["Admin"],
          },
          active_role: { key: "Admin", label: "Admin", is_active: true },
          available_roles: [{ key: "Admin", label: "Admin", is_active: true }],
          permissions: [],
          setup_required: false,
        }),
      });
      return;
    }

    if (path === "/api/v1/admin/policies" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [attendancePolicy()],
          policies: [attendancePolicy()],
          versions: { attendance: attendancePolicy().version },
        }),
      });
      return;
    }

    if (path === "/api/v1/admin/policies/attendance" && method === "PUT") {
      const body = request.postDataJSON() as {
        expected_version?: number;
        config?: Record<string, unknown>;
      };
      policyUpdates.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          policy: { ...attendancePolicy(), config: body.config ?? {}, version: 8 },
          version: 8,
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

  return { policyUpdates };
}

function attendancePolicy() {
  return {
    id: "policy-attendance",
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
    },
    updated_at: "2026-09-30T00:00:00.000Z",
    version: 7,
  };
}
