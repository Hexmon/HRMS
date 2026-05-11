import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useExpenses, fmtCurrency, ticketTotal, HIGH_VALUE_THRESHOLD } from "@/lib/expenses-store";
import { StatCard, DataCard, EmptyState, StatusBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import {
  ChevronRight, Receipt, Hourglass, BadgeCheck, Wallet, Hand, Ban, ClipboardCheck, Crown,
  AlertTriangle, FileWarning, Banknote,
} from "lucide-react";

export const Route = createFileRoute("/_app/expenses/")({ component: ExpensesDashboard });

function ExpensesDashboard() {
  const { activeRole, user } = useAuth();
  const { tickets } = useExpenses();
  const me = user?.name ?? "You";

  const mine = useMemo(() => tickets.filter((t) => t.employee === me || t.employeeId === "self"), [tickets, me]);

  if (activeRole === "finance_manager" || activeRole === "main_admin") {
    const verifPending = tickets.filter((t) => t.status === "finance_verification");
    const payPending = tickets.filter((t) => t.status === "finance_verified");
    const settlement = tickets.filter((t) => ["bills_submitted", "settlement_review", "pending_adjustment"].includes(t.status));
    const advanceAging = tickets.filter((t) => t.paymentType === "advance" && t.status === "payment_released");
    const reimbursable = tickets.filter((t) => t.paymentType === "reimbursement" && t.status === "finance_verified");

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Verification pending" value={verifPending.length} icon={ClipboardCheck} tone="warning" />
          <StatCard label="Payment pending" value={payPending.length} hint={fmtCurrency(payPending.reduce((s, t) => s + ticketTotal(t), 0))} icon={Wallet} tone="info" />
          <StatCard label="Settlement pending" value={settlement.length} icon={Hourglass} tone="warning" />
          <StatCard label="Advance aging" value={advanceAging.length} icon={Banknote} tone="primary" />
          <StatCard label="Reimbursement payable" value={reimbursable.length} icon={Receipt} tone="success" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <QueueList title="Verification queue" rows={verifPending} link="/expenses/finance" emptyIcon={ClipboardCheck} />
          <QueueList title="Settlement pending" rows={settlement} link="/expenses/finance" emptyIcon={Hourglass} />
        </div>
      </div>
    );
  }

  if (activeRole === "manager" || activeRole === "project_manager") {
    const queue = tickets.filter((t) => t.status === "pending_reviewer");
    const returned = tickets.filter((t) => t.status === "reviewer_returned");
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatCard label="Pending review" value={queue.length} icon={ClipboardCheck} tone="warning" />
          <StatCard label="Returned to employee" value={returned.length} icon={Hand} tone="info" />
          <StatCard label="Approved this month" value={tickets.filter((t) => t.approvals.some((a) => a.role === "Reviewer" && a.status === "approved")).length} icon={BadgeCheck} tone="success" />
        </div>
        <QueueList title="Pending review" rows={queue} link="/expenses/review" emptyIcon={ClipboardCheck} />
      </div>
    );
  }

  if (activeRole === "hr_admin") {
    const dirQueue = tickets.filter((t) => t.status === "pending_director");
    const highValue = dirQueue.filter((t) => ticketTotal(t) >= HIGH_VALUE_THRESHOLD);
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatCard label="Pending final approval" value={dirQueue.length} icon={Crown} tone="warning" />
          <StatCard label="High-value expenses" value={highValue.length} hint={`>${fmtCurrency(HIGH_VALUE_THRESHOLD)}`} icon={AlertTriangle} tone="destructive" />
          <StatCard label="Department total (open)" value={fmtCurrency(tickets.filter((t) => t.status !== "closed").reduce((s, t) => s + ticketTotal(t), 0))} icon={Banknote} tone="primary" />
        </div>
        <QueueList title="Pending Director Approval" rows={dirQueue} link="/expenses/director" emptyIcon={Crown} />
      </div>
    );
  }

  // Employee-facing dashboard (default)
  const submitted = mine.filter((t) => t.status !== "draft");
  const pending = mine.filter((t) => ["pending_reviewer", "pending_director", "finance_verification"].includes(t.status));
  const approved = mine.filter((t) => ["finance_verified", "payment_released", "bills_submitted", "settlement_review", "closed"].includes(t.status));
  const paymentPending = mine.filter((t) => t.status === "finance_verified");
  const settlementPending = mine.filter((t) => ["bills_submitted", "settlement_review", "pending_adjustment"].includes(t.status));
  const rejected = mine.filter((t) => ["reviewer_rejected", "director_rejected", "reviewer_returned", "director_returned"].includes(t.status));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Submitted" value={submitted.length} icon={Receipt} tone="primary" />
        <StatCard label="Pending approval" value={pending.length} icon={Hourglass} tone="warning" />
        <StatCard label="Approved" value={approved.length} icon={BadgeCheck} tone="success" />
        <StatCard label="Payment pending" value={paymentPending.length} icon={Wallet} tone="info" />
        <StatCard label="Settlement pending" value={settlementPending.length} icon={FileWarning} tone="warning" />
        <StatCard label="Returned / Rejected" value={rejected.length} icon={Ban} tone="destructive" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QueueList title="My recent tickets" rows={mine.slice(0, 6)} link="/expenses/my" emptyIcon={Receipt} />
        <QueueList title="Action needed" rows={rejected} link="/expenses/my" emptyIcon={Hand} />
      </div>
    </div>
  );
}

function QueueList({ title, rows, link, emptyIcon: Icon }: { title: string; rows: ReturnType<typeof useExpenses>["tickets"]; link: string; emptyIcon: React.ComponentType<{ className?: string }> }) {
  return (
    <DataCard title={title} padded={false} actions={
      <Button asChild size="sm" variant="ghost" className="text-primary">
        <Link to={link}>Open <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link>
      </Button>
    }>
      {rows.length === 0 ? (
        <EmptyState icon={Icon} title="Nothing here" description="You're all caught up." />
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <Link to="/expenses/$id" params={{ id: r.id }} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.taskTitle}</p>
                <p className="text-xs text-muted-foreground">{r.id} · {r.employee} · {fmtCurrency(ticketTotal(r))}</p>
              </Link>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </DataCard>
  );
}
