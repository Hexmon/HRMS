import { asRecord, numberValue, text } from "@/shared/api";
import type { ApiRecord } from "@/shared/api";
import type { NotificationItem } from "@/lib/mock/notifications";

function relativeTime(iso: string): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "Just now";
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function category(value: string): NotificationItem["category"] {
  if (value === "approval" || value === "mention" || value === "system" || value === "alert") {
    return value;
  }
  return "system";
}

export function mapApiNotification(input: unknown): NotificationItem {
  const record = asRecord(input);
  const createdAt = text(record.created_at, new Date().toISOString());
  return {
    id: text(record.id, crypto.randomUUID()),
    apiId: text(record.id),
    version: numberValue(record.version, 1),
    type: text(record.type),
    title: text(record.title, "Notification"),
    description: text(record.description, "A workflow update is available."),
    category: category(text(record.category, "system")),
    time: relativeTime(createdAt),
    createdAt,
    actionUrl: text(record.action_url) || null,
    read: Boolean(record.read),
  };
}

export function mapApiNotifications(items: unknown[]): NotificationItem[] {
  return items.map((item) => mapApiNotification(item as ApiRecord));
}
