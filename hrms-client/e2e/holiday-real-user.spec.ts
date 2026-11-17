import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001";
const LOCAL_DEMO_PASSWORD = process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123";
const EXPECTED_APP_ENV = process.env.E2E_EXPECTED_APP_ENV ?? "local";

test.beforeAll(async ({ request }) => {
  expect(
    process.env.E2E_ALLOW_HOLIDAY_MUTATIONS,
    "Set E2E_ALLOW_HOLIDAY_MUTATIONS=true only for an isolated local or QA environment.",
  ).toBe("true");
  expect(["local", "qa"]).toContain(EXPECTED_APP_ENV);
  const ready = await request.get(`${API_BASE_URL}/api/v1/health/ready`, { timeout: 5_000 });
  expect(ready.ok(), `Holiday browser QA requires the local API at ${API_BASE_URL}`).toBe(true);
  const identity = (await ready.json()) as { app_env?: string };
  expect(
    identity.app_env,
    "API environment must match the explicitly selected test environment.",
  ).toBe(EXPECTED_APP_ENV);
});

test.describe("holiday real-user journey", () => {
  test("Admin and HR create/edit safely while an employee remains read-only", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const suffix = `${Date.now()}`;
    const firstName = `QA Regional Day ${suffix}`;
    const secondName = `QA Optional Day ${suffix}`;
    const adminUpdatedName = `${firstName} Updated`;
    const hrName = `QA HR Day ${suffix}`;
    const hrUpdatedName = `${hrName} Updated`;
    const forgedName = `QA Employee Forged ${suffix}`;
    const date = currentMonthDate();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const stalePage = await adminContext.newPage();
    await login(adminPage, "admin@example.test");
    await openHolidays(adminPage);

    await addHoliday(adminPage, { name: firstName, date, region: "IN", optional: false });
    await addHoliday(adminPage, { name: secondName, date, region: "US", optional: true });
    await adminPage.reload({ waitUntil: "networkidle" });
    await expect(adminPage.getByRole("button", { name: `Edit ${firstName}` })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: `Edit ${secondName}` })).toBeVisible();
    await adminPage.getByRole("tab", { name: "Calendar" }).click();
    await expect(adminPage.getByText(firstName, { exact: true })).toBeVisible();
    await expect(adminPage.getByText(secondName, { exact: true })).toBeVisible();

    await openHolidays(stalePage);
    await stalePage.getByRole("button", { name: `Edit ${firstName}` }).click();
    await adminPage.getByRole("tab", { name: "List" }).click();
    await adminPage.getByRole("button", { name: `Edit ${firstName}` }).click();
    await adminPage.getByLabel("Name", { exact: true }).fill(adminUpdatedName);
    await saveHoliday(adminPage, 200);

    await stalePage.getByLabel("Region", { exact: true }).fill("IN-SOUTH");
    await saveHoliday(stalePage, 409);
    await expect(stalePage.getByText("A newer version is available")).toBeVisible();
    await expect(stalePage.getByLabel("Region", { exact: true })).toHaveValue("IN-SOUTH");
    await expect(stalePage.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await stalePage.getByRole("button", { name: "Load latest version" }).click();
    await expect(stalePage.getByLabel("Name", { exact: true })).toHaveValue(adminUpdatedName);
    await stalePage.getByLabel("Region", { exact: true }).fill("IN-SOUTH");
    await saveHoliday(stalePage, 200);
    await expect(stalePage.getByText(adminUpdatedName, { exact: true })).toBeVisible();

    const hrContext = await browser.newContext();
    const hrPage = await hrContext.newPage();
    await login(hrPage, "hrm@example.test");
    await openHolidays(hrPage);
    await expect(hrPage.getByRole("button", { name: "Add holiday" })).toBeVisible();
    await addHoliday(hrPage, { name: hrName, date, region: "IN-HR", optional: false });
    await hrPage.getByRole("button", { name: `Edit ${hrName}` }).click();
    await hrPage.getByLabel("Name", { exact: true }).fill(hrUpdatedName);
    await saveHoliday(hrPage, 200);
    await expect(hrPage.getByRole("button", { name: `Edit ${hrUpdatedName}` })).toBeVisible();

    const employeeContext = await browser.newContext();
    const employeePage = await employeeContext.newPage();
    await login(employeePage, "e1@example.test");
    await openHolidays(employeePage);
    await expect(employeePage.getByText(adminUpdatedName, { exact: true })).toBeVisible();
    await expect(employeePage.getByRole("button", { name: "Add holiday" })).toHaveCount(0);
    await expect(
      employeePage.getByRole("button", { name: `Edit ${adminUpdatedName}` }),
    ).toHaveCount(0);
    await expect(employeePage.getByText(hrUpdatedName, { exact: true })).toBeVisible();

    const forgedId = crypto.randomUUID();
    const deniedStatus = await employeePage.evaluate(
      async ({ apiBaseUrl, id, name, holidayDate }) => {
        const token = window.sessionStorage.getItem("hawkaii_api_access_token");
        const response = await fetch(`${apiBaseUrl}/api/v1/holidays/${id}`, {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            name,
            date: holidayDate,
            region: "FORGED",
            optional: false,
          }),
        });
        return response.status;
      },
      { apiBaseUrl: API_BASE_URL, id: forgedId, name: forgedName, holidayDate: date },
    );
    expect(deniedStatus).toBe(403);
    await adminPage.reload({ waitUntil: "networkidle" });
    await expect(adminPage.getByText(hrUpdatedName, { exact: true })).toBeVisible();
    await expect(adminPage.getByText(forgedName, { exact: true })).toHaveCount(0);

    await Promise.all([adminContext.close(), hrContext.close(), employeeContext.close()]);
  });
});

async function openHolidays(page: Page): Promise<void> {
  await page.goto("/leave-wfh/holidays", { waitUntil: "networkidle" });
  await expect(page.getByText("Company-wide holiday calendar.")).toBeVisible();
  await expect(page.getByLabel(/^(Connected|Platform API ready)$/)).toBeVisible();
}

async function addHoliday(
  page: Page,
  input: { name: string; date: string; region: string; optional: boolean },
): Promise<void> {
  await page.getByRole("button", { name: "Add holiday" }).click();
  await page.getByLabel("Name", { exact: true }).fill(input.name);
  await page.getByLabel("Date", { exact: true }).fill(input.date);
  await page.getByLabel("Region", { exact: true }).fill(input.region);
  if (input.optional) await page.getByRole("switch").click();
  const response = page.waitForResponse(
    (candidate) =>
      /\/api\/v1\/holidays\/[^/]+$/.test(new URL(candidate.url()).pathname) &&
      candidate.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Add", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole("button", { name: `Edit ${input.name}` })).toBeVisible();
}

async function saveHoliday(page: Page, expectedStatus: number): Promise<void> {
  const response = page.waitForResponse(
    (candidate) =>
      /\/api\/v1\/holidays\/[^/]+$/.test(new URL(candidate.url()).pathname) &&
      candidate.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await response).status()).toBe(expectedStatus);
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(LOCAL_DEMO_PASSWORD);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/auth/login",
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  const response = await loginResponse;
  expect(response.ok()).toBe(true);
  expect(new URL(response.url()).origin).toBe(new URL(API_BASE_URL).origin);
  await expect(page).toHaveURL(/\/dashboard/);
}

function currentMonthDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(now.getDate() + 1, lastDay);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
