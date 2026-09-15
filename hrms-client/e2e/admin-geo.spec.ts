import { expect, test, type Page } from "@playwright/test";

test("admin geo route supports local drafting without provider config", async ({ page }) => {
  await prepareAdminGeoPage(page);
  await page.goto("/admin-settings/geo");
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });

  await expect(
    page.getByRole("main").getByRole("heading", { name: "Admin Settings" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Geo" })).toBeVisible();
  await expect(page.getByTestId("admin-geo-map-missing")).toBeVisible();
  await expect(page.getByText("Work Site Location", { exact: true })).toBeVisible();
  await expect(page.getByText("Polygon Geofence", { exact: true })).toBeVisible();

  await page.getByLabel("Longitude").first().fill("77.5946");
  await page.getByLabel("Latitude").first().fill("12.9716");
  await expect(page.getByText("Preview marker at")).toBeVisible();

  await page.getByLabel("Longitude").nth(1).fill("77");
  await page.getByLabel("Latitude").nth(1).fill("12");
  await page.getByRole("button", { name: "Add vertex" }).click();
  await page.getByLabel("Longitude").nth(1).fill("78");
  await page.getByLabel("Latitude").nth(1).fill("12");
  await page.getByRole("button", { name: "Add vertex" }).click();
  await page.getByLabel("Longitude").nth(1).fill("78");
  await page.getByLabel("Latitude").nth(1).fill("13");
  await page.getByRole("button", { name: "Add vertex" }).click();

  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await expect(page.getByTestId("polygon-vertex-list").getByRole("listitem")).toHaveCount(3);

  await page.getByRole("button", { name: "Remove last" }).click();
  await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
  await expect(page.getByTestId("polygon-vertex-list").getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Reset polygon" }).click();
  await expect(page.getByTestId("polygon-vertex-list").getByText("No vertices yet.")).toBeVisible();
});

async function prepareAdminGeoPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("hawkaii_api_access_token", "admin-geo-token");
  });
  await page.route("**/api/v1/**", async (route) => {
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
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "admin-geo-main-admin",
          employee_code: "ADM-001",
          email: "admin-geo@example.test",
          full_name: "Admin Geo",
          roles: ["Admin"],
        },
        active_role: { key: "Admin", label: "Admin", is_active: true },
        available_roles: [{ key: "Admin", label: "Admin", is_active: true }],
        permissions: [],
        setup_required: false,
      }),
    });
  });
}
