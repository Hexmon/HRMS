import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarPlus,
  Timer,
  Receipt,
  Users,
  Megaphone,
  Briefcase,
  LifeBuoy,
  FileBarChart,
  Inbox,
  Wallet,
  Boxes,
  ClipboardCheck,
  Play,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/auth";
import { isApiEnabled } from "@/shared/api";
import { useDashboardSummary } from "@/domains/dashboard";
import { DashboardHero } from "@/components/dashboards/shared";
import { BackendDashboardSummary } from "@/components/dashboards/backend-summary";
import { EmployeeAttendanceDashboard } from "@/components/dashboards/employee-attendance-dashboard";
import { MainAdminDashboard } from "@/components/dashboards/main-admin";
import { HrAdminDashboard } from "@/components/dashboards/hr-admin";
import { EmployeeDashboard } from "@/components/dashboards/employee";
import { ManagerDashboard } from "@/components/dashboards/manager";
import { ProjectManagerDashboard } from "@/components/dashboards/project-manager";
import { FinanceManagerDashboard } from "@/components/dashboards/finance-manager";
import { AssetAdminDashboard } from "@/components/dashboards/asset-admin";
import { HelpdeskAgentDashboard } from "@/components/dashboards/helpdesk-agent";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

const HERO_ACTIONS: Record<Role, { label: string; to: string; variant?: "primary" | "outline" }[]> =
  {
    main_admin: [
      { label: "Invite employee", to: "/employees", variant: "outline" },
      { label: "Workspace settings", to: "/admin-settings" },
    ],
    hr_admin: [
      { label: "Add employee", to: "/employees", variant: "outline" },
      { label: "Run report", to: "/reports" },
    ],
    employee: [
      { label: "Apply for leave", to: "/leave-wfh", variant: "outline" },
      { label: "Log timesheet", to: "/timesheet" },
    ],
    manager: [
      { label: "Team utilisation", to: "/team-utilization", variant: "outline" },
      { label: "Expense reviews", to: "/expenses/review" },
      { label: "Leave / WFH", to: "/leave-wfh", variant: "outline" },
    ],
    project_manager: [
      { label: "View projects", to: "/projects", variant: "outline" },
      { label: "New project", to: "/projects" },
    ],
    finance_manager: [
      { label: "Export register", to: "/expenses", variant: "outline" },
      { label: "Verify claims", to: "/expenses" },
    ],
    asset_admin: [
      { label: "Asset inventory", to: "/assets", variant: "outline" },
      { label: "Allocate asset", to: "/assets" },
    ],
    helpdesk_agent: [
      { label: "Open queue", to: "/helpdesk", variant: "outline" },
      { label: "My tickets", to: "/helpdesk" },
    ],
  };

function DashboardPage() {
  const { user, activeRole } = useAuth();
  const apiEnabled = isApiEnabled();
  const showEmployeeApiDashboard = apiEnabled && activeRole === "employee";
  const summaryQuery = useDashboardSummary(
    Boolean(user) && apiEnabled && !showEmployeeApiDashboard,
  );
  if (!user || !activeRole) return null;

  const actions = HERO_ACTIONS[activeRole] ?? HERO_ACTIONS.employee;
  const showDemoRoleDashboard = !apiEnabled;

  return (
    <>
      <DashboardHero user={user} activeRole={activeRole} actions={actions} />
      {showEmployeeApiDashboard ? (
        <EmployeeAttendanceDashboard />
      ) : (
        <BackendDashboardSummary
          summary={summaryQuery.data}
          loading={summaryQuery.isLoading}
          error={summaryQuery.error instanceof Error ? summaryQuery.error : null}
        />
      )}
      {showDemoRoleDashboard && activeRole === "main_admin" && <MainAdminDashboard />}
      {showDemoRoleDashboard && activeRole === "hr_admin" && <HrAdminDashboard />}
      {showDemoRoleDashboard && activeRole === "employee" && <EmployeeDashboard />}
      {showDemoRoleDashboard && activeRole === "manager" && <ManagerDashboard />}
      {showDemoRoleDashboard && activeRole === "project_manager" && <ProjectManagerDashboard />}
      {showDemoRoleDashboard && activeRole === "finance_manager" && <FinanceManagerDashboard />}
      {showDemoRoleDashboard && activeRole === "asset_admin" && <AssetAdminDashboard />}
      {showDemoRoleDashboard && activeRole === "helpdesk_agent" && <HelpdeskAgentDashboard />}
    </>
  );
}
