import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useEmployees } from "@/lib/employees-store";
import { useAssets, warrantyDaysLeft, fmtMoney, ASSET_ADMIN_ROLES } from "@/lib/assets-store";
import { assetOverviewMetadata, assetsApi, mapApiAsset } from "@/domains/assets";
import { isUuid, toastApiError, userFacingErrorMessage } from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";
import { DataCard, StatusBadge } from "@/components/ui-kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import {
  ArrowLeft,
  Wrench,
  Undo2,
  FileText,
  Plus,
  ClipboardCheck,
  AlertTriangle,
} from "lucide-react";
import type { AssetCondition, MaintenanceEntry } from "@/lib/mock/assets";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/assets/$id")({ component: AssetDetail });

export function AssetDetail() {
  const { id } = useParams({ from: "/_app/assets/$id" });
  const { activeRole, user } = useAuth();
  const {
    assets,
    assignAsset,
    returnAsset,
    setStatus,
    addMaintenance,
    loading,
    error,
    isApiBacked,
  } = useAssets();
  const { employees } = useEmployees();
  const listAsset = assets.find((a) => a.id === id);
  const detailQuery = useQuery({
    queryKey: queryKeys.detail("assets", "asset", id, { actor_id: user?.id }),
    queryFn: async () => mapApiAsset(await assetsApi.get(id)),
    enabled: isApiBacked && isUuid(id),
    staleTime: queryTimings.detailStaleMs,
  });
  const detailFailed = isApiBacked && detailQuery.isError;
  const resolvedAsset = detailFailed ? undefined : (detailQuery.data ?? listAsset);
  const isAdmin = !!activeRole && (ASSET_ADMIN_ROLES as readonly string[]).includes(activeRole);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const assigneesQuery = useQuery({
    queryKey: queryKeys.list("assets", "assignees", { actor_id: user?.id, q: assigneeSearch }),
    queryFn: () => assetsApi.assignees(assigneeSearch),
    enabled: isAdmin && isApiBacked,
    staleTime: queryTimings.referenceStaleMs,
  });
  const assignableEmployees = isApiBacked
    ? (assigneesQuery.data?.items ?? []).map((person) => ({
        id: person.id,
        name: person.full_name,
      }))
    : employees.map((person) => ({ id: person.apiId ?? person.id, name: person.name }));

  if (!resolvedAsset) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <h2 className="text-lg font-semibold">
          {loading || detailQuery.isLoading ? "Loading asset" : "Asset not found"}
        </h2>
        {(error || detailQuery.error) && (
          <p className="mt-3 text-sm text-destructive">
            {userFacingErrorMessage(
              error ?? detailQuery.error,
              "Asset data could not be loaded from the backend.",
            )}
          </p>
        )}
        <Button asChild className="mt-4">
          <Link to="/assets/inventory">Back to inventory</Link>
        </Button>
      </div>
    );
  }

  const asset = resolvedAsset.apiMissing?.condition
    ? { ...resolvedAsset, condition: "—" }
    : resolvedAsset;
  const days = warrantyDaysLeft(asset.warrantyExpiry);
  const hasWarranty = !!asset.warrantyExpiry;
  const expired = hasWarranty && days < 0;
  const overview = assetOverviewMetadata(resolvedAsset, days);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/assets/inventory">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Inventory
            </Link>
          </Button>
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold tracking-tight">
              {asset.brand === "—" ? asset.model : `${asset.brand} ${asset.model}`}
            </h2>
            <p className="break-words text-xs text-muted-foreground">
              {asset.id} · {asset.serial} · {asset.type}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <StatusBadge status={asset.status} />
          {isAdmin && asset.status !== "assigned" && (
            <AssignDialog
              employees={assignableEmployees}
              search={assigneeSearch}
              onSearch={setAssigneeSearch}
              hasMore={assigneesQuery.data?.has_more ?? false}
              showDetails={!isApiBacked}
              onAssign={(emp, eid, on, ret, cond, rem) => {
                return assignAsset(asset.id, emp, eid, on, ret, cond, rem)
                  .then(() => toast.success(`Assigned to ${emp}`))
                  .catch((error) => {
                    toastApiError(error, "Asset could not be assigned.");
                    throw error;
                  });
              }}
            />
          )}
          {isAdmin && asset.status === "assigned" && (
            <ReturnDialog
              showDetails={!isApiBacked}
              onReturn={(d, c, r) => {
                return returnAsset(asset.id, d, c, r)
                  .then(() => toast.success("Asset returned to inventory"))
                  .catch((error) => {
                    toastApiError(error, "Asset could not be returned.");
                    throw error;
                  });
              }}
            />
          )}
          {isAdmin && asset.status !== "repair" && asset.status !== "retired" && (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                if (isApiBacked) {
                  toast.error("Create a maintenance record to move this asset into repair.");
                  return;
                }
                setStatus(asset.id, "repair", "Marco Rossi", "Sent for service");
                toast.success("Marked as in repair");
              }}
            >
              <Wrench className="mr-1.5 h-4 w-4" />
              Send to repair
            </Button>
          )}
        </div>
      </div>

      {expired && (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Warranty expired {Math.abs(days)} days ago.
        </div>
      )}

      <Tabs defaultValue="overview" className="min-w-0">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">Assignment History</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <DataCard title="Asset details" className="lg:col-span-2">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 md:grid-cols-3">
                <Info k="Type" v={asset.type} />
                <Info k="Category" v={asset.category} />
                <Info k="Brand" v={asset.brand} />
                <Info k="Model" v={asset.model} />
                <Info k="Serial" v={asset.serial} />
                <Info k="Vendor" v={asset.vendor} />
                <Info k="Invoice #" v={asset.invoiceNumber} />
                <Info k="Purchased" v={overview.purchaseDate} />
                <Info k="Warranty" v={overview.warranty} />
                <Info k="Cost" v={overview.cost === null ? "—" : fmtMoney(overview.cost)} />
                <Info k="Location" v={asset.location} />
                <Info k="Condition" v={<span className="uppercase">{asset.condition}</span>} />
              </dl>
            </DataCard>
            <DataCard title="Current assignment">
              {asset.assignedTo ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{asset.assignedTo}</p>
                  <p className="text-xs text-muted-foreground">Assigned on {asset.assignedOn}</p>
                  {asset.expectedReturn && (
                    <p className="text-xs text-muted-foreground">
                      Expected return: {asset.expectedReturn}
                    </p>
                  )}
                  <div className="pt-1">
                    <StatusBadge
                      status={asset.history[0]?.acknowledged ? "confirmed" : "pending"}
                      label={
                        asset.history[0]?.acknowledged ? "Acknowledged" : "Pending acknowledgement"
                      }
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not currently assigned. Available in <strong>{asset.location}</strong>.
                </p>
              )}
            </DataCard>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <DataCard title="Assignment history" padded={false}>
            {asset.history.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No assignment history yet.
              </p>
            ) : (
              <ul className="divide-y">
                {asset.history.map((h) => (
                  <li
                    key={h.id}
                    className="grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-5 md:items-center"
                  >
                    <div>
                      <p className="text-sm font-medium">{h.employee}</p>
                      <p className="text-xs text-muted-foreground">{h.employeeId}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Assigned</p>
                      <p className="text-sm">{h.assignedOn}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Returned</p>
                      <p className="text-sm">{h.returnedOn ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Condition</p>
                      <p className="text-sm uppercase">
                        {asset.apiMissing?.condition ? "—" : h.conditionAtHandover}
                        {h.conditionAtReturn ? ` → ${h.conditionAtReturn}` : ""}
                      </p>
                    </div>
                    <div className="md:text-right">
                      <StatusBadge
                        status={h.acknowledged ? "confirmed" : "pending"}
                        label={h.acknowledged ? "Acknowledged" : "Pending"}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DataCard>
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4">
          <DataCard
            title="Maintenance & repair log"
            actions={
              isAdmin ? (
                <MaintenanceDialog
                  onAdd={(e) => {
                    void addMaintenance(asset.id, e)
                      .then(() => toast.success("Maintenance logged"))
                      .catch((error) => toastApiError(error, "Maintenance could not be logged."));
                  }}
                />
              ) : undefined
            }
          >
            {asset.maintenance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No maintenance records yet.</p>
            ) : (
              <ul className="space-y-3">
                {asset.maintenance.map((m) => (
                  <li key={m.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {m.type}
                          {m.vendor ? ` · ${m.vendor}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {m.date}
                          {m.cost ? ` · ${fmtMoney(m.cost)}` : ""}
                        </p>
                      </div>
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                    </div>
                    {m.notes && <p className="mt-2 text-xs text-muted-foreground">{m.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </DataCard>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DataCard title="Documents">
            {isApiBacked ? (
              <p className="text-sm text-muted-foreground">
                Asset documents are not available in this view.
              </p>
            ) : asset.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents uploaded for this asset.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {asset.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate">{d.name}</span>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {d.kind}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DataCard>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <DataCard title="Audit trail" padded={false}>
            {isApiBacked ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Asset audit history is not available in this view.
              </p>
            ) : (
              <ul className="divide-y">
                {asset.audit.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{a.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.at).toLocaleString()}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {a.actor}
                      {a.remarks ? ` · ${a.remarks}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DataCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="mt-0.5 text-sm">{v}</dd>
    </div>
  );
}

export function AssignDialog({
  employees,
  search,
  onSearch,
  hasMore,
  showDetails,
  onAssign,
}: {
  employees: { id: string; name: string }[];
  search: string;
  onSearch: (value: string) => void;
  hasMore: boolean;
  showDetails: boolean;
  onAssign: (
    emp: string,
    eid: string,
    on: string,
    ret: string,
    cond: AssetCondition,
    rem: string,
  ) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [eid, setEid] = useState(employees[0]?.id ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const [on, setOn] = useState(today);
  const [ret, setRet] = useState("");
  const [cond, setCond] = useState<AssetCondition>("good");
  const [rem, setRem] = useState("");
  const selectedEmployeeId = employees.some((employee) => employee.id === eid)
    ? eid
    : (employees[0]?.id ?? "");
  const submit = async () => {
    if (pending) return;
    const emp = employees.find((e) => e.id === selectedEmployeeId);
    if (!emp) return;
    setPending(true);
    try {
      await onAssign(emp.name, emp.id, on, ret, cond, rem);
      setOpen(false);
    } catch {
      /* The caller displays the API error; keep the form for retry. */
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          disabled={employees.length === 0}
          className="rounded-full text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          <ClipboardCheck className="mr-1.5 h-4 w-4" />
          Assign
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign asset</DialogTitle>
          <DialogDescription>
            {showDetails
              ? "Hand over to an employee with condition and return date."
              : "Choose an employee to assign this asset."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="asset-assignee-search">Search employees</Label>
            <Input
              id="asset-assignee-search"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search by name"
            />
            {hasMore && (
              <p className="text-xs text-muted-foreground">
                More employees match. Refine the search to select the correct person.
              </p>
            )}
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="asset-assignee">Employee</Label>
            <Select value={selectedEmployeeId} onValueChange={setEid}>
              <SelectTrigger id="asset-assignee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} · {e.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {showDetails && (
            <>
              <div className="space-y-1">
                <Label htmlFor="asset-assignment-date">Assignment date</Label>
                <Input
                  id="asset-assignment-date"
                  type="date"
                  value={on}
                  onChange={(e) => setOn(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="asset-expected-return">Expected return</Label>
                <Input
                  id="asset-expected-return"
                  type="date"
                  value={ret}
                  onChange={(e) => setRet(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="asset-handover-condition">Condition at handover</Label>
                <Select value={cond} onValueChange={(v) => setCond(v as AssetCondition)}>
                  <SelectTrigger id="asset-handover-condition">
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
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="asset-assignment-remarks">Remarks</Label>
                <Textarea
                  id="asset-assignment-remarks"
                  rows={2}
                  value={rem}
                  onChange={(e) => setRem(e.target.value)}
                />
              </div>
            </>
          )}
          <Card className="sm:col-span-2 rounded-xl border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
            The employee can acknowledge receipt from My Assets after assignment.
          </Card>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || employees.length === 0}
            className="rounded-full text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            Confirm assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReturnDialog({
  onReturn,
  showDetails,
}: {
  onReturn: (d: string, c: AssetCondition, r: string) => Promise<unknown>;
  showDetails: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [d, setD] = useState(today);
  const [c, setC] = useState<AssetCondition>("good");
  const [r, setR] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full">
          <Undo2 className="mr-1.5 h-4 w-4" />
          Mark returned
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Return asset</DialogTitle>
          <DialogDescription>
            {showDetails ? "Reclaim and set condition at return." : "Mark this asset as returned."}
          </DialogDescription>
        </DialogHeader>
        {showDetails ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="asset-return-date">Return date</Label>
              <Input
                id="asset-return-date"
                type="date"
                value={d}
                onChange={(e) => setD(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="asset-return-condition">Condition</Label>
              <Select value={c} onValueChange={(v) => setC(v as AssetCondition)}>
                <SelectTrigger id="asset-return-condition">
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
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="asset-recovery-remarks">Recovery remarks</Label>
              <Textarea
                id="asset-recovery-remarks"
                rows={2}
                value={r}
                onChange={(e) => setR(e.target.value)}
              />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (pending) return;
              setPending(true);
              try {
                await onReturn(d, c, r);
                setOpen(false);
              } catch {
                /* The caller displays the API error; keep the form for retry. */
              } finally {
                setPending(false);
              }
            }}
            disabled={pending}
            className="rounded-full"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MaintenanceDialog({ onAdd }: { onAdd: (m: MaintenanceEntry) => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MaintenanceEntry["type"]>("service");
  const [vendor, setVendor] = useState("");
  const [cost, setCost] = useState(0);
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full">
          <Plus className="mr-1 h-4 w-4" />
          Log service
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log maintenance</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="asset-maintenance-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as MaintenanceEntry["type"])}>
              <SelectTrigger id="asset-maintenance-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["service", "repair", "inspection", "upgrade"].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="asset-maintenance-vendor">Vendor</Label>
            <Input
              id="asset-maintenance-vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="asset-maintenance-cost">Cost (USD)</Label>
            <Input
              id="asset-maintenance-cost"
              type="number"
              value={cost || ""}
              onChange={(e) => setCost(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="asset-maintenance-notes">Notes</Label>
            <Textarea
              id="asset-maintenance-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full">
            Cancel
          </Button>
          <Button
            onClick={() => {
              onAdd({
                id: "m_" + Math.random().toString(36).slice(2, 8),
                date: new Date().toISOString().slice(0, 10),
                type,
                vendor,
                cost,
                notes,
              });
              setOpen(false);
            }}
            className="rounded-full"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
