import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  UserCircle,
  Clock,
  CalendarDays,
  Briefcase,
  Activity,
  Timer,
  Receipt,
  Laptop,
  LifeBuoy,
  BarChart3,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/lib/mock-data";
import type { ComponentType } from "react";

interface Item {
  title: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
  roles?: Role[];
}

const WORKSPACE: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "My Space", url: "/ems", icon: UserCircle },
  { title: "Attendance", url: "/attendance", icon: Clock },
  { title: "Leave & WFH", url: "/leave", icon: CalendarDays },
  { title: "Timesheet", url: "/timesheet", icon: Timer },
];

const OPERATIONS: Item[] = [
  { title: "Employees", url: "/employees", icon: Users, roles: ["main_admin", "hr_admin", "admin", "manager", "team_lead"] },
  { title: "Projects", url: "/projects", icon: Briefcase, roles: ["main_admin", "admin", "manager", "project_manager", "team_lead", "module_lead"] },
  { title: "Team Utilization", url: "/utilization", icon: Activity, roles: ["main_admin", "admin", "manager", "project_manager"] },
  { title: "Expenses", url: "/expenses", icon: Receipt },
  { title: "Assets", url: "/assets", icon: Laptop },
  { title: "Helpdesk", url: "/helpdesk", icon: LifeBuoy },
];

const INSIGHTS: Item[] = [
  { title: "Reports", url: "/reports", icon: BarChart3, roles: ["main_admin", "hr_admin", "admin", "manager", "finance_manager", "auditor"] },
  { title: "Admin Settings", url: "/settings", icon: Settings, roles: ["main_admin", "hr_admin", "admin"] },
];

function filterByRole(items: Item[], role: Role | null) {
  if (!role) return items;
  return items.filter((i) => !i.roles || i.roles.includes(role));
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { activeRole } = useAuth();

  const isActive = (url: string) => path === url || path.startsWith(url + "/");

  const renderGroup = (label: string, items: Item[]) => {
    const filtered = filterByRole(items, activeRole);
    if (!filtered.length) return null;
    return (
      <SidebarGroup>
        {!collapsed && <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</SidebarGroupLabel>}
        <SidebarGroupContent>
          <SidebarMenu>
            {filtered.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={isActive(item.url)} className="data-[active=true]:bg-primary-soft data-[active=true]:text-primary data-[active=true]:font-semibold">
                  <Link to={item.url} className="flex items-center gap-3">
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{item.title}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b px-4 py-4">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl text-primary-foreground shadow-md" style={{ background: "var(--gradient-primary)" }}>
            <span className="text-sm font-bold">H</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-base font-semibold tracking-tight">Hawkaii</span>
              <span className="text-[11px] text-muted-foreground">HRMS & Workforce OS</span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {renderGroup("Workspace", WORKSPACE)}
        {renderGroup("Operations", OPERATIONS)}
        {renderGroup("Insights", INSIGHTS)}
      </SidebarContent>

      {!collapsed && activeRole && (
        <SidebarFooter className="border-t p-3">
          <div className="rounded-lg bg-primary-soft/60 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-primary/80">Active role</p>
            <p className="mt-0.5 text-sm font-semibold text-primary">{ROLE_LABELS[activeRole]}</p>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
