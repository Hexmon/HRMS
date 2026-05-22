import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAdminSettings } from "@/lib/admin-settings-store";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_app/admin-settings/security")({
  component: SecurityScreen,
});

function SecurityScreen() {
  const { security, setSecurity } = useAdminSettings();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="rounded-2xl border-border/60 p-5">
        <p className="text-sm font-semibold">Password policy</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Enforce at signup, password reset and admin-set passwords.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label="Minimum length"
            value={security.passwordMinLength}
            onChange={(v) => setSecurity({ passwordMinLength: v })}
          />
          <NumField
            label="Expiry (days)"
            value={security.passwordExpiryDays}
            onChange={(v) => setSecurity({ passwordExpiryDays: v })}
          />
        </div>
        <div className="mt-3 space-y-2">
          <SwitchRow
            label="Require special character"
            value={security.passwordRequireSpecial}
            onChange={(v) => setSecurity({ passwordRequireSpecial: v })}
          />
          <SwitchRow
            label="Require number"
            value={security.passwordRequireNumber}
            onChange={(v) => setSecurity({ passwordRequireNumber: v })}
          />
        </div>
      </Card>

      <Card className="rounded-2xl border-border/60 p-5">
        <p className="text-sm font-semibold">Sessions & login</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Idle timeout, brute-force protection and MFA.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label="Session timeout (mins)"
            value={security.sessionTimeoutMinutes}
            onChange={(v) => setSecurity({ sessionTimeoutMinutes: v })}
          />
          <NumField
            label="Login attempt limit"
            value={security.loginAttemptLimit}
            onChange={(v) => setSecurity({ loginAttemptLimit: v })}
          />
        </div>
        <div className="mt-3 space-y-2">
          <SwitchRow
            label="Multi-factor authentication"
            value={security.mfaEnabled}
            onChange={(v) => setSecurity({ mfaEnabled: v })}
          />
        </div>
      </Card>

      <Card className="rounded-2xl border-border/60 p-5 lg:col-span-2">
        <p className="text-sm font-semibold">Audit & device tracking</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Critical changes are logged immutably in the audit log.
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <SwitchRow
            label="Log every role change"
            value={security.auditRoleChanges}
            onChange={(v) => setSecurity({ auditRoleChanges: v })}
          />
          <SwitchRow
            label="Track IP & device per session"
            value={security.ipDeviceAuditEnabled}
            onChange={(v) => setSecurity({ ipDeviceAuditEnabled: v })}
          />
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
          Disabling these audits weakens compliance reporting. Coordinate with your security team
          before turning them off.
        </div>
      </Card>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: React.ReactNode;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-card/50 px-3 py-2.5">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
