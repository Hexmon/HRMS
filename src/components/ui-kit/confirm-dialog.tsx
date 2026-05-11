import { ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

interface Props {
  /** Trigger element (passed via asChild). Optional if you control `open`. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tone of the action button. Defaults to destructive. */
  tone?: "destructive" | "primary";
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "destructive",
  onConfirm,
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    try {
      setBusy(true);
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <span
              className={cn(
                "grid h-9 w-9 place-items-center rounded-xl",
                tone === "destructive"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-primary-soft text-primary",
              )}
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </div>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            className={cn(
              tone === "destructive"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "text-primary-foreground",
            )}
            style={tone === "primary" ? { background: "var(--gradient-primary)" } : undefined}
          >
            {busy ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
