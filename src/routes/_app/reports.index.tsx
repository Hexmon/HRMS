import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { REPORT_CATEGORIES, visibleCategoriesForRole } from "./reports";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, FileBarChart2 } from "lucide-react";

export const Route = createFileRoute("/_app/reports/")({ component: ReportsDashboard });

const REPORT_COUNTS: Record<string, { count: number; description: string }> = {
  "/reports/hr": { count: 8, description: "Headcount, exits, joiners, role access and onboarding compliance." },
  "/reports/attendance": { count: 6, description: "Daily attendance, late arrivals, exceptions and monthly summaries." },
  "/reports/leave": { count: 5, description: "Leave balances, applied vs approved, WFH and holiday calendar." },
  "/reports/projects": { count: 6, description: "Project master, allocations, utilization and billable mix." },
  "/reports/timesheet": { count: 6, description: "Submission compliance, approved hours and productivity." },
  "/reports/expenses": { count: 9, description: "Pending approvals, advances, settlements and payment register." },
  "/reports/assets": { count: 6, description: "Inventory, warranty, recovery and maintenance views." },
  "/reports/helpdesk": { count: 6, description: "Open tickets, SLA breaches, agent performance and resolution time." },
  "/reports/audit": { count: 6, description: "Logins, role changes, profile, approvals, expense and asset audit trails." },
};

function ReportsDashboard() {
  const { activeRole } = useAuth();
  const visible = visibleCategoriesForRole(activeRole ?? null);

  return (
    <>
      {visible.length === 0 && (
        <Card className="p-10 text-center">
          <FileBarChart2 className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-base font-medium">No reports available for your role</p>
          <p className="mt-1 text-sm text-muted-foreground">Speak to your admin if you need access to a specific report library.</p>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((c) => {
          const meta = REPORT_COUNTS[c.to];
          return (
            <Card key={c.to} className="group flex flex-col rounded-2xl border-border/60 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <c.icon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {meta?.count ?? 0} reports
                </span>
              </div>
              <h3 className="mt-4 text-base font-semibold tracking-tight">{c.label}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{meta?.description}</p>
              <div className="mt-4 flex justify-end">
                <Button asChild size="sm" variant="ghost" className="text-primary">
                  <Link to={c.to}>
                    View reports
                    <ChevronRight className="ml-1 h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </Link>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {visible.length > 0 && (
        <Card className="rounded-2xl border-dashed bg-muted/30 p-5">
          <div className="flex items-start gap-3">
            <FileBarChart2 className="mt-0.5 h-5 w-5 text-primary" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Every report supports filters &amp; export</p>
              <p className="text-muted-foreground">
                Date range, department, employee and status filters apply globally inside a report.
                Export to CSV is mocked but reflects whatever is currently filtered on screen.
              </p>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
