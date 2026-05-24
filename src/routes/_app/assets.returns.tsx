import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAssets } from "@/lib/assets-store";
import { useEmployees } from "@/lib/employees-store";
import { DataCard, EmptyState, StatusBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Undo2, Laptop } from "lucide-react";
import type { AssetCondition } from "@/lib/mock/assets";
import { toast } from "sonner";
import { useApiRouteEnabled } from "@/shared/api";
import {
  useAssetRecoveryQueue,
  useAssetRecoverySettlementMutation,
  type AssetRecoveryTicketView,
} from "@/domains/assets";

export const Route = createFileRoute("/_app/assets/returns")({ component: ReturnsScreen });

function ReturnsScreen() {
  const { assets, returnAsset } = useAssets();
  const { employees } = useEmployees();
  const apiEnabled = useApiRouteEnabled(["/assets"]);
  const recoveryQueue = useAssetRecoveryQueue({ page_size: 100, status: "open" }, apiEnabled);
  const settleRecovery = useAssetRecoverySettlementMutation();

  // Group assigned assets by employee, surfacing those tied to exit / notice
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; status?: string; assets: typeof assets }>();
    assets
      .filter((a) => a.assignedTo)
      .forEach((a) => {
        const emp = employees.find((e) => e.id === a.assignedToId || e.name === a.assignedTo);
        const key = a.assignedTo!;
        const cur = map.get(key) ?? { name: key, status: emp?.status, assets: [] };
        cur.assets.push(a);
        map.set(key, cur);
      });
    return Array.from(map.values()).sort((a, b) => {
      const aP = a.status === "exited" || a.status === "notice_period" ? 0 : 1;
      const bP = b.status === "exited" || b.status === "notice_period" ? 0 : 1;
      return aP - bP;
    });
  }, [assets, employees]);

  const exitOrNotice = grouped.filter((g) => g.status === "exited" || g.status === "notice_period");
  const recoveryTickets = recoveryQueue.data?.items ?? [];
  const recoveryLoading = apiEnabled && recoveryQueue.isLoading && !recoveryQueue.data;
  const recoveryError =
    apiEnabled && recoveryQueue.error instanceof Error ? recoveryQueue.error : null;

  const settleTicket = (
    ticket: AssetRecoveryTicketView,
    date: string,
    condition: AssetCondition,
    remarks: string,
  ) => {
    void settleRecovery
      .mutateAsync({
        id: ticket.id,
        input: {
          settlement_status: "recovered",
          remarks: [remarks, `Return date: ${date}`, `Condition: ${condition}`]
            .filter(Boolean)
            .join(" · "),
          expected_version: ticket.version,
        },
      })
      .then(() => toast.success(`${ticket.assetCode} recovered`))
      .catch((error: Error) => toast.error(error.message));
  };

  return (
    <div className="space-y-4">
      <DataCard
        title="Offboarding recovery"
        description="Employees on notice or exited — reclaim assets before clearance."
        padded={false}
      >
        {apiEnabled ? (
          recoveryLoading ? (
            <div className="px-5 py-8 text-sm text-muted-foreground">Loading recovery queue...</div>
          ) : recoveryError ? (
            <div className="px-5 py-8 text-sm text-destructive">{recoveryError.message}</div>
          ) : recoveryTickets.length === 0 ? (
            <EmptyState
              icon={Undo2}
              title="No active recovery cases"
              description="When someone enters notice period, their assets will be listed here."
            />
          ) : (
            <ul className="divide-y">
              {recoveryTickets.map((ticket) => (
                <li key={ticket.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <Link to="/assets/$id" params={{ id: ticket.assetId }} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{ticket.assetName}</p>
                    <p className="text-xs text-muted-foreground">
                      {ticket.assetCode} · {ticket.employeeName} · since{" "}
                      {ticket.assignedOn.slice(0, 10)}
                    </p>
                  </Link>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={ticket.status} label={ticket.status} />
                    <ReturnInline
                      onConfirm={(date, condition, remarks) =>
                        settleTicket(ticket, date, condition, remarks)
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : exitOrNotice.length === 0 ? (
          <EmptyState
            icon={Undo2}
            title="No active recovery cases"
            description="When someone enters notice period, their assets will be listed here."
          />
        ) : (
          <ul className="divide-y">
            {exitOrNotice.map((g) => (
              <li key={g.name} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.assets.length} asset(s) assigned · clearance{" "}
                      {g.assets.every((a) => a.status !== "assigned") ? "complete" : "pending"}
                    </p>
                  </div>
                  <StatusBadge status={g.status === "exited" ? "exited" : "notice_period"} />
                </div>
                <ul className="mt-3 space-y-2">
                  {g.assets.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <Link to="/assets/$id" params={{ id: a.id }} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {a.brand} {a.model}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.id} · since {a.assignedOn}
                        </p>
                      </Link>
                      <ReturnInline
                        onConfirm={(d, c, r) => {
                          returnAsset(a.id, d, c, r);
                          toast.success(`${a.id} returned`);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </DataCard>

      <DataCard
        title="All assigned (return ready)"
        description="Reclaim any assigned asset."
        padded={false}
      >
        {grouped.length === 0 ? (
          <EmptyState icon={Laptop} title="No assigned assets" />
        ) : (
          <ul className="divide-y">
            {grouped
              .flatMap((g) => g.assets)
              .slice(0, 12)
              .map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {a.brand} {a.model}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.id} · {a.assignedTo}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={a.history[0]?.acknowledged ? "confirmed" : "pending"}
                      label={a.history[0]?.acknowledged ? "Ack'd" : "Pending Ack"}
                    />
                    <ReturnInline
                      onConfirm={(d, c, r) => {
                        returnAsset(a.id, d, c, r);
                        toast.success(`${a.id} returned`);
                      }}
                    />
                  </div>
                </li>
              ))}
          </ul>
        )}
      </DataCard>
    </div>
  );
}

function ReturnInline({
  onConfirm,
}: {
  onConfirm: (d: string, c: AssetCondition, r: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [d, setD] = useState(today);
  const [c, setC] = useState<AssetCondition>("good");
  const [r, setR] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full">
          <Undo2 className="mr-1.5 h-4 w-4" />
          Mark returned
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm return</DialogTitle>
          <DialogDescription>Recovery remarks update the audit trail.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Return date</Label>
            <Input type="date" value={d} onChange={(e) => setD(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Condition</Label>
            <Select value={c} onValueChange={(v) => setC(v as AssetCondition)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["new", "good", "fair", "poor"] as AssetCondition[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Remarks</Label>
            <Textarea rows={2} value={r} onChange={(e) => setR(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full">
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm(d, c, r);
              setOpen(false);
            }}
            className="rounded-full"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
