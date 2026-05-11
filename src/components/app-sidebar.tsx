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
import { useAuth, ROLE_MAP } from "@/lib/auth";
import type { ComponentType } from "react";

interface Item {
  title: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
}

const WORKSPACE: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "EMS", url: "/ems", icon: UserCircle },
  { title: "Attendance", url: "/attendance", icon: Clock },
  { title: "Leave & WFH", url: "/leave-wfh", icon: CalendarDays },
  { title: "Timesheet", url: "/timesheet", icon: Timer },
];

const OPERATIONS: Item[] = [
  { title: "Employees", url: "/employees", icon: Users },
  { title: "Projects", url: "/projects", icon: Briefcase },
  { title: "Team Utilization", url: "/team-utilization", icon: Activity },
  { title: "Expense Management", url: "/expenses", icon: Receipt },
  { title: "Assets", url: "/assets", icon: Laptop },
  { title: "Helpdesk", url: "/helpdesk", icon: LifeBuoy },
];

const INSIGHTS: Item[] = [
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Admin Settings", url: "/admin-settings", icon: Settings },
];

const ALL_GROUPS: { label: string; items: Item[] }[] = [
  { label: "Workspace", items: WORKSPACE },
  { label: "Operations", items: OPERATIONS },
  { label: "Insights", items: INSIGHTS },
];

const ALL_MODULES = WORKSPACE.length + OPERATIONS.length + INSIGHTS.length;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { activeRole } = useAuth();

  const accessible = activeRole ? ROLE_MAP[activeRole].modules : [];

  const isActive = (url: string) => path === url || path.startsWith(url + "/");
  const canAccess = (url: string) => accessible.includes(url);

  const renderGroup = (label: string, items: Item[]) => {
    const visible = items.filter((i) => canAccess(i.url));
    if (visible.length === 0) return null;
    return (
      <SidebarGroup key={label}>
        {!collapsed && (
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            {label}
          </SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu>
            {visible.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(item.url)}
                  className="rounded-xl transition data-[active=true]:bg-primary-soft data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:shadow-[inset_3px_0_0_var(--color-primary)]"
                  tooltip={item.title}
                >
                  <Link to={item.url} className="flex items-center gap-3">
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{item.title}</span>}
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
        <Link to="/dashboard" className="flex items-center gap-2.5 rounded-xl outline-none">
          <div
            className="grid h-9 w-9 place-items-center rounded-xl text-primary-foreground shadow-md"
            style={{ background: "var(--gradient-primary)" }}
          >
            <span className="text-sm font-bold">H</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-base font-semibold tracking-tight">Hawkaii</span>
              <span className="text-[11px] text-muted-foreground">HRMS · Workforce OS</span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {ALL_GROUPS.map((g) => renderGroup(g.label, g.items))}
      </SidebarContent>

      {!collapsed && activeRole && (
        <SidebarFooter className="border-t p-3">
          <div className="rounded-xl border border-primary/15 bg-primary-soft/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary/80">
              Active role
            </p>
            <p className="mt-0.5 text-sm font-semibold text-primary">{ROLE_MAP[activeRole].label}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {accessible.length} of {ALL_MODULES} modules visible
            </p>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
