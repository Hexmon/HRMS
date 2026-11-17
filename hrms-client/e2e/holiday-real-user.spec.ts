import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001";
const LOCAL_DEMO_PASSWORD =
  process.env.E2E_LOCAL_DEMO_PASSWORD ??
  (process.env.E2E_EXPECTED_APP_ENV === "qa" ? "" : "LocalDev@123");
const EXPECTED_APP_ENV = process.env.E2E_EXPECTED_APP_ENV ?? "local";

test.beforeAll(async ({ request }) => {
  expect(
    process.env.E2E_ALLOW_HOLIDAY_MUTATIONS,
    "Set E2E_ALLOW_HOLIDAY_MUTATIONS=true only for an isolated local or QA environment.",
  ).toBe("true");
  expect(["local", "qa"]).toContain(EXPECTED_APP_ENV);
  expect(
    LOCAL_DEMO_PASSWORD,
    "E2E_LOCAL_DEMO_PASSWORD must be supplied from the QA secret store for hosted QA.",
  ).not.toBe("");
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
    test.setTimeout(240_000);
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
    const staleContext = await browser.newContext();
    const stalePage = await staleContext.newPage();
    await login(adminPage, "admin@example.test");
    await openHolidays(adminPage);

    const firstHoliday = await addHoliday(adminPage, {
      name: firstName,
      date,
      region: "IN",
      optional: false,
    });
    await addHoliday(adminPage, { name: secondName, date, region: "US", optional: true });
    await adminPage.reload({ waitUntil: "networkidle" });
    await expect(adminPage.getByRole("button", { name: `Edit ${firstName}` })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: `Edit ${secondName}` })).toBeVisible();
    await adminPage.getByRole("tab", { name: "Calendar" }).click();
    await expect(adminPage.getByText(firstName, { exact: true })).toBeVisible();
    await expect(adminPage.getByText(secondName, { exact: true })).toBeVisible();

    await login(stalePage, "admin@example.test");
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

    const tenantBContext = await browser.newContext();
    const tenantBPage = await tenantBContext.newPage();
    await login(tenantBPage, "admin.tenant-b@example.test");
    await openHolidays(tenantBPage);
    const tenantBName = `QA Tenant B Day ${suffix}`;
    const tenantBHoliday = await addHoliday(tenantBPage, {
      name: tenantBName,
      date,
      region: "TENANT-B",
      optional: false,
    });

    const crossTenantAttempt = await putHolidayFromPage(adminPage, tenantBHoliday.id, {
      name: `Leaked ${tenantBName}`,
      date,
      region: "TENANT-A",
      optional: false,
      expected_version: tenantBHoliday.version,
    });
    expect(crossTenantAttempt.status).toBe(404);
    expect(JSON.stringify(crossTenantAttempt.body)).not.toContain(tenantBName);

    const protectedId = crypto.randomUUID();
    const protectedAttempt = await putHolidayFromPage(adminPage, protectedId, {
      name: `Protected field ${suffix}`,
      date,
      region: "IN",
      optional: false,
      company_id: crypto.randomUUID(),
    });
    expect(protectedAttempt.status).toBe(400);

    const currentAdminHoliday = (
      await listHolidaysFromPage(adminPage, Number(date.slice(0, 4)))
    ).find((holiday) => holiday.id === firstHoliday.id);
    expect(currentAdminHoliday).toBeDefined();
    const retry = await putHolidayFromPage(adminPage, firstHoliday.id, {
      name: currentAdminHoliday!.name,
      date: currentAdminHoliday!.date,
      region: currentAdminHoliday!.region,
      optional: currentAdminHoliday!.optional,
    });
    expect(retry.status).toBe(200);
    expect((retry.body as HolidayMutationResponse).holiday.version).toBe(
      currentAdminHoliday!.version,
    );

    await adminPage.reload({ waitUntil: "networkidle" });
    await expect(adminPage.getByText(tenantBName, { exact: true })).toHaveCount(0);
    await expect(adminPage.getByText(`Protected field ${suffix}`, { exact: true })).toHaveCount(0);
    await tenantBPage.reload({ waitUntil: "networkidle" });
    await expect(tenantBPage.getByRole("button", { name: `Edit ${tenantBName}` })).toBeVisible();
    const tenantBList = await listHolidaysFromPage(tenantBPage, Number(date.slice(0, 4)));
    expect(tenantBList.find((holiday) => holiday.id === tenantBHoliday.id)).toMatchObject({
      name: tenantBName,
      version: tenantBHoliday.version,
    });

    await Promise.all([
      adminContext.close(),
      staleContext.close(),
      hrContext.close(),
      employeeContext.close(),
      tenantBContext.close(),
    ]);
  });

  test("mobile keyboard, theme, boundary navigation, double action, and network recovery", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const suffix = `${Date.now()}`;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await login(page, "admin@example.test");
    await openHolidays(page);

    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    const themeToggle = page.getByRole("button", { name: /Switch to (dark|light) mode/ });
    await expect(themeToggle).toBeVisible();
    const originalThemeLabel = await themeToggle.getAttribute("aria-label");
    await themeToggle.focus();
    await page.keyboard.press("Enter");
    await expect(themeToggle).not.toHaveAttribute("aria-label", originalThemeLabel!);
    await page.keyboard.press("Escape");

    const doubleName = `QA Double Guard ${suffix}`;
    await page.getByRole("button", { name: "Add holiday" }).focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("Name", { exact: true }).fill(doubleName);
    await page.getByLabel("Date", { exact: true }).fill("2026-12-30");
    await page.getByLabel("Region", { exact: true }).fill("MOBILE");
    let doubleRequests = 0;
    const countRequest = (request: { method(): string; url(): string }) => {
      if (
        request.method() === "PUT" &&
        /\/api\/v1\/holidays\/[^/]+$/.test(new URL(request.url()).pathname)
      ) {
        doubleRequests += 1;
      }
    };
    page.on("request", countRequest);
    const doubleResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /\/api\/v1\/holidays\/[^/]+$/.test(new URL(response.url()).pathname),
    );
    await page.getByRole("button", { name: "Add", exact: true }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    expect((await doubleResponse).status()).toBe(200);
    await expect(page.getByRole("button", { name: `Edit ${doubleName}` })).toBeVisible();
    await page.waitForTimeout(250);
    expect(doubleRequests).toBe(1);
    page.off("request", countRequest);

    const recoveryName = `QA Network Recovery ${suffix}`;
    await page.route(
      "**/api/v1/holidays/*",
      async (route) => {
        if (route.request().method() === "PUT") {
          await route.abort("internetdisconnected");
          return;
        }
        await route.continue();
      },
      { times: 1 },
    );
    await page.getByRole("button", { name: "Add holiday" }).click();
    await page.getByLabel("Name", { exact: true }).fill(recoveryName);
    await page.getByLabel("Date", { exact: true }).fill("2026-12-31");
    await page.getByLabel("Region", { exact: true }).fill("RECOVERY");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(/connection dropped/i)).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(recoveryName);
    await page.unroute("**/api/v1/holidays/*");
    const recoveryResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /\/api\/v1\/holidays\/[^/]+$/.test(new URL(response.url()).pathname),
    );
    await page.getByRole("button", { name: "Add", exact: true }).click();
    expect((await recoveryResponse).status()).toBe(200);
    await expect(page.getByRole("button", { name: `Edit ${recoveryName}` })).toBeVisible();

    const januaryName = `QA New Year Boundary ${suffix}`;
    const januaryId = crypto.randomUUID();
    expect(
      (
        await putHolidayFromPage(page, januaryId, {
          name: januaryName,
          date: "2027-01-01",
          region: "BOUNDARY",
          optional: false,
        })
      ).status,
    ).toBe(200);

    await page.goto("/leave-wfh/holidays?month=2026-11", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Calendar" }).click();
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.getByRole("heading", { name: "December 2026" })).toBeVisible();
    await expect(page.getByText(recoveryName, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.getByRole("heading", { name: "January 2027" })).toBeVisible();
    await expect(page.getByText(januaryName, { exact: true })).toBeVisible();

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.goBack({ waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/leave-wfh\/holidays/);
    await expect(page.getByText(januaryName, { exact: true })).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText(januaryName, { exact: true })).toBeVisible();
    await context.close();
  });
});

