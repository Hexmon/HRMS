import { asArray, asRecord, dateText, numberValue, text, type ApiRecord } from "@/shared/api";
import type {
  ApprovalEvent,
  AuditEvent,
  ExpenseDoc,
  ExpenseStage,
  ExpenseStatus,
  ExpenseTicket,
  ExpenseType,
  LineItem,
  Payment,
  PaymentType,
  Priority,
  Settlement,
} from "@/lib/expenses-store";

function normalized(value: unknown): string {
  return text(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function mapStatus(value: unknown, fallback: ExpenseStatus = "draft"): ExpenseStatus {
  const status = normalized(value);
  const map: Record<string, ExpenseStatus> = {
    draft: "draft",
    submitted: "submitted",
    pending_manager_verification: "pending_manager",
    pending_manager: "pending_manager",
    manager_returned: "manager_returned",
    manager_rejected: "manager_rejected",
    manager_verified: "finance_verification",
    clarification_required: "finance_hold",
    finance_verification: "finance_verification",
    finance_hold: "finance_hold",
    finance_approved: "finance_verified",
    finance_verified: "finance_verified",
    payment_released: "payment_released",
    bills_submitted: "bills_submitted",
    settlement_review: "settlement_review",
    pending_adjustment: "pending_adjustment",
    finance_routing_exception: "finance_hold",
    closed: "closed",
    cancelled: "withdrawn",
    withdrawn: "withdrawn",
  };
  return map[status] ?? fallback;
}

function stageForStatus(status: ExpenseStatus): ExpenseStage {
  if (status === "draft") return "draft";
  if (["pending_manager", "manager_returned"].includes(status)) return "manager";
  if (["finance_verification", "finance_hold", "finance_verified"].includes(status))
    return "finance";
  if (status === "payment_released") return "payment";
  if (["bills_submitted", "settlement_review", "pending_adjustment"].includes(status)) {
    return "settlement";
  }
  return "closed";
}

function mapExpenseType(value: unknown, fallback: ExpenseType = "project"): ExpenseType {
  const type = normalized(value);
  if (["salespresales", "sales_pre_sales", "sales_presales"].includes(type))
    return "sales_presales";
  if (type === "project") return "project";
  return fallback;
}

function mapPaymentType(value: unknown, fallback: PaymentType = "reimbursement"): PaymentType {
  return normalized(value) === "advance" ? "advance" : fallback;
}

function mapPriority(value: unknown, fallback: Priority = "normal"): Priority {
  const priority = normalized(value);
  return ["low", "normal", "high", "urgent"].includes(priority) ? (priority as Priority) : fallback;
}

function mapLineItems(value: unknown, fallback: LineItem[]): LineItem[] {
  const rows = asArray(value);
  if (!rows.length) return fallback;
  return rows.map((item, index) => {
    const row = asRecord(item);
    return {
      id: text(row.id, `li_${index + 1}`),
      category: text(row.category ?? row.expense_category ?? row.line_category, "General"),
      description: text(row.description, "Expense item"),
      quantity: numberValue(row.quantity, 1),
      unitCost: numberValue(row.unit_cost ?? row.unitCost ?? row.amount, 0),
      taxAmount: numberValue(row.tax_amount ?? row.taxAmount, 0),
      vendor: text(row.vendor ?? row.vendor_name, "—"),
    };
  });
}

function mapDocuments(value: unknown, fallback: ExpenseDoc[]): ExpenseDoc[] {
  const rows = asArray(value);
  if (!rows.length) return fallback;
  return rows.map((item, index) => {
    const row = asRecord(item);
    return {
      id: text(row.id ?? row.document_id, `doc_${index + 1}`),
      name: text(row.name ?? row.file_name ?? row.type ?? row.document_type, "Document"),
      kind: (normalized(row.kind ?? row.type ?? row.document_type) ||
        "other") as ExpenseDoc["kind"],
      uploadedAt: dateText(row.uploaded_at ?? row.created_at),
    };
  });
}

function mapPayment(row: ApiRecord, fallback?: Payment): Payment | undefined {
  if (!row.payment && !row.payment_reference && !fallback) return undefined;
  const payment = asRecord(row.payment);
  return {
    paidAmount: numberValue(payment.paid_amount ?? row.paid_amount, fallback?.paidAmount ?? 0),
    mode: (normalized(payment.mode ?? row.payment_mode) ||
      fallback?.mode ||
      "bank_transfer") as Payment["mode"],
    paidOn: dateText(payment.paid_on ?? row.paid_on, fallback?.paidOn).slice(0, 10),
    reference: text(payment.reference ?? row.payment_reference, fallback?.reference ?? "—"),
    remarks: text(payment.remarks ?? row.payment_remarks, fallback?.remarks),
  };
}

function mapSettlement(row: ApiRecord, fallback?: Settlement): Settlement | undefined {
  if (!row.settlement && !row.actual_amount && !fallback) return undefined;
  const settlement = asRecord(row.settlement);
  return {
    advanceAmount: numberValue(
      settlement.advance_amount ?? row.advance_amount,
      fallback?.advanceAmount ?? 0,
    ),
    actualSpent: numberValue(
      settlement.actual_spent ?? row.actual_amount,
      fallback?.actualSpent ?? 0,
    ),
    balance: numberValue(settlement.balance ?? row.settlement_delta, fallback?.balance ?? 0),
    billsSubmitted: Boolean(
      settlement.bills_submitted ?? row.bills_submitted ?? fallback?.billsSubmitted,
    ),
    remarks: text(settlement.remarks ?? row.settlement_remarks, fallback?.remarks),
  };
}

export function mapApiExpenseTicket(
  value: unknown,
  fallback?: Partial<ExpenseTicket>,
): ExpenseTicket {
  const row = asRecord(value);
  const status = mapStatus(row.status, fallback?.status);
  const expenseType = mapExpenseType(row.expense_type, fallback?.expenseType);
  const estimatedAmount = numberValue(
    row.estimated_amount ?? row.amount,
    fallback?.estimatedAmount ?? 0,
  );

  return {
    id: text(row.id ?? row.ticket_no, fallback?.id ?? "EXP-API"),
    version: numberValue(row.version, fallback?.version ?? 1),
    employee: text(row.requester_name ?? row.employee, fallback?.employee ?? "Employee"),
    employeeId: text(row.requester_user_id ?? row.employee_id, fallback?.employeeId ?? "self"),
    department: text(row.department_name ?? row.department_id, fallback?.department ?? "General"),
    manager: text(
      row.manager_name ?? row.manager_verifier_label ?? row.manager_user_id,
      fallback?.manager ?? "Manager",
    ),
    expenseType,
    subType: text(row.expense_sub_type ?? row.sub_type, fallback?.subType ?? "General"),
    taskTitle: text(row.task_title, fallback?.taskTitle ?? text(row.ticket_no, "Expense")),
    taskDescription: text(row.task_description ?? row.description, fallback?.taskDescription ?? ""),
    startDate: dateText(row.start_date, fallback?.startDate ?? new Date().toISOString()).slice(
      0,
      10,
    ),
    endDate: dateText(row.end_date, fallback?.endDate ?? new Date().toISOString()).slice(0, 10),
    location: text(row.location, fallback?.location ?? "—"),
    estimatedAmount,
    paymentType: mapPaymentType(row.payment_type, fallback?.paymentType),
    priority: mapPriority(row.priority, fallback?.priority),
    remarks: text(row.remarks, fallback?.remarks),
    project:
      expenseType === "project"
        ? {
            projectCode: text(row.project_code, fallback?.project?.projectCode ?? "PRJ"),
            projectName: text(row.project_name, fallback?.project?.projectName ?? "Project"),
            projectManager: text(row.project_manager, fallback?.project?.projectManager ?? "—"),
            costCenter: text(row.cost_center, fallback?.project?.costCenter ?? "—"),
            projectExpenseType: fallback?.project?.projectExpenseType ?? "misc",
          }
        : undefined,
    sales:
      expenseType === "sales_presales"
        ? {
            client: text(row.client_name, fallback?.sales?.client ?? "Client"),
            opportunity: text(row.opportunity, fallback?.sales?.opportunity ?? "—"),
            meetingType: text(row.meeting_type, fallback?.sales?.meetingType ?? "Meeting"),
            salesOwner: text(row.sales_owner, fallback?.sales?.salesOwner ?? "—"),
            expectedOutcome: text(row.expected_outcome, fallback?.sales?.expectedOutcome ?? "—"),
          }
        : undefined,
    lineItems: mapLineItems(
      row.line_items ?? row.lineItems,
      fallback?.lineItems ?? [
        {
          id: "li_1",
          category: text(row.expense_sub_type, "General"),
          description: text(row.task_title, "Expense"),
          quantity: 1,
          unitCost: estimatedAmount,
          taxAmount: 0,
          vendor: "—",
        },
      ],
    ),
    documents: mapDocuments(row.documents, fallback?.documents ?? []),
    status,
    stage: fallback?.stage ?? stageForStatus(status),
    approvals: fallback?.approvals ?? ([] as ApprovalEvent[]),
    audit: fallback?.audit ?? ([] as AuditEvent[]),
    comments: mapClarifications(row.clarifications, fallback?.comments ?? []),
    payment: mapPayment(row, fallback?.payment),
    settlement: mapSettlement(row, fallback?.settlement),
    submittedAt: text(row.submitted_at, fallback?.submittedAt),
    createdAt: dateText(row.created_at, fallback?.createdAt ?? new Date().toISOString()),
  };
}

export function mapApiExpenseTickets(
  values: unknown[],
  fallbacks: ExpenseTicket[],
): ExpenseTicket[] {
  return values.map((value) => {
    const row = asRecord(value);
    const key = text(row.id ?? row.ticket_no);
    const fallback = fallbacks.find((ticket) => ticket.id === key);
    return mapApiExpenseTicket(row as ApiRecord, fallback);
  });
}

function mapClarifications(
  value: unknown,
  fallback: ExpenseTicket["comments"],
): ExpenseTicket["comments"] {
  const rows = asArray(value);
  if (!rows.length) return fallback;
  return rows.map((item) => {
    const row = asRecord(item);
    return {
      by: text(row.actor_name ?? row.actor_user_id, "System"),
      text: text(row.message ?? row.remarks, "Clarification added"),
      at: dateText(row.created_at),
    };
  });
}

function approvalRole(eventType: string): string {
  if (eventType.includes("manager")) return "Manager";
  if (
    eventType.includes("finance") ||
    eventType.includes("payment") ||
    eventType.includes("settlement")
  ) {
    return "Finance";
  }
  if (eventType.includes("document")) return "Documents";
  return "Requester";
}

function approvalStatus(eventType: string): ApprovalEvent["status"] {
  if (
    eventType.includes("reject") ||
    eventType.includes("return") ||
    eventType.includes("hold") ||
    eventType.includes("clarification")
  ) {
    return "rejected";
  }
  return "approved";
}

export function mapApiExpenseApprovals(
  values: unknown[],
  fallback: ApprovalEvent[],
): ApprovalEvent[] {
  const rows = asArray(values);
  if (!rows.length) return fallback;
  return rows.map((item) => {
    const row = asRecord(item);
    const eventType = normalized(row.event_type);
    return {
      by: text(row.actor_name ?? row.actor ?? row.actor_user_id, "System"),
      role: approvalRole(eventType),
      action: text(row.label ?? row.event_type, "Workflow event"),
      status: approvalStatus(eventType),
      remark: text(row.remarks) || undefined,
      at: dateText(row.timestamp ?? row.created_at),
    };
  });
}

export function mapApiExpenseAudit(values: unknown[], fallback: AuditEvent[]): AuditEvent[] {
  const rows = asArray(values);
  if (!rows.length) return fallback;
  return rows.map((item) => {
    const row = asRecord(item);
    return {
      by: text(row.actor_name ?? row.actor ?? row.actor_user_id, "System"),
      what: text(row.label ?? row.event_type, "Expense event"),
      at: dateText(row.timestamp ?? row.created_at),
    };
  });
}
