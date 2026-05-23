import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { useAdminSettings, type CompanyProfile } from "@/lib/admin-settings-store";
import {
  useCompanyProfile,
  useUpdateCompanyProfileMutation,
  type CompanyProfileResponse,
  type CompanyProfileUpdateInput,
} from "@/domains/admin";
import { useApiRouteEnabled } from "@/shared/api";
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
const MONTH_TO_NUMBER: Record<string, number> = {
  January: 1,
  April: 4,
  July: 7,
  October: 10,
};
const NUMBER_TO_MONTH = new Map(
  Object.entries(MONTH_TO_NUMBER).map(([month, value]) => [value, month]),
);
const TIMEZONE_OPTIONS: Record<string, string> = {
  "Asia/Kolkata": "Asia/Kolkata (GMT+05:30)",
  "Asia/Singapore": "Asia/Singapore (GMT+08:00)",
  "Europe/London": "Europe/London (GMT+00:00)",
  "America/New_York": "America/New_York (GMT-05:00)",
};
const CURRENCY_OPTIONS: Record<string, string> = {
  INR: "INR — Indian Rupee",
  USD: "USD — US Dollar",
  EUR: "EUR — Euro",
  SGD: "SGD — Singapore Dollar",
  GBP: "GBP — British Pound",
};
const WORK_WEEK_OPTIONS: Record<string, string> = {
  "Mon-Fri": "Mon – Fri",
  "Mon-Sat": "Mon – Sat",
  "Sun-Thu": "Sun – Thu",
};

function CompanyProfileScreen() {
  const { company, setCompany } = useAdminSettings();
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const companyQuery = useCompanyProfile(apiEnabled);
  const updateCompanyMutation = useUpdateCompanyProfileMutation();
  const apiCompany = useMemo(
    () => (companyQuery.data ? mapApiCompanyProfile(companyQuery.data) : null),
    [companyQuery.data],
  );
  const [draft, setDraft] = useState<CompanyProfile>(apiCompany ?? company);

  useEffect(() => {
    setDraft(apiCompany ?? company);
  }, [apiCompany, company]);

  const update = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) =>
    setDraft({ ...draft, [k]: v });

  const onSave = () => {
    if (!apiEnabled) {
      setCompany(draft);
      toast.success("Company profile updated");
      return;
    }
    if (!companyQuery.data?.version) {
      toast.error("Company profile has not loaded yet.");
      return;
    }

    updateCompanyMutation.mutate(toApiCompanyPayload(draft, companyQuery.data.version), {
      onSuccess: (profile) => {
        const next = mapApiCompanyProfile(profile);
        setCompany(next);
        setDraft(next);
        toast.success("Company profile updated");
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Company profile update failed");
      },
    });
  };

  return (
    <Card className="max-w-4xl rounded-2xl border-border/60 p-6">
      {apiEnabled && companyQuery.isLoading ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Loading company profile from backend...
        </p>
      ) : null}
      {apiEnabled && companyQuery.isError ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Company profile could not be loaded. {companyQuery.error.message}
        </div>
      ) : null}
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
          disabled={apiEnabled && (companyQuery.isLoading || updateCompanyMutation.isPending)}
          style={{ background: "var(--gradient-primary)" }}
          className="text-primary-foreground"
        >
          {updateCompanyMutation.isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}

function mapApiCompanyProfile(profile: CompanyProfileResponse): CompanyProfile {
  return {
    name: profile.company_name,
    website: profile.website ?? "",
    industry: profile.industry ?? "",
    address: profile.address ?? "",
    timezone: TIMEZONE_OPTIONS[profile.timezone] ?? profile.timezone,
    currency: CURRENCY_OPTIONS[profile.currency] ?? profile.currency,
    financialYearStart:
      NUMBER_TO_MONTH.get(profile.fiscal_year_start_month) ??
      profile.financial_year_start ??
      "April",
    workingWeek: WORK_WEEK_OPTIONS[profile.working_week] ?? profile.working_week,
    workHours: Number(profile.work_hours_per_day || 8),
    logoLabel: profile.logo_label ?? "HK",
  };
}

function toApiCompanyPayload(
  company: CompanyProfile,
  expectedVersion: number,
): CompanyProfileUpdateInput {
  return {
    company_name: company.name,
    website: company.website || null,
    industry: company.industry || null,
    address: company.address || null,
    timezone: company.timezone.split(" ")[0],
    currency: company.currency.split(" ")[0],
    fiscal_year_start_month: MONTH_TO_NUMBER[company.financialYearStart] ?? 4,
    working_week: company.workingWeek.replace(/\s+–\s+/u, "-").replace(/\s+-\s+/u, "-"),
    work_hours_per_day: company.workHours,
    logo_label: company.logoLabel || null,
    expected_version: expectedVersion,
  };
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
