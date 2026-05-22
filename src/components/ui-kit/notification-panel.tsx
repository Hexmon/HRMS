import { Bell, AtSign, ShieldAlert, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NOTIFICATIONS, type NotificationItem } from "@/lib/mock";

const ICONS: Record<NotificationItem["category"], LucideIcon> = {
  approval: Sparkles,
  mention: AtSign,
  system: Bell,
  alert: ShieldAlert,
};

const TONES: Record<NotificationItem["category"], string> = {
  approval: "bg-primary-soft text-primary",
  mention: "bg-info/15 text-info",
  system: "bg-muted text-muted-foreground",
  alert: "bg-destructive/15 text-destructive",
};

export function NotificationPanel() {
  const unread = NOTIFICATIONS.filter((n) => !n.read).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] rounded-2xl p-0">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">{unread} unread</p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-primary">
            Mark all read
          </Button>
        </div>
        <ScrollArea className="max-h-96">
          <ul className="divide-y">
            {NOTIFICATIONS.map((n) => {
              const Icon = ICONS[n.category];
              return (
                <li
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 p-4 transition hover:bg-accent/40",
                    !n.read && "bg-primary-soft/30",
                  )}
                >
                  <div
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                      TONES[n.category],
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">{n.title}</p>
                      {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {n.description}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{n.time}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
