import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

const reports = [
  { name: "Headcount summary", desc: "Active vs inactive, by department and location.", tag: "HR" },
  { name: "Attendance compliance", desc: "Late check-ins, absences and WFH ratios.", tag: "HR" },
  { name: "Leave utilization", desc: "Balances, accruals and burn-down across teams.", tag: "HR" },
  { name: "Project profitability", desc: "Billable vs cost across active engagements.", tag: "Delivery" },
  { name: "Timesheet compliance", desc: "Submitted, approved and pending entries.", tag: "Delivery" },
  { name: "Expense ageing", desc: "Pending claims by age, by category, by approver.", tag: "Finance" },
  { name: "Asset inventory", desc: "Allocated, in-stock, in-repair and retired.", tag: "IT" },
  { name: "Helpdesk SLA", desc: "First-response and resolution against SLA.", tag: "Support" },
];

function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="A curated library of operational, people and financial reports." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.name} className="group cursor-pointer rounded-2xl border-border/60 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start justify-between">
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">{r.tag}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <h3 className="mt-3 text-base font-semibold tracking-tight">{r.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{r.desc}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
