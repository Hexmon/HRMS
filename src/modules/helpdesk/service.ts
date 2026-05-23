import type {
  AuthUser,
  CoreUser,
  HelpdeskCategory,
  HelpdeskAssignInput,
  HelpdeskAttachmentInput,
  HelpdeskCloseInput,
  HelpdeskCommentInput,
  HelpdeskPriorityInput,
  HelpdeskResolveInput,
  HelpdeskReopenInput,
  HelpdeskStatusInput,
  HelpdeskTicket,
  HelpdeskTicketCategory,
  HelpdeskTicketCreateInput,
  HelpdeskTicketPriority,
  HelpdeskTicketStatus,
  HelpdeskTicketUpdateInput,
  UUID
} from "#shared";
import { EmploymentStatuses, HelpdeskTicketPriorities, HelpdeskTicketStatuses, Roles } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, forbidden } from "../../platform/errors.js";
import { canCloseOrReopenTicket, canManageHelpdesk, canManageTicket, canSeeTicket } from "./policy.js";
import { HelpdeskRepository } from "./repository.js";

export interface HelpdeskQuery {
  page: number;
  page_size: number;
  sort?: string;
  status?: HelpdeskTicketStatus;
  priority?: HelpdeskTicketPriority;
  category_id?: UUID;
  category_key?: HelpdeskTicketCategory;
  assignee_id?: UUID;
  requester_id?: UUID;
  active_only?: boolean;
  search?: string;
  date_from?: string;
  date_to?: string;
}

export interface HelpdeskCategoryCreateInput {
  category_key: HelpdeskTicketCategory;
  label: string;
  default_assignee_user_id?: UUID | null;
  default_assignee_name?: string | null;
  default_assignee_role?: string | null;
  team: string;
  active?: boolean;
  sub_categories?: Array<{ key: string; label: string }>;
}

export interface HelpdeskCategoryUpdateInput {
  expected_version: number;
  label?: string;
  default_assignee_user_id?: UUID | null;
  default_assignee_name?: string | null;
  default_assignee_role?: string | null;
  team?: string;
  active?: boolean;
  sub_categories?: Array<{ key: string; label: string }>;
}

type SlaState = "on_track" | "near_breach" | "breached" | "met";

const SLA_MATRIX: Record<HelpdeskTicketPriority, { responseHours: number; resolutionHours: number }> = {
  [HelpdeskTicketPriorities.Urgent]: { responseHours: 1, resolutionHours: 8 },
  [HelpdeskTicketPriorities.High]: { responseHours: 4, resolutionHours: 24 },
  [HelpdeskTicketPriorities.Medium]: { responseHours: 24, resolutionHours: 72 },
  [HelpdeskTicketPriorities.Low]: { responseHours: 48, resolutionHours: 120 }
};

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
}

