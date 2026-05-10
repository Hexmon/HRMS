import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EMPLOYEES } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/utilization")({
  component: UtilizationPage,
});

const utilization = EMPLOYEES.slice(0, 6).map((e, i) => ({
  ...e,
  billable: 60 + ((i * 11) % 35),
  bench: (i * 7) % 20,
  project: ["Atlas Payments", "Helios Analytics", "Nimbus Data Lake", "Orion CRM"][i % 4],
}));

function UtilizationPage() {
  return (
    <>
      <PageHeader title="Team utilization" description="Billable vs bench breakdown across your delivery teams." />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl p-5">
          <p className="text-xs text-muted-foreground">Avg billable</p>
          <p className="mt-1 text-3xl font-semibold">86%</p>
          <p className="mt-1 text-xs text-success">+4% week on week</p>
        </Card>
        <Card className="rounded-2xl p-5">
          <p className="text-xs text-muted-foreground">Bench</p>
          <p className="mt-1 text-3xl font-semibold">12</p>
          <p className="mt-1 text-xs text-warning-foreground">3 ramping next week</p>
        </Card>
        <Card className="rounded-2xl p-5">
          <p className="text-xs text-muted-foreground">Open positions</p>
          <p className="mt-1 text-3xl font-semibold">7</p>
          <p className="mt-1 text-xs text-muted-foreground">Across 4 projects</p>
        </Card>
      </div>

      <Card className="rounded-2xl border-border/60">
        <div className="border-b p-5">
          <h3 className="text-sm font-semibold">Per-person utilization</h3>
        </div>
        <ul className="divide-y">
          {utilization.map((u) => (
            <li key={u.id} className="grid grid-cols-12 items-center gap-4 px-5 py-4">
              <div className="col-span-4">
                <p className="text-sm font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">{u.designation} · {u.project}</p>
              </div>
              <div className="col-span-6">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Billable</span>
                  <span className="font-semibold">{u.billable}%</span>
                </div>
                <Progress value={u.billable} className="mt-1 h-2" />
              </div>
              <div className="col-span-2 text-right text-xs text-muted-foreground">Bench {u.bench}%</div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
