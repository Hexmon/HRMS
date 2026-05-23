import type { UUID } from "#shared";
import type { NotificationRecord, MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { conflict, notFound } from "../../platform/errors.js";

export interface NotificationFilters {
  userId: UUID;
  unreadOnly?: boolean;
  type?: string;
  before?: string;
}

function notificationCategory(notification: NotificationRecord): string {
  const category = notification.payload.category;
  if (typeof category === "string" && category.trim()) return category;
  if (notification.event_type.includes("submitted") || notification.event_type.includes("approval")) return "approval";
  if (notification.event_type.includes("mention")) return "mention";
  if (notification.event_type.includes("helpdesk") || notification.event_type.includes("escalated")) return "alert";
  return "system";
}

export class NotificationsRepository {
  constructor(private readonly store: MemoryDataStore) {}

  list(filters: NotificationFilters): NotificationRecord[] {
    return this.store.notifications
      .filter((notification) => notification.target_user_id === filters.userId)
      .filter((notification) => !filters.unreadOnly || notification.status === "pending")
      .filter((notification) => !filters.before || notification.created_at <= filters.before)
      .filter((notification) => {
        if (!filters.type) return true;
        return notification.event_type === filters.type || notificationCategory(notification) === filters.type;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  unreadCount(userId: UUID): { unread_count: number; latest_created_at: string | null } {
    const unread = this.list({ userId, unreadOnly: true });
    return {
      unread_count: unread.length,
      latest_created_at: unread[0]?.created_at ?? null
    };
  }

  findOwned(id: UUID, userId: UUID): NotificationRecord {
    const notification = this.store.notifications.find(
      (candidate) => candidate.id === id && candidate.target_user_id === userId
    );
    if (!notification) {
      throw notFound("Notification not found", { id });
    }
    return notification;
  }

  markRead(notification: NotificationRecord, expectedVersion?: number): NotificationRecord {
    if (expectedVersion !== undefined && notification.version !== expectedVersion) {
      throw conflict("Notification was modified by another actor.", {
        aggregate: "notification",
        id: notification.id
      });
    }
    if (notification.status !== "pending") return notification;
    const now = nowIso();
    notification.status = "sent";
    notification.read_at = now;
    notification.version += 1;
    notification.updated_at = now;
    return notification;
  }
}
