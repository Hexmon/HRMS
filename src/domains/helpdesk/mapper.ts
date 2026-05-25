import { asArray, asRecord, boolValue, dateText, numberValue, text } from "@/shared/api";
import type {
  CategoryConfig,
  SubCategory,
  Ticket,
  TicketAttachment,
  TicketCategory,
  TicketComment,
  TicketEvent,
  TicketPriority,
  TicketStatus,
} from "@/lib/mock/helpdesk";

const ticketCategories = ["IT", "HR", "Finance", "Admin", "Assets", "Project Support"] as const;
const ticketPriorities = ["Low", "Medium", "High", "Urgent"] as const;
const ticketStatuses = [
  "new",
  "assigned",
  "in_progress",
  "on_hold",
  "resolved",
  "closed",
  "reopened",
  "escalated",
] as const;

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const raw = text(value, fallback);
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

function mapComment(value: unknown): TicketComment {
  const row = asRecord(value);
  return {
    id: text(row.id, "comment-api"),
    at: dateText(row.at ?? row.created_at),
    author: text(row.author ?? row.author_name, "Backend API"),
    authorRole: text(row.authorRole ?? row.author_role) || undefined,
    body: text(row.body ?? row.message),
    internal: boolValue(row.internal),
  };
}

function mapAttachment(value: unknown): TicketAttachment {
  const row = asRecord(value);
  return {
    id: text(row.id, "attachment-api"),
    documentId: text(row.document_id ?? row.documentId) || undefined,
    name: text(row.name ?? row.file_name, "attachment"),
    size: text(row.size ?? row.size_text, "—"),
    by: text(row.by ?? row.uploaded_by_name, "Backend API"),
    at: dateText(row.at ?? row.created_at),
  };
}

function mapEvent(value: unknown): TicketEvent {
  const row = asRecord(value);
  return {
    id: text(row.id, "event-api"),
    at: dateText(row.at ?? row.created_at),
    actor: text(row.actor ?? row.actor_name, "System"),
    action: text(row.action, "Updated"),
    detail: text(row.detail) || undefined,
  };
}

export function mapApiCategory(value: unknown, fallback?: CategoryConfig): CategoryConfig {
  const row = asRecord(value);
  const subCategories = asArray(row.sub_categories ?? row.subCategories).map((item) => {
    const sub = asRecord(item);
    return {
      key: text(sub.key),
      label: text(sub.label, text(sub.key)),
    };
  });
  return {
    key: enumValue<TicketCategory>(
      row.category_key ?? row.key,
      ticketCategories,
      fallback?.key ?? "IT",
    ),
    apiId: text(row.id, fallback?.apiId),
    version: numberValue(row.version, fallback?.version ?? 1),
    label: text(row.label, fallback?.label ?? "Helpdesk"),
    defaultAssignee: text(
      row.default_assignee_name ?? row.defaultAssignee,
      fallback?.defaultAssignee ?? "",
    ),
    defaultAssigneeRole: text(
      row.default_assignee_role ?? row.defaultAssigneeRole,
      fallback?.defaultAssigneeRole ?? "",
    ),
    team: text(row.team, fallback?.team ?? "Support"),
    active: boolValue(row.active, fallback?.active ?? true),
    subCategories: subCategories.length
      ? (subCategories as SubCategory[])
      : (fallback?.subCategories ?? []),
  };
}

export function mapApiTicket(value: unknown, fallback?: Ticket): Ticket {
  const row = asRecord(value);
  const category = asRecord(row.category);
  const ticketNo = text(row.ticket_no ?? row.display_id, fallback?.id ?? "TKT-API");
  return {
    id: ticketNo,
    apiId: text(row.id, fallback?.apiId),
    version: numberValue(row.version, fallback?.version ?? 1),
    subject: text(row.subject, fallback?.subject ?? "Helpdesk ticket"),
    description: text(row.description, fallback?.description ?? ""),
    category: enumValue<TicketCategory>(
      row.category_key ?? category.category_key,
      ticketCategories,
      fallback?.category ?? "IT",
    ),
    categoryApiId: text(row.category_id ?? category.id, fallback?.categoryApiId),
    subCategory: text(row.sub_category ?? row.subCategory, fallback?.subCategory ?? ""),
    priority: enumValue<TicketPriority>(
      row.priority,
      ticketPriorities,
      fallback?.priority ?? "Medium",
    ),
    status: enumValue<TicketStatus>(row.status, ticketStatuses, fallback?.status ?? "new"),
    raisedBy: text(row.requester_name ?? row.raisedBy, fallback?.raisedBy ?? "Employee"),
    raisedById: text(row.requester_user_id ?? row.raisedById, fallback?.raisedById),
    raisedByEmail: text(row.requester_email ?? row.raisedByEmail, fallback?.raisedByEmail),
    raisedByDept: text(row.requester_department ?? row.raisedByDept, fallback?.raisedByDept),
    assignee: text(row.assignee_name ?? row.assignee, fallback?.assignee),
    assigneeUserId: text(row.assignee_user_id ?? row.assigneeUserId, fallback?.assigneeUserId),
    assigneeRole: text(row.assignee_role ?? row.assigneeRole, fallback?.assigneeRole),
    createdAt: dateText(row.created_at ?? row.createdAt, fallback?.createdAt),
    updatedAt: dateText(row.updated_at ?? row.updatedAt, fallback?.updatedAt),
    resolvedAt: text(row.resolved_at ?? row.resolvedAt) || fallback?.resolvedAt,
    closedAt: text(row.closed_at ?? row.closedAt) || fallback?.closedAt,
    firstResponseAt:
      text(row.first_response_at ?? row.firstResponseAt) || fallback?.firstResponseAt,
    relatedAssetId: text(row.related_asset_id ?? row.relatedAssetId) || fallback?.relatedAssetId,
    relatedProjectId:
      text(row.related_project_id ?? row.relatedProjectId) || fallback?.relatedProjectId,
    resolution: text(row.resolution, fallback?.resolution),
    reopenCount: numberValue(row.reopen_count ?? row.reopenCount, fallback?.reopenCount ?? 0),
    escalated: boolValue(row.escalated, fallback?.escalated ?? false),
    comments: asArray(row.comments).map(mapComment),
    attachments: asArray(row.attachments).map(mapAttachment),
    events: asArray(row.events).map(mapEvent),
  };
}

export function mapApiTickets(values: unknown[], fallbacks: Ticket[]): Ticket[] {
  return values.map((value) => {
    const row = asRecord(value);
    const id = text(row.ticket_no ?? row.display_id);
    const apiId = text(row.id);
    const fallback = fallbacks.find((ticket) => ticket.id === id || ticket.apiId === apiId);
    return mapApiTicket(row, fallback);
  });
}

export function mapApiCategories(values: unknown[], fallbacks: CategoryConfig[]): CategoryConfig[] {
  return values.map((value) => {
    const row = asRecord(value);
    const key = text(row.category_key ?? row.key);
    const fallback = fallbacks.find(
      (category) => category.key === key || category.apiId === text(row.id),
    );
    return mapApiCategory(row, fallback);
  });
}
