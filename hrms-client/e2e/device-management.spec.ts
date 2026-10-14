import { expect, test, type Page, type Route } from "@playwright/test";

const ADMIN_DEVICE_ID = "00000000-0000-4000-8000-0000001100aa";
const ADMIN_SUSPENDED_DEVICE_ID = "00000000-0000-4000-8000-0000002200bb";
const EMPLOYEE_DEVICE_ID = "00000000-0000-4000-8000-0000003300cc";

test("main admin can inspect, filter, and revoke registered mobile devices", async ({ page }) => {
  const state = await prepareDeviceManagementPage(page, "main_admin");

  await page.goto("/admin-settings/devices");
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });

  const table = page.getByRole("table");
  await expect(page.getByText("Device management", { exact: true })).toBeVisible();
  await expect(table.getByText("Employee One", { exact: true })).toBeVisible();
  await expect(table.getByText("Device 1100AA", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(ADMIN_DEVICE_ID);
  await expect(page.locator("body")).not.toContainText("installation_id_hash");

  await page.getByPlaceholder("Search employee code or name").fill("E1");
  await expect
    .poll(() => state.adminDeviceRequests.some((url) => url.searchParams.get("q") === "E1"))
    .toBe(true);

  await page.getByRole("combobox", { name: "Status filter" }).click();
  await page.getByRole("option", { name: "Suspended" }).click();
  await expect
    .poll(() =>
      state.adminDeviceRequests.some((url) => url.searchParams.get("status") === "suspended"),
    )
    .toBe(true);
  await expect(table.getByText("Device 2200BB", { exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Status filter" }).click();
  await page.getByRole("option", { name: "All statuses" }).click();
  await page.getByRole("button", { name: "Revoke" }).first().click();
  await expect(page.getByRole("dialog", { name: "Revoke Device 1100AA" })).toBeVisible();
  await expect(
    page.getByText("It does not sign the user out of web sessions.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Reason" }).click();
  await page.getByRole("option", { name: "Security concern" }).click();
  await page.getByRole("button", { name: "Revoke device" }).click();

  await expect.poll(() => state.revokeCalls.length).toBe(1);
  expect(state.revokeCalls[0]).toEqual({
    deviceId: ADMIN_DEVICE_ID,
    body: { reason: "security" },
  });
});

test("HR admin cannot access device lifecycle management", async ({ page }) => {
  const state = await prepareDeviceManagementPage(page, "hr_admin");

  await page.goto("/admin-settings");
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });
  await expect(page.getByRole("tab", { name: "Devices" })).toHaveCount(0);

  await page.goto("/admin-settings/devices");
  await expect(page).toHaveURL(/\/admin-settings\/?$/);
  expect(state.adminDeviceRequests).toHaveLength(0);
});

test("employee profile shows masked registered devices and can revoke one", async ({ page }) => {
  const state = await prepareDeviceManagementPage(page, "employee");

  await page.goto("/ems/profile");
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });

  await expect(page.getByText("My devices", { exact: true })).toBeVisible();
  await expect(page.getByText("Device 3300CC", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(EMPLOYEE_DEVICE_ID);

  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("dialog", { name: "Revoke Device 3300CC" })).toBeVisible();
  await page.getByRole("combobox", { name: "Reason" }).click();
  await page.getByRole("option", { name: "User requested" }).click();
  await page.getByRole("button", { name: "Revoke device" }).click();

  await expect.poll(() => state.revokeCalls.length).toBe(1);
  expect(state.revokeCalls[0]).toEqual({
    deviceId: EMPLOYEE_DEVICE_ID,
    body: { reason: "user_requested" },
  });
});

