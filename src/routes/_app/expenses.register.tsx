import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useExpenses, fmtCurrency, ticketTotal, type ExpenseTicket } from "@/lib/expenses-store";
import { mapApiExpenseTickets } from "@/domains/expenses";
import { documentsApi } from "@/domains/documents";
import { useCreateReportExportMutation, useExpenseRegisterReport } from "@/domains/reports";
import { DataTable, StatusBadge, type Column } from "@/components/ui-kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { pageItems, useApiRouteEnabled } from "@/shared/api";

export const Route = createFileRoute("/_app/expenses/register")({ component: ExpenseRegister });

function ExpenseRegister() {
  const { tickets, loading, error, isApiBacked } = useExpenses();
  const apiMode = useApiRouteEnabled(["/expenses", "/reports"]);
  const registerQuery = useExpenseRegisterReport(apiMode, { page: 1, page_size: 500 });
  const exportMutation = useCreateReportExportMutation();
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [pay, setPay] = useState("all");

  const sourceTickets = useMemo(() => {
    if (!apiMode) return tickets;
    if (!registerQuery.data) return [];
    return mapApiExpenseTickets(pageItems(registerQuery.data), tickets);
  }, [apiMode, registerQuery.data, tickets]);

  const tableLoading = apiMode ? registerQuery.isLoading : loading;
  const tableError = apiMode
    ? registerQuery.error instanceof Error
      ? registerQuery.error
      : null
    : error;

  const departments = useMemo(
    () => Array.from(new Set(sourceTickets.map((t) => t.department))),
    [sourceTickets],
  );

  const rows = useMemo(
    () =>
      sourceTickets.filter(
        (t) =>
          (dept === "all" || t.department === dept) &&
          (status === "all" || t.status === status) &&
          (pay === "all" || t.paymentType === pay),
      ),
    [sourceTickets, dept, status, pay],
  );

  const cols: Column<ExpenseTicket>[] = [
    {
      key: "id",
      header: "Ticket",
      render: (r) => (
        <Link
          to="/expenses/$id"
          params={{ id: r.id }}
          className="font-medium text-primary hover:underline"
        >
          {r.id}
        </Link>
      ),
    },
    {
      key: "emp",
      header: "Employee",
      render: (r) => <span className="text-sm">{r.employee}</span>,
    },
    { key: "dept", header: "Dept", render: (r) => <span className="text-xs">{r.department}</span> },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <span className="text-xs capitalize">{r.expenseType.replace("_", " / ")}</span>
      ),
    },
    {
      key: "project",
      header: "Project / Client",
      render: (r) => (
        <span className="text-xs">{r.project?.projectName ?? r.sales?.client ?? "—"}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (r) => <span className="font-semibold">{fmtCurrency(ticketTotal(r))}</span>,
    },
    {
      key: "pay",
      header: "Payment",
      render: (r) => <span className="text-xs capitalize">{r.paymentType}</span>,
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "submitted",
      header: "Submitted",
      render: (r) => (
        <span className="text-xs text-muted-foreground">{r.submittedAt?.slice(0, 10) ?? "—"}</span>
      ),
    },
  ];

  const exportCsv = async () => {
    if (apiMode || isApiBacked) {
      try {
        const job = await exportMutation.mutateAsync({
          format: "csv",
          report_type: "expenses/register",
          filters: {
            status: status === "all" ? undefined : status,
            payment_type:
              pay === "all" ? undefined : pay === "advance" ? "Advance" : "ReimbursementAccrued",
            department: dept === "all" ? undefined : dept,
          },
        });
        if (typeof job.download_document_id === "string" && job.download_document_id) {
          const download = await documentsApi.createDownloadUrl(job.download_document_id);
          if (typeof download.url === "string" && download.url) {
            window.open(download.url, "_blank", "noopener,noreferrer");
          }
        }
        toast.success(job.download_document_id ? "Register exported" : "Register export queued");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Expense register export failed.");
      }
      return;
    }

    const head = [
      "Ticket",
      "Employee",
      "Department",
      "Type",
      "Project/Client",
      "Amount",
      "Payment",
      "Status",
      "Submitted",
    ];
    const csv = [
      head.join(","),
      ...rows.map((r) =>
        [
          r.id,
          r.employee,
          r.department,
          r.expenseType,
          r.project?.projectName ?? r.sales?.client ?? "",
          ticketTotal(r),
          r.paymentType,
          r.status,
          r.submittedAt ?? "",
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "expense-register.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Register exported");
  };

  return (
    <DataTable
      columns={cols}
      rows={rows}
      searchKeys={["id", "employee", "taskTitle"]}
      emptyTitle="No expense records"
      emptyDescription={
        tableError
          ? "Expense register data could not be loaded from the backend."
          : "No expenses match the current filters."
      }
      loading={tableLoading}
      toolbarRight={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="h-9 w-36 rounded-full">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All depts</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-44 rounded-full">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {[
                "draft",
                "pending_manager",
                "finance_verification",
                "finance_verified",
                "payment_released",
                "settlement_review",
                "closed",
              ].map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pay} onValueChange={setPay}>
            <SelectTrigger className="h-9 w-36 rounded-full">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="advance">Advance</SelectItem>
              <SelectItem value="reimbursement">Reimbursement</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={exportCsv}
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={(apiMode || isApiBacked) && exportMutation.isPending}
          >
            <Download className="mr-1 h-4 w-4" /> Export
          </Button>
        </div>
      }
    />
  );
}
