import { randomUUID } from "node:crypto";
import type {
  HelpdeskCategory,
  HelpdeskTicket,
  HelpdeskTicketAttachment,
  HelpdeskTicketComment,
  HelpdeskTicketEvent,
  HelpdeskTicketCategory,
  HelpdeskTicketPriority,
  HelpdeskTicketStatus,
  UUID
} from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { conflict, notFound } from "../../platform/errors.js";

export interface HelpdeskTicketFilters {
  status?: HelpdeskTicketStatus;
  priority?: HelpdeskTicketPriority;
  categoryId?: UUID;
  categoryKey?: HelpdeskTicketCategory;
  assigneeId?: UUID;
  requesterId?: UUID;
  search?: string;
}

export class HelpdeskRepository {
  constructor(private readonly store: MemoryDataStore) {}

  nextTicketNo(): string {
    const max = this.store.helpdeskTickets.reduce((highest, ticket) => {
      const parsed = Number.parseInt(ticket.ticket_no.replace(/\D/gu, ""), 10);
      return Number.isFinite(parsed) ? Math.max(highest, parsed) : highest;
    }, 12000);
    return `TKT-${max + 1}`;
  }

  findCategory(idOrKey: UUID | HelpdeskTicketCategory): HelpdeskCategory {
    const category = this.store.helpdeskCategories.find(
      (candidate) =>
        !candidate.deleted_at &&
        (candidate.id === idOrKey || candidate.category_key === idOrKey)
    );
    if (!category) {
      throw notFound("Helpdesk category not found", { category: idOrKey });
    }
    return category;
  }

  listCategories(activeOnly = false): HelpdeskCategory[] {
    return this.store.helpdeskCategories
      .filter((category) => !category.deleted_at && (!activeOnly || category.active))
      .sort((a, b) => a.category_key.localeCompare(b.category_key));
  }

  addCategory(input: Omit<HelpdeskCategory, "id" | "version" | "created_at" | "updated_at" | "deleted_at">): HelpdeskCategory {
    if (this.store.helpdeskCategories.some((category) => !category.deleted_at && category.category_key === input.category_key)) {
      throw conflict("Helpdesk category key already exists.", { category_key: input.category_key });
    }
    const now = nowIso();
    const category: HelpdeskCategory = {
      id: randomUUID(),
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      ...input
    };
    this.store.helpdeskCategories.push(category);
    return category;
  }

  updateCategoryVersioned(idOrKey: UUID | HelpdeskTicketCategory, expectedVersion: number, mutator: (category: HelpdeskCategory) => void): HelpdeskCategory {
    const category = this.findCategory(idOrKey);
    if (category.version !== expectedVersion) {
      throw conflict("Helpdesk category was modified by another actor.", { aggregate: "helpdesk_category", id: category.id });
    }
    mutator(category);
    category.version += 1;
    category.updated_at = nowIso();
    return category;
  }

  addTicket(input: Omit<HelpdeskTicket, "id" | "ticket_no" | "version" | "created_at" | "updated_at" | "deleted_at">): HelpdeskTicket {
    const now = nowIso();
    const ticket: HelpdeskTicket = {
      id: randomUUID(),
      ticket_no: this.nextTicketNo(),
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      ...input
    };
    this.store.helpdeskTickets.push(ticket);
    return ticket;
  }

  findTicket(idOrNo: UUID | string): HelpdeskTicket {
    const ticket = this.store.helpdeskTickets.find(
      (candidate) => !candidate.deleted_at && (candidate.id === idOrNo || candidate.ticket_no === idOrNo)
    );
    if (!ticket) {
      throw notFound("Helpdesk ticket not found", { id: idOrNo });
    }
    return ticket;
  }

  listTickets(filters: HelpdeskTicketFilters = {}): HelpdeskTicket[] {
    const search = filters.search?.trim().toLowerCase();
    return this.store.helpdeskTickets
      .filter((ticket) => {
        if (ticket.deleted_at) return false;
        if (filters.status && ticket.status !== filters.status) return false;
        if (filters.priority && ticket.priority !== filters.priority) return false;
        if (filters.categoryId && ticket.category_id !== filters.categoryId) return false;
        if (filters.categoryKey && ticket.category_key !== filters.categoryKey) return false;
        if (filters.assigneeId && ticket.assignee_user_id !== filters.assigneeId) return false;
        if (filters.requesterId && ticket.requester_user_id !== filters.requesterId) return false;
        if (search) {
          const haystack = [
            ticket.ticket_no,
            ticket.subject,
            ticket.description,
            ticket.requester_name,
            ticket.assignee_name ?? "",
            ticket.category_key
          ].join(" ").toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  updateTicketVersioned(id: UUID | string, expectedVersion: number, mutator: (ticket: HelpdeskTicket) => void): HelpdeskTicket {
    const ticket = this.findTicket(id);
    if (ticket.version !== expectedVersion) {
      throw conflict("Helpdesk ticket was modified by another actor.", { aggregate: "helpdesk_ticket", id: ticket.id });
    }
    mutator(ticket);
    ticket.version += 1;
    ticket.updated_at = nowIso();
    return ticket;
  }

  listComments(ticketId: UUID, includeInternal: boolean): HelpdeskTicketComment[] {
    return this.store.helpdeskComments
      .filter((comment) => comment.ticket_id === ticketId && !comment.deleted_at && (includeInternal || !comment.internal))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  addComment(input: Omit<HelpdeskTicketComment, "id" | "created_at" | "deleted_at">): HelpdeskTicketComment {
    const comment: HelpdeskTicketComment = {
      id: randomUUID(),
      created_at: nowIso(),
      deleted_at: null,
      ...input
    };
    this.store.helpdeskComments.push(comment);
    return comment;
  }

  listAttachments(ticketId: UUID): HelpdeskTicketAttachment[] {
    return this.store.helpdeskAttachments
      .filter((attachment) => attachment.ticket_id === ticketId && !attachment.deleted_at)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  addAttachment(input: Omit<HelpdeskTicketAttachment, "id" | "created_at" | "deleted_at">): HelpdeskTicketAttachment {
    const attachment: HelpdeskTicketAttachment = {
      id: randomUUID(),
      created_at: nowIso(),
      deleted_at: null,
      ...input
    };
    this.store.helpdeskAttachments.push(attachment);
    return attachment;
  }

  listEvents(ticketId: UUID): HelpdeskTicketEvent[] {
    return this.store.helpdeskEvents
      .filter((event) => event.ticket_id === ticketId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  addEvent(input: Omit<HelpdeskTicketEvent, "id" | "created_at">): HelpdeskTicketEvent {
    const event: HelpdeskTicketEvent = {
      id: randomUUID(),
      created_at: nowIso(),
      ...input
    };
    this.store.helpdeskEvents.push(event);
    return event;
  }
}
