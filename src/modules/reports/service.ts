import type { AuthUser, ExpensePayment, ExpenseTicket, UUID } from "#shared";
import { addMoney, compareMoney, ExpenseStatuses, Roles, RequiredDocumentsByExpenseSubType } from "#shared";
import type { ExpenseApprovalRecord, MemoryDataStore } from "../../platform/data-store.js";
import { ReportRepository } from "./repository.js";
import { assertReportRole } from "./policy.js";

export interface ExpenseReportQuery {
  page: number;
  page_size: number;
  sort?: string;
  status?: string;
  expense_type?: string;
  expense_sub_type?: string;
  payment_type?: string;
  department_id?: UUID;
  requester_user_id?: UUID;
  manager_user_id?: UUID;
  finance_user_id?: UUID;
  date_from?: string;
  date_to?: string;
  document_status?: "any" | "complete" | "missing" | "pending" | "not_required";
}

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
}

function pageWithMeta<T, TMeta extends Record<string, unknown>>(items: T[], pageNumber: number, pageSize: number, meta: TMeta) {
  return { ...page(items, pageNumber, pageSize), ...meta };
}

export class ReportService {
  private readonly repository: ReportRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new ReportRepository(store);
  }

  myExpenses(actor: AuthUser, query: ExpenseReportQuery) {
    const tickets = this.applyTicketFilters(
      this.repository.tickets().filter((ticket) => ticket.requester_user_id === actor.id),
      query
    );
    const rows = tickets.map((ticket) => this.presentTicket(ticket));
    return pageWithMeta(rows, query.page, query.page_size, {
      summary: this.ticketSummary(tickets),
      cards: this.expenseCards(tickets),
      filters: this.appliedFilterSummary(query)
    });
  }

  managerQueue(actor: AuthUser, query: ExpenseReportQuery) {
    const queueTickets = this.repository
      .tickets()
      .filter((ticket) => ticket.status === ExpenseStatuses.PendingManagerVerification)
      .filter(
        (ticket) =>
          actor.roles.includes(Roles.Admin) ||
          ticket.manager_verifier_id === actor.id ||
          ticket.manager_backup_user_id === actor.id
      );
    const tickets = this.applyTicketFilters(queueTickets, query);
    const rows = tickets.map((ticket) => ({
      ...this.presentTicket(ticket),
      manager_assignment_type: ticket.manager_backup_user_id === actor.id ? "backup" : "direct",
      manager_action_required: true
    }));
    return pageWithMeta(rows, query.page, query.page_size, {
      queue_counts: {
        total: tickets.length,
        direct_assigned: tickets.filter((ticket) => ticket.manager_verifier_id === actor.id).length,
        backup_assigned: tickets.filter((ticket) => ticket.manager_backup_user_id === actor.id).length,
        overdue_72h: tickets.filter((ticket) => ageHours(ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at) > 72).length
      },
      cards: this.managerCards(tickets),
      filters: this.appliedFilterSummary(query)
    });
  }

  financeDashboard(actor: AuthUser, query: ExpenseReportQuery) {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Admin, Roles.Auditor]);
    const tickets = this.applyTicketFilters(this.financeScopedTickets(actor), query);
    const rows = tickets.map((ticket) => this.presentTicket(ticket));
    return pageWithMeta(rows, query.page, query.page_size, {
      cards: this.financeCards(tickets),
      aging_buckets: this.agingBuckets(tickets),
      payable_totals: this.payableTotals(tickets),
      exception_counts: this.exceptionCounts(tickets),
      filters: this.appliedFilterSummary(query)
    });
  }

  managerHistory(actor: AuthUser, query: ExpenseReportQuery) {
    const rows = this.store.expenseApprovals
      .filter((approval) => approval.approval_stage === "manager" && (approval.approver_user_id === actor.id || actor.roles.includes(Roles.Admin)))
      .sort((left, right) => Date.parse(right.action_at) - Date.parse(left.action_at))
      .map((approval) => this.presentManagerApproval(approval))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .filter((row) => this.matchesReportRow(row.ticket, query));
    return pageWithMeta(rows, query.page, query.page_size, {
      summary: {
        total_actions: rows.length,
        verified: rows.filter((row) => row.decision === "approve").length,
        returned: rows.filter((row) => row.decision === "return").length,
        rejected: rows.filter((row) => row.decision === "reject").length
      },
      filters: this.appliedFilterSummary(query)
    });
  }

  financeHistory(actor: AuthUser, query: ExpenseReportQuery) {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Admin, Roles.Auditor]);
    const canSeeAll = actor.roles.includes(Roles.Admin) || actor.roles.includes(Roles.Auditor);
    const rows = this.repository
      .audits()
      .filter((log) => canSeeAll || log.actor_user_id === actor.id)
      .filter((log) => log.event_type.startsWith("expense.finance.") || log.event_type === "expense.payment_released" || log.event_type === "expense.settlement")
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
      .map((log) => {
        const ticket = this.repository.tickets().find((candidate) => candidate.id === log.ticket_id);
        const actorUser = this.store.users.find((user) => user.id === log.actor_user_id && !user.deleted_at);
        return ticket
          ? {
              ticket: this.presentTicket(ticket),
              stage: log.event_type.includes("payment") ? "payment" : log.event_type.includes("settlement") ? "settlement" : "finance",
              decision: log.event_type.replace("expense.", "").replaceAll(".", " "),
              remarks: log.remarks,
              actor_user_id: log.actor_user_id,
              actor_label: actorUser ? `${actorUser.employee_code} - ${actorUser.full_name}` : log.actor_user_id,
              acted_at: log.created_at,
              audit_event_type: log.event_type,
              payment: this.paymentSummary(ticket)
            }
          : null;
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .filter((row) => this.matchesReportRow(row.ticket, query));
    return pageWithMeta(rows, query.page, query.page_size, {
      summary: {
        total_actions: rows.length,
        finance_decisions: rows.filter((row) => row.stage === "finance").length,
        payments: rows.filter((row) => row.stage === "payment").length,
        settlements: rows.filter((row) => row.stage === "settlement").length
      },
      filters: this.appliedFilterSummary(query)
    });
  }

  financeAnalytics(actor: AuthUser) {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Admin, Roles.Auditor]);
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
      cards: this.financeCards(tickets),
      aging_buckets: this.agingBuckets(tickets),
      payable_totals: this.payableTotals(tickets),
      exception_counts: this.exceptionCounts(tickets),
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
        requester_label: this.userLabel(ticket.requester_user_id),
        status: ticket.status,
        estimated_amount: ticket.estimated_amount,
        document_status: this.documentSummary(ticket).status
      })),
      policy_warnings: missingDocumentTickets.slice(0, 5).map((ticket) => ({
        id: ticket.id,
        ticket_no: ticket.ticket_no,
        warning: "required_documents_missing",
        missing_document_types: this.missingRequiredDocuments(ticket)
      }))
    };
  }

  register(actor: AuthUser, query: ExpenseReportQuery) {
    assertReportRole(actor, [Roles.FinanceManager, Roles.Auditor, Roles.Admin]);
    const isFinance = actor.roles.includes(Roles.FinanceManager) || actor.roles.includes(Roles.Admin);
    const tickets = this.applyTicketFilters(this.financeScopedTickets(actor), query);
    const rows = tickets.map((ticket) => {
      const presented = this.presentTicket(ticket);
      if (isFinance) {
        return {
          ...presented,
          register_columns: this.registerColumns(ticket),
          export_fields: this.exportFields(ticket)
        };
      }
      return {
        id: ticket.id,
        ticket_no: ticket.ticket_no,
        requester_user_id: ticket.requester_user_id,
        requester_label: presented.requester_label,
        department_name: presented.department_name,
        status: ticket.status,
        estimated_amount: ticket.estimated_amount,
        document_summary: presented.document_summary,
        register_columns: this.registerColumns(ticket)
      };
    });
    return pageWithMeta(rows, query.page, query.page_size, {
      totals: this.registerTotals(tickets),
      filters: this.appliedFilterSummary(query),
      export_columns: [
        "ticket_no",
        "requester_label",
        "department_name",
        "status",
        "estimated_amount",
        "approved_amount",
        "actual_amount",
        "payment_reference_no",
        "document_status",
        "settlement_delta"
      ]
    });
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
      .filter((ticket) => canSeeAllFinance || ticket.finance_approver_id === actor.id || ticket.route_snapshot.finance_approver_id === actor.id);
  }

  private applyTicketFilters(tickets: readonly ExpenseTicket[], query: ExpenseReportQuery): ExpenseTicket[] {
    const filtered = tickets.filter((ticket) => this.matchesTicketFilters(ticket, query));
    const sort = query.sort ?? "-updated_at";
    const descending = sort.startsWith("-");
    const key = descending ? sort.slice(1) : sort;
    return [...filtered].sort((left, right) => {
      const compared = this.ticketSortValue(left, key).localeCompare(this.ticketSortValue(right, key));
      return descending ? -compared : compared;
    });
  }

  private matchesTicketFilters(ticket: ExpenseTicket, query: ExpenseReportQuery): boolean {
    if (query.status && ticket.status !== query.status) return false;
    if (query.expense_type && ticket.expense_type !== query.expense_type) return false;
    if (query.expense_sub_type && ticket.expense_sub_type !== query.expense_sub_type) return false;
    if (query.payment_type && ticket.payment_type !== query.payment_type) return false;
    if (query.department_id && ticket.department_id !== query.department_id) return false;
    if (query.requester_user_id && ticket.requester_user_id !== query.requester_user_id) return false;
    if (query.manager_user_id && ticket.manager_verifier_id !== query.manager_user_id && ticket.manager_backup_user_id !== query.manager_user_id) return false;
    if (query.finance_user_id && ticket.finance_approver_id !== query.finance_user_id && ticket.route_snapshot.finance_approver_id !== query.finance_user_id) return false;
    if (query.date_from && ticket.created_at.slice(0, 10) < query.date_from) return false;
    if (query.date_to && ticket.created_at.slice(0, 10) > query.date_to) return false;
    if (query.document_status && query.document_status !== "any" && this.documentSummary(ticket).status !== query.document_status) return false;
    return true;
  }

  private matchesReportRow(ticket: { id: UUID }, query: ExpenseReportQuery): boolean {
    const source = this.repository.tickets().find((candidate) => candidate.id === ticket.id);
    return source ? this.matchesTicketFilters(source, query) : false;
  }

  private ticketSortValue(ticket: ExpenseTicket, key: string): string {
    switch (key) {
      case "ticket_no":
        return ticket.ticket_no;
      case "status":
        return ticket.status;
      case "estimated_amount":
        return ticket.estimated_amount.padStart(16, "0");
      case "created_at":
        return ticket.created_at;
      case "updated_at":
      default:
        return ticket.updated_at;
    }
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

  private presentManagerApproval(approval: ExpenseApprovalRecord) {
    const ticket = this.repository.tickets().find((candidate) => candidate.id === approval.ticket_id);
    const approver = this.store.users.find((user) => user.id === approval.approver_user_id && !user.deleted_at);
    return ticket
      ? {
          ticket: this.presentTicket(ticket),
          stage: approval.approval_stage,
          decision: approval.decision,
          remarks: approval.remarks,
          decided_by_user_id: approval.approver_user_id,
          decided_by_label: approver ? `${approver.employee_code} - ${approver.full_name}` : approval.approver_user_id,
          acted_at: approval.action_at,
          previous_status: approval.route_snapshot.previous_status ?? null,
          next_status: approval.route_snapshot.next_status ?? ticket.status,
          audit_metadata: {
            role_snapshot: approval.role_snapshot,
            designation_snapshot: approval.designation_snapshot,
            route_snapshot: approval.route_snapshot
          }
        }
      : null;
  }

  private presentTicket(ticket: ExpenseTicket) {
    const requester = this.store.users.find((user) => user.id === ticket.requester_user_id && !user.deleted_at);
    const department = this.store.departments.find((candidate) => candidate.id === ticket.department_id && !candidate.deleted_at);
    const manager = ticket.manager_verifier_id ? this.store.users.find((user) => user.id === ticket.manager_verifier_id && !user.deleted_at) : null;
    const backupManager = ticket.manager_backup_user_id ? this.store.users.find((user) => user.id === ticket.manager_backup_user_id && !user.deleted_at) : null;
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
    const documentSummary = this.documentSummary(ticket);
    const paymentSummary = this.paymentSummary(ticket);
    const workflowSummary = this.workflowSummary(ticket, manager, backupManager, assignedFinanceActor);
    return {
      ...ticket,
      requester_employee_code: requester?.employee_code ?? null,
      requester_name: requester?.full_name ?? null,
      requester_email: requester?.email ?? null,
      requester_label: requester ? `${requester.employee_code} - ${requester.full_name}` : ticket.requester_user_id,
      department_code: department?.department_code ?? null,
      department_name: department?.name ?? null,
      department: department?.name ?? ticket.department_id,
      manager_verifier_label: manager ? `${manager.employee_code} - ${manager.full_name}` : ticket.manager_verifier_id,
      manager_backup_label: backupManager ? `${backupManager.employee_code} - ${backupManager.full_name}` : ticket.manager_backup_user_id,
      assigned_finance_actor_user_id: assignedFinanceActorId,
      assigned_finance_actor_label: assignedFinanceActor ? `${assignedFinanceActor.employee_code} - ${assignedFinanceActor.full_name}` : assignedFinanceActorId,
      primary_finance_manager_user_id: primaryFinanceManagerId,
      primary_finance_manager_label: primaryFinanceManager ? `${primaryFinanceManager.employee_code} - ${primaryFinanceManager.full_name}` : primaryFinanceManagerId,
      finance_backup_applied: ticket.route_snapshot.finance_backup_applied === true,
      governance_warning_codes: governanceNotes.filter((note) => note.startsWith("finance_") || note.startsWith("primary_")),
      document_summary: documentSummary,
      payment_summary: paymentSummary,
      workflow_summary: workflowSummary,
      amount_summary: {
        estimated_amount: ticket.estimated_amount,
        advance_amount: ticket.advance_amount,
        actual_amount: ticket.actual_amount,
        variance_amount: ticket.variance_amount,
        approved_amount: paymentSummary?.approved_amount ?? null,
        paid_amount: paymentSummary?.paid_amount ?? null
      }
    };
  }

  private documentSummary(ticket: ExpenseTicket) {
    const required = RequiredDocumentsByExpenseSubType[ticket.expense_sub_type] ?? [];
    const documents = this.repository.documents().filter((document) => document.ticket_id === ticket.id);
    const missing = this.missingRequiredDocuments(ticket);
    const pending = documents.filter((document) => document.verification_status === "pending").length;
    const verified = documents.filter((document) => document.verification_status === "verified").length;
    const rejected = documents.filter((document) => document.verification_status === "rejected").length;
    const status = required.length === 0
      ? "not_required"
      : missing.length > 0
        ? "missing"
        : pending > 0
          ? "pending"
          : "complete";
    return {
      status,
      required_document_types: required,
      missing_document_types: missing,
      uploaded_document_count: documents.length,
      verified_document_count: verified,
      pending_document_count: pending,
      rejected_document_count: rejected,
      total_required_document_count: required.length
    };
  }

  private paymentSummary(ticket: ExpenseTicket) {
    const payments = this.repository.payments().filter((payment) => payment.ticket_id === ticket.id);
    const latest = latestPayment(payments);
    return latest
      ? {
          payment_id: latest.id,
          payment_type: latest.payment_type,
          approved_amount: latest.approved_amount,
          paid_amount: latest.paid_amount,
          payment_date: latest.payment_date,
          payment_mode: latest.payment_mode,
          reference_no: latest.reference_no,
          settlement_status: latest.settlement_status,
          settlement_amount: latest.settlement_amount,
          processed_by_user_id: latest.processed_by_user_id
        }
      : null;
  }

  private workflowSummary(ticket: ExpenseTicket, manager: AuthUser | null | undefined, backupManager: AuthUser | null | undefined, financeActor: AuthUser | null | undefined) {
    const ageSource = ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at;
    const action = actionRequiredBy(ticket);
    const actor = action === "manager" ? manager ?? backupManager : action === "finance" ? financeActor : null;
    return {
      current_status: ticket.status,
      action_required_by: action,
      current_actor_user_id: actor?.id ?? null,
      current_actor_label: actor ? `${actor.employee_code} - ${actor.full_name}` : null,
      age_hours: ageHours(ageSource),
      aging_bucket: agingBucket(ageSource),
      manager_action_required: ticket.status === ExpenseStatuses.PendingManagerVerification,
      finance_action_required: hasStatus(ticket, [ExpenseStatuses.ManagerVerified, ExpenseStatuses.FinanceHold, ExpenseStatuses.ClarificationRequired]),
      document_action_required: hasStatus(ticket, [ExpenseStatuses.PaymentReleased, ExpenseStatuses.BillsSubmitted]),
      settlement_action_required: ticket.status === ExpenseStatuses.PendingAdjustment
    };
  }

  private ticketSummary(tickets: readonly ExpenseTicket[]) {
    return {
      total_requests: tickets.length,
      open_requests: tickets.filter((ticket) => !hasStatus(ticket, [ExpenseStatuses.Closed, ExpenseStatuses.Cancelled])).length,
      closed_requests: countStatus(tickets, ExpenseStatuses.Closed),
      total_estimated_amount: addMoney(tickets.map((ticket) => ticket.estimated_amount)),
      total_advance_amount: addMoney(tickets.map((ticket) => ticket.advance_amount ?? "0.00")),
      missing_documents: tickets.filter((ticket) => this.documentSummary(ticket).status === "missing").length
    };
  }

  private expenseCards(tickets: readonly ExpenseTicket[]) {
    return [
      { key: "open", label: "Open", count: tickets.filter((ticket) => !hasStatus(ticket, [ExpenseStatuses.Closed, ExpenseStatuses.Cancelled])).length },
      { key: "manager", label: "Pending Manager Verification", count: countStatus(tickets, ExpenseStatuses.PendingManagerVerification) },
      { key: "finance", label: "Finance Action", count: tickets.filter((ticket) => hasStatus(ticket, [ExpenseStatuses.ManagerVerified, ExpenseStatuses.FinanceHold, ExpenseStatuses.ClarificationRequired])).length },
      { key: "closed", label: "Closed", count: countStatus(tickets, ExpenseStatuses.Closed) }
    ];
  }

  private managerCards(tickets: readonly ExpenseTicket[]) {
    return [
      { key: "pending", label: "Pending Manager Verification", count: tickets.length, amount: addMoney(tickets.map((ticket) => ticket.estimated_amount)) },
      { key: "missing_documents", label: "Missing Required Documents", count: tickets.filter((ticket) => this.documentSummary(ticket).status === "missing").length },
      { key: "overdue", label: "Over 72h", count: tickets.filter((ticket) => ageHours(ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at) > 72).length }
    ];
  }

  private financeCards(tickets: readonly ExpenseTicket[]) {
    return [
      { key: "pending_finance_approval", label: "Pending Finance Approval", count: countStatus(tickets, ExpenseStatuses.ManagerVerified), amount: addMoney(tickets.filter((ticket) => ticket.status === ExpenseStatuses.ManagerVerified).map((ticket) => ticket.estimated_amount)) },
      { key: "finance_hold", label: "Finance Hold", count: countStatus(tickets, ExpenseStatuses.FinanceHold) },
      { key: "payment_released", label: "Payment Released", count: countStatus(tickets, ExpenseStatuses.PaymentReleased) },
      { key: "bills_pending", label: "Bills Pending", count: countStatus(tickets, ExpenseStatuses.PaymentReleased) },
      { key: "settlement_due", label: "Settlement Due", count: countStatus(tickets, ExpenseStatuses.PendingAdjustment) },
      { key: "closed", label: "Closed", count: countStatus(tickets, ExpenseStatuses.Closed) }
    ];
  }

  private agingBuckets(tickets: readonly ExpenseTicket[]) {
    return groupCount(tickets, (ticket) => agingBucket(ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at));
  }

  private payableTotals(tickets: readonly ExpenseTicket[]) {
    const payments = this.repository.payments().filter((payment) => tickets.some((ticket) => ticket.id === payment.ticket_id));
    const payable = payments.filter((payment) => payment.settlement_status === "payable").map((payment) => payment.settlement_amount ?? "0.00");
    const recoverable = payments.filter((payment) => payment.settlement_status === "recoverable").map((payment) => (payment.settlement_amount ?? "0.00").replace("-", ""));
    return {
      approved_amount: addMoney(payments.map((payment) => payment.approved_amount)),
      paid_amount: addMoney(payments.map((payment) => payment.paid_amount)),
      payable_amount: addMoney(payable),
      recoverable_amount: addMoney(recoverable)
    };
  }

  private exceptionCounts(tickets: readonly ExpenseTicket[]) {
    return {
      missing_documents: tickets.filter((ticket) => this.documentSummary(ticket).status === "missing").length,
      finance_hold: countStatus(tickets, ExpenseStatuses.FinanceHold),
      overdue_72h: tickets.filter((ticket) => ageHours(ticket.submitted_at ?? ticket.updated_at ?? ticket.created_at) > 72).length,
      high_value: tickets.filter((ticket) => compareMoney(ticket.estimated_amount, "100000.00") >= 0).length
    };
  }

  private registerColumns(ticket: ExpenseTicket) {
    const payment = this.paymentSummary(ticket);
    return {
      employee: this.userLabel(ticket.requester_user_id),
      department: this.repository.departmentName(ticket.department_id),
      status: ticket.status,
      approved_amount: payment?.approved_amount ?? null,
      actual_amount: ticket.actual_amount,
      payment_reference_no: payment?.reference_no ?? ticket.payment_reference_no,
      document_status: this.documentSummary(ticket).status,
      settlement_delta: ticket.variance_amount
    };
  }

  private exportFields(ticket: ExpenseTicket) {
    const presented = this.presentTicket(ticket);
    return {
      ticket_no: ticket.ticket_no,
      requester_label: presented.requester_label,
      department_name: presented.department_name,
      status: ticket.status,
      estimated_amount: ticket.estimated_amount,
      approved_amount: presented.payment_summary?.approved_amount ?? null,
      actual_amount: ticket.actual_amount,
      payment_reference_no: presented.payment_summary?.reference_no ?? ticket.payment_reference_no,
      document_status: presented.document_summary.status,
      settlement_delta: ticket.variance_amount
    };
  }

  private registerTotals(tickets: readonly ExpenseTicket[]) {
    const payments = this.repository.payments().filter((payment) => tickets.some((ticket) => ticket.id === payment.ticket_id));
    return {
      total_rows: tickets.length,
      estimated_amount: addMoney(tickets.map((ticket) => ticket.estimated_amount)),
      approved_amount: addMoney(payments.map((payment) => payment.approved_amount)),
      actual_amount: addMoney(tickets.map((ticket) => ticket.actual_amount ?? "0.00")),
      paid_amount: addMoney(payments.map((payment) => payment.paid_amount)),
      missing_documents: tickets.filter((ticket) => this.documentSummary(ticket).status === "missing").length
    };
  }

  private userLabel(userId: UUID): string | null {
    const user = this.store.users.find((candidate) => candidate.id === userId && !candidate.deleted_at);
    return user ? `${user.employee_code} - ${user.full_name}` : null;
  }

  private appliedFilterSummary(query: ExpenseReportQuery) {
    return {
      status: query.status ?? null,
      expense_type: query.expense_type ?? null,
      expense_sub_type: query.expense_sub_type ?? null,
      payment_type: query.payment_type ?? null,
      department_id: query.department_id ?? null,
      requester_user_id: query.requester_user_id ?? null,
      manager_user_id: query.manager_user_id ?? null,
      finance_user_id: query.finance_user_id ?? null,
      date_from: query.date_from ?? null,
      date_to: query.date_to ?? null,
      document_status: query.document_status ?? "any",
      sort: query.sort ?? "-updated_at"
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

function latestPayment(payments: readonly ExpensePayment[]): ExpensePayment | null {
  return [...payments].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null;
}

function actionRequiredBy(ticket: ExpenseTicket): "requester" | "manager" | "finance" | "none" {
  switch (ticket.status) {
    case ExpenseStatuses.PendingManagerVerification:
      return "manager";
    case ExpenseStatuses.ManagerReturned:
    case ExpenseStatuses.ClarificationRequired:
    case ExpenseStatuses.PaymentReleased:
      return "requester";
    case ExpenseStatuses.ManagerVerified:
    case ExpenseStatuses.FinanceHold:
    case ExpenseStatuses.FinanceApproved:
    case ExpenseStatuses.BillsSubmitted:
    case ExpenseStatuses.PendingAdjustment:
      return "finance";
    default:
      return "none";
  }
}

function hasStatus(ticket: ExpenseTicket, statuses: readonly string[]): boolean {
  return statuses.includes(ticket.status);
}
