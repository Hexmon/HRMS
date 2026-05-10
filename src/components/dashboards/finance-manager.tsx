import { Receipt, Wallet, BadgeCheck, ClipboardCheck, FileSpreadsheet, FileBarChart, Banknote, ChevronRight, Hourglass, Download } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StatCard, DataCard, ChartCard, StatusBadge, QuickActionCard, EmptyState } from "@/components/ui-kit";
import { MiniArea, CHART_COLORS } from "./shared";

const reimbursementTrend = [
  { label: "W14", v: 4200 }, { label: "W15", v: 5800 }, { label: "W16", v: 6100 },
  { label: "W17", v: 4900 }, { label: "W18", v: 7200 }, { label: "W19", v: 8400 },
];

const queue = [
  { id: "EXP-5502", who: "Mei Lin", what: "Software · USD 129", status: "pending" as const, age: 2 },
  { id: "EXP-5505", who: "Daniel Park", what: "Travel · USD 482", status: "pending" as const, age: 4 },
  { id: "EXP-5509", who: "Olu Adeyemi", what: "Internet · USD 60", status: "pending" as const, age: 1 },
];

const settlements = [
  { id: "SET-220", who: "Carlos Mendes", what: "Final settlement", amount: "USD 4,820", status: "pending" as const },
];

const advances = [
  { id: "ADV-101", who: "Jacob Owens", what: "Travel advance · Berlin offsite", amount: "USD 1,200", status: "pending" as const },
];

const aging = [
  { bucket: "0–7 d", count: 8, total: "USD 1,820" },
  { bucket: "8–14 d", count: 3, total: "USD 980" },
  { bucket: "15–30 d", count: 1, total: "USD 215" },
  { bucket: "30+ d", count: 0, total: "USD 0" },
];

export function FinanceManagerDashboard() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Pending verification" value="12" hint="USD 2,184" icon={ClipboardCheck} tone="warning" />
        <StatCard label="Approved · awaiting payment" value="USD 6,420" hint="Across 9 claims" icon={BadgeCheck} tone="info" />
        <StatCard label="Advance requests" value="3" hint="USD 2,800" icon={Wallet} tone="primary" />
        <StatCard label="Reimbursement queue" value="14" hint="Avg 2.4 d cycle" icon={Receipt} tone="primary" />
        <StatCard label="Settlements pending" value="1" hint="Final dues" icon={Hourglass} tone="warning" />
        <StatCard label="Paid YTD" value="USD 142,901" trend={{ value: "12%", direction: "up" }} icon={Banknote} tone="success" />
        <StatCard label="Avg cycle time" value="2.4 d" hint="Down from 3.1 d" icon={Hourglass} tone="info" trend={{ value: "0.7d", direction: "down" }} />
        <StatCard label="Aging > 30d" value="0" icon={ClipboardCheck} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Reimbursements paid" subtitle="Last 6 weeks (USD)" className="lg:col-span-2">
          <MiniArea data={reimbursementTrend} height={200} color={CHART_COLORS.SUCCESS} />
        </ChartCard>

        <DataCard title="Expense aging" description="Buckets by claim age" padded={false}>
          <ul className="divide-y">
            {aging.map((b) => (
              <li key={b.bucket} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{b.bucket}</p>
                  <p className="text-xs text-muted-foreground">{b.count} claims</p>
                </div>
                <span className="text-sm font-semibold">{b.total}</span>
              </li>
            ))}
          </ul>
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Verification queue" description="Awaiting finance review" padded={false}
          actions={<Button asChild size="sm" variant="ghost" className="text-primary"><Link to="/expenses">Open <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link></Button>}
        >
          {queue.length === 0 ? (
            <EmptyState icon={Receipt} title="Queue empty" description="No claims pending verification." />
          ) : (
            <ul className="divide-y">
              {queue.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{q.what}</p>
                    <p className="text-xs text-muted-foreground">{q.id} · {q.who} · {q.age}d in queue</p>
                  </div>
                  <StatusBadge status={q.status} />
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="Payment register" description="Approved · awaiting payment" padded={false}>
          <ul className="divide-y">
            {[
              { id: "EXP-5501", who: "Daniel Park", what: "Travel · USD 482", date: "May 02" },
              { id: "EXP-5497", who: "Hana Kobayashi", what: "Conference · USD 320", date: "Apr 28" },
              { id: "EXP-5482", who: "Mei Lin", what: "Software · USD 129", date: "Apr 26" },
            ].map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{p.what}</p>
                  <p className="text-xs text-muted-foreground">{p.id} · {p.who} · {p.date}</p>
                </div>
                <Button size="sm" variant="outline" className="rounded-full">Mark paid</Button>
              </li>
            ))}
          </ul>
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Advance requests" padded={false}>
          {advances.length === 0 ? (
            <EmptyState icon={Wallet} title="No advances requested" />
          ) : (
            <ul className="divide-y">
              {advances.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{a.what}</p>
                    <p className="text-xs text-muted-foreground">{a.id} · {a.who} · {a.amount}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="Settlements pending" padded={false}>
          {settlements.length === 0 ? (
            <EmptyState icon={Hourglass} title="No pending settlements" />
          ) : (
            <ul className="divide-y">
              {settlements.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{s.what}</p>
                    <p className="text-xs text-muted-foreground">{s.id} · {s.who} · {s.amount}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <DataCard title="Export shortcuts" description="Audit-ready reports" padded={false}>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <QuickActionCard icon={FileSpreadsheet} title="Expense register" description="Filtered XLSX export" to="/expenses" />
          <QuickActionCard icon={FileBarChart} title="Reimbursement report" description="By department & cycle" to="/reports" />
          <QuickActionCard icon={Banknote} title="Payment ledger" description="GL-friendly format" to="/reports" />
          <QuickActionCard icon={Download} title="Tax pack" description="Quarterly summary" to="/reports" />
        </div>
      </DataCard>
    </>
  );
}
