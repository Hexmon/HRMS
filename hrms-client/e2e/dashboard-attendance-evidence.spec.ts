import { expect, test, type Page } from "@playwright/test";

test("dashboard renders company-scoped attendance evidence categories without location leakage", async ({
  page,
}) => {
  const requests = await prepareDashboardPage(page);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });

  await expect(page.getByText("Attendance evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("Current reporting confidence", { exact: true })).toBeVisible();
  await expectEvidenceCount(page, "Verified", 3);
  await expectEvidenceCount(page, "Warning", 2);
  await expectEvidenceCount(page, "Provisional", 1);
  await expectEvidenceCount(page, "Review required", 4);
  await expectEvidenceCount(page, "Rejected", 0);

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/latitude|longitude|coordinates/i);
  expect(bodyText).not.toContain("19.076");
  expect(bodyText).not.toContain("72.8777");
  expect(requests.dashboardSummary).toBe(1);
});

test("dashboard keeps zero attendance evidence counts stable", async ({ page }) => {
  await prepareDashboardPage(page, {
    verified: 0,
    warning: 0,
    provisional: 0,
    review_required: 0,
    rejected: 0,
  });

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status", { name: "Loading workspace" })).toBeHidden({
    timeout: 60_000,
  });

  await expect(page.getByText("No evidence states today", { exact: true })).toBeVisible();
  await expectEvidenceCount(page, "Verified", 0);
  await expectEvidenceCount(page, "Warning", 0);
  await expectEvidenceCount(page, "Provisional", 0);
  await expectEvidenceCount(page, "Review required", 0);
  await expectEvidenceCount(page, "Rejected", 0);
});

async function expectEvidenceCount(page: Page, label: string, count: number): Promise<void> {
  const row = page.getByRole("listitem").filter({ hasText: label });
  await expect(row).toContainText(String(count));
}

async function prepareDashboardPage(
  page: Page,
  evidenceCategories: Record<string, number> = {
    verified: 3,
    warning: 2,
    provisional: 1,
    review_required: 4,
    rejected: 0,
  },
): Promise<{ dashboardSummary: number }> {
  const requests = { dashboardSummary: 0 };

  await page.addInitScript(() => {
    window.sessionStorage.setItem("hawkaii_api_access_token", "dashboard-evidence-token");
  });

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/v1/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(authSession()),
      });
      return;
    }

    if (path === "/api/v1/dashboard/summary") {
      requests.dashboardSummary += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(dashboardSummary(evidenceCategories)),
      });
      return;
    }

    if (path === "/api/v1/core/master-data/org-selectors") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          departments: [
            {
              id: "dept-dashboard-ops",
              code: "OPS",
              name: "Operations",
            },
          ],
          designations: [],
          managers: [],
          roles: [],
        }),
      });
      return;
    }

    if (path === "/api/v1/core/users/profile-photo-policy") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ mode: "optional", max_bytes: 1048576, allowed_mime_types: [] }),
      });
      return;
    }

    if (path === "/api/v1/core/users") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [],
          page: 1,
          page_size: 100,
          total: 0,
          total_pages: 0,
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

  return requests;
}

function authSession(): Record<string, unknown> {
  return {
    user: {
      id: "dashboard-main-admin",
      employee_code: "ADM-DASH",
      email: "dashboard-admin@example.test",
      full_name: "Dashboard Admin",
      roles: ["Admin"],
    },
    active_role: { key: "Admin", label: "Admin", is_active: true },
    available_roles: [{ key: "Admin", label: "Admin", is_active: true }],
    permissions: [],
    setup_required: false,
  };
}

function dashboardSummary(evidenceCategories: Record<string, number>): Record<string, unknown> {
  return {
    generated_at: "2026-10-05T09:00:00.000Z",
    scope: {
      actor_user_id: "dashboard-main-admin",
      employee_code: "ADM-DASH",
      primary_role: "Admin",
      roles: ["Admin"],
      visibility: "all",
    },
    cards: [
      {
        key: "active_employees",
        label: "Active employees",
        value: 7,
        unit: "count",
        source: "core",
      },
    ],
    workforce: {
      visible_employees: 7,
      active_employees: 7,
      inactive_employees: 0,
      new_joiners_30d: 1,
      departments: [
        {
          department_id: "dept-dashboard-ops",
          department_code: "OPS",
          name: "Operations",
          active_employees: 7,
        },
      ],
    },
    approvals: {
      expense_manager_pending: 0,
      expense_finance_pending: 0,
      expense_total_pending: 0,
      timesheet_pending: 0,
      leave_pending: 0,
      wfh_pending: 0,
      document_verification_pending: 0,
    },
    operations: {
      assets_total: 0,
      assets_assigned: 0,
      assets_recovery_pending: 0,
      notifications_pending: 0,
      outbox_pending: 0,
    },
    attendance: {
      evidence_categories: evidenceCategories,
    },
    workload: {
      work_segments_total: 0,
      submitted_hours_total: "0",
      timesheet_submissions_total: 0,
      timesheet_submissions_approved: 0,
      timesheet_submissions_returned: 0,
    },
    attention: [],
    unavailable_features: [],
  };
}
