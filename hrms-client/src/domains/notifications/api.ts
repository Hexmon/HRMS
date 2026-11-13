import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";

export interface NotificationsQuery extends PageQuery {
  unread_only?: boolean;
  type?: string;
}

export interface NotificationReadAllBody extends ApiRecord {
  type?: string;
  before?: string;
}

export interface NotificationUnreadCountResponse extends ApiRecord {
  unread_count: number;
  latest_created_at: string | null;
}

export interface NotificationReadAllResponse extends ApiRecord {
  updated_count: number;
  unread_count: number;
  has_more: boolean;
}

export const notificationsApi = {
  list(query: NotificationsQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/notifications", { query });
  },
  unreadCount() {
    return apiRequest<NotificationUnreadCountResponse>("/api/v1/notifications/unread-count");
  },
  markRead(id: string, input: Partial<ExpectedVersionBody> = {}) {
    return apiRequest<ApiRecord>(`/api/v1/notifications/${id}/read`, {
      method: "POST",
      body: input,
    });
  },
  async markAllRead(input: NotificationReadAllBody = {}) {
    const body = { ...input, before: input.before ?? new Date().toISOString() };
    let updatedCount = 0;
    let latest: NotificationReadAllResponse | null = null;
    // The server advances at most 1,000 rows per call. Freeze the cutoff so
    // notifications arriving during this action cannot keep the UI looping.
    for (let batch = 0; batch < 100; batch += 1) {
      latest = await apiRequest<NotificationReadAllResponse>("/api/v1/notifications/read-all", {
        method: "POST",
        body,
      });
      updatedCount += latest.updated_count;
      if (!latest.has_more) {
        return { ...latest, updated_count: updatedCount };
      }
      if (latest.updated_count === 0) {
        throw new Error("Notification read continuation made no progress.");
      }
    }
    throw new Error("Too many notifications to mark read in one action. Please try again.");
  },
};
