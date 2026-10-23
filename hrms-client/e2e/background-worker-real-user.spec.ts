import { createRequire } from "node:module";
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

async function loginInBrowser(page: Page, email: string): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  await waitForLoginHydration(page);
  await page.getByLabel("Company email").fill(email);
  await page.locator("#password").fill(process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123");
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/auth/login") && response.request().method() === "POST",
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  expect((await loginResponse).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible({ timeout: 60_000 });
}

function scheduledUrl(cronExpression: string, scheduledTime = Date.now()): string {
  const url = new URL(`${workerBaseUrl}/cdn-cgi/local/scheduled`);
  url.searchParams.set("cron", cronExpression);
  url.searchParams.set("time", String(scheduledTime));
  return url.toString();
}

interface LocalPgClient {
  connect(): Promise<void>;
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

async function withLocalWorkerDatabase<T>(
  action: (client: LocalPgClient) => Promise<T>,
): Promise<T> {
  const connectionString = process.env.E2E_DATABASE_URL;
  if (!connectionString)
    throw new Error("E2E_DATABASE_URL is required for the local retention journey.");
  const target = new URL(connectionString);
  if (target.hostname !== "postgres" || target.pathname !== "/hrms_platform") {
    throw new Error(
      "The browser retention test accepts only its isolated Docker PostgreSQL database.",
    );
  }
  // Test harness only: the application browser still uses Fastify APIs. Load
  // the backend's existing pg installation without adding a frontend runtime dependency.
  const backendRequire = createRequire(new URL("../../hrms_backend/package.json", import.meta.url));
  const PgClient = (
    backendRequire("pg") as {
      Client: new (config: { connectionString: string }) => LocalPgClient;
    }
  ).Client;
  const client = new PgClient({ connectionString });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
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
  browser,
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

  const adminContext = await browser.newContext();
  try {
    const adminPage = await adminContext.newPage();
    await loginInBrowser(adminPage, "admin@example.test");
    const auditResponse = adminPage.waitForResponse(
      (response) => response.url().includes("/api/v1/reports/audit") && response.ok(),
      { timeout: 30_000 },
    );
    await adminPage.goto("/reports/audit", { waitUntil: "networkidle" });
    const audit = await (await auditResponse).json();
    expect(audit.items?.some((row: { target: string }) => row.target === ticket.id)).toBe(true);
    await adminPage.getByRole("tab", { name: "Expense Audit" }).click();
    const expenseAuditPanel = adminPage.getByRole("tabpanel", { name: "Expense Audit" });
    await expect(expenseAuditPanel.getByRole("cell", { name: ticket.id }).first()).toBeVisible();
    await testInfo.attach("admin-expense-audit", {
      body: await adminPage.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  } finally {
    await adminContext.close();
  }
});

test("HR deactivates an open-shift employee and admin sees the worker-closed day", async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  const employeeContext = await browser.newContext();
  const hrContext = await browser.newContext();
  const adminContext = await browser.newContext();
  try {
    const employeePage = await employeeContext.newPage();
    await loginInBrowser(employeePage, "worker-exit@example.test");
    await employeePage.goto("/attendance", { waitUntil: "networkidle" });
    const clockIn = employeePage.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/attendance/punches") &&
        response.request().method() === "POST",
    );
    await employeePage.getByRole("button", { name: "Clock in" }).click();
    expect((await clockIn).ok()).toBe(true);
    await expect(employeePage.getByRole("button", { name: "Start break" })).toBeVisible();

    const hrPage = await hrContext.newPage();
    await loginInBrowser(hrPage, "worker-hr@example.test");
    await hrPage.goto("/employees", { waitUntil: "networkidle" });
    const employeeRow = hrPage.getByRole("row").filter({ hasText: "Worker Exit Employee" });
    await expect(employeeRow).toBeVisible();
    await employeeRow.getByRole("button", { name: "Row actions" }).click();
    const deactivated = hrPage.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/core/users/") &&
        response.request().method() !== "GET" &&
        response.ok(),
    );
    await hrPage.getByRole("menuitem", { name: "Deactivate" }).click();
    expect((await deactivated).ok()).toBe(true);
    await expect(hrPage.getByText("Employee deactivated")).toBeVisible();
    await testInfo.attach("hr-deactivated-open-shift", {
      body: await hrPage.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    expect(
      (await request.get(scheduledUrl("*/5 * * * *", Date.now() + 48 * 60 * 60_000))).ok(),
    ).toBe(true);

    const adminPage = await adminContext.newPage();
    await loginInBrowser(adminPage, "admin@example.test");
    await adminPage.goto("/reports/attendance", { waitUntil: "networkidle" });
    await expect(adminPage.getByRole("heading", { name: "Daily Attendance" })).toBeVisible();
    await expect
      .poll(
        async () => {
          const reportPromise = adminPage.waitForResponse(
            (response) =>
              response.url().includes("/api/v1/reports/attendance/summary") && response.ok(),
            { timeout: 15_000 },
          );
          await adminPage.reload();
          const reportResponse = await reportPromise;
          const body = await reportResponse.json();
          return Boolean(
            body.items?.some(
              (row: { employee?: string; out_time?: string }) =>
                row.employee === "Worker Exit Employee" && row.out_time,
            ),
          );
        },
        { timeout: 45_000, intervals: [1000, 2000, 3000] },
      )
      .toBe(true);
    await testInfo.attach("admin-historical-checkout-report", {
      body: await adminPage.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  } finally {
    await Promise.all([employeeContext.close(), hrContext.close(), adminContext.close()]);
  }
});

test("browser location evidence is redacted by the hourly Worker while privacy details remain visible", async ({
  browser,
  request,
}, testInfo) => {
  test.skip(!process.env.E2E_DATABASE_URL, "Requires the isolated local PostgreSQL test database");
  test.setTimeout(240_000);
  const context = await browser.newContext({
    geolocation: { latitude: 0.001, longitude: 0.001, accuracy: 18 },
    permissions: ["geolocation"],
  });
  try {
    const page = await context.newPage();
    await loginInBrowser(page, "worker-geo@example.test");
    await page.goto("/attendance/privacy", { waitUntil: "networkidle" });
    await expect(page.getByText("1 minute", { exact: true })).toBeVisible();
    await page.goto("/attendance", { waitUntil: "networkidle" });
    const clockIn = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/attendance/punches") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Clock in" }).click();
    const response = await clockIn;
    expect(response.ok(), await response.text()).toBe(true);
    const submitted = response.request().postDataJSON() as {
      command?: { source?: string; location?: { latitude?: number; longitude?: number } };
      source?: string;
      location?: { latitude?: number; longitude?: number };
    };
    const command = submitted.command ?? submitted;
    expect(command.source).toBe("web_geo");
    expect(command.location).toMatchObject({ latitude: 0.001, longitude: 0.001 });

    const captured = await withLocalWorkerDatabase(async (db) => {
      const rows = await db.query<{
        id: string;
        latitude: string | null;
        longitude: string | null;
        coordinates_expire_at: Date;
        coordinates_purged_at: Date | null;
      }>(
        `SELECT evidence.id, evidence.latitude::text, evidence.longitude::text,
                evidence.coordinates_expire_at, evidence.coordinates_purged_at
         FROM attendance.location_evidence evidence
         JOIN core.users employee ON employee.id = evidence.employee_user_id
         WHERE employee.email = $1
         ORDER BY evidence.received_at DESC LIMIT 1`,
        ["worker-geo@example.test"],
      );
      return rows.rows[0];
    });
    expect(captured).toBeTruthy();
    expect(captured!.latitude).not.toBeNull();
    expect(captured!.longitude).not.toBeNull();
    expect(captured!.coordinates_purged_at).toBeNull();
    const expiresAt = new Date(captured!.coordinates_expire_at).getTime();
    const waitMs = Math.max(0, expiresAt - Date.now() + 250);
    if (waitMs > 75_000)
      throw new Error("The synthetic geo policy exceeded its one-minute retention window.");
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    expect((await request.get(scheduledUrl("0 * * * *"))).ok()).toBe(true);

    await expect
      .poll(
        async () =>
          withLocalWorkerDatabase(async (db) => {
            const result = await db.query<{
              latitude: string | null;
              longitude: string | null;
              coordinates_purged_at: Date | null;
              action_count: number;
            }>(
              `SELECT evidence.latitude::text, evidence.longitude::text,
                evidence.coordinates_purged_at,
                (SELECT count(*)::integer FROM attendance.location_retention_actions action
                 WHERE action.location_evidence_id = evidence.id) AS action_count
         FROM attendance.location_evidence evidence WHERE evidence.id = $1`,
              [captured!.id],
            );
            const row = result.rows[0];
            return Boolean(
              row &&
              row.latitude === null &&
              row.longitude === null &&
              row.coordinates_purged_at &&
              row.action_count === 1,
            );
          }),
        { timeout: 30_000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    await page.goto("/attendance/privacy", { waitUntil: "networkidle" });
    await expect(page.getByText(/After precise coordinates are purged/)).toBeVisible();
    await testInfo.attach("employee-location-retention-after-purge", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  } finally {
    await context.close();
  }
});
