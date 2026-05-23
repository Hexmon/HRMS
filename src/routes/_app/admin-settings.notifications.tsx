import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAdminSettings, type NotificationEvent } from "@/lib/admin-settings-store";
import { useApiRouteEnabled } from "@/shared/api";
import {
  useAdminNotificationChannels,
  useUpdateAdminNotificationChannelsMutation,
} from "@/domains/admin/queries";
import type { AdminNotificationChannelRecord } from "@/domains/admin/api";
import { toast } from "sonner";
import { Bell, Mail, Smartphone } from "lucide-react";

export const Route = createFileRoute("/_app/admin-settings/notifications")({
  component: NotificationsScreen,
});

type NotificationChannel = "inApp" | "email" | "push";
type ScreenNotification = NotificationEvent & {
  module?: string;
  version?: number;
};

function NotificationsScreen() {
  const localSettings = useAdminSettings();
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const channelsQuery = useAdminNotificationChannels(apiEnabled);
  const updateChannelsMutation = useUpdateAdminNotificationChannelsMutation();
  const [draftNotifications, setDraftNotifications] = useState<ScreenNotification[]>(
    localSettings.notifications,
  );

  const apiNotifications = useMemo(
    () => (channelsQuery.data?.items ?? []).map(channelFromApi),
    [channelsQuery.data?.items],
  );

  useEffect(() => {
    if (!apiEnabled) return;
    setDraftNotifications(apiNotifications);
  }, [apiEnabled, apiNotifications]);

  const notifications: ScreenNotification[] = apiEnabled
    ? draftNotifications
    : localSettings.notifications;
  const loading = apiEnabled && channelsQuery.isLoading;
  const error = apiEnabled && channelsQuery.error instanceof Error ? channelsQuery.error : null;

  async function toggleNotification(key: string, channel: NotificationChannel) {
    if (!apiEnabled) {
      localSettings.toggleNotification(key, channel);
      return;
    }
    const current = notifications.find((event) => event.key === key);
    const expectedVersion = channelsQuery.data?.version;
    if (!current || !expectedVersion) return;
    const nextValue = !current[channel];
    const previous = draftNotifications;
    setDraftNotifications((events) =>
      events.map((event) => (event.key === key ? { ...event, [channel]: nextValue } : event)),
    );
    try {
      await updateChannelsMutation.mutateAsync({
        channels: [{ key, [channel]: nextValue }],
        expected_version: expectedVersion,
      });
      toast.success("Notification preference saved");
    } catch (saveError) {
      setDraftNotifications(previous);
      toast.error(saveError instanceof Error ? saveError.message : "Notification update failed");
    }
  }

  if (loading) {
    return (
      <Card className="rounded-2xl border-border/60 p-6 text-sm text-muted-foreground">
        Loading notification preferences...
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="rounded-2xl border-border/60 p-6 text-sm text-destructive">
        {error.message}
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-border/60 p-0">
      <div className="border-b p-4">
        <p className="text-sm font-semibold">Notification preferences</p>
        <p className="text-xs text-muted-foreground">
          Choose how each event is delivered. Mobile push is a planned channel — toggles are saved
          but not yet sent.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Event</th>
              <th className="px-3 py-3 text-center font-semibold">
                <div className="inline-flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5" /> In-app
                </div>
              </th>
              <th className="px-3 py-3 text-center font-semibold">
                <div className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Email
                </div>
              </th>
              <th className="px-3 py-3 text-center font-semibold">
                <div className="inline-flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" /> Push{" "}
                  <Badge variant="outline" className="ml-1 text-[9px]">
                    Soon
                  </Badge>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((e) => (
              <tr key={e.key} className="border-b last:border-0 hover:bg-accent/40">
                <td className="px-4 py-3 font-medium">{e.label}</td>
                <td className="px-3 py-3 text-center">
                  <Switch
                    checked={e.inApp}
                    disabled={updateChannelsMutation.isPending}
                    onCheckedChange={() => void toggleNotification(e.key, "inApp")}
                  />
                </td>
                <td className="px-3 py-3 text-center">
                  <Switch
                    checked={e.email}
                    disabled={updateChannelsMutation.isPending}
                    onCheckedChange={() => void toggleNotification(e.key, "email")}
                  />
                </td>
                <td className="px-3 py-3 text-center">
                  <Switch
                    checked={e.push}
                    disabled={updateChannelsMutation.isPending}
                    onCheckedChange={() => void toggleNotification(e.key, "push")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function channelFromApi(channel: AdminNotificationChannelRecord): ScreenNotification {
  return {
    key: channel.key,
    label: channel.label,
    inApp: channel.inApp,
    email: channel.email,
    push: channel.push,
    module: channel.module,
    version: channel.version,
  };
}
