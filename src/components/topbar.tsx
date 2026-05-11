import { useRouterState, useNavigate, Link } from "@tanstack/react-router";
import {
  Search,
  LogOut,
  ChevronDown,
  HelpCircle,
  Plus,
  User as UserIcon,
  Settings as SettingsIcon,
  UserCog,
  ShieldCheck,
  Briefcase,
  Receipt,
  Plane,
  LifeBuoy,
  Timer,
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth, ROLES, ROLE_MAP } from "@/lib/auth";
import type { Role } from "@/lib/mock";
import { UserAvatar } from "@/components/ui-kit/user-avatar";
import { NotificationPanel } from "@/components/ui-kit/notification-panel";
import { toast } from "sonner";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/employees": "Employees",
  "/ems": "Employee Self Service",
  "/attendance": "Attendance",
  "/leave-wfh": "Leave & WFH",
  "/projects": "Projects",
  "/team-utilization": "Team Utilization",
  "/timesheet": "Timesheet",
  "/expenses": "Expense Management",
  "/assets": "Assets",
  "/helpdesk": "Helpdesk",
  "/reports": "Reports",
  "/admin-settings": "Admin Settings",
};

interface QuickAction {
  label: string;
  to: string;
  icon: typeof Plus;
  hint: string;
  requires?: string; // role-key
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Apply leave", to: "/leave-wfh/apply-leave", icon: Plane, hint: "Personal" },
  { label: "Submit timesheet", to: "/timesheet", icon: Timer, hint: "Personal" },
  { label: "New expense claim", to: "/expenses/create", icon: Receipt, hint: "Personal" },
  { label: "Raise a ticket", to: "/helpdesk", icon: LifeBuoy, hint: "Support" },
  { label: "Create project", to: "/projects", icon: Briefcase, hint: "Manager" },
];

export function Topbar() {
  const { user, activeRole, setActiveRole, logout } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const title =
    PAGE_TITLES[path] ??
    Object.entries(PAGE_TITLES).find(([k]) => path.startsWith(k + "/"))?.[1] ??
    "Hawkaii";

  if (!user || !activeRole) return null;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/65 sm:px-6">
      <SidebarTrigger className="text-muted-foreground" />

      {/* Page title */}
      <div className="ml-1 hidden min-w-0 sm:block">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
          Hawkaii
        </p>
        <h1 className="-mt-0.5 truncate text-sm font-semibold">{title}</h1>
      </div>

      {/* Search */}
      <div className="relative ml-3 hidden max-w-sm flex-1 lg:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search employees, projects, tickets…"
          aria-label="Global search"
          onFocus={(e) => {
            e.currentTarget.blur();
            toast.info("Global search is coming soon.", { description: "Use the search bar in any module for now." });
          }}
          className="h-9 rounded-full border-border/70 bg-secondary/60 pl-9 pr-16 text-sm focus-visible:ring-primary/30"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none rounded-md border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:block">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {/* Quick action menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="hidden rounded-full text-primary-foreground shadow-sm sm:inline-flex"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Plus className="mr-1 h-4 w-4" /> Quick action
              <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Create
            </DropdownMenuLabel>
            {QUICK_ACTIONS.map((a) => (
              <DropdownMenuItem key={a.to} asChild>
                <Link to={a.to} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <a.icon className="h-4 w-4 text-muted-foreground" />
                    {a.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                    {a.hint}
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Help */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="Help"
              onClick={() => toast.info("Help center is coming soon.")}
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Help & docs</TooltipContent>
        </Tooltip>

        {/* Notifications */}
        <NotificationPanel />

        {/* Role switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="hidden rounded-full border-border/70 bg-card text-xs font-semibold sm:inline-flex"
            >
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-primary" />
              {ROLE_MAP[activeRole].label}
              <ChevronDown className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Switch role (prototype)
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={activeRole} onValueChange={(v) => setActiveRole(v as Role)}>
              {ROLES.map((r) => (
                <DropdownMenuRadioItem key={r.key} value={r.key} className="flex flex-col items-start py-2">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-[11px] text-muted-foreground">{r.description}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-full border bg-card px-1.5 py-1 text-left transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2"
              aria-label="Account menu"
            >
              <UserAvatar name={user.name} size="sm" />
              <div className="hidden pr-1 text-xs leading-tight md:block">
                <p className="font-semibold">{user.name.split(" ")[0]}</p>
                <p className="text-muted-foreground">{ROLE_MAP[activeRole].label}</p>
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="font-semibold">{user.name}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/ems"><UserIcon className="mr-2 h-4 w-4" /> My Profile</Link>
            </DropdownMenuItem>
            {(activeRole === "main_admin" || activeRole === "hr_admin") && (
              <DropdownMenuItem asChild>
                <Link to="/admin-settings"><SettingsIcon className="mr-2 h-4 w-4" /> Settings</Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <UserCog className="mr-1 inline h-3 w-3" /> Switch role
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={activeRole} onValueChange={(v) => setActiveRole(v as Role)}>
              {ROLES.map((r) => (
                <DropdownMenuRadioItem key={r.key} value={r.key} className="text-sm">
                  {r.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
