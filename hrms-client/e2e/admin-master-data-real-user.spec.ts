import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001";
const LOCAL_DEMO_PASSWORD = process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123";
const EXPECTED_APP_ENV = process.env.E2E_EXPECTED_APP_ENV ?? "local";

let adminToken = "";
let paginationPrefix = "";

test.beforeAll(async ({ request }) => {
  expect(
    process.env.E2E_ALLOW_ADMIN_MASTER_MUTATIONS,
    "Set E2E_ALLOW_ADMIN_MASTER_MUTATIONS=true only for an isolated local or QA environment.",
  ).toBe("true");
  expect(["local", "qa"]).toContain(EXPECTED_APP_ENV);

  const ready = await request.get(`${API_BASE_URL}/api/v1/health/ready`, { timeout: 5_000 });
  expect(ready.ok(), `Admin master-data QA requires the API at ${API_BASE_URL}`).toBe(true);
  expect((await ready.json()) as { app_env?: string }).toMatchObject({ app_env: EXPECTED_APP_ENV });

  adminToken = await apiLogin(request, "admin@example.test");
  paginationPrefix = `QA Page ${Date.now()}`;
  for (let index = 1; index <= 27; index += 1) {
    const response = await request.post(`${API_BASE_URL}/api/v1/admin/master-data/departments`, {
      headers: authHeaders(adminToken),
      data: {
        name: `${paginationPrefix} ${String(index).padStart(2, "0")}`,
        code: `QAP${String(Date.now()).slice(-6)}${String(index).padStart(2, "0")}`,
      },
    });
    if (!response.ok()) {
      throw new Error(
        `pagination fixture ${index} failed with ${response.status()}: ${await response.text()}`,
      );
    }
  }
});

test.describe("admin hierarchy real-user journey", () => {
  test("Admin manages parent hierarchy and recovers a stale edit without losing the draft", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const suffix = Date.now();
    const parentName = `QA Parent ${suffix}`;
    const childName = `QA Child ${suffix}`;
    const winnerName = `${childName} Winner`;
    const staleDraftName = `${childName} Stale Draft`;

    const context = await browser.newContext();
    const primary = await context.newPage();
    await login(primary, "admin@example.test");
    await openMasterData(primary);
    await expect(primary.getByRole("tab", { name: "Departments" })).toBeVisible();
    await expect(primary.getByRole("tab", { name: "Designations" })).toBeVisible();
    await expect(primary.getByRole("tab", { name: "Employment Types" })).toHaveCount(0);

    await addDepartment(primary, {
      name: parentName,
      code: `P${String(suffix).slice(-8)}`,
    });
    await addDepartment(primary, {
      name: childName,
      code: `C${String(suffix).slice(-8)}`,
      parentName,
    });
    await search(primary, childName);
    await expect(
      primary.getByRole("table").getByText(`Parent: ${parentName}`, { exact: false }).first(),
    ).toBeVisible();

    const stale = await context.newPage();
    await openMasterData(stale, childName);
    await editRow(stale, childName);
    await editRow(primary, childName);
    await primary.getByLabel("Name", { exact: true }).fill(winnerName);
    await saveChanges(primary, 200);

    await stale.getByLabel("Name", { exact: true }).fill(staleDraftName);
    await saveChanges(stale, 409);
    await expect(stale.getByRole("alert")).toContainText("A newer version is available");
    await expect(stale.getByLabel("Name", { exact: true })).toHaveValue(staleDraftName);
    await stale.getByRole("button", { name: "Retry against latest version" }).click();
    await expect(stale.getByLabel("Name", { exact: true })).toHaveValue(staleDraftName);
    await saveChanges(stale, 200);
    await expect(
      stale.getByRole("table").getByText(staleDraftName, { exact: true }).first(),
    ).toBeVisible();

    await context.close();
  });

  test("HR manages designation levels while Employee UI and API access remain denied", async ({
    browser,
    request,
  }) => {
    const suffix = Date.now();
    const designationName = `QA Platform Lead ${suffix}`;
    const hrContext = await browser.newContext();
    const hrPage = await hrContext.newPage();
    await login(hrPage, "hrm@example.test");
    await openMasterData(hrPage);
    await hrPage.getByRole("tab", { name: "Designations" }).click();
    await hrPage.getByRole("button", { name: "Add", exact: true }).click();
    await hrPage.getByLabel("Name", { exact: true }).fill(designationName);
    await hrPage.getByLabel("Code (optional)").fill(`L${String(suffix).slice(-8)}`);
    await hrPage.getByLabel("Level (optional)").fill("7");
    const create = hrPage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/admin/master-data/designations",
    );
    await hrPage.getByRole("button", { name: "Add", exact: true }).last().click();
    expect((await create).status()).toBe(200);
    await search(hrPage, designationName);
    await expect(
      hrPage.getByRole("table").getByText("Level 7", { exact: false }).first(),
    ).toBeVisible();

    const employeeContext = await browser.newContext();
    const employeePage = await employeeContext.newPage();
    await login(employeePage, "e1@example.test");
    await employeePage.goto("/admin-settings/master-data", { waitUntil: "networkidle" });
    await expect(employeePage).not.toHaveURL(/\/admin-settings\/master-data/);
    await expect(
      employeePage.getByRole("main").getByRole("heading", { name: "Admin Settings" }),
    ).toHaveCount(0);

    const employeeToken = await apiLogin(request, "e1@example.test");
    const deniedRead = await request.get(
      `${API_BASE_URL}/api/v1/admin/master-data/departments?page=1&page_size=10`,
      { headers: authHeaders(employeeToken) },
    );
    expect(deniedRead.status()).toBe(403);
    const deniedWrite = await request.post(`${API_BASE_URL}/api/v1/admin/master-data/departments`, {
      headers: authHeaders(employeeToken),
      data: { name: `Forged ${suffix}`, code: `F${String(suffix).slice(-8)}` },
    });
    expect(deniedWrite.status()).toBe(403);

    await Promise.all([hrContext.close(), employeeContext.close()]);
  });

  test("pagination, refresh/back, duplicate-click protection, offline recovery, mobile and themes stay honest", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await login(page, "admin@example.test");
    await openMasterData(page, paginationPrefix);
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await page.goBack({ waitUntil: "networkidle" });
    await expect(page).not.toHaveURL(/page=2/);
    await page.goForward({ waitUntil: "networkidle" });
    await expect(page).toHaveURL(/page=2/);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await page.getByRole("button", { name: "Previous" }).click();
    await expect(page).not.toHaveURL(/page=2/);

    const suffix = Date.now();
    const resilientName = `QA Resilient ${suffix}`;
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill(resilientName);
    await page.getByLabel("Code (optional)").fill(`R${String(suffix).slice(-8)}`);
    const disconnectedPath = `${API_BASE_URL}/api/v1/admin/master-data/departments`;
    await page.route(disconnectedPath, async (route) => {
      await route.abort("internetdisconnected");
    });
    await page.getByRole("button", { name: "Add", exact: true }).last().click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(resilientName);
    await expect(page.getByText(/draft was kept/i)).toBeVisible();
    await page.unroute(disconnectedPath);

    let createRequests = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/admin/master-data/departments"
      ) {
        createRequests += 1;
      }
    });
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        new URL(candidate.url()).pathname === "/api/v1/admin/master-data/departments",
    );
    await page
      .getByRole("button", { name: "Add", exact: true })
      .last()
      .evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
    expect((await response).status()).toBe(200);
    await expect.poll(() => createRequests).toBe(1);

    const themeToggle = page.getByRole("button", { name: /Switch to (dark|light) mode/ }).first();
    await expect(themeToggle).toBeVisible();
    await themeToggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveClass(/dark|light/);

    await page.setViewportSize({ width: 390, height: 844 });
    await openMasterData(page, resilientName);
    await expect(page.getByRole("tab", { name: "Departments" })).toBeVisible();
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
    await context.close();
  });
});

