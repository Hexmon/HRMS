import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminSettings } from "@/lib/admin-settings-store";
import { toast } from "sonner";
import { Upload } from "lucide-react";

export const Route = createFileRoute("/_app/admin-settings/company")({
  component: CompanyProfileScreen,
});

const TIMEZONES = [
  "Asia/Kolkata (GMT+05:30)",
  "Asia/Singapore (GMT+08:00)",
  "Europe/London (GMT+00:00)",
  "America/New_York (GMT-05:00)",
];
const CURRENCIES = [
  "INR — Indian Rupee",
  "USD — US Dollar",
  "EUR — Euro",
  "SGD — Singapore Dollar",
  "GBP — British Pound",
];
const FY_STARTS = ["January", "April", "July", "October"];
const WORK_WEEKS = ["Mon – Fri", "Mon – Sat", "Sun – Thu"];

function CompanyProfileScreen() {
  const { company, setCompany } = useAdminSettings();
  const [draft, setDraft] = useState(company);

  const update = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) =>
    setDraft({ ...draft, [k]: v });

  const onSave = () => {
    setCompany(draft);
    toast.success("Company profile updated");
  };

  return (
    <Card className="max-w-4xl rounded-2xl border-border/60 p-6">
      <div className="mb-6 flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-2xl font-semibold text-primary-foreground shadow-md">
          {draft.logoLabel}
        </div>
        <div>
          <p className="text-sm font-medium">Company logo</p>
          <p className="text-xs text-muted-foreground">PNG or SVG, square. Recommended 256×256.</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            type="button"
            onClick={() => toast.info("Logo upload is not wired in this preview.")}
          >
            <Upload className="mr-1 h-3.5 w-3.5" /> Upload logo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Company name">
          <Input value={draft.name} onChange={(e) => update("name", e.target.value)} />
        </Field>
        <Field label="Website">
          <Input value={draft.website} onChange={(e) => update("website", e.target.value)} />
        </Field>
        <Field label="Industry">
          <Input value={draft.industry} onChange={(e) => update("industry", e.target.value)} />
        </Field>
        <Field label="Default work hours / day">
          <Input
            type="number"
            value={draft.workHours}
            onChange={(e) => update("workHours", Number(e.target.value))}
          />
        </Field>

        <Field label="Address" full>
          <Textarea
            rows={2}
            value={draft.address}
            onChange={(e) => update("address", e.target.value)}
          />
        </Field>

        <Field label="Timezone">
          <Select value={draft.timezone} onValueChange={(v) => update("timezone", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Currency">
          <Select value={draft.currency} onValueChange={(v) => update("currency", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Financial year starts">
          <Select
            value={draft.financialYearStart}
            onValueChange={(v) => update("financialYearStart", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FY_STARTS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Working week">
          <Select value={draft.workingWeek} onValueChange={(v) => update("workingWeek", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORK_WEEKS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t pt-4">
        <Button variant="ghost" onClick={() => setDraft(company)}>
          Reset
        </Button>
        <Button
          onClick={onSave}
          style={{ background: "var(--gradient-primary)" }}
          className="text-primary-foreground"
        >
          Save changes
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={"space-y-1.5 " + (full ? "md:col-span-2" : "")}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
