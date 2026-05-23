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
  markAllRead(input: NotificationReadAllBody = {}) {
    return apiRequest<ApiRecord>("/api/v1/notifications/read-all", {
      method: "POST",
      body: input,
    });
  },
};
