import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  PlatformDeviceLifecycleReason,
  PlatformRegisteredDevicePlatform,
} from "@/domains/platform/api";
import { maskDeviceId, platformLabel } from "./device-status";

interface DeviceDialogTarget {
  registered_device_id: string;
  platform: PlatformRegisteredDevicePlatform;
}

const REASONS: Array<{ value: PlatformDeviceLifecycleReason; label: string }> = [
  { value: "lost", label: "Lost device" },
  { value: "replaced", label: "Replaced device" },
  { value: "user_requested", label: "User requested" },
  { value: "security", label: "Security concern" },
  { value: "administrative", label: "Administrative action" },
];

export function DeviceRevokeDialog({
  open,
  onOpenChange,
  device,
  ownerLabel,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: DeviceDialogTarget | null;
  ownerLabel?: string;
  isPending: boolean;
  onConfirm: (reason?: PlatformDeviceLifecycleReason) => Promise<void> | void;
}) {
  const [reason, setReason] = useState<PlatformDeviceLifecycleReason | "none">("none");

  useEffect(() => {
    if (!open) setReason("none");
  }, [open]);

  const title = device ? `Revoke ${maskDeviceId(device.registered_device_id)}` : "Revoke device";
  const targetLabel = device
    ? `${platformLabel(device.platform)} ${maskDeviceId(device.registered_device_id)}`
    : "this device";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Revoking {targetLabel}
            {ownerLabel ? ` for ${ownerLabel}` : ""} removes it from mobile attendance and offline
            sync. It does not sign the user out of web sessions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="device-revoke-reason">Reason</Label>
          <Select
            value={reason}
            onValueChange={(value) => setReason(value as PlatformDeviceLifecycleReason | "none")}
            disabled={isPending}
          >
            <SelectTrigger id="device-revoke-reason">
              <SelectValue placeholder="Optional reason" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No reason selected</SelectItem>
              {REASONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason === "none" ? undefined : reason)}
            disabled={!device || isPending}
          >
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Revoke device
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
