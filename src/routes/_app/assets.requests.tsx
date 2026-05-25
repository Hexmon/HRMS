import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useAssets, nextRequestId, ASSET_ADMIN_ROLES } from "@/lib/assets-store";
import { DataCard, DataTable, StatusBadge, EmptyState, type Column } from "@/components/ui-kit";
import { Card } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Inbox, Plus, Upload, Check, X, PackageCheck } from "lucide-react";
import type { AssetRequest, RequestPriority, RequestStatus, RequestType } from "@/lib/mock/assets";
import { toast } from "sonner";
import { toastApiError } from "@/shared/api";

export const Route = createFileRoute("/_app/assets/requests")({ component: RequestsScreen });

function RequestsScreen() {
  const { activeRole, user } = useAuth();
  const { requests, addRequest, decideRequest, cancelRequest } = useAssets();
  const isAdmin = !!activeRole && (ASSET_ADMIN_ROLES as readonly string[]).includes(activeRole);
  const isManagerOrAdmin =
    isAdmin || activeRole === "manager" || activeRole === "hr_admin" || activeRole === "main_admin";

  const myReqs = useMemo(() => requests.filter((r) => r.raisedBy === user?.name), [requests, user]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue={isAdmin ? "queue" : "mine"}>
        <TabsList>
          {isAdmin && (
            <TabsTrigger value="queue">
              Admin Queue ({requests.filter((r) => r.status === "pending").length})
            </TabsTrigger>
          )}
          <TabsTrigger value="mine">My Requests</TabsTrigger>
          <TabsTrigger value="raise">Raise Request</TabsTrigger>
        </TabsList>

        {isAdmin && (
          <TabsContent value="queue" className="mt-4">
            <AdminQueue
              rows={requests}
              onDecide={(id, status, remarks) => {
                void decideRequest(id, status, user?.name ?? "Admin", remarks)
                  .then(() => toast.success(`Request ${status}`))
                  .catch((error) => toastApiError(error, "Request decision could not be saved."));
              }}
            />
          </TabsContent>
        )}

        <TabsContent value="mine" className="mt-4">
          {myReqs.length === 0 ? (
            <DataCard title="My requests">
              <EmptyState
                icon={Inbox}
                title="No requests raised"
                description="Use the Raise Request tab to submit one."
              />
            </DataCard>
          ) : (
            <DataCard title="My requests" padded={false}>
              <ul className="divide-y">
                {myReqs.map((r) => (
                  <li
                    key={r.id}
                    className="grid grid-cols-1 gap-2 px-5 py-3.5 md:grid-cols-5 md:items-center"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {r.assetType} · <span className="capitalize">{r.type}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{r.id}</p>
                    </div>
                    <p className="text-xs text-muted-foreground md:col-span-2">{r.reason}</p>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        status={
                          r.priority === "urgent"
                            ? "overdue"
                            : r.priority === "high"
                              ? "late"
                              : "in_progress"
                        }
                        label={r.priority}
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <StatusBadge status={r.status} />
                      {r.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            void cancelRequest(r.id)
                              .then(() => toast.success("Request cancelled"))
                              .catch((error) =>
                                toastApiError(error, "Request could not be cancelled."),
                              );
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </DataCard>
          )}
        </TabsContent>

        <TabsContent value="raise" className="mt-4">
          <RaiseForm
            onSubmit={(data) => {
              const r: AssetRequest = {
                id: nextRequestId(requests),
                raisedBy: user?.name ?? "You",
                employeeId: undefined,
                raisedAt: new Date().toISOString(),
                status: "pending",
                ...data,
              };
              void addRequest(r)
                .then(() => toast.success(`${r.id} submitted`))
                .catch((error) => toastApiError(error, "Asset request could not be submitted."));
            }}
          />
          {!isManagerOrAdmin && (
            <p className="mt-3 text-xs text-muted-foreground">
              Your manager and IT admin will be notified for approval.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AdminQueue({
  rows,
  onDecide,
}: {
  rows: AssetRequest[];
  onDecide: (id: string, status: RequestStatus, remarks: string) => void;
}) {
  const columns: Column<AssetRequest>[] = [
    { key: "id", header: "Request", render: (r) => <span className="font-medium">{r.id}</span> },
    {
      key: "type",
      header: "Type",
      render: (r) => <span className="text-sm capitalize">{r.type}</span>,
    },
    {
      key: "asset",
      header: "Asset",
      render: (r) => (
        <span className="text-sm">
          {r.assetType}
          {r.assetId ? ` · ${r.assetId}` : ""}
        </span>
      ),
    },
    {
      key: "raisedBy",
      header: "Raised by",
      render: (r) => (
        <div>
          <p className="text-sm font-medium">{r.raisedBy}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(r.raisedAt).toLocaleDateString()}
          </p>
        </div>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (r) => (
        <span className="text-xs text-muted-foreground line-clamp-2 max-w-xs block">
          {r.reason}
        </span>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      render: (r) => <span className="text-xs uppercase">{r.priority}</span>,
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "act",
      header: "",
      render: (r) =>
        r.status === "pending" ? (
          <div className="flex justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-success"
              onClick={() => onDecide(r.id, "approved", "")}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive"
              onClick={() => onDecide(r.id, "rejected", "Rejected from queue")}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-primary"
              onClick={() => onDecide(r.id, "fulfilled", "Asset handed over")}
            >
              <PackageCheck className="h-4 w-4" />
            </Button>
          </div>
        ) : null,
    },
  ];
  return (
    <DataTable<AssetRequest>
      columns={columns}
      rows={rows}
      searchKeys={["id", "raisedBy", "assetType", "reason"]}
      emptyTitle="No requests"
      emptyDescription="When employees raise requests, they will appear here."
    />
  );
}

function RaiseForm({
  onSubmit,
}: {
  onSubmit: (
    data: Pick<
      AssetRequest,
      "type" | "assetType" | "reason" | "priority" | "assetId" | "attachment"
    >,
  ) => void;
}) {
  const [type, setType] = useState<RequestType>("new");
  const [assetType, setAssetType] = useState("Laptop");
  const [assetId, setAssetId] = useState("");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState<RequestPriority>("normal");

  const submit = () => {
    if (!reason.trim()) {
      toast.error("Please add a reason.");
      return;
    }
    onSubmit({ type, assetType, assetId: assetId || undefined, reason, priority });
    setReason("");
    setAssetId("");
  };

  return (
    <Card className="rounded-2xl border-border/60 p-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Request type</Label>
          <Select value={type} onValueChange={(v) => setType(v as RequestType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New asset</SelectItem>
              <SelectItem value="replacement">Replacement</SelectItem>
              <SelectItem value="repair">Repair</SelectItem>
              <SelectItem value="return">Return</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Asset type</Label>
          <Select value={assetType} onValueChange={setAssetType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "Laptop",
                "Desktop",
                "Monitor",
                "Phone",
                "Headset",
                "Keyboard",
                "Mouse",
                "Software License",
                "Other",
              ].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(type === "replacement" || type === "repair" || type === "return") && (
          <div className="space-y-1.5 md:col-span-2">
            <Label>Asset ID (optional)</Label>
            <Input
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              placeholder="AST-XXXX"
            />
          </div>
        )}
        <div className="space-y-1.5 md:col-span-2">
          <Label>Reason</Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain the need so IT can prioritise…"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as RequestPriority)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["low", "normal", "high", "urgent"] as RequestPriority[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Attachment</Label>
          <div className="grid place-items-center rounded-xl border border-dashed bg-muted/20 px-3 py-3 text-center">
            <Upload className="mb-1 h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Click to attach</p>
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button
          onClick={submit}
          className="rounded-full text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Submit request
        </Button>
      </div>
    </Card>
  );
}

// silence unused dialog imports for future use
void Dialog;
void DialogContent;
void DialogDescription;
void DialogFooter;
void DialogHeader;
void DialogTitle;
void DialogTrigger;
