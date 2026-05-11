import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DataTable, type Column, StatusBadge, EmptyState, StatCard, Modal } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { useLeave, LEAVE_TYPE_LABEL, type LeaveRequest, type ReqStatus } from "@/lib/leave-store";
import type { Role } from "@/lib/mock/roles";
import { toast } from "sonner";
import { CheckSquare, Check, X, MessageCircle, CalendarDays, Home } from "lucide-react";

export const Route = createFileRoute("/_app/leave-wfh/approvals")({
  component: ApprovalsPage,
});

const APPROVER: Role[] = ["manager", "project_manager", "hr_admin", "main_admin"];

function ApprovalsPage() {
  const { activeRole } = useAuth();
  if (!activeRole || !APPROVER.includes(activeRole)) return <Navigate to="/leave-wfh" />;
  const { requests, setStatus } = useLeave();

  const [modal, setModal] = useState<{ open: boolean; req?: LeaveRequest; action?: "rejected" | "submitted" }>({ open: false });
  const [remark, setRemark] = useState("");

  const pending = useMemo(() => requests.filter((r) => r.status === "pending_manager"), [requests]);
  const leaves = pending.filter((r) => r.kind === "leave");
  const wfhs = pending.filter((r) => r.kind === "wfh");

  const approve = (r: LeaveRequest) => { setStatus(r.id, "approved"); toast.success(`${r.id} approved`); };
  const openModal = (r: LeaveRequest, action: "rejected" | "submitted") => {
    setModal({ open: true, req: r, action }); setRemark("");
  };
  const submitModal = () => {
    if (!modal.req || !modal.action) return;
    if (!remark.trim()) return toast.error("Remarks are required");
    const status: ReqStatus = modal.action === "rejected" ? "rejected" : "submitted";
    setStatus(modal.req.id, status, remark);
    toast.success(modal.action === "rejected" ? `${modal.req.id} rejected` : `Returned to ${modal.req.employee} for clarification`);
    setModal({ open: false });
  };

  function Queue({ rows, kind }: { rows: LeaveRequest[]; kind: "leave" | "wfh" }) {
    if (rows.length === 0) return <EmptyState icon={CheckSquare} title="All caught up" description="No requests pending your action." />;
    const cols: Column<LeaveRequest>[] = [
      { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
      { key: "employee", header: "Employee", render: (r) => (<><div className="font-medium">{r.employee}</div><div className="text-xs text-muted-foreground">{r.department}</div></>) },
      ...(kind === "leave" ? [{ key: "type", header: "Type", render: (r: LeaveRequest) => <>{LEAVE_TYPE_LABEL[r.leaveType!]}</> }] : []),
      { key: "dates", header: "Dates", render: (r) => <span className="text-sm">{r.fromDate} → {r.toDate}</span> },
      { key: "duration", header: "Duration", render: (r) => <span className="tabular-nums">{r.duration}d{r.halfDay ? " (½)" : ""}</span> },
      { key: "reason", header: "Reason", render: (r) => <span className="block max-w-[260px] truncate text-sm text-muted-foreground" title={r.reason}>{r.reason}</span> },
      { key: "status", header: "Status", render: (r) => <StatusBadge status="pending" /> },
      { key: "a", header: "Actions", render: (r) => (
        <div className="flex gap-1.5">
          <Button size="sm" className="h-7 rounded-full" onClick={() => approve(r)}><Check className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" className="h-7 rounded-full" onClick={() => openModal(r, "rejected")}><X className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => openModal(r, "submitted")} title="Return for clarification"><MessageCircle className="h-3.5 w-3.5" /></Button>
        </div>
      ) },
    ];
    return <DataTable rows={rows} columns={cols} searchKeys={["employee", "reason"]} />;
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Pending leave" value={leaves.length} icon={CalendarDays} tone="warning" />
        <StatCard label="Pending WFH" value={wfhs.length} icon={Home} tone="info" />
        <StatCard label="Approved (this week)" value={requests.filter((r) => r.status === "approved").length} icon={Check} tone="success" />
      </div>

      <Tabs defaultValue="leave">
        <TabsList>
          <TabsTrigger value="leave">Leave requests ({leaves.length})</TabsTrigger>
          <TabsTrigger value="wfh">WFH requests ({wfhs.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="leave" className="mt-4"><Queue rows={leaves} kind="leave" /></TabsContent>
        <TabsContent value="wfh" className="mt-4"><Queue rows={wfhs} kind="wfh" /></TabsContent>
      </Tabs>

      <Modal
        open={modal.open}
        onOpenChange={(v) => setModal({ open: v })}
        title={modal.action === "rejected" ? "Reject request" : "Return for clarification"}
        description={modal.req ? `${modal.req.id} · ${modal.req.employee}` : ""}
        footer={
          <>
            <Button variant="outline" className="rounded-full" onClick={() => setModal({ open: false })}>Cancel</Button>
            <Button className="rounded-full" onClick={submitModal}>{modal.action === "rejected" ? "Reject" : "Return"}</Button>
          </>
        }
      >
        <div>
          <Label htmlFor="rk">Remarks {modal.action === "rejected" ? "(required)" : ""}</Label>
          <Textarea id="rk" rows={4} value={remark} onChange={(e) => setRemark(e.target.value)} className="mt-1.5" placeholder="Explain your decision so the employee can understand." />
        </div>
      </Modal>
    </div>
  );
}
