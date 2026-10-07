import { expect, test, type Page } from "@playwright/test";

test("API mutation failures show backend message and never show success", async ({ page }) => {
  await prepareHelpdeskPage(page);

  await page.route("**/api/v1/helpdesk/tickets", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        code: "VALIDATION_FAILED",
        message: "Backend rejected this ticket.",
        details: { fieldErrors: { subject: ["Use a more specific subject."] } },
        request_id: "req-toast-e2e",
      }),
    });
  });

  await page.goto("/helpdesk", { waitUntil: "networkidle" });
  await waitForWorkspace(page);
  await page.getByRole("button", { name: "Raise ticket" }).click();
  await page.getByPlaceholder("Short summary").fill("Broken");
  await page
    .locator("textarea[placeholder^='Add as much detail']")
    .fill("This deliberately exercises the API error toast path.");
  await page.getByRole("button", { name: "Submit ticket" }).click();

  await expect(page.getByText("Backend rejected this ticket.")).toBeVisible();
  await expect(page.getByText(/subject: Use a more specific subject\./)).toBeVisible();
  await expect(page.getByText(/Request ID: req-toast-e2e/)).toBeVisible();
  await expect(page.getByText("Ticket created")).toHaveCount(0);
});

test("API error details redact coordinates while preserving safe context", async ({ page }) => {
  await prepareHelpdeskPage(page);

  await page.route("**/api/v1/helpdesk/tickets", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        code: "VALIDATION_FAILED",
        message: "Backend rejected this ticket.",
        details: {
          latitude: 10.123,
          longitude: 20.456,
          deviceLatitude: 10.123,
          reason_code: "geo_outside_fence",
          selected_action: "manual_fallback",
          evidence: {
            coordinates: {
              latitude: 10.123,
              longitude: 20.456,
            },
          },
          browserLocation: {
            lat: 10.123,
            lng: 20.456,
          },
          samples: [
            {
              raw_location: {
                lat: 10.123,
                lng: 20.456,
              },
              validation_note: "Safe validation detail remains visible",
            },
          ],
          fieldErrors: {
            subject: ["Use a more specific subject."],
            latitude: ["10.123 should never be displayed"],
          },
        },
        request_id: "req-toast-redaction-e2e",
      }),
    });
  });

  await page.goto("/helpdesk", { waitUntil: "networkidle" });
  await waitForWorkspace(page);
  await page.getByRole("button", { name: "Raise ticket" }).click();
  await page.getByPlaceholder("Short summary").fill("Broken");
  await page
    .locator("textarea[placeholder^='Add as much detail']")
    .fill("This deliberately exercises location error detail redaction.");
  await page.getByRole("button", { name: "Submit ticket" }).click();

  await expect(page.getByText("Backend rejected this ticket.")).toBeVisible();
  await expect(page.getByText(/reason_code: geo_outside_fence/)).toBeVisible();
  await expect(page.getByText(/selected_action: manual_fallback/)).toBeVisible();
  await expect(page.getByText(/subject: Use a more specific subject\./)).toBeVisible();
  await expect(page.getByText(/Safe validation detail remains visible/)).toBeVisible();
  await expect(page.getByText(/Request ID: req-toast-redaction-e2e/)).toBeVisible();

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/10\.123|20\.456/u);
  expect(bodyText).not.toMatch(
    /latitude|longitude|deviceLatitude|coordinates|raw_location|browserLocation/u,
  );
});

async function prepareHelpdeskPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("hawkaii_api_access_token", "error-toast-token");
  });
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        categories: [],
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
          id: "error-toast-employee",
          employee_code: "ERR-001",
          email: "error-toast@example.test",
          full_name: "Error Toast Employee",
          roles: ["Employee"],
        },
        active_role: { key: "Employee", label: "Employee", is_active: true },
        available_roles: [{ key: "Employee", label: "Employee", is_active: true }],
        permissions: [],
        setup_required: false,
      }),
    });
  });
}

async function waitForWorkspace(page: Page): Promise<void> {
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
}
