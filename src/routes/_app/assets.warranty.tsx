import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAssets, warrantyDaysLeft, fmtMoney } from "@/lib/assets-store";
import { DataCard, EmptyState, StatCard } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ShieldCheck, Wrench, Building2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/assets/warranty")({ component: WarrantyScreen });

function WarrantyScreen() {
  const { assets } = useAssets();

  const expiring = useMemo(() =>
    assets.map((a) => ({ a, d: warrantyDaysLeft(a.warrantyExpiry) }))
      .filter((x) => x.d <= 60)
      .sort((x, y) => x.d - y.d), [assets]);
  const expired = expiring.filter((x) => x.d < 0);
  const soon = expiring.filter((x) => x.d >= 0);

  const maintenance = useMemo(() =>
    assets.flatMap((a) => a.maintenance.map((m) => ({ a, m })))
      .sort((x, y) => y.m.date.localeCompare(x.m.date)), [assets]);

  const vendors = useMemo(() => {
    const map = new Map<string, { name: string; assets: number; warranties: number }>();
    assets.forEach((a) => {
      const cur = map.get(a.vendor) ?? { name: a.vendor, assets: 0, warranties: 0 };
      cur.assets += 1;
      if (warrantyDaysLeft(a.warrantyExpiry) >= 0) cur.warranties += 1;
      map.set(a.vendor, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.assets - a.assets);
  }, [assets]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Expiring (60d)" value={soon.length} icon={ShieldAlert} tone="warning" />
        <StatCard label="Expired" value={expired.length} icon={AlertTriangle} tone="destructive" />
        <StatCard label="Active warranties" value={assets.length - expired.length} icon={ShieldCheck} tone="success" />
        <StatCard label="Maintenance logs" value={maintenance.length} hint={fmtMoney(maintenance.reduce((s, x) => s + (x.m.cost ?? 0), 0))} icon={Wrench} tone="info" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Warranty expiring" description="Action recommended" padded={false}>
          {expiring.length === 0 ? <EmptyState icon={ShieldCheck} title="All warranties healthy" /> : (
            <ul className="divide-y">
              {expiring.map(({ a, d }) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <Link to="/assets/$id" params={{ id: a.id }} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.brand} {a.model}</p>
                    <p className="text-xs text-muted-foreground">{a.id} · {a.vendor} · {a.warrantyExpiry}</p>
                  </Link>
                  <span className={`text-xs font-medium ${d < 0 ? "text-destructive" : d <= 14 ? "text-warning-foreground" : "text-muted-foreground"}`}>
                    {d < 0 ? `${Math.abs(d)}d expired` : `${d}d left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard title="Maintenance history" description="Recent service logs across the fleet" padded={false}>
          {maintenance.length === 0 ? <EmptyState icon={Wrench} title="No maintenance recorded yet" /> : (
            <ul className="divide-y">
              {maintenance.slice(0, 10).map(({ a, m }) => (
                <li key={a.id + m.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link to="/assets/$id" params={{ id: a.id }} className="text-sm font-medium hover:underline">{a.brand} {a.model}</Link>
                    <span className="text-xs text-muted-foreground">{m.date}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.id} · <span className="capitalize">{m.type}</span>{m.vendor ? ` · ${m.vendor}` : ""}{m.cost ? ` · ${fmtMoney(m.cost)}` : ""}</p>
                  {m.notes && <p className="mt-1 text-xs text-muted-foreground">{m.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <DataCard title="Vendors" description="Suppliers and AMC partners" padded={false}>
        {vendors.length === 0 ? <EmptyState icon={Building2} title="No vendors" /> : (
          <ul className="divide-y">
            {vendors.map((v) => (
              <li key={v.name} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{v.name}</p>
                  <p className="text-xs text-muted-foreground">{v.assets} assets · {v.warranties} active warranties</p>
                </div>
                <Button size="sm" variant="ghost" className="text-primary">Open</Button>
              </li>
            ))}
          </ul>
        )}
      </DataCard>
    </div>
  );
}
