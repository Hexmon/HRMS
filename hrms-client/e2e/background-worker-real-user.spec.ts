import { expect, test } from "@playwright/test";

const workerBaseUrl = process.env.E2E_WORKER_BASE_URL;
test.skip(!workerBaseUrl, "Requires local Wrangler Queue/Cron emulator and real backend API");

test("employee clocks in and sees the scheduled auto checkout in the browser", async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Company email").fill("e2@example.test");
  await page.locator("#password").fill(process.env.E2E_LOCAL_DEMO_PASSWORD ?? "LocalDev@123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await page.getByRole("link", { name: "Attendance", exact: true }).first().click();
  if (await page.getByRole("button", { name: "Clock in" }).count()) {
    const created = page.waitForResponse((response) =>
      response.url().includes("/api/v1/attendance/punches") && response.request().method() === "POST",
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

  await expect.poll(async () => {
    const summary = page.waitForResponse((response) =>
      response.url().includes("/api/v1/attendance/summary/my") && response.ok(),
    );
    await page.reload();
    const body = await (await summary).json();
    return Boolean(body.today?.last_check_out);
  }, { timeout: 30_000, intervals: [1000, 2000, 3000] }).toBe(true);
  await expect(page.getByText("Your attendance session is complete.")).toBeVisible();
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(page).toHaveURL(/attendance\/calendar/);
});
