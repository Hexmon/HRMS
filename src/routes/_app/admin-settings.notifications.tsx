import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAdminSettings } from "@/lib/admin-settings-store";
import { Bell, Mail, Smartphone } from "lucide-react";

export const Route = createFileRoute("/_app/admin-settings/notifications")({ component: NotificationsScreen });

function NotificationsScreen() {
  const { notifications, toggleNotification } = useAdminSettings();
  return (
    <Card className="rounded-2xl border-border/60 p-0">
      <div className="border-b p-4">
        <p className="text-sm font-semibold">Notification preferences</p>
        <p className="text-xs text-muted-foreground">Choose how each event is delivered. Mobile push is a planned channel — toggles are saved but not yet sent.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Event</th>
              <th className="px-3 py-3 text-center font-semibold"><div className="inline-flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> In-app</div></th>
              <th className="px-3 py-3 text-center font-semibold"><div className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</div></th>
              <th className="px-3 py-3 text-center font-semibold"><div className="inline-flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> Push <Badge variant="outline" className="ml-1 text-[9px]">Soon</Badge></div></th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((e) => (
              <tr key={e.key} className="border-b last:border-0 hover:bg-accent/40">
                <td className="px-4 py-3 font-medium">{e.label}</td>
                <td className="px-3 py-3 text-center"><Switch checked={e.inApp} onCheckedChange={() => toggleNotification(e.key, "inApp")} /></td>
                <td className="px-3 py-3 text-center"><Switch checked={e.email} onCheckedChange={() => toggleNotification(e.key, "email")} /></td>
                <td className="px-3 py-3 text-center"><Switch checked={e.push} onCheckedChange={() => toggleNotification(e.key, "push")} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
