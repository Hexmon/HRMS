import type { AuthUser, UUID } from "#shared";
import type { MemoryDataStore, NotificationRecord } from "../../platform/data-store.js";
import { NotificationsRepository } from "./repository.js";

export interface NotificationsQuery {
  page: number;
  page_size: number;
  unread_only?: boolean;
  type?: string;
}

export interface MarkReadInput {
  expected_version?: number;
}

export interface MarkAllReadInput {
  type?: string;
  before?: string;
}

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
}

function textPayload(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function categoryFor(notification: NotificationRecord): "approval" | "mention" | "system" | "alert" {
  const fromPayload = textPayload(notification.payload, "category");
  if (fromPayload === "approval" || fromPayload === "mention" || fromPayload === "system" || fromPayload === "alert") {
    return fromPayload;
  }
  if (notification.event_type.includes("submitted") || notification.event_type.includes("approval")) return "approval";
  if (notification.event_type.includes("mention")) return "mention";
  if (notification.event_type.includes("helpdesk") || notification.event_type.includes("escalated")) return "alert";
  return "system";
}

function titleFor(notification: NotificationRecord): string {
  const explicit = textPayload(notification.payload, "title");
  if (explicit) return explicit;
  if (notification.event_type === "expense.submitted") return "Expense submitted";
  if (notification.event_type === "expense.manager_decision") return "Expense manager decision";
  if (notification.event_type === "expense.finance_decision") return "Expense finance decision";
  if (notification.event_type === "expense.payment_released") return "Expense paid";
  if (notification.event_type.startsWith("helpdesk.")) return "Helpdesk update";
  if (notification.event_type.startsWith("timesheet.")) return "Timesheet update";
  return "Notification";
}

function descriptionFor(notification: NotificationRecord): string {
  const explicit = textPayload(notification.payload, "description");
  if (explicit) return explicit;
  const ticketId = textPayload(notification.payload, "ticket_id");
  if (ticketId) return `Activity recorded for ${ticketId}.`;
  const decision = textPayload(notification.payload, "decision");
  if (decision) return `Decision recorded: ${decision}.`;
  return "A workflow update is available.";
}

export class NotificationsService {
  private readonly repository: NotificationsRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new NotificationsRepository(store);
  }

  list(actor: AuthUser, query: NotificationsQuery) {
    const visible = this.repository.list({
      userId: actor.id,
      unreadOnly: query.unread_only,
      type: query.type
    });
    return page(visible.map((notification) => this.present(notification)), query.page, query.page_size);
  }

  unreadCount(actor: AuthUser) {
    return this.repository.unreadCount(actor.id);
  }

  markRead(actor: AuthUser, id: UUID, input: MarkReadInput) {
    const notification = this.repository.findOwned(id, actor.id);
    const updated = this.repository.markRead(notification, input.expected_version);
    return {
      notification: this.present(updated),
      unread_count: this.repository.unreadCount(actor.id).unread_count
    };
  }

  markAllRead(actor: AuthUser, input: MarkAllReadInput) {
    const visible = this.repository.list({
      userId: actor.id,
      unreadOnly: true,
      type: input.type,
      before: input.before
    });
    let updatedCount = 0;
    for (const notification of visible) {
      const beforeVersion = notification.version;
      this.repository.markRead(notification);
      if (notification.version !== beforeVersion) updatedCount += 1;
    }
    return {
      updated_count: updatedCount,
      unread_count: this.repository.unreadCount(actor.id).unread_count
    };
  }

  private present(notification: NotificationRecord) {
    const actor = notification.actor_user_id
      ? this.store.users.find((candidate) => candidate.id === notification.actor_user_id)
      : null;
    return {
      id: notification.id,
      type: notification.event_type,
      title: titleFor(notification),
      description: descriptionFor(notification),
      category: categoryFor(notification),
      action_url: textPayload(notification.payload, "action_url"),
      actor_user_id: notification.actor_user_id,
      actor_name: actor?.full_name ?? null,
      target_user_id: notification.target_user_id,
      read: notification.status !== "pending",
      status: notification.status,
      read_at: notification.read_at,
      created_at: notification.created_at,
      updated_at: notification.updated_at,
      version: notification.version
    };
  }
}
