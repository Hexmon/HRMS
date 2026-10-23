import { expect, test, type Page } from "@playwright/test";

const workerBaseUrl = process.env.E2E_WORKER_BASE_URL;
test.skip(!workerBaseUrl, "Requires local Wrangler Queue/Cron emulator and real backend API");

async function waitForLoginHydration(page: Page) {
  // TanStack Start server-renders the form before its React submit handler is
  // attached. In a cold container, clicking the visible button too early
  // performs a native GET /login? instead of authenticating.
  await page.waitForFunction(
    () => {
      const form = document.querySelector<HTMLFormElement>("form");
      return Boolean(form && Object.keys(form).some((key) => key.startsWith("__reactProps$")));
    },
    undefined,
    { timeout: 120_000 },
  );
}

test("employee clocks in and sees the scheduled auto checkout in the browser", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.goto("/login", { waitUntil: "networkidle" });
  await waitForLoginHydration(page);
  await page.getByLabel("Company email").fill("e2@example.test");
  await page.locator("#password").fill(process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123");
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/auth/login") && response.request().method() === "POST",
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  expect((await loginResponse).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Attendance", exact: true }).first().click();
  await expect(page.getByRole("button", { name: /^(Clock in|Start break)$/ })).toBeVisible({
    timeout: 30_000,
  });
  if (await page.getByRole("button", { name: "Clock in" }).count()) {
    const created = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/attendance/punches") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Clock in" }).click();
    expect((await created).ok()).toBe(true);
    await page.reload();
  }
  await expect(page.getByRole("button", { name: "Start break" })).toBeVisible();

  // Advance only the scheduler's reference clock. The real browser/API/DB
  // still execute the same user and transaction paths as a production run.
  const dueAt = Date.now() + 48 * 60 * 60 * 1000;
  const cron = new URL(`${workerBaseUrl}/cdn-cgi/local/scheduled`);
  cron.searchParams.set("cron", "*/5 * * * *");
  cron.searchParams.set("time", String(dueAt));
  const scheduled = await request.get(cron.toString());
  expect(scheduled.ok()).toBe(true);

  await expect
    .poll(
      async () => {
        const summary = page.waitForResponse(
          (response) => response.url().includes("/api/v1/attendance/summary/my") && response.ok(),
        );
        await page.reload();
        const body = await (await summary).json();
        return Boolean(body.today?.last_check_out);
      },
      { timeout: 30_000, intervals: [1000, 2000, 3000] },
    )
    .toBe(true);
  await expect(page.getByText("Your attendance session is complete.")).toBeVisible();
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(page).toHaveURL(/attendance\/calendar/);
  await expect(page.locator('button[aria-current="date"]')).toHaveAttribute(
    "aria-label",
    /(?:Present|Late|WFH) attendance for/,
  );

  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page.getByText("Your attendance session is complete.")).toBeVisible();

  const reportResponse = page.waitForResponse(
    (response) => response.url().includes("/api/v1/reports/attendance/summary") && response.ok(),
  );
  await page.goto("/reports/attendance", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Daily Attendance" })).toBeVisible();
  const report = await (await reportResponse).json();
  const outTime = report.items?.find((row: { out_time?: string }) => row.out_time)?.out_time;
  if (!outTime) throw new Error("The attendance report omitted the scheduled checkout.");
  await expect(
    page.getByRole("tabpanel").getByRole("cell", { name: outTime, exact: true }),
  ).toBeVisible();
  await testInfo.attach("auto-checkout-attendance-report", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("manual checkout racing the scheduled job leaves one completed session", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.goto("/login", { waitUntil: "networkidle" });
  await waitForLoginHydration(page);
  // E1 intentionally has an incomplete historical fallback punch. E4 is a
  // clean synthetic employee, so this tests the real personal attendance UI.
  await page.getByLabel("Company email").fill("worker-race@example.test");
  await page.locator("#password").fill(process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123");
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/auth/login") && response.request().method() === "POST",
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  expect((await loginResponse).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Attendance", exact: true }).first().click();
  await expect(page.getByRole("button", { name: /^(Clock in|Clock out)$/ })).toBeVisible({
    timeout: 30_000,
  });
  if (await page.getByRole("button", { name: "Clock in" }).count()) {
    const checkInResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/attendance/punches") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Clock in" }).click();
    expect((await checkInResponse).ok()).toBe(true);
    await page.reload();
  }
  await expect(page.getByRole("button", { name: "Clock out" })).toBeVisible();

  const cron = new URL(`${workerBaseUrl}/cdn-cgi/local/scheduled`);
  cron.searchParams.set("cron", "*/5 * * * *");
  cron.searchParams.set("time", String(Date.now() + 48 * 60 * 60 * 1000));
  const [manualResult, cronResult] = await Promise.allSettled([
    page.getByRole("button", { name: "Clock out" }).click(),
    request.get(cron.toString()),
  ]);
  expect(manualResult.status).toBe("fulfilled");
  expect(cronResult.status).toBe("fulfilled");
  if (cronResult.status === "fulfilled") expect(cronResult.value.ok()).toBe(true);

  await expect
    .poll(
      async () => {
        const summary = page.waitForResponse(
          (response) => response.url().includes("/api/v1/attendance/summary/my") && response.ok(),
        );
        await page.reload();
        const body = await (await summary).json();
        return Boolean(body.today?.last_check_out);
      },
      { timeout: 30_000, intervals: [1000, 2000, 3000] },
    )
    .toBe(true);
  await expect(page.getByText("Your attendance session is complete.")).toBeVisible();
  const accessToken = await page.evaluate(() => sessionStorage.getItem("hawkaii_api_access_token"));
  if (!accessToken) throw new Error("The browser lost its authenticated API session.");
  const punchesResponse = await page.request.get(
    `${process.env.E2E_API_BASE_URL ?? "http://hostmachine:3001"}/api/v1/attendance/punches/my`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  expect(punchesResponse.ok()).toBe(true);
  const punches = await punchesResponse.json();
  expect(
    punches.items?.filter((punch: { event_type: string }) => punch.event_type === "check_out"),
  ).toHaveLength(1);
  await testInfo.attach("manual-versus-scheduled-checkout", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("manager verifies a submitted expense and sees it in history", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://hostmachine:3001";
  const employeeLogin = await request.post(`${apiBaseUrl}/api/v1/auth/login`, {
    data: {
      email: "e2@example.test",
      password: process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123",
    },
  });
  expect(employeeLogin.ok()).toBe(true);
  const { access_token: employeeToken } = (await employeeLogin.json()) as { access_token: string };
  const create = await request.post(`${apiBaseUrl}/api/v1/expenses`, {
    headers: { authorization: `Bearer ${employeeToken}` },
    data: {
      submit: true,
      expense_type: "Project",
      expense_sub_type: "Project Travel",
      project_code: "PRJ-100",
      task_title: `Queue browser approval ${Date.now()}`,
      task_description: "Synthetic employee request for manager browser approval",
      location: "Mumbai",
      start_date: "2026-11-01",
      end_date: "2026-11-03",
      estimated_amount: "1000.00",
      payment_type: "Advance",
      advance_amount: "500.00",
      line_items: [
        { line_category: "travel", description: "Flight", line_total: "700.00" },
        { line_category: "lodging", description: "Hotel", line_total: "300.00" },
      ],
    },
  });
  expect(create.ok(), await create.text()).toBe(true);
  const ticket = (await create.json()) as { id: string };

  await page.goto("/login", { waitUntil: "networkidle" });
  await waitForLoginHydration(page);
  await page.getByLabel("Company email").fill("reviewer@example.test");
  await page.locator("#password").fill(process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123");
  const managerLogin = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/auth/login") && response.request().method() === "POST",
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  expect((await managerLogin).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible({ timeout: 60_000 });
  await page.goto("/expenses/review", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: ticket.id })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: ticket.id }).click();
  await expect(page.getByRole("button", { name: "Verify", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Verify as manager" })).toBeVisible();
  const verified = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/expenses/${ticket.id}/manager/verify`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  expect((await verified).ok()).toBe(true);
  await expect(page.getByText("Action recorded")).toBeVisible();
  await page.goto("/expenses/review", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Manager verified/ }).click();
  await expect(page.getByRole("link", { name: ticket.id })).toBeVisible();
  await testInfo.attach("manager-expense-verification", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