interface HolidayRecord {
  id: string;
  company_id?: string;
  name: string;
  date: string;
  region: string;
  optional: boolean;
  version: number;
}

interface HolidayMutationResponse {
  holiday: HolidayRecord;
  version: number;
}

async function openHolidays(page: Page): Promise<void> {
  await page.goto("/leave-wfh/holidays", { waitUntil: "networkidle" });
  await expect(page.getByText("Company-wide holiday calendar.")).toBeVisible();
  await expect(page.getByLabel(/^(Connected|Platform API ready)$/)).toBeVisible();
}

async function addHoliday(
  page: Page,
  input: { name: string; date: string; region: string; optional: boolean },
): Promise<HolidayRecord> {
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
  const completed = await response;
  expect(completed.status()).toBe(200);
  const payload = (await completed.json()) as HolidayMutationResponse;
  await expect(page.getByRole("button", { name: `Edit ${input.name}` })).toBeVisible();
  return payload.holiday;
}

async function putHolidayFromPage(
  page: Page,
  id: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ apiBaseUrl, holidayId, payload }) => {
      const token = window.sessionStorage.getItem("hawkaii_api_access_token");
      const response = await fetch(`${apiBaseUrl}/api/v1/holidays/${holidayId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.json() };
    },
    { apiBaseUrl: API_BASE_URL, holidayId: id, payload: body },
  );
}

async function listHolidaysFromPage(page: Page, year: number): Promise<HolidayRecord[]> {
  return page.evaluate(
    async ({ apiBaseUrl, queryYear }) => {
      const token = window.sessionStorage.getItem("hawkaii_api_access_token");
      const response = await fetch(
        `${apiBaseUrl}/api/v1/holidays?year=${queryYear}&page=1&page_size=100`,
        {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!response.ok) throw new Error(`Holiday list failed with ${response.status}`);
      const payload = (await response.json()) as { holidays: HolidayRecord[] };
      return payload.holidays;
    },
    { apiBaseUrl: API_BASE_URL, queryYear: year },
  );
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
  const emailInput = page.locator("#email");
  const passwordInput = page.locator("#password");
  await expect(emailInput).toBeEditable({ timeout: 15_000 });
  await expect(passwordInput).toBeEditable({ timeout: 15_000 });
  await emailInput.fill(email);
  await passwordInput.fill(LOCAL_DEMO_PASSWORD);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(LOCAL_DEMO_PASSWORD);
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
