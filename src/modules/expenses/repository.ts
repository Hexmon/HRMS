import { randomUUID } from "node:crypto";
import type {
  ExpenseAuditLog,
  ExpenseDocument,
  ExpenseLineItem,
  ExpensePayment,
  ExpenseStatus,
  ExpenseTicket,
  ManagerBackupAssignment,
  UUID
} from "#shared";
import { ExpenseStatuses } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { conflict, notFound } from "../../platform/errors.js";

export class ExpenseRepository {
  constructor(private readonly store: MemoryDataStore) {}

  nextTicketNo(): string {
    return `EXP-2026-${String(this.store.nextTicketNo++).padStart(4, "0")}`;
  }

  insertTicket(ticket: ExpenseTicket, items: ExpenseLineItem[]): ExpenseTicket {
    this.store.tickets.push(ticket);
    this.store.lineItems.push(...items);
    return ticket;
  }

  findTicket(id: UUID): ExpenseTicket {
    const ticket = this.store.tickets.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!ticket) {
      throw notFound("Expense ticket not found", { id });
    }
    return ticket;
  }

  updateTicketVersioned(id: UUID, expectedVersion: number, mutator: (ticket: ExpenseTicket) => void): ExpenseTicket {
    const ticket = this.findTicket(id);
    if (ticket.version !== expectedVersion) {
      throw conflict("The ticket was modified by another actor. Refresh and retry.", {
        aggregate: "expense_ticket",
        id,
        expected_version: expectedVersion,
        current_version: ticket.version,
        current_status: ticket.status
      });
    }
    mutator(ticket);
    ticket.version += 1;
    ticket.updated_at = nowIso();
    return ticket;
  }

  listByRequester(userId: UUID): ExpenseTicket[] {
    return this.store.tickets.filter((ticket) => ticket.requester_user_id === userId && !ticket.deleted_at);
  }

  managerQueue(userId: UUID): ExpenseTicket[] {
    return this.store.tickets.filter((ticket) => {
      if (ticket.manager_verifier_id !== userId || ticket.deleted_at) {
        return false;
      }
      if (ticket.status === ExpenseStatuses.PendingManagerVerification) {
        return true;
      }
      const hasPendingDocuments = this.store.expenseDocuments.some(
        (document) => document.ticket_id === ticket.id && document.verification_status === "pending"
      );
      const documentStatuses: readonly ExpenseStatus[] = [ExpenseStatuses.PaymentReleased, ExpenseStatuses.BillsSubmitted, ExpenseStatuses.PendingAdjustment];
      return hasPendingDocuments && documentStatuses.includes(ticket.status);
    });
  }

  financeQueue(userId: UUID): ExpenseTicket[] {
    return this.store.tickets.filter(
      (ticket) =>
        ticket.finance_approver_id === userId &&
        ([
          ExpenseStatuses.ManagerVerified,
          ExpenseStatuses.FinanceHold,
          ExpenseStatuses.ClarificationRequired,
          ExpenseStatuses.FinanceApproved,
          ExpenseStatuses.PaymentReleased,
          ExpenseStatuses.BillsSubmitted,
          ExpenseStatuses.PendingAdjustment
        ] as readonly ExpenseStatus[]).includes(ticket.status) &&
        !ticket.deleted_at
    );
  }

  addAudit(input: Omit<ExpenseAuditLog, "id" | "created_at">): ExpenseAuditLog {
    const audit: ExpenseAuditLog = {
      id: randomUUID(),
      created_at: nowIso(),
      ...input
    };
    this.store.auditLogs.push(audit);
    return audit;
  }

  addApproval(input: {
    ticketId: UUID;
    stage: string;
    approverUserId: UUID;
    decision: string;
    remarks: string | null;
    roleSnapshot: string;
    routeSnapshot: Record<string, unknown>;
  }): void {
    const created = nowIso();
    this.store.expenseApprovals.push({
      id: randomUUID(),
      ticket_id: input.ticketId,
      approval_stage: input.stage,
      approver_user_id: input.approverUserId,
      decision: input.decision,
      remarks: input.remarks,
      role_snapshot: input.roleSnapshot,
      designation_snapshot: null,
      route_snapshot: input.routeSnapshot,
      action_at: created,
      created_at: created
    });
    this.store.auditLogs.push({
      id: randomUUID(),
      ticket_id: input.ticketId,
      actor_user_id: input.approverUserId,
      event_type: `approval.${input.stage}.${input.decision}`,
      old_value: null,
      new_value: {
        stage: input.stage,
        decision: input.decision,
        role_snapshot: input.roleSnapshot,
        route_snapshot: input.routeSnapshot
      },
      remarks: input.remarks,
      payload_hash: null,
      created_at: created
    });
  }

  activeManagerBackupAssignment(employeeUserId: UUID, dateIso: string): ManagerBackupAssignment | null {
    return (
      this.store.managerBackupAssignments.find(
        (assignment) =>
          assignment.employee_user_id === employeeUserId &&
          assignment.status === "active" &&
          !assignment.deleted_at &&
          assignment.effective_from <= dateIso &&
          (!assignment.effective_to || assignment.effective_to >= dateIso)
      ) ?? null
    );
  }

  createManagerBackupAssignment(input: Omit<ManagerBackupAssignment, "id" | "created_at" | "updated_at" | "deleted_at" | "version" | "status">): ManagerBackupAssignment {
    const assignment: ManagerBackupAssignment = {
      id: randomUUID(),
      status: "active",
      created_at: nowIso(),
      updated_at: nowIso(),
      deleted_at: null,
      version: 1,
      ...input
    };
    this.store.managerBackupAssignments.push(assignment);
    return assignment;
  }

  revokeManagerBackupAssignment(id: UUID, expectedVersion?: number): ManagerBackupAssignment {
    const assignment = this.store.managerBackupAssignments.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!assignment) {
      throw notFound("Manager backup assignment not found", { id });
    }
    if (expectedVersion && assignment.version !== expectedVersion) {
      throw conflict("Manager backup assignment was modified by another actor.", { id });
    }
    assignment.status = "revoked";
    assignment.version += 1;
    assignment.updated_at = nowIso();
    return assignment;
  }

  addExpenseDocument(document: ExpenseDocument): void {
    this.store.expenseDocuments.push(document);
  }

  findExpenseDocument(ticketId: UUID, documentId: UUID): ExpenseDocument {
    const document = this.store.expenseDocuments.find(
      (candidate) =>
        candidate.ticket_id === ticketId &&
        (candidate.id === documentId || candidate.document_id === documentId)
    );
    if (!document) {
      throw notFound("Expense document not found", { ticket_id: ticketId, document_id: documentId });
    }
    return document;
  }

  verifiedDocumentsForTicket(ticketId: UUID): ExpenseDocument[] {
    return this.store.expenseDocuments.filter(
      (document) => document.ticket_id === ticketId && document.verification_status === "verified"
    );
  }

  addPayment(payment: ExpensePayment): void {
    this.store.payments.push(payment);
  }

  ticketLineItems(ticketId: UUID): ExpenseLineItem[] {
    return this.store.lineItems.filter((item) => item.ticket_id === ticketId);
  }

  setStatus(ticket: ExpenseTicket, status: ExpenseStatus): void {
    ticket.status = status;
  }
}