function dateInRange(iso: string, from?: string, to?: string): boolean {
  const date = iso.slice(0, 10);
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function escalationPriority(priority: HelpdeskTicketPriority): HelpdeskTicketPriority {
  if (priority === HelpdeskTicketPriorities.Low) return HelpdeskTicketPriorities.Medium;
  if (priority === HelpdeskTicketPriorities.Medium) return HelpdeskTicketPriorities.High;
  return HelpdeskTicketPriorities.Urgent;
}

function isResolvedOrClosed(status: HelpdeskTicketStatus): boolean {
  return status === HelpdeskTicketStatuses.Resolved || status === HelpdeskTicketStatuses.Closed;
}

export class HelpdeskService {
  private readonly repository: HelpdeskRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new HelpdeskRepository(store);
  }

  createTicket(actor: AuthUser, input: HelpdeskTicketCreateInput) {
    const requester = this.requireActiveUser(actor.id);
    const category = this.repository.findCategory(input.category_id ?? input.category_key!);
    if (!category.active) {
      throw badRequest("Helpdesk category is inactive.", { category_key: category.category_key });
    }
    const department = this.store.departments.find((candidate) => candidate.id === requester.department_id);
    const ticket = this.repository.addTicket({
      subject: input.subject,
      description: input.description,
      category_id: category.id,
      category_key: category.category_key,
      sub_category: input.sub_category ?? null,
      priority: input.priority,
      status: category.default_assignee_user_id ? HelpdeskTicketStatuses.Assigned : HelpdeskTicketStatuses.New,
      requester_user_id: requester.id,
      requester_name: requester.full_name,
      requester_email: requester.email,
      requester_department: department?.name ?? null,
      assignee_user_id: category.default_assignee_user_id,
      assignee_name: category.default_assignee_name,
      assignee_role: category.default_assignee_role,
      related_asset_id: input.related_asset_id ?? null,
      related_project_id: input.related_project_id ?? null,
      first_response_at: null,
      resolved_at: null,
      closed_at: null,
      resolution: null,
      reopen_count: 0,
      escalated: false
    });
    this.addEvent(ticket, actor, "Ticket created");
    if (category.default_assignee_user_id) {
      this.addEvent(ticket, null, "Auto-assigned", `Assigned to ${category.default_assignee_name ?? "queue"}`);
    }
    if (input.attachment_name) {
      this.repository.addAttachment({
        ticket_id: ticket.id,
        document_id: null,
        attachment_type: "supporting_document",
        file_name: input.attachment_name,
        size_text: null,
        uploaded_by_user_id: actor.id,
        uploaded_by_name: actor.full_name
      });
      this.addEvent(ticket, actor, "Attachment uploaded", input.attachment_name);
    }
    for (const documentId of input.document_ids) {
      this.repository.addAttachment({
        ticket_id: ticket.id,
        document_id: documentId,
        attachment_type: "supporting_document",
        file_name: this.documentFileName(documentId),
        size_text: null,
        uploaded_by_user_id: actor.id,
        uploaded_by_name: actor.full_name
      });
    }
    return { ticket: this.presentTicket(ticket, actor, true), version: ticket.version };
  }

  listTickets(actor: AuthUser, query: HelpdeskQuery) {
    const visible = this.repository
      .listTickets({
        status: query.status,
        priority: query.priority,
        categoryId: query.category_id,
        categoryKey: query.category_key,
        assigneeId: query.assignee_id,
        requesterId: query.requester_id,
        search: query.search
      })
      .filter((ticket) => canSeeTicket(actor, ticket))
      .filter((ticket) => dateInRange(ticket.created_at, query.date_from, query.date_to));
    const sorted = this.sortTickets(visible, query.sort);
    return {
      ...page(sorted.map((ticket) => this.presentTicket(ticket, actor, false)), query.page, query.page_size),
      queue_counts: this.queueCounts(visible)
    };
  }

  getTicket(actor: AuthUser, id: UUID | string) {
    const ticket = this.repository.findTicket(id);
    if (!canSeeTicket(actor, ticket)) {
      throw forbidden("Helpdesk ticket is outside your scope.");
    }
    return this.presentTicket(ticket, actor, true);
  }

  updateTicket(actor: AuthUser, id: UUID | string, input: HelpdeskTicketUpdateInput) {
    const existing = this.repository.findTicket(id);
    if (!canSeeTicket(actor, existing)) throw forbidden("Helpdesk ticket is outside your scope.");
    if (existing.status === HelpdeskTicketStatuses.Closed) throw conflict("Closed tickets must be reopened before updates.");
    if (existing.requester_user_id !== actor.id && !canManageTicket(actor, existing)) {
      throw forbidden("Only the requester, assigned agent, or scoped helpdesk manager can update this ticket.");
    }
    const nextCategory = input.category_id || input.category_key
      ? this.repository.findCategory(input.category_id ?? input.category_key!)
      : null;
    const ticket = this.repository.updateTicketVersioned(id, input.expected_version, (target) => {
      if (input.subject !== undefined) target.subject = input.subject;
      if (input.description !== undefined) target.description = input.description;
      if (input.sub_category !== undefined) target.sub_category = input.sub_category ?? null;
      if (input.related_asset_id !== undefined) target.related_asset_id = input.related_asset_id ?? null;
      if (input.related_project_id !== undefined) target.related_project_id = input.related_project_id ?? null;
      if (input.priority !== undefined) target.priority = input.priority;
      if (nextCategory) {
        target.category_id = nextCategory.id;
        target.category_key = nextCategory.category_key;
      }
    });
    this.addEvent(ticket, actor, "Ticket updated");
    return { ticket: this.presentTicket(ticket, actor, true), version: ticket.version };
  }

  addComment(actor: AuthUser, id: UUID | string, input: HelpdeskCommentInput) {
    const existing = this.repository.findTicket(id);
    if (!canSeeTicket(actor, existing)) throw forbidden("Helpdesk ticket is outside your scope.");
    this.assertWritable(existing);
    const expectedVersion = input.expected_version ?? existing.version;
    const ticket = this.repository.updateTicketVersioned(id, expectedVersion, (target) => {
      if (!target.first_response_at && target.requester_user_id !== actor.id) {
        target.first_response_at = nowIso();
      }
    });
    const comment = this.repository.addComment({
      ticket_id: ticket.id,
      author_user_id: actor.id,
      author_name: actor.full_name,
      author_role: actor.roles[0] ?? null,
      body: input.message,
      internal: false,
      document_ids: input.document_ids
    });
    this.addEvent(ticket, actor, "Comment added");
    return { comment: this.presentComment(comment), ticket_version: ticket.version };
  }

  addInternalNote(actor: AuthUser, id: UUID | string, input: HelpdeskCommentInput) {
    const existing = this.repository.findTicket(id);
    if (!canManageTicket(actor, existing)) throw forbidden("Only helpdesk agents can add internal notes.");
    this.assertWritable(existing);
    const expectedVersion = input.expected_version ?? existing.version;
    const ticket = this.repository.updateTicketVersioned(id, expectedVersion, () => undefined);
    const note = this.repository.addComment({
      ticket_id: ticket.id,
      author_user_id: actor.id,
      author_name: actor.full_name,
      author_role: actor.roles[0] ?? null,
      body: input.message,
      internal: true,
      document_ids: input.document_ids
    });
    this.addEvent(ticket, actor, "Internal note added");
    return { note: this.presentComment(note), ticket_version: ticket.version };
  }

  addAttachment(actor: AuthUser, id: UUID | string, input: HelpdeskAttachmentInput) {
    const existing = this.repository.findTicket(id);
    if (!canSeeTicket(actor, existing)) throw forbidden("Helpdesk ticket is outside your scope.");
    this.assertWritable(existing);
    const expectedVersion = input.expected_version ?? existing.version;
    const ticket = this.repository.updateTicketVersioned(id, expectedVersion, () => undefined);
    const attachment = this.repository.addAttachment({
      ticket_id: ticket.id,
      document_id: input.document_id ?? null,
      attachment_type: input.attachment_type,
      file_name: input.file_name ?? this.documentFileName(input.document_id!),
      size_text: input.size_text ?? null,
      uploaded_by_user_id: actor.id,
      uploaded_by_name: actor.full_name
    });
    this.addEvent(ticket, actor, "Attachment uploaded", attachment.file_name);
    return { attachment: this.presentAttachment(attachment), ticket_version: ticket.version };
  }

  assign(actor: AuthUser, id: UUID | string, input: HelpdeskAssignInput) {
    const existing = this.repository.findTicket(id);
    if (!canManageTicket(actor, existing)) throw forbidden("Only helpdesk agents can assign tickets.");
    this.assertWritable(existing);
    const assignee = this.requireActiveUser(input.assignee_user_id);
    const ticket = this.repository.updateTicketVersioned(id, input.expected_version, (target) => {
      target.assignee_user_id = assignee.id;
      target.assignee_name = assignee.full_name;
      target.assignee_role = assignee.roles[0] ?? null;
      if (target.status === HelpdeskTicketStatuses.New) target.status = HelpdeskTicketStatuses.Assigned;
    });
    this.addEvent(ticket, actor, "Assigned", `Assigned to ${assignee.full_name}${input.remarks ? `: ${input.remarks}` : ""}`);
    return { ticket: this.presentTicket(ticket, actor, true), version: ticket.version };
  }

  changePriority(actor: AuthUser, id: UUID | string, input: HelpdeskPriorityInput) {
    const existing = this.repository.findTicket(id);
    if (!canManageTicket(actor, existing)) throw forbidden("Only helpdesk agents can change priority.");
    this.assertWritable(existing);
    if (input.priority === HelpdeskTicketPriorities.Urgent && existing.priority !== HelpdeskTicketPriorities.Urgent && !input.remarks?.trim()) {
      throw badRequest("Remarks are required when escalating a ticket to urgent priority.");
    }
    const ticket = this.repository.updateTicketVersioned(id, input.expected_version, (target) => {
      target.priority = input.priority;
      if (input.priority === HelpdeskTicketPriorities.Urgent) {
        target.escalated = true;
        target.status = HelpdeskTicketStatuses.Escalated;
      }
    });
    this.addEvent(ticket, actor, "Priority changed", `Priority -> ${input.priority}${input.remarks ? `: ${input.remarks}` : ""}`);
    return { ticket: this.presentTicket(ticket, actor, true), sla: this.computeSla(ticket), version: ticket.version };
  }

  setStatus(actor: AuthUser, id: UUID | string, input: HelpdeskStatusInput) {
    const existing = this.repository.findTicket(id);
    if (!canManageTicket(actor, existing)) throw forbidden("Only helpdesk agents can change ticket status.");
    this.assertWritable(existing);
    if (isResolvedOrClosed(input.status)) {
      throw conflict("Use the dedicated resolve or close endpoint for this status.");
    }
    if (input.status === HelpdeskTicketStatuses.OnHold && !input.remarks?.trim()) {
      throw badRequest("Remarks are required when putting a ticket on hold.");
    }
    const ticket = this.repository.updateTicketVersioned(id, input.expected_version, (target) => {
      target.status = input.status;
      if (input.status === HelpdeskTicketStatuses.Escalated) {
        target.escalated = true;
        target.priority = escalationPriority(target.priority);
      }
    });
    this.addEvent(ticket, actor, `Status -> ${input.status.replace("_", " ")}`, input.remarks);
    return { ticket: this.presentTicket(ticket, actor, true), version: ticket.version };
  }

  resolve(actor: AuthUser, id: UUID | string, input: HelpdeskResolveInput) {
    const existing = this.repository.findTicket(id);
    if (!canManageTicket(actor, existing)) throw forbidden("Only helpdesk agents can resolve tickets.");
    this.assertWritable(existing);
    const resolvedAt = nowIso();
    const ticket = this.repository.updateTicketVersioned(id, input.expected_version, (target) => {
      target.status = HelpdeskTicketStatuses.Resolved;
      target.resolved_at = resolvedAt;
      target.resolution = input.resolution;
      if (!target.first_response_at) target.first_response_at = resolvedAt;
    });
    this.addEvent(ticket, actor, "Resolved", input.resolution);
    return { ticket: this.presentTicket(ticket, actor, true), resolved_at: ticket.resolved_at, version: ticket.version };
  }

  close(actor: AuthUser, id: UUID | string, input: HelpdeskCloseInput) {
    const existing = this.repository.findTicket(id);
    if (!canCloseOrReopenTicket(actor, existing)) throw forbidden("Only the requester or helpdesk agent can close this ticket.");
    if (existing.status !== HelpdeskTicketStatuses.Resolved) {
      throw conflict("Only resolved tickets can be closed.");
    }
    const closedAt = nowIso();
    const ticket = this.repository.updateTicketVersioned(id, input.expected_version, (target) => {
      target.status = HelpdeskTicketStatuses.Closed;
      target.closed_at = closedAt;
    });
    this.addEvent(ticket, actor, "Closed", input.remarks ?? (input.satisfaction ? `Satisfaction ${input.satisfaction}/5` : undefined));
    return { ticket: this.presentTicket(ticket, actor, true), closed_at: ticket.closed_at, version: ticket.version };
  }

  reopen(actor: AuthUser, id: UUID | string, input: HelpdeskReopenInput) {
    const existing = this.repository.findTicket(id);
    if (!canCloseOrReopenTicket(actor, existing)) throw forbidden("Only the requester or helpdesk agent can reopen this ticket.");
    if (!isResolvedOrClosed(existing.status)) {
      throw conflict("Only resolved or closed tickets can be reopened.");
    }
    const ticket = this.repository.updateTicketVersioned(id, input.expected_version, (target) => {
      target.status = HelpdeskTicketStatuses.Reopened;
      target.closed_at = null;
      target.resolved_at = null;
      target.reopen_count += 1;
    });
    this.addEvent(ticket, actor, "Reopened", input.reason);
    return { ticket: this.presentTicket(ticket, actor, true), reopened_at: ticket.updated_at, version: ticket.version };
  }

  categories(actor: AuthUser, query: HelpdeskQuery) {
    return {
      categories: this.repository.listCategories(query.active_only ?? true).map((category) => this.presentCategory(category)),
      sla: SLA_MATRIX,
      actor_scope: canManageHelpdesk(actor) ? "agent" : "requester"
    };
  }

  createCategory(actor: AuthUser, input: HelpdeskCategoryCreateInput) {
    this.requireCategoryManager(actor);
    const assignee = input.default_assignee_user_id ? this.requireActiveUser(input.default_assignee_user_id) : null;
    const category = this.repository.addCategory({
      category_key: input.category_key,
      label: input.label,
      default_assignee_user_id: assignee?.id ?? null,
      default_assignee_name: assignee?.full_name ?? input.default_assignee_name ?? null,
      default_assignee_role: assignee?.roles[0] ?? input.default_assignee_role ?? null,
      team: input.team,
      active: input.active ?? true,
      sub_categories: normalizeSubCategories(input.sub_categories)
    });
    return { category: this.presentCategory(category), version: category.version };
  }

  updateCategory(actor: AuthUser, idOrKey: UUID | HelpdeskTicketCategory, input: HelpdeskCategoryUpdateInput) {
    this.requireCategoryManager(actor);
    const assignee = input.default_assignee_user_id ? this.requireActiveUser(input.default_assignee_user_id) : null;
    const category = this.repository.updateCategoryVersioned(idOrKey, input.expected_version, (target) => {
      if (input.label !== undefined) target.label = input.label;
      if (input.team !== undefined) target.team = input.team;
      if (input.active !== undefined) target.active = input.active;
      if (input.sub_categories !== undefined) target.sub_categories = normalizeSubCategories(input.sub_categories);
      if (input.default_assignee_user_id !== undefined) {
        target.default_assignee_user_id = assignee?.id ?? null;
        target.default_assignee_name = assignee?.full_name ?? input.default_assignee_name ?? null;
        target.default_assignee_role = assignee?.roles[0] ?? input.default_assignee_role ?? null;
      } else {
        if (input.default_assignee_name !== undefined) target.default_assignee_name = input.default_assignee_name;
        if (input.default_assignee_role !== undefined) target.default_assignee_role = input.default_assignee_role;
      }
    });
    return { category: this.presentCategory(category), version: category.version };
  }

  slaReport(actor: AuthUser, query: HelpdeskQuery) {
    if (!canManageHelpdesk(actor) && !actor.roles.includes(Roles.Auditor)) {
      throw forbidden("SLA reports are limited to helpdesk managers and auditors.");
    }
    const visible = this.repository
      .listTickets({
        status: query.status,
        priority: query.priority,
        categoryId: query.category_id,
        categoryKey: query.category_key,
        assigneeId: query.assignee_id,
        search: query.search
      })
      .filter((ticket) => canSeeTicket(actor, ticket) || actor.roles.includes(Roles.Auditor))
      .filter((ticket) => dateInRange(ticket.created_at, query.date_from, query.date_to));
    const rows = visible.map((ticket) => ({
      ticket: this.presentTicket(ticket, actor, false),
      sla: this.computeSla(ticket)
    }));
    const totals = {
      total: visible.length,
      open: visible.filter((ticket) => !isResolvedOrClosed(ticket.status)).length,
      on_track: rows.filter((row) => row.sla.worst === "on_track").length,
      near_breach: rows.filter((row) => row.sla.worst === "near_breach").length,
      breached: rows.filter((row) => row.sla.worst === "breached").length
    };
    return { ...page(rows, query.page, query.page_size), totals, sla_policy: SLA_MATRIX };
  }

  private assertWritable(ticket: HelpdeskTicket): void {
    if (ticket.status === HelpdeskTicketStatuses.Closed) {
      throw conflict("Closed tickets must be reopened before new changes.");
    }
  }

  private requireCategoryManager(actor: AuthUser): void {
    if (!canManageHelpdesk(actor)) {
      throw forbidden("Only helpdesk managers can configure categories.");
    }
  }

  private requireActiveUser(userId: UUID): CoreUser {
    const user = this.store.users.find((candidate) => candidate.id === userId && !candidate.deleted_at);
    if (!user || user.employment_status !== EmploymentStatuses.Active) {
      throw badRequest("Active employee user is required.", { user_id: userId });
    }
    return user;
  }

  private addEvent(ticket: HelpdeskTicket, actor: AuthUser | null, action: string, detail?: string | null) {
    this.repository.addEvent({
      ticket_id: ticket.id,
      actor_user_id: actor?.id ?? null,
      actor_name: actor?.full_name ?? "System",
      action,
      detail: detail ?? null
    });
  }

  private documentFileName(documentId: UUID): string {
    return this.store.documents.find((document) => document.id === documentId)?.file_name ?? `document-${documentId}.pdf`;
  }

  private presentCategory(category: HelpdeskCategory) {
    return {
      ...category,
      sla: SLA_MATRIX
    };
  }

  private queueCounts(tickets: HelpdeskTicket[]) {
    const open = tickets.filter((ticket) => !isResolvedOrClosed(ticket.status));
    return {
      total: tickets.length,
      open: open.length,
      new: tickets.filter((ticket) => ticket.status === HelpdeskTicketStatuses.New).length,
      unassigned: open.filter((ticket) => !ticket.assignee_user_id).length,
      escalated: tickets.filter((ticket) => ticket.escalated && ticket.status !== HelpdeskTicketStatuses.Closed).length,
      overdue: open.filter((ticket) => this.computeSla(ticket).resolutionState === "breached").length,
      resolved: tickets.filter((ticket) => ticket.status === HelpdeskTicketStatuses.Resolved).length,
      closed: tickets.filter((ticket) => ticket.status === HelpdeskTicketStatuses.Closed).length
    };
  }

  private sortTickets(tickets: HelpdeskTicket[], sort?: string): HelpdeskTicket[] {
    const sorted = [...tickets];
    if (sort === "updated_at") return sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    if (sort === "priority") return sorted.sort((a, b) => this.priorityRank(b.priority) - this.priorityRank(a.priority));
    return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  private priorityRank(priority: HelpdeskTicketPriority): number {
    if (priority === HelpdeskTicketPriorities.Urgent) return 4;
    if (priority === HelpdeskTicketPriorities.High) return 3;
    if (priority === HelpdeskTicketPriorities.Medium) return 2;
    return 1;
  }

  private computeSla(ticket: HelpdeskTicket) {
    const policy = SLA_MATRIX[ticket.priority];
    const created = new Date(ticket.created_at).getTime();
    const responseDueAt = new Date(created + policy.responseHours * 3600 * 1000).toISOString();
    const resolutionDueAt = new Date(created + policy.resolutionHours * 3600 * 1000).toISOString();
    const state = (dueIso: string, completedIso: string | null, weight: number): SlaState => {
      const due = new Date(dueIso).getTime();
      const ref = completedIso ? new Date(completedIso).getTime() : Date.now();
      if (completedIso) return ref <= due ? "met" : "breached";
      if (ref >= due) return "breached";
      if (due - ref <= weight * (policy.resolutionHours * 3600 * 1000)) return "near_breach";
      return "on_track";
    };
    const responseState = state(responseDueAt, ticket.first_response_at, 0.25);
    const resolutionState = state(resolutionDueAt, ticket.resolved_at ?? ticket.closed_at, 0.2);
    const order: Record<SlaState, number> = { met: 0, on_track: 1, near_breach: 2, breached: 3 };
    return {
      response_due_at: responseDueAt,
      resolution_due_at: resolutionDueAt,
      responseState,
      resolutionState,
      worst: order[resolutionState] >= order[responseState] ? resolutionState : responseState,
      policy
    };
  }

  private presentTicket(ticket: HelpdeskTicket, actor: AuthUser, detailed: boolean) {
    const includeInternal = canManageTicket(actor, ticket);
    const base = {
      ...ticket,
      display_id: ticket.ticket_no,
      category: this.repository.findCategory(ticket.category_id),
      sla: this.computeSla(ticket),
      counts: {
        comments: this.repository.listComments(ticket.id, includeInternal).length,
        attachments: this.repository.listAttachments(ticket.id).length,
        events: this.repository.listEvents(ticket.id).length
      },
      can_manage: canManageTicket(actor, ticket),
      can_close_or_reopen: canCloseOrReopenTicket(actor, ticket)
    };
    if (!detailed) return base;
    return {
      ...base,
      comments: this.repository.listComments(ticket.id, includeInternal).map((comment) => this.presentComment(comment)),
      attachments: this.repository.listAttachments(ticket.id).map((attachment) => this.presentAttachment(attachment)),
      events: this.repository.listEvents(ticket.id).map((event) => ({
        id: event.id,
        at: event.created_at,
        actor: event.actor_name,
        action: event.action,
        detail: event.detail
      })),
      version: ticket.version
    };
  }

  private presentComment(comment: ReturnType<HelpdeskRepository["addComment"]>) {
    return {
      id: comment.id,
      at: comment.created_at,
      author: comment.author_name,
      author_user_id: comment.author_user_id,
      authorRole: comment.author_role,
      body: comment.body,
      internal: comment.internal,
      document_ids: comment.document_ids
    };
  }

  private presentAttachment(attachment: ReturnType<HelpdeskRepository["addAttachment"]>) {
    return {
      id: attachment.id,
      document_id: attachment.document_id,
      name: attachment.file_name,
      size: attachment.size_text ?? "—",
      by: attachment.uploaded_by_name,
      at: attachment.created_at,
      attachment_type: attachment.attachment_type
    };
  }
}

function normalizeSubCategories(input: Array<{ key: string; label: string }> | undefined): Array<{ key: string; label: string }> {
  const seen = new Set<string>();
  const result: Array<{ key: string; label: string }> = [];
  for (const item of input ?? []) {
    const key = item.key.trim();
    const label = item.label.trim();
    if (!key || !label || seen.has(key)) continue;
    seen.add(key);
    result.push({ key, label });
  }
  return result;
}
