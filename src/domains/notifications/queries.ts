import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { notificationsApi, type NotificationsQuery } from "./api";

export function useNotifications(query: NotificationsQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("notifications", "feed", query),
    queryFn: () => notificationsApi.list(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useNotificationUnreadCount(enabled = true) {
  return useQuery({
    queryKey: queryKeys.action("notifications", "feed", "unread-count"),
    queryFn: () => notificationsApi.unreadCount(),
    enabled,
    staleTime: 30_000,
  });
}
