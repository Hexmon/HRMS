import { Laptop, PackageCheck, Boxes, ShieldAlert, Inbox, Undo2, LifeBuoy, AlertTriangle, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StatCard, DataCard, ChartCard, StatusBadge, EmptyState } from "@/components/ui-kit";
import { DonutChart, MiniBars, CHART_COLORS } from "./shared";

const inventoryMix = [
  { name: "Assigned", value: 548, color: CHART_COLORS.PRIMARY },
  { name: "Available", value: 56, color: CHART_COLORS.INFO },
  { name: "In repair", value: 8, color: CHART_COLORS.WARNING },
];

const requests = [
  { id: "REQ-410", what: "MacBook Pro 14\"", who: "Aria Kapoor", note: "New joiner · May 18" },
  { id: "REQ-411", what: "External monitor", who: "Mei Lin", note: "Replacement" },
  { id: "REQ-412", what: "Headset", who: "Olu Adeyemi", note: "WFH setup" },
];

const warranty = [
  { id: "AST-7701", name: "MacBook Pro 16\" · Daniel", expires: "Jun 28, 2026" },
  { id: "AST-7689", name: "Dell Latitude · Carlos", expires: "Jul 12, 2026" },
];

const returns = [
  { id: "AST-7705", name: "MacBook Air · Carlos Mendes", reason: "Exit handover" },
];

const ticketsByCat = [
  { label: "Network", v: 6 },
  { label: "Hardware", v: 4 },
  { label: "Account", v: 3 },
  { label: "Software", v: 2 },
];

const itTickets = [
  { id: "TKT-12001", title: "VPN not connecting from Lagos", who: "Olu Adeyemi", status: "in_progress" as const, sla: "2h left" },
  { id: "TKT-12015", title: "Code editor licence expired", who: "Daniel Park", status: "open" as const, sla: "On track" },
  { id: "TKT-12017", title: "Laptop overheating", who: "Hana Kobayashi", status: "open" as const, sla: "Breaching" },
];

export function AssetAdminDashboard() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total assets" value="612" icon={Laptop} tone="primary" />
        <StatCard label="Assigned" value="548" hint="89% utilised" icon={PackageCheck} tone="success" />
        <StatCard label="Available" value="56" icon={Boxes} tone="info" />
        <StatCard label="Warranty expiring" value="7" hint="Next 60 days" icon={ShieldAlert} tone="warning" />
        <StatCard label="Asset requests" value="3" icon={Inbox} tone="primary" />
        <StatCard label="Return pending" value="1" hint="From exits" icon={Undo2} tone="warning" />
        <StatCard label="IT tickets open" value="5" icon={LifeBuoy} tone="info" />
        <StatCard label="SLA breaches" value="1" icon={AlertTriangle} tone="destructive" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Inventory mix" subtitle="Across all categories">
          <DonutChart data={inventoryMix} height={180} />
          <ul className="mt-3 space-y-1 text-xs">
            {inventoryMix.map((d) => (
              <li key={d.name} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="ml-auto font-medium">{d.value}</span>
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard title="IT tickets by category" subtitle="Last 30 days" className="lg:col-span-2">
          <MiniBars data={ticketsByCat} height={200} color={CHART_COLORS.INFO} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Asset requests" padded={false}
          actions={<Button asChild size="sm" variant="ghost" className="text-primary"><Link to="/assets">Open <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link></Button>}
        >
          {requests.length === 0 ? (
            <EmptyState icon={Inbox} title="No requests pending" />
          ) : (
            <ul className="divide-y">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{r.what}</p>
                    <p className="text-xs text-muted-foreground">{r.id} · {r.who} · {r.note}</p>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full">Allocate</Button>
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="Warranty expiring" description="Next 60 days" padded={false}>
          {warranty.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="Nothing expiring soon" />
          ) : (
            <ul className="divide-y">
              {warranty.map((w) => (
                <li key={w.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{w.name}</p>
                    <p className="text-xs text-muted-foreground">{w.id}</p>
                  </div>
                  <span className="text-xs font-medium">{w.expires}</span>
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Returns pending" padded={false}>
          {returns.length === 0 ? (
            <EmptyState icon={Undo2} title="All assets returned" />
          ) : (
            <ul className="divide-y">
              {returns.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.id} · {r.reason}</p>
                  </div>
                  <StatusBadge status="pending" />
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="IT helpdesk" description="Open IT tickets & SLA" padded={false}
          actions={<Button asChild size="sm" variant="ghost" className="text-primary"><Link to="/helpdesk">View <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link></Button>}
        >
          <ul className="divide-y">
            {itTickets.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.id} · {t.who} · SLA {t.sla}</p>
                </div>
                <StatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        </DataCard>
      </div>
    </>
  );
}
