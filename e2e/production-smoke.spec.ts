import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001";
const LOCAL_DEMO_PASSWORD = process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123";

test.beforeAll(async ({ request }) => {
  await expectBackendReady(request);
});

test.describe("production browser smoke", () => {
  test("employee self-service modules render against the backend API", async ({ page }) => {
    await login(page, "e1@example.test");
    await expect(page.getByLabel("Platform API ready")).toBeVisible();

    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByText("Notifications").first()).toBeVisible();
    await page.keyboard.press("Escape");

    await expectModule(page, "/attendance", "Attendance", /This week|Department-wise attendance/);
    await expectModule(page, "/leave-wfh", "Leave & WFH", "Leave balances");
    await expectModule(page, "/ems", "Employee Self Service", "Company announcements", "EMS");
    await expectModule(page, "/timesheet", "Timesheet", /This week|Project|Submit/);
    await expectModule(page, "/expenses", "Expense Management", /Submitted|My recent tickets/);
    await expectModule(page, "/helpdesk", "Helpdesk", /Recent tickets|My queue/);
  });

  test("HR/admin routes render reports and configuration in API mode", async ({ page }) => {
    await login(page, "admin@example.test");
    await expect(page.getByLabel("Platform API ready")).toBeVisible();

    await expectModule(page, "/employees", "Employees", /People|Add employee|Export/);
    await expectModule(page, "/attendance", "Attendance", "Department-wise attendance");
    await expectModule(page, "/leave-wfh", "Leave & WFH", "Apply leave");
    await page.getByRole("tab", { name: "Monitor", exact: true }).click();
    await expect(page.getByText(/Leave\/WFH monitor|Export/).first()).toBeVisible();
    await expectModule(page, "/reports", "Reports", /Every report supports|HR reports|Attendance/);
    await expectModule(page, "/admin-settings", "Admin Settings", "Company Profile");
  });

  test("project and utilization screens render in API mode", async ({ page }) => {
    await login(page, "admin@example.test");
    await expect(page.getByLabel("Platform API ready")).toBeVisible();

    await expectModule(page, "/projects", "Projects", /Delivery|Add project|Export/);
    await expectModule(page, "/team-utilization", "Team Utilization", /Capacity|Bench|Overloaded/);
  });
});

async function expectBackendReady(request: APIRequestContext): Promise<void> {
  const ready = await request.get(`${API_BASE_URL}/api/v1/health/ready`, {
    timeout: 5_000,
  });
  expect(
    ready.ok(),
    `Backend API must be running before browser e2e. Expected readiness at ${API_BASE_URL}/api/v1/health/ready, got ${ready.status()}.`,
  ).toBe(true);
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.waitForFunction(() => {
    const emailInput = document.querySelector("#email");
    const passwordInput = document.querySelector("#password");
    return Boolean(
      emailInput &&
      passwordInput &&
      "_valueTracker" in emailInput &&
      "_valueTracker" in passwordInput,
    );
  });
  const emailInput = page.locator("#email");
  const passwordInput = page.locator("#password");
  await emailInput.fill(email);
  await passwordInput.fill(LOCAL_DEMO_PASSWORD);
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(LOCAL_DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
}

async function expectModule(
  page: Page,
  path: string,
  title: string,
  visibleText: string | RegExp,
  linkName = title,
): Promise<void> {
  await page.getByRole("link", { name: linkName, exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(escapeRegExp(path)));
  await expect(page.getByRole("heading", { name: title }).first()).toBeVisible();
  await expect(page.getByText(visibleText).first()).toBeVisible();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