async function apiLogin(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
    data: { email, password: LOCAL_DEMO_PASSWORD },
  });
  expect(response.ok(), `${email} API login should succeed`).toBe(true);
  const body = (await response.json()) as { access_token?: unknown };
  expect(typeof body.access_token).toBe("string");
  return body.access_token as string;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(LOCAL_DEMO_PASSWORD);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      new URL(candidate.url()).pathname === "/api/v1/auth/login",
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  expect((await response).ok()).toBe(true);
  await expect(page).toHaveURL(/\/dashboard/);
}

async function openMasterData(page: Page, query?: string): Promise<void> {
  const params = new URLSearchParams({ tab: "departments" });
  if (query) params.set("q", query);
  await page.goto(`/admin-settings/master-data?${params}`, { waitUntil: "networkidle" });
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Admin Settings" }),
  ).toBeVisible();
  await expect(page.getByLabel(/^(Connected|Platform API ready)$/)).toBeVisible();
}

async function search(page: Page, value: string): Promise<void> {
  const input = page.getByLabel(/Search (departments|designations)/);
  await input.fill(value);
  await expect(page).toHaveURL(
    new RegExp(
      `q=${encodeURIComponent(value).replace(/%20/g, "\\+")}|q=${encodeURIComponent(value)}`,
    ),
  );
  await page.waitForLoadState("networkidle");
}

async function addDepartment(
  page: Page,
  input: { name: string; code: string; parentName?: string },
): Promise<void> {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(input.name);
  await page.getByLabel("Code (optional)").fill(input.code);
  if (input.parentName) {
    await page.getByLabel("Search parent departments").fill(input.parentName);
    await page.getByRole("combobox", { name: "Parent department" }).click();
    await page.getByRole("option", { name: input.parentName }).click();
  }
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      new URL(candidate.url()).pathname === "/api/v1/admin/master-data/departments",
  );
  await page.getByRole("button", { name: "Add", exact: true }).last().click();
  expect((await response).status()).toBe(200);
}

async function editRow(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function saveChanges(page: Page, expectedStatus: number): Promise<void> {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "PATCH" &&
      /\/api\/v1\/admin\/master-data\/(departments|designations)\/[^/]+$/.test(
        new URL(candidate.url()).pathname,
      ),
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await response).status()).toBe(expectedStatus);
}
