import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardSummary } from "@/domains/dashboard";
import { BackendDashboardSummary } from "./backend-summary";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

afterEach(cleanup);

describe("backend dashboard unavailable metrics", () => {
  it("does not present unavailable approval and operations data as zero or healthy", () => {
    render(<BackendDashboardSummary summary={summaryFixture()} loading={false} />);

    expect(screen.queryByText("Pending timesheet approvals")).not.toBeInTheDocument();
    expect(screen.queryByText("Assigned assets")).not.toBeInTheDocument();
    expect(screen.queryByText("Submitted hours")).not.toBeInTheDocument();
    expect(screen.queryByText("All approval lanes are clear")).not.toBeInTheDocument();
    expect(screen.queryByText("Workspace is operational")).not.toBeInTheDocument();
    expect(screen.getByText("Some approval data is unavailable")).toBeInTheDocument();
    expect(screen.getByText("Operational data is partially unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(5);
  });
});

function summaryFixture(): DashboardSummary {
  return {
    generated_at: "2026-11-11T00:00:00.000Z",
    scope: {
      actor_user_id: "admin",
      employee_code: "ADM",
      primary_role: "Admin",
      roles: ["Admin"],
      visibility: "all",
    },
    cards: [
      {
        key: "active_employees",
        label: "Active employees",
        value: 4,
        unit: "count",
        source: "core",
      },
      {
        key: "pending_timesheet_approvals",
        label: "Pending timesheet approvals",
        value: 0,
        unit: "count",
        source: "timesheets",
      },
      {
        key: "assigned_assets",
        label: "Assigned assets",
        value: 0,
        unit: "count",
        source: "assets",
      },
      {
        key: "submitted_hours",
        label: "Submitted hours",
        value: "0.00",
        unit: "hours",
        source: "timesheets",
      },
    ],
    workforce: {
      visible_employees: 4,
      active_employees: 4,
      inactive_employees: 0,
      new_joiners_30d: 0,
      departments: [],
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
    attendance: { evidence_categories: {}, source_categories: {} },
    workload: {
      work_segments_total: 0,
      submitted_hours_total: "0.00",
      timesheet_submissions_total: 0,
      timesheet_submissions_approved: 0,
      timesheet_submissions_returned: 0,
    },
    attention: [],
    unavailable_features: [
      {
        key: "timesheets_historical_ownership",
        label: "Timesheets",
        status: "not_implemented",
        notes: "Unavailable",
      },
      {
        key: "leave_wfh_historical_ownership",
        label: "Leave",
        status: "not_implemented",
        notes: "Unavailable",
      },
      {
        key: "assets_historical_ownership",
        label: "Assets",
        status: "not_implemented",
        notes: "Unavailable",
      },
      {
        key: "notifications_historical_ownership",
        label: "Notifications",
        status: "not_implemented",
        notes: "Unavailable",
      },
    ],
  };
}
