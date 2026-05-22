import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useAdminSettings } from "@/lib/admin-settings-store";
import {
  Building2,
  Database,
  ShieldCheck,
  GitBranch,
  FileText,
  Mail,
  BellRing,
  Lock,
  ScrollText,
  Users,
  Briefcase,
  Clock,
  Plane,
  Timer,
  Wallet,
  Boxes,
  LifeBuoy,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin-settings/")({ component: AdminSettingsIndex });

interface CardDef {
  title: string;
  description: string;
  icon: typeof Building2;
  to: string;
  meta: () => string;
  mainOnly?: boolean;
}

function AdminSettingsIndex() {
  const { activeRole } = useAuth();
  const isMain = activeRole === "main_admin";
  const { company, masters, roles, workflows, templates, notifications, audit } =
    useAdminSettings();

  const cards: CardDef[] = [
    {
      title: "Company Profile",
      description: "Identity, currency, timezone & working week.",
      icon: Building2,
      to: "/admin-settings/company",
      meta: () => company.name,
    },
    {
      title: "Departments",
      description: "Org units that group teams and reporting lines.",
      icon: Users,
      to: "/admin-settings/master-data",
      meta: () => `${masters.departments.length} configured`,
    },
    {
      title: "Designations",
      description: "Job titles and seniority levels.",
      icon: Users,
      to: "/admin-settings/master-data",
      meta: () => `${masters.designations.length} configured`,
    },
    {
      title: "Employment Types",
      description: "Full-time, part-time, intern, contractor.",
      icon: Users,
      to: "/admin-settings/master-data",
      meta: () => `${masters.employmentTypes.length} configured`,
    },
    {
      title: "Work Locations",
      description: "Offices, hubs and remote regions.",
      icon: Building2,
      to: "/admin-settings/master-data",
      meta: () => `${masters.workLocations.length} configured`,
    },
    {
      title: "Shifts",
      description: "Working hours and overlap windows.",
      icon: Clock,
      to: "/admin-settings/master-data",
      meta: () => `${masters.shifts.length} configured`,
    },
    {
      title: "Roles & Permissions",
      description: "Granular RBAC across every module.",
      icon: ShieldCheck,
      to: "/admin-settings/roles",
      meta: () => `${roles.length} roles`,
      mainOnly: true,
    },
    {
      title: "Approval Workflows",
      description: "Multi-stage approvals with escalations.",
      icon: GitBranch,
      to: "/admin-settings/workflows",
      meta: () => `${workflows.filter((w) => w.active).length}/${workflows.length} active`,
      mainOnly: true,
    },
    {
      title: "Leave Policy",
      description: "Quotas, carry-forward, encashment.",
      icon: Plane,
      to: "/admin-settings/policies",
      meta: () => "Configured",
    },
    {
      title: "Attendance Policy",
      description: "Grace, half-day and absent rules.",
      icon: Clock,
      to: "/admin-settings/policies",
      meta: () => "Configured",
    },
    {
      title: "Timesheet Policy",
      description: "Weekly hours, lock & deadlines.",
      icon: Timer,
      to: "/admin-settings/policies",
      meta: () => "Configured",
    },
    {
      title: "Expense Policy",
      description: "Limits, receipts and self-approval rule.",
      icon: Wallet,
      to: "/admin-settings/policies",
      meta: () => "Configured",
    },
    {
      title: "Asset Policy",
      description: "Acknowledgements, returns, warranty alerts.",
      icon: Boxes,
      to: "/admin-settings/policies",
      meta: () => "Configured",
    },
    {
      title: "Helpdesk SLA",
      description: "Response & resolution targets per priority.",
      icon: LifeBuoy,
      to: "/admin-settings/policies",
      meta: () => "Configured",
    },
    {
      title: "Email Templates",
      description: "Transactional emails to employees.",
      icon: Mail,
      to: "/admin-settings/email-templates",
      meta: () => `${templates.filter((t) => t.active).length}/${templates.length} active`,
    },
    {
      title: "Notification Settings",
      description: "Channels and event preferences.",
      icon: BellRing,
      to: "/admin-settings/notifications",
      meta: () => `${notifications.length} events`,
    },
    {
      title: "Security Settings",
      description: "Passwords, sessions, MFA, attempt limits.",
      icon: Lock,
      to: "/admin-settings/security",
      meta: () => "Configured",
      mainOnly: true,
    },
    {
      title: "Audit Logs",
      description: "Immutable record of critical actions.",
      icon: ScrollText,
      to: "/admin-settings/audit",
      meta: () => `${audit.length} entries`,
      mainOnly: true,
    },
  ];

  const visible = cards.filter((c) => isMain || !c.mainOnly);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {visible.map((c) => (
          <Link key={c.title} to={c.to} className="group">
            <Card className="h-full rounded-2xl border-border/60 p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <c.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                    {c.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {c.description}
                  </p>
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                    {c.meta()}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