async function prepareDeviceManagementPage(
  page: Page,
  role: "main_admin" | "hr_admin" | "employee",
): Promise<{
  adminDeviceRequests: URL[];
  revokeCalls: Array<{ deviceId: string; body: Record<string, unknown> }>;
}> {
  const adminDeviceRequests: URL[] = [];
  const revokeCalls: Array<{ deviceId: string; body: Record<string, unknown> }> = [];
  const backendRole =
    role === "main_admin" ? "Admin" : role === "hr_admin" ? "HR Manager" : "Employee";

  await page.addInitScript(
    ({ localRole }) => {
      window.sessionStorage.setItem("hawkaii_api_access_token", "device-management-token");
      window.localStorage.setItem(
        "hawkaii_session",
        JSON.stringify({
          user: { id: `${localRole}-device-management-user` },
          role: localRole,
        }),
      );
    },
    { localRole: role },
  );

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === "/api/v1/auth/me") {
      await fulfillJson(route, {
        user: {
          id: `${role}-device-management-user`,
          employee_code: role === "employee" ? "E1" : role === "hr_admin" ? "HR1" : "ADM",
          email: `${role}@device-management.example.test`,
          full_name:
            role === "employee" ? "Employee One" : role === "hr_admin" ? "HR Admin" : "Main Admin",
          roles: [backendRole],
        },
        active_role: { key: backendRole, label: backendRole, is_active: true },
        available_roles: [{ key: backendRole, label: backendRole, is_active: true }],
        permissions: [],
        setup_required: false,
      });
      return;
    }

    if (path === "/api/v1/platform/admin/devices" && method === "GET") {
      adminDeviceRequests.push(url);
      await fulfillJson(route, adminDeviceListResponse(url));
      return;
    }

    if (path === "/api/v1/platform/devices" && method === "GET") {
      await fulfillJson(route, {
        items: [
          {
            registered_device_id: EMPLOYEE_DEVICE_ID,
            platform: "android",
            status: "registered",
            created_at: "2026-08-09T03:40:00.000Z",
            status_changed_at: "2026-08-09T03:40:00.000Z",
            updated_at: "2026-08-09T03:40:00.000Z",
          },
        ],
      });
      return;
    }

    const revokeMatch = path.match(/^\/api\/v1\/platform\/devices\/([^/]+)\/revoke$/u);
    if (revokeMatch && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      revokeCalls.push({ deviceId: decodeURIComponent(revokeMatch[1]!), body });
      await fulfillJson(route, {
        registered_device_id: decodeURIComponent(revokeMatch[1]!),
        platform: "android",
        status: "revoked",
        created_at: "2026-08-09T03:40:00.000Z",
        status_changed_at: "2026-08-09T04:00:00.000Z",
        updated_at: "2026-08-09T04:00:00.000Z",
      });
      return;
    }

    if (path === "/api/v1/ems/profile/me") {
      await fulfillJson(route, employeeProfile());
      return;
    }

    if (path === "/api/v1/core/users/profile-photo-policy") {
      await fulfillJson(route, {
        max_bytes: 2097152,
        max_width: 512,
        max_height: 512,
        jpeg_quality: 0.82,
        allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
        output_mime_type: "image/jpeg",
      });
      return;
    }

    await fulfillJson(route, {
      items: [],
      page: 1,
      page_size: 25,
      total: 0,
      notifications: [],
      unread_count: 0,
    });
  });

  return { adminDeviceRequests, revokeCalls };
}

function adminDeviceListResponse(url: URL) {
  const status = url.searchParams.get("status");
  const allItems = [
    {
      registered_device_id: ADMIN_DEVICE_ID,
      platform: "android",
      status: "registered",
      created_at: "2026-08-09T03:40:00.000Z",
      status_changed_at: "2026-08-09T03:40:00.000Z",
      updated_at: "2026-08-09T03:40:00.000Z",
      owner: { employee_code: "E1", full_name: "Employee One" },
    },
    {
      registered_device_id: ADMIN_SUSPENDED_DEVICE_ID,
      platform: "ios",
      status: "suspended",
      created_at: "2026-08-10T03:40:00.000Z",
      status_changed_at: "2026-08-10T03:40:00.000Z",
      updated_at: "2026-08-10T03:40:00.000Z",
      owner: { employee_code: "E2", full_name: "Employee Two" },
    },
  ];
  const items =
    status && status !== "registered"
      ? allItems.filter((item) => item.status === status)
      : allItems;
  return {
    items,
    page: Number(url.searchParams.get("page") ?? 1),
    page_size: Number(url.searchParams.get("page_size") ?? 25),
    total: items.length,
  };
}

function employeeProfile() {
  return {
    profile: {
      user: {
        id: "employee-device-management-user",
        employee_code: "E1",
        full_name: "Employee One",
        email: "employee@device-management.example.test",
      },
      manager: null,
      department: { name: "People" },
      designation: { name: "Analyst" },
      joined_on: "2026-01-01",
      employment_status: "active",
      personal_email: "employee.personal@example.test",
      phone: "+91 90000 00000",
      alternate_phone: "",
      current_address: "Bangalore",
      permanent_address: "Bangalore",
      city: "Bangalore",
      country: "India",
      emergency_contact: {},
      personal_details: {},
      work_preferences: {},
      version: 1,
    },
    summaries: {},
  };
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
