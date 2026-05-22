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
import { DashboardHero } from "@/components/dashboards/shared";
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
      { label: "Review approvals", to: "/leave-wfh" },
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
  if (!user || !activeRole) return null;

  const actions = HERO_ACTIONS[activeRole] ?? HERO_ACTIONS.employee;

  return (
    <>
      <DashboardHero user={user} activeRole={activeRole} actions={actions} />
      {activeRole === "main_admin" && <MainAdminDashboard />}
      {activeRole === "hr_admin" && <HrAdminDashboard />}
      {activeRole === "employee" && <EmployeeDashboard />}
      {activeRole === "manager" && <ManagerDashboard />}
      {activeRole === "project_manager" && <ProjectManagerDashboard />}
      {activeRole === "finance_manager" && <FinanceManagerDashboard />}
      {activeRole === "asset_admin" && <AssetAdminDashboard />}
      {activeRole === "helpdesk_agent" && <HelpdeskAgentDashboard />}
    </>
  );
}
