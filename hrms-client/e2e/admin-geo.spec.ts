import { expect, test, type Page } from "@playwright/test";

test("admin geo route manages persisted work sites, geofences, draft shapes and publishing", async ({
  page,
}) => {
  const requests = await prepareAdminGeoPage(page);
  await page.goto("/admin-settings/geo");
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });

  await expect(
    page.getByRole("main").getByRole("heading", { name: "Admin Settings" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Geo" })).toBeVisible();
  await expect(page.getByTestId("admin-geo-map-missing")).toBeVisible();
  await expect(
    page.getByText(/Geo attendance policies use a one-time location result/u),
  ).toBeVisible();
  await expect(
    page.getByText(/routine reports use privacy-safe site and evidence labels/u),
  ).toBeVisible();
  await expect(
    page.getByText(/exact-location access remains separately restricted/u),
  ).toBeVisible();
  await expect(page.getByText("Work Sites", { exact: true })).toBeVisible();
  await expect(page.getByText("Bengaluru HQ", { exact: true })).toBeVisible();
  await expect(page.getByText("Main office perimeter", { exact: true })).toBeVisible();
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();

  await page.getByLabel("Radius meters").fill("225");
  await page.getByRole("button", { name: "Update draft" }).click();
  await expect.poll(() => requests.versionUpdates.length).toBe(1);
  expect(requests.versionUpdates[0]).toMatchObject({
    shapeType: "circle",
    center: { longitude: 77.5946, latitude: 12.9716 },
    radiusMeters: 225,
  });

  await page.getByRole("button", { name: "Polygon" }).click();
  await page.getByLabel("Longitude").fill("77");
  await page.getByLabel("Latitude").fill("12");
  await page.getByRole("button", { name: "Add vertex" }).click();
  await page.getByLabel("Longitude").fill("78");
  await page.getByLabel("Latitude").fill("12");
  await page.getByRole("button", { name: "Add vertex" }).click();
  await page.getByLabel("Longitude").fill("78");
  await page.getByLabel("Latitude").fill("13");
  await page.getByRole("button", { name: "Add vertex" }).click();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await expect(page.getByTestId("polygon-vertex-list").getByRole("listitem")).toHaveCount(3);

  await page.getByRole("button", { name: "Update draft" }).click();
  await expect.poll(() => requests.versionUpdates.length).toBe(2);
  expect(requests.versionUpdates[1]).toMatchObject({
    shapeType: "polygon",
    vertices: [
      [77, 12],
      [78, 12],
      [78, 13],
    ],
  });

  await page.getByLabel("Effective from").fill("2026-09-16T09:00");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect.poll(() => requests.publishes.length).toBe(1);
  expect(requests.publishes[0]).toMatchObject({
    effectiveUntil: null,
  });
  expect(typeof requests.publishes[0]?.effectiveFrom).toBe("string");
});

async function prepareAdminGeoPage(page: Page): Promise<{
  versionUpdates: unknown[];
  publishes: unknown[];
}> {
  const versionUpdates: unknown[] = [];
  const publishes: unknown[] = [];

  await page.addInitScript(() => {
    window.sessionStorage.setItem("hawkaii_api_access_token", "admin-geo-token");
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
      return;
    }

    if (path === "/api/v1/attendance/work-sites" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: "ws-1",
              siteCode: "BLR-HQ",
              name: "Bengaluru HQ",
              siteType: "office",
              timezone: "Asia/Kolkata",
              isActive: true,
              metadata: {},
              createdAt: "2026-09-16T00:00:00.000Z",
              updatedAt: "2026-09-16T00:00:00.000Z",
              deletedAt: null,
              version: 1,
            },
          ],
        }),
      });
      return;
    }

    if (path === "/api/v1/attendance/work-sites/ws-1/geofences" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: "gf-1",
              workSiteId: "ws-1",
              geofenceCode: "MAIN",
              name: "Main office perimeter",
              isActive: true,
              currentPublishedVersionId: null,
              metadata: {},
              createdAt: "2026-09-16T00:00:00.000Z",
              updatedAt: "2026-09-16T00:00:00.000Z",
              deletedAt: null,
              version: 1,
            },
          ],
        }),
      });
      return;
    }

    if (path === "/api/v1/attendance/geofences/gf-1/versions" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [circleVersion()],
        }),
      });
      return;
    }

    if (path === "/api/v1/attendance/geofences/gf-1/versions/ver-1" && method === "PATCH") {
      const body = request.postDataJSON();
      versionUpdates.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: { ...circleVersion(), shapeType: body.shapeType, shape: versionShape(body) },
        }),
      });
      return;
    }

    if (path === "/api/v1/attendance/geofences/gf-1/versions/ver-1/publish" && method === "POST") {
      publishes.push(request.postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          publishedVersion: { ...circleVersion(), versionStatus: "published" },
          retiredVersionIds: [],
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

  return { versionUpdates, publishes };
}

function circleVersion() {
  return {
    id: "ver-1",
    geofenceId: "gf-1",
    versionNumber: 1,
    versionStatus: "draft",
    shapeType: "circle",
    shape: {
      center: { longitude: 77.5946, latitude: 12.9716 },
      radiusMeters: 150,
    },
    shapeMetadata: {},
    effectiveFrom: null,
    effectiveUntil: null,
    canonicalHash: null,
    publishedAt: null,
    publishedByUserId: null,
    createdAt: "2026-09-16T00:00:00.000Z",
    createdByUserId: "admin-geo-main-admin",
  };
}

function versionShape(body: Record<string, unknown>) {
  if (body.shapeType === "polygon") {
    return { vertices: body.vertices };
  }
  return {
    center: body.center,
    radiusMeters: body.radiusMeters,
  };
}
