import type { AuthUser, ExpenseTicket } from "#shared";
import { addMoney, compareMoney, ExpenseStatuses, Roles, RequiredDocumentsByExpenseSubType } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { ReportRepository } from "./repository.js";
import { assertReportRole } from "./policy.js";

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
}

export class ReportService {
  private readonly repository: ReportRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new ReportRepository(store);
  }

  myExpenses(actor: AuthUser, pageNumber: number, pageSize: number) {
    return page(this.repository.tickets().filter((ticket) => ticket.requester_user_id === actor.id), pageNumber, pageSize);
  }

  managerQueue(actor: AuthUser, pageNumber: number, pageSize: number) {
    const items = actor.roles.includes(Roles.Admin)
      ? this.repository.tickets().filter((ticket) => ticket.status === ExpenseStatuses.PendingManagerVerification)
      : this.repository.tickets().filter((ticket) => ticket.manager_verifier_id === actor.id);
    return page(items.map((ticket) => this.presentTicket(ticket)), pageNumber, pageSize);
  }

  financeDashboard(actor: AuthUser, pageNumber: number, pageSize: number) {
    assertReportRole(actor, [Roles.FinanceManager]);
    return page(this.repository.tickets().filter((ticket) => ticket.finance_approver_id === actor.id).map((ticket) => this.presentTicket(ticket)), pageNumber, pageSize);
  }

  managerHistory(actor: AuthUser, pageNumber: number, pageSize: number) {
    const rows = this.store.expenseApprovals
      .filter((approval) => approval.approval_stage === "manager" && (approval.approver_user_id === actor.id || actor.roles.includes(Roles.Admin)))
      .sort((left, right) => Date.parse(right.action_at) - Date.parse(left.action_at))
      .map((approval) => {
        const ticket = this.repository.tickets().find((candidate) => candidate.id === approval.ticket_id);
        return ticket
          ? {
              ticket: this.presentTicket(ticket),
              stage: approval.approval_stage,
              decision: approval.decision,
              remarks: approval.remarks,
              acted_at: approval.action_at
            }
          : null;
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    return page(rows, pageNumber, pageSize);
  }

  financeHistory(actor: AuthUser, pageNumber: number, pageSize: number) {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Admin]);
    const rows = this.repository
      .audits()
      .filter((log) => log.actor_user_id === actor.id)
      .filter((log) => log.event_type.startsWith("expense.finance.") || log.event_type === "expense.payment_released" || log.event_type === "expense.settlement")
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
      .map((log) => {
        const ticket = this.repository.tickets().find((candidate) => candidate.id === log.ticket_id);
        return ticket
          ? {
              ticket: this.presentTicket(ticket),
              stage: log.event_type.includes("payment") ? "payment" : log.event_type.includes("settlement") ? "settlement" : "finance",
              decision: log.event_type.replace("expense.", "").replaceAll(".", " "),
              remarks: log.remarks,
              acted_at: log.created_at
            }
          : null;
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    return page(rows, pageNumber, pageSize);
  }

  financeAnalytics(actor: AuthUser) {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Auditor]);
    const tickets = this.financeScopedTickets(actor);
    const payments = this.repository
      .payments()
      .filter((payment) => tickets.some((ticket) => ticket.id === payment.ticket_id));
    const missingDocumentTickets = tickets.filter((ticket) => this.missingRequiredDocuments(ticket).length > 0);
    const highValueTickets = tickets
      .filter((ticket) => compareMoney(ticket.estimated_amount, "100000.00") >= 0)
      .sort((left, right) => compareMoney(right.estimated_amount, left.estimated_amount))
      .slice(0, 5);
    const staleTickets = tickets.filter((ticket) => ageHours(ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at) > 72);
    const payable = payments.filter((payment) => payment.settlement_status === "payable").map((payment) => payment.settlement_amount ?? "0.00");
    const recoverable = payments.filter((payment) => payment.settlement_status === "recoverable").map((payment) => payment.settlement_amount ?? "0.00");
    const recoverableAbsolute = recoverable.map((value) => value.replace("-", ""));

    return {
      generated_at: new Date().toISOString(),
      summary: {
        total_tickets: tickets.length,
        pending_finance_approval: countStatus(tickets, ExpenseStatuses.ManagerVerified),
        finance_hold: countStatus(tickets, ExpenseStatuses.FinanceHold),
        finance_approved: countStatus(tickets, ExpenseStatuses.FinanceApproved),
        payment_released: countStatus(tickets, ExpenseStatuses.PaymentReleased),
        bills_submitted: countStatus(tickets, ExpenseStatuses.BillsSubmitted),
        pending_adjustment: countStatus(tickets, ExpenseStatuses.PendingAdjustment),
        closed: countStatus(tickets, ExpenseStatuses.Closed),
        advance_outstanding_amount: addMoney(
          tickets
            .filter((ticket) => ticket.payment_type === "Advance" && ticket.status !== ExpenseStatuses.Closed)
            .map((ticket) => ticket.advance_amount ?? "0.00")
        ),
        payable_amount: addMoney(payable),
        recoverable_amount: addMoney(recoverableAbsolute),
        missing_document_risks: missingDocumentTickets.length,
        high_value_tickets: highValueTickets.length,
        sla_breaches: staleTickets.length
      },
      status_distribution: groupCount(tickets, (ticket) => ticket.status),
      monthly_spend_trend: groupMoney(tickets, (ticket) => ticket.created_at.slice(0, 7), (ticket) => ticket.estimated_amount),
      spend_by_department: groupMoney(
        tickets,
        (ticket) => this.repository.departmentName(ticket.department_id),
        (ticket) => ticket.estimated_amount
      ),
      spend_by_expense_type: groupMoney(tickets, (ticket) => ticket.expense_type, (ticket) => ticket.estimated_amount),
      spend_by_subtype: groupMoney(tickets, (ticket) => ticket.expense_sub_type, (ticket) => ticket.estimated_amount),
      advance_aging: groupCount(
        tickets.filter((ticket) => ticket.payment_type === "Advance" && ticket.status !== ExpenseStatuses.Closed),
        (ticket) => agingBucket(ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at)
      ),
      settlement_variance: [
        { label: "payable", amount: addMoney(payable.map((value) => value.replace("-", ""))) },
        { label: "recoverable", amount: addMoney(recoverableAbsolute) },
        { label: "no_balance", amount: "0.00", count: payments.filter((payment) => payment.settlement_status === "no_balance").length }
      ],
      risk_indicators: [
        { label: "Missing documents", count: missingDocumentTickets.length, severity: "must" },
        { label: "Finance hold", count: countStatus(tickets, ExpenseStatuses.FinanceHold), severity: "should" },
        { label: "SLA over 72h", count: staleTickets.length, severity: "should" },
        { label: "High value", count: highValueTickets.length, severity: "review" }
      ],
      high_value_tickets: highValueTickets.map((ticket) => ({
        id: ticket.id,
        ticket_no: ticket.ticket_no,
        requester_user_id: ticket.requester_user_id,
        status: ticket.status,
        estimated_amount: ticket.estimated_amount
      })),
      policy_warnings: missingDocumentTickets.slice(0, 5).map((ticket) => ({
        id: ticket.id,
        ticket_no: ticket.ticket_no,
        warning: "required_documents_missing",
        missing_document_types: this.missingRequiredDocuments(ticket)
      }))
    };
  }

  register(actor: AuthUser, pageNumber: number, pageSize: number) {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Auditor]);
    const isFinance = actor.roles.includes(Roles.FinanceManager) || actor.roles.includes(Roles.Admin);
    const tickets = this.repository.tickets().map((ticket) =>
      isFinance
        ? ticket
        : {
            id: ticket.id,
            ticket_no: ticket.ticket_no,
            requester_user_id: ticket.requester_user_id,
            status: ticket.status,
            estimated_amount: ticket.estimated_amount
          }
    );
    return page(tickets, pageNumber, pageSize);
  }

  advanceAging(actor: AuthUser, pageNumber: number, pageSize: number) {
    assertReportRole(actor, [Roles.FinanceManager]);
    const agingStatuses: readonly string[] = [
      ExpenseStatuses.PaymentReleased,
      ExpenseStatuses.BillsSubmitted,
      ExpenseStatuses.PendingAdjustment
    ];
    return page(
      this.repository
        .tickets()
        .filter(
          (ticket) =>
            ticket.payment_type === "Advance" &&
            agingStatuses.includes(ticket.status)
        ),
      pageNumber,
      pageSize
    );
  }

  paymentRegister(actor: AuthUser, pageNumber: number, pageSize: number) {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Auditor]);
    const tickets = this.financeScopedTickets(actor);
    const rows = this.repository
      .payments()
      .filter((payment) => tickets.some((ticket) => ticket.id === payment.ticket_id))
      .map((payment) => {
        const ticket = tickets.find((candidate) => candidate.id === payment.ticket_id);
        return {
          ...payment,
          ticket_no: ticket?.ticket_no ?? null,
          status: ticket?.status ?? null,
          requester_user_id: ticket?.requester_user_id ?? null
        };
      });
    return page(rows, pageNumber, pageSize);
  }

  audit(actor: AuthUser, pageNumber: number, pageSize: number) {
    assertReportRole(actor, [Roles.Auditor, Roles.FinanceManager, Roles.Admin]);
    return page(this.repository.audits(), pageNumber, pageSize);
  }

  createExport(actor: AuthUser, format: "csv" | "xlsx") {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Admin]);
    return {
      export_id: `export-${Date.now()}`,
      format,
      status: "queued",
      adapter: "csv-xlsx-placeholder"
    };
  }

  private financeScopedTickets(actor: AuthUser): ExpenseTicket[] {
    const canSeeAllFinance = actor.roles.includes(Roles.Admin) || actor.roles.includes(Roles.Auditor);
    return this.repository
      .tickets()
      .filter((ticket) => canSeeAllFinance || ticket.finance_approver_id === actor.id);
  }

  private missingRequiredDocuments(ticket: ExpenseTicket): string[] {
    const required = RequiredDocumentsByExpenseSubType[ticket.expense_sub_type] ?? [];
    const verified = new Set(
      this.repository
        .documents()
        .filter((document) => document.ticket_id === ticket.id && document.verification_status === "verified")
        .map((document) => document.document_type)
    );
    return required.filter((documentType) => !verified.has(documentType));
  }

  private presentTicket(ticket: ExpenseTicket) {
    const requester = this.store.users.find((user) => user.id === ticket.requester_user_id && !user.deleted_at);
    const department = this.store.departments.find((candidate) => candidate.id === ticket.department_id && !candidate.deleted_at);
    const assignedFinanceActorId =
      (typeof ticket.route_snapshot.finance_approver_id === "string" ? ticket.route_snapshot.finance_approver_id : ticket.finance_approver_id) ?? null;
    const assignedFinanceActor = assignedFinanceActorId
      ? this.store.users.find((user) => user.id === assignedFinanceActorId && !user.deleted_at) ?? null
      : null;
    const primaryFinanceManagerId =
      typeof ticket.route_snapshot.primary_finance_manager_user_id === "string"
        ? ticket.route_snapshot.primary_finance_manager_user_id
        : null;
    const primaryFinanceManager = primaryFinanceManagerId
      ? this.store.users.find((user) => user.id === primaryFinanceManagerId && !user.deleted_at) ?? null
      : null;
    const governanceNotes = Array.isArray(ticket.route_snapshot.notes)
      ? ticket.route_snapshot.notes.filter((note): note is string => typeof note === "string")
      : [];
    return {
      ...ticket,
      requester_employee_code: requester?.employee_code ?? null,
      requester_name: requester?.full_name ?? null,
      requester_email: requester?.email ?? null,
      requester_label: requester ? `${requester.employee_code} - ${requester.full_name}` : ticket.requester_user_id,
      department_code: department?.department_code ?? null,
      department_name: department?.name ?? null,
      department: department?.name ?? ticket.department_id,
      assigned_finance_actor_user_id: assignedFinanceActorId,
      assigned_finance_actor_label: assignedFinanceActor ? `${assignedFinanceActor.employee_code} - ${assignedFinanceActor.full_name}` : assignedFinanceActorId,
      primary_finance_manager_user_id: primaryFinanceManagerId,
      primary_finance_manager_label: primaryFinanceManager ? `${primaryFinanceManager.employee_code} - ${primaryFinanceManager.full_name}` : primaryFinanceManagerId,
      finance_backup_applied: ticket.route_snapshot.finance_backup_applied === true,
      governance_warning_codes: governanceNotes.filter((note) => note.startsWith("finance_") || note.startsWith("primary_"))
    };
  }
}

function countStatus(tickets: readonly ExpenseTicket[], status: string): number {
  return tickets.filter((ticket) => ticket.status === status).length;
}

function groupCount<T>(items: readonly T[], getLabel: (item: T) => string): Array<{ label: string; count: number }> {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const label = getLabel(item);
    grouped.set(label, (grouped.get(label) ?? 0) + 1);
  }
  return [...grouped.entries()].map(([label, count]) => ({ label, count }));
}

function groupMoney<T>(
  items: readonly T[],
  getLabel: (item: T) => string,
  getAmount: (item: T) => string
): Array<{ label: string; amount: string }> {
  const grouped = new Map<string, string[]>();
  for (const item of items) {
    const label = getLabel(item);
    grouped.set(label, [...(grouped.get(label) ?? []), getAmount(item)]);
  }
  return [...grouped.entries()].map(([label, values]) => ({ label, amount: addMoney(values) }));
}

function ageHours(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 3_600_000));
}

function agingBucket(iso: string): string {
  const age = ageHours(iso);
  if (age <= 24) {
    return "0-24h";
  }
  if (age <= 72) {
    return "24-72h";
  }
  return "72h-plus";
}
