import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAdminSettings, type Policies } from "@/lib/admin-settings-store";

export const Route = createFileRoute("/_app/admin-settings/policies")({
  component: PoliciesScreen,
});

function PoliciesScreen() {
  const { policies, setPolicy } = useAdminSettings();
  return (
    <Tabs defaultValue="attendance">
      <TabsList className="flex-wrap">
        <TabsTrigger value="attendance">Attendance</TabsTrigger>
        <TabsTrigger value="leave">Leave</TabsTrigger>
        <TabsTrigger value="timesheet">Timesheet</TabsTrigger>
        <TabsTrigger value="expense">Expense</TabsTrigger>
        <TabsTrigger value="asset">Asset</TabsTrigger>
        <TabsTrigger value="sla">Helpdesk SLA</TabsTrigger>
      </TabsList>

      <TabsContent value="attendance" className="mt-4">
        <PolicyCard
          title="Attendance policy"
          description="Govern grace periods and auto-absent thresholds."
        >
          <NumField
            label="Grace minutes (no late mark)"
            value={policies.attendance.graceMinutes}
            onChange={(v) => setPolicy("attendance", { graceMinutes: v })}
          />
          <NumField
            label="Half-day after (minutes late)"
            value={policies.attendance.halfDayAfterMinutes}
            onChange={(v) => setPolicy("attendance", { halfDayAfterMinutes: v })}
          />
          <NumField
            label="Auto-absent after (minutes)"
            value={policies.attendance.autoMarkAbsentMinutes}
            onChange={(v) => setPolicy("attendance", { autoMarkAbsentMinutes: v })}
          />
          <SwitchField
            label="Allow regularization requests"
            value={policies.attendance.allowRegularization}
            onChange={(v) => setPolicy("attendance", { allowRegularization: v })}
          />
        </PolicyCard>
      </TabsContent>

      <TabsContent value="leave" className="mt-4">
        <PolicyCard title="Leave policy" description="Yearly entitlements and carry-forward rules.">
          <NumField
            label="Casual leave / year"
            value={policies.leave.casualPerYear}
            onChange={(v) => setPolicy("leave", { casualPerYear: v })}
          />
          <NumField
            label="Sick leave / year"
            value={policies.leave.sickPerYear}
            onChange={(v) => setPolicy("leave", { sickPerYear: v })}
          />
          <NumField
            label="Earned leave / year"
            value={policies.leave.earnedPerYear}
            onChange={(v) => setPolicy("leave", { earnedPerYear: v })}
          />
          <NumField
            label="Carry-forward cap (days)"
            value={policies.leave.carryForwardCap}
            onChange={(v) => setPolicy("leave", { carryForwardCap: v })}
          />
          <SwitchField
            label="Encashment allowed"
            value={policies.leave.encashmentAllowed}
            onChange={(v) => setPolicy("leave", { encashmentAllowed: v })}
          />
        </PolicyCard>
      </TabsContent>

      <TabsContent value="timesheet" className="mt-4">
        <PolicyCard
          title="Timesheet policy"
          description="Submission cadence and locking behaviour."
        >
          <NumField
            label="Weekly hours target"
            value={policies.timesheet.weeklyHours}
            onChange={(v) => setPolicy("timesheet", { weeklyHours: v })}
          />
          <NumField
            label="Minimum daily hours"
            value={policies.timesheet.minDailyHours}
            onChange={(v) => setPolicy("timesheet", { minDailyHours: v })}
          />
          <TextField
            label="Submit by"
            value={policies.timesheet.submitBy}
            onChange={(v) => setPolicy("timesheet", { submitBy: v })}
          />
          <SwitchField
            label="Lock entries after approval"
            value={policies.timesheet.lockAfterApproval}
            onChange={(v) => setPolicy("timesheet", { lockAfterApproval: v })}
          />
        </PolicyCard>
      </TabsContent>

      <TabsContent value="expense" className="mt-4">
        <PolicyCard
          title="Expense policy"
          description="Daily limits, receipt thresholds and self-approval."
        >
          <NumField
            label="Per-day claim limit"
            value={policies.expense.perDayLimit}
            onChange={(v) => setPolicy("expense", { perDayLimit: v })}
          />
          <NumField
            label="Receipt mandatory above"
            value={policies.expense.receiptMandatoryAbove}
            onChange={(v) => setPolicy("expense", { receiptMandatoryAbove: v })}
          />
          <SwitchField
            label="Allow self-approval (not recommended)"
            value={policies.expense.selfApprovalAllowed}
            onChange={(v) => setPolicy("expense", { selfApprovalAllowed: v })}
          />
          <NumField
            label="Auto-escalate after (days)"
            value={policies.expense.autoEscalateDays}
            onChange={(v) => setPolicy("expense", { autoEscalateDays: v })}
          />
        </PolicyCard>
      </TabsContent>

      <TabsContent value="asset" className="mt-4">
        <PolicyCard
          title="Asset policy"
          description="Acknowledgement, return SLAs and warranty alerts."
        >
          <SwitchField
            label="Charge penalty for damaged returns"
            value={policies.asset.damagePenalty}
            onChange={(v) => setPolicy("asset", { damagePenalty: v })}
          />
          <SwitchField
            label="Mandatory employee acknowledgement"
            value={policies.asset.mandatoryAck}
            onChange={(v) => setPolicy("asset", { mandatoryAck: v })}
          />
          <NumField
            label="Return SLA (days)"
            value={policies.asset.returnSlaDays}
            onChange={(v) => setPolicy("asset", { returnSlaDays: v })}
          />
          <NumField
            label="Warranty alert window (days)"
            value={policies.asset.warrantyAlertDays}
            onChange={(v) => setPolicy("asset", { warrantyAlertDays: v })}
          />
        </PolicyCard>
      </TabsContent>

      <TabsContent value="sla" className="mt-4">
        <PolicyCard
          title="Helpdesk SLA"
          description="Response & resolution targets per priority (hours)."
        >
          {(["urgent", "high", "normal", "low"] as const).map((p) => (
            <div
              key={p}
              className="md:col-span-2 grid grid-cols-1 gap-3 md:grid-cols-2 rounded-xl border bg-card/50 p-3"
            >
              <p className="md:col-span-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {p} priority
              </p>
              <NumField
                label="Response (hrs)"
                value={policies.sla[(p + "ResponseHrs") as keyof Policies["sla"]]}
                onChange={(v) =>
                  setPolicy("sla", { [(p + "ResponseHrs") as keyof Policies["sla"]]: v } as Partial<
                    Policies["sla"]
                  >)
                }
              />
              <NumField
                label="Resolve (hrs)"
                value={policies.sla[(p + "ResolveHrs") as keyof Policies["sla"]]}
                onChange={(v) =>
                  setPolicy("sla", { [(p + "ResolveHrs") as keyof Policies["sla"]]: v } as Partial<
                    Policies["sla"]
                  >)
                }
              />
            </div>
          ))}
        </PolicyCard>
      </TabsContent>
    </Tabs>
  );
}

function PolicyCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl border-border/60 p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
      <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
        Changes save automatically and are reflected across the relevant module.
      </p>
    </Card>
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
function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function SwitchField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-card/50 p-3">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
