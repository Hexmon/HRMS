import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  PlatformRegisteredDevicePlatform,
  PlatformRegisteredDeviceStatus,
} from "@/domains/platform/api";

const STATUS_META: Record<
  PlatformRegisteredDeviceStatus,
  { label: string; className: string }
> = {
  registered: {
    label: "Registered",
    className: "border-success/30 bg-success/10 text-success",
  },
  suspended: {
    label: "Suspended",
    className:
      "border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning",
  },
  revoked: {
    label: "Revoked",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

export function DeviceStatusBadge({
  status,
  className,
}: {
  status: PlatformRegisteredDeviceStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      {meta.label}
    </Badge>
  );
}

export function deviceStatusLabel(status: PlatformRegisteredDeviceStatus): string {
  return STATUS_META[status].label;
}

export function platformLabel(platform: PlatformRegisteredDevicePlatform): string {
  return platform === "ios" ? "iOS" : "Android";
}

export function maskDeviceId(deviceId: string): string {
  const suffix = deviceId.replace(/-/g, "").slice(-6).toUpperCase();
  return suffix ? `Device ${suffix}` : "Device";
}

export function formatDeviceDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
