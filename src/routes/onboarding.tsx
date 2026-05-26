import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth, dashboardPathForRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDocumentUploadPolicy } from "@/domains/documents";
import {
  DEFAULT_MEDIA_UPLOAD_POLICY,
  formatBytes,
  prepareDocumentUploadFile,
  uploadPolicyAccept,
  type MediaUploadPolicy,
} from "@/shared/uploads/documents";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ImageUp,
  Layers,
  ShieldCheck,
  UserCog,
  Users2,
  X,
  CalendarDays,
  Clock,
  Receipt,
  Briefcase,
  LifeBuoy,
} from "lucide-react";
import { ROLES } from "@/lib/mock";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Company setup — Hawkaii HRMS" }] }),
  component: OnboardingPage,
});

const DEFAULT_DEPARTMENTS = [
  "Management",
  "HR",
  "Engineering",
  "QA",
  "Design",
  "Sales",
  "Finance",
  "IT Support",
  "Operations",
];

const DEFAULT_DESIGNATIONS = [
  "Intern",
  "Junior Developer",
  "Software Developer",
  "Senior Developer",
  "Team Lead",
  "Module Lead",
  "Project Manager",
  "HR Executive",
  "Finance Executive",
  "Director",
];

type CompanyProfile = {
  companyName: string;
  website: string;
  industry: string;
  size: string;
  address: string;
  timezone: string;
  currency: string;
  logoName: string;
  logoDataUrl: string;
  logoMimeType: string;
  logoSizeBytes: number | null;
};

type OnboardingDraft = {
  step: number;
  profile: CompanyProfile;
  departments: string[];
  designations: string[];
  enabledRoles: string[];
  savedAt: string;
};

const DEFAULT_PROFILE: CompanyProfile = {
  companyName: "",
  website: "",
  industry: "Software",
  size: "11–50",
  address: "",
  timezone: "Asia/Kolkata",
  currency: "USD",
  logoName: "",
  logoDataUrl: "",
  logoMimeType: "",
  logoSizeBytes: null,
};

const ONBOARDING_DRAFT_KEY_PREFIX = "hawkaii_onboarding_draft_v1";
const POLICIES = [
  {
    key: "attendance",
    title: "Attendance Policy",
    icon: Clock,
    body: "Geo-tag, IP-locked or open clock-in. Configure grace period and break rules.",
  },
  {
    key: "leave",
    title: "Leave Policy",
    icon: CalendarDays,
    body: "Define leave types, accrual cadence, carry-forward and blackout dates.",
  },
  {
    key: "timesheet",
    title: "Timesheet Policy",
    icon: Briefcase,
    body: "Daily/weekly cadence, billable rules, approval routing.",
  },
  {
    key: "expense",
    title: "Expense Policy",
    icon: Receipt,
    body: "Per-category limits, receipts threshold, multi-currency settlement.",
  },
  {
    key: "asset",
    title: "Asset Policy",
    icon: ShieldCheck,
    body: "Issuance flow, depreciation method, return-on-exit checklist.",
  },
  {
    key: "helpdesk",
    title: "Helpdesk SLA",
    icon: LifeBuoy,
    body: "Priority tiers, response and resolution targets, escalation matrix.",
  },
];

const STEPS = [
  { id: 1, title: "Company profile", icon: Building2 },
  { id: 2, title: "Departments", icon: Layers },
  { id: 3, title: "Designations", icon: UserCog },
  { id: 4, title: "Roles", icon: Users2 },
  { id: 5, title: "Policies", icon: ShieldCheck },
];

function onboardingDraftKey(identity: string) {
  return `${ONBOARDING_DRAFT_KEY_PREFIX}:${identity}`;
}

function clampStep(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(STEPS.length, Math.max(1, Math.round(numeric)));
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return cleaned.length ? cleaned : fallback;
}

function mergeProfileDraft(value: unknown): CompanyProfile {
  if (!value || typeof value !== "object") return DEFAULT_PROFILE;
  return { ...DEFAULT_PROFILE, ...(value as Partial<CompanyProfile>) };
}

function readOnboardingDraft(key: string): OnboardingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    return {
      step: clampStep(parsed.step),
      profile: mergeProfileDraft(parsed.profile),
      departments: normalizeStringList(parsed.departments, DEFAULT_DEPARTMENTS),
      designations: normalizeStringList(parsed.designations, DEFAULT_DESIGNATIONS),
      enabledRoles: normalizeStringList(
        parsed.enabledRoles,
        ROLES.map((role) => role.key),
      ),
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeOnboardingDraft(key: string, draft: OnboardingDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // A large uploaded logo can exceed localStorage quota. Keep the wizard usable even then.
  }
}

function clearOnboardingDraft(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

function readLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read logo file."));
    };
    reader.onerror = () => reject(new Error("Could not read logo file."));
    reader.readAsDataURL(file);
  });
}

function logoOnlyPolicy(
  policy: MediaUploadPolicy = DEFAULT_MEDIA_UPLOAD_POLICY,
): MediaUploadPolicy {
  const imageMimeTypes = policy.allowed_mime_types.filter(
    (mimeType) => mimeType.startsWith("image/") && mimeType !== "image/svg+xml",
  );
  return {
    ...policy,
    allowed_mime_types: imageMimeTypes.length
      ? imageMimeTypes
      : ["image/jpeg", "image/png", "image/webp"],
  };
}

async function logoFileFromProfile(profile: CompanyProfile): Promise<File | null> {
  if (!profile.logoDataUrl || !profile.logoName) return null;
  try {
    const response = await fetch(profile.logoDataUrl);
    const blob = await response.blob();
    if (!blob.size) return null;
    return new File([blob], profile.logoName, {
      type: profile.logoMimeType || blob.type || "image/jpeg",
    });
  } catch {
    return null;
  }
}

function OnboardingPage() {
  const { user, activeRole, isCompanySetupComplete, completeCompanySetup } = useAuth();
  const navigate = useNavigate();
  const uploadPolicyQuery = useDocumentUploadPolicy(Boolean(user));
  const [step, setStep] = useState(1);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_PROFILE);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [departments, setDepartments] = useState<string[]>(DEFAULT_DEPARTMENTS);
  const [designations, setDesignations] = useState<string[]>(DEFAULT_DESIGNATIONS);
  const [enabledRoles, setEnabledRoles] = useState<string[]>(ROLES.map((r) => r.key));
  const draftKey = user ? onboardingDraftKey(user.id || user.email) : null;

  useEffect(() => {
    if (!draftKey) {
      setDraftLoaded(false);
      return;
    }

    const draft = readOnboardingDraft(draftKey);
    if (draft) {
      setStep(draft.step);
      setProfile(draft.profile);
      setDepartments(draft.departments);
      setDesignations(draft.designations);
      setEnabledRoles(draft.enabledRoles);
      setLogoFile(null);
    }
    setDraftLoaded(true);
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !draftLoaded || done || isCompanySetupComplete) return;
    writeOnboardingDraft(draftKey, {
      step,
      profile,
      departments,
      designations,
      enabledRoles,
      savedAt: new Date().toISOString(),
    });
  }, [
    departments,
    designations,
    done,
    draftKey,
    draftLoaded,
    enabledRoles,
    isCompanySetupComplete,
    profile,
    step,
  ]);

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (isCompanySetupComplete) {
      if (draftKey) clearOnboardingDraft(draftKey);
      navigate({ to: dashboardPathForRole(activeRole) });
    }
  }, [user, activeRole, draftKey, isCompanySetupComplete, navigate]);

  if (!user) return null;

  const totalSteps = STEPS.length;
  const progress = ((step - 1) / (totalSteps - 1)) * 100;

  const next = () => setStep((s) => Math.min(totalSteps, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const finish = async () => {
    setError("");
    setSubmitting(true);
    try {
      const companyLogoFile = logoFile ?? (await logoFileFromProfile(profile));
      const result = await completeCompanySetup({
        companyName: profile.companyName || undefined,
        timezone: profile.timezone,
        locale: "en-IN",
        fullName: user.name,
        landingPage: dashboardPathForRole(activeRole),
        companyLogoFile,
      });
      if (!result.ok) {
        setError(result.error ?? "Could not finish setup.");
        return;
      }
      if (draftKey) clearOnboardingDraft(draftKey);
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div
        className="grid min-h-screen place-items-center px-6"
        style={{ background: "var(--gradient-hero)" }}
      >
        <Card className="w-full max-w-md rounded-3xl p-8 text-center shadow-xl">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-success/10">
            <CheckCircle2 className="h-9 w-9 text-success" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">You're all set</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your Hawkaii HRMS workspace is ready. You can fine-tune everything from Admin Settings
            any time.
          </p>
          <Button
            asChild
            className="mt-6 h-11 w-full rounded-xl text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Link to={dashboardPathForRole(activeRole)}>Open dashboard</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-hero)" }}>
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link to="/" className="flex items-center gap-2.5">
              <div
                className="grid h-10 w-10 place-items-center rounded-2xl text-primary-foreground shadow-lg"
                style={{ background: "var(--gradient-primary)" }}
              >
                <span className="font-bold">H</span>
              </div>
              <div>
                <p className="text-base font-semibold tracking-tight">Hawkaii HRMS</p>
                <p className="text-xs text-muted-foreground">Company setup wizard</p>
              </div>
            </Link>
          </div>
          <Badge variant="outline" className="self-start sm:self-auto">
            Step {step} of {totalSteps}
          </Badge>
        </div>

        {/* Stepper */}
        <Card className="rounded-3xl border-border/60 p-6 shadow-xl sm:p-8">
          <div className="mb-6">
            <div className="grid grid-cols-5 gap-2">
              {STEPS.map((s) => {
                const active = s.id === step;
                const completed = s.id < step;
                return (
                  <div key={s.id} className="flex flex-col items-center gap-2 text-center">
                    <div
                      className={`grid h-9 w-9 place-items-center rounded-xl border text-xs font-semibold transition ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : completed
                            ? "border-success bg-success/10 text-success"
                            : "border-border bg-secondary text-muted-foreground"
                      }`}
                    >
                      {completed ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                    </div>
                    <p
                      className={`text-[11px] sm:text-xs ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}
                    >
                      {s.title}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, background: "var(--gradient-primary)" }}
              />
            </div>
          </div>

          <div className="mt-2 min-h-[300px]">
            {step === 1 && (
              <StepProfile
                profile={profile}
                setProfile={setProfile}
                setLogoFile={setLogoFile}
                uploadPolicy={uploadPolicyQuery.data}
              />
            )}
            {step === 2 && (
              <StepList
                title="Departments"
                description="We've added common departments to get you going. Edit, remove or add your own."
                items={departments}
                setItems={setDepartments}
                placeholder="e.g. Marketing"
              />
            )}
            {step === 3 && (
              <StepList
                title="Designations"
                description="Designations show on profiles, employee directory and reports."
                items={designations}
                setItems={setDesignations}
                placeholder="e.g. Principal Engineer"
              />
            )}
            {step === 4 && <StepRoles enabled={enabledRoles} setEnabled={setEnabledRoles} />}
            {step === 5 && <StepPolicies />}
          </div>

          {error && (
            <p className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="mt-8 flex items-center justify-between border-t pt-6">
            <Button variant="outline" onClick={back} disabled={step === 1} className="rounded-xl">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
            {step < totalSteps ? (
              <Button
                onClick={next}
                className="rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                Continue <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={finish}
                disabled={submitting}
                className="rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                {submitting ? "Finishing..." : "Finish setup"}{" "}
                <CheckCircle2 className="ml-1.5 h-4 w-4" />
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// -------- Step 1 --------
function StepProfile({
  profile,
  setProfile,
  setLogoFile,
  uploadPolicy,
}: {
  profile: CompanyProfile;
  setProfile: React.Dispatch<React.SetStateAction<CompanyProfile>>;
  setLogoFile: React.Dispatch<React.SetStateAction<File | null>>;
  uploadPolicy?: MediaUploadPolicy;
}) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState("");
  const [dragging, setDragging] = useState(false);
  const set =
    (k: keyof CompanyProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setProfile((p) => ({ ...p, [k]: e.target.value }));
  const applyLogo = async (file: File | null | undefined) => {
    setLogoError("");
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      setLogoError("Use an image logo.");
      return;
    }
    try {
      const prepared = await prepareDocumentUploadFile(file, logoOnlyPolicy(uploadPolicy));
      const logoDataUrl = await readLogoFile(prepared.file);
      setLogoFile(prepared.file);
      setProfile((p) => ({
        ...p,
        logoName: prepared.file.name,
        logoDataUrl,
        logoMimeType: prepared.file.type,
        logoSizeBytes: prepared.file.size,
      }));
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : "Could not prepare this logo file.");
    }
  };
  const clearLogo = () => {
    setLogoError("");
    setLogoFile(null);
    setProfile((p) => ({
      ...p,
      logoName: "",
      logoDataUrl: "",
      logoMimeType: "",
      logoSizeBytes: null,
    }));
  };
  return (
    <div className="space-y-5">
      <Header
        title="Tell us about your company"
        subtitle="This information appears on documents and the employee directory."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Company name" value={profile.companyName} onChange={set("companyName")} />
        <Field
          label="Website"
          placeholder="https://"
          value={profile.website}
          onChange={set("website")}
        />
        <SelectField
          label="Industry"
          value={profile.industry}
          onChange={set("industry")}
          options={[
            "Software",
            "Consulting",
            "Finance",
            "Healthcare",
            "Education",
            "Manufacturing",
            "Other",
          ]}
        />
        <SelectField
          label="Company size"
          value={profile.size}
          onChange={set("size")}
          options={["1–10", "11–50", "51–200", "201–500", "501–1000", "1000+"]}
        />
        <Field
          label="Address"
          value={profile.address}
          onChange={set("address")}
          className="sm:col-span-2"
        />
        <SelectField
          label="Timezone"
          value={profile.timezone}
          onChange={set("timezone")}
          options={[
            "Asia/Kolkata",
            "Asia/Singapore",
            "Europe/London",
            "America/New_York",
            "America/Los_Angeles",
            "Australia/Sydney",
          ]}
        />
        <SelectField
          label="Currency"
          value={profile.currency}
          onChange={set("currency")}
          options={["USD", "EUR", "GBP", "INR", "SGD", "AUD"]}
        />
      </div>
      <div
        className={`rounded-2xl border border-dashed bg-secondary/40 p-6 transition ${
          dragging ? "border-primary bg-primary/5" : "border-border"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void applyLogo(event.dataTransfer.files.item(0));
        }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-card text-muted-foreground">
            {profile.logoDataUrl ? (
              <img
                src={profile.logoDataUrl}
                alt={`${profile.companyName || "Company"} logo preview`}
                className="h-full w-full object-contain"
              />
            ) : (
              <ImageUp className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Company logo</p>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, or WebP up to {formatBytes(logoOnlyPolicy(uploadPolicy).max_bytes)}. Images
              are compressed before Cloudinary upload.
            </p>
            {profile.logoName && (
              <p className="mt-1 text-xs text-foreground">
                {profile.logoName}
                {profile.logoSizeBytes ? ` (${formatBytes(profile.logoSizeBytes)})` : ""}
              </p>
            )}
            {logoError && <p className="mt-1 text-xs text-destructive">{logoError}</p>}
          </div>
          <div className="flex shrink-0 gap-2 self-start sm:self-auto">
            <input
              ref={logoInputRef}
              type="file"
              accept={uploadPolicyAccept(logoOnlyPolicy(uploadPolicy))}
              className="hidden"
              onChange={(event) => {
                void applyLogo(event.currentTarget.files?.item(0));
                event.currentTarget.value = "";
              }}
            />
            <Button
              variant="outline"
              type="button"
              className="rounded-xl"
              onClick={() => logoInputRef.current?.click()}
            >
              Upload
            </Button>
            {profile.logoDataUrl && (
              <Button variant="ghost" type="button" className="rounded-xl" onClick={clearLogo}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// -------- Step 2/3 list editor --------
function StepList({
  title,
  description,
  items,
  setItems,
  placeholder,
}: {
  title: string;
  description: string;
  items: string[];
  setItems: React.Dispatch<React.SetStateAction<string[]>>;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.includes(v)) return;
    setItems((arr) => [...arr, v]);
    setDraft("");
  };
  return (
    <div className="space-y-5">
      <Header title={title} subtitle={description} />
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <Button onClick={add} type="button" variant="outline" className="rounded-xl">
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <span
            key={it}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium"
          >
            {it}
            <button
              type="button"
              onClick={() => setItems((arr) => arr.filter((x) => x !== it))}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Remove ${it}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

// -------- Step 4 --------
function StepRoles({
  enabled,
  setEnabled,
}: {
  enabled: string[];
  setEnabled: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const extra = [
    {
      key: "admin",
      label: "Admin",
      description: "Workspace administration without people-ops scope.",
    },
    { key: "team_lead", label: "Team Lead", description: "Lead a small team within a department." },
    {
      key: "module_lead",
      label: "Module Lead",
      description: "Own a delivery module within a project.",
    },
    {
      key: "auditor",
      label: "Auditor",
      description: "Read-only access for compliance and audits.",
    },
  ];
  const all = [
    ...ROLES.map((r) => ({ key: r.key, label: r.label, description: r.description })),
    ...extra,
  ];

  const toggle = (k: string) =>
    setEnabled((arr) => (arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]));

  return (
    <div className="space-y-5">
      <Header
        title="Roles & permissions"
        subtitle="Toggle the roles you'd like available in your workspace. You can edit permissions later."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {all.map((r) => {
          const on = enabled.includes(r.key);
          return (
            <button
              type="button"
              key={r.key}
              onClick={() => toggle(r.key)}
              className={`group flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                on ? "border-primary/60 bg-primary/5" : "bg-card hover:bg-secondary/60"
              }`}
            >
              <div
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                }`}
              >
                {on && <Check className="h-3 w-3" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{r.label}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -------- Step 5 --------
function StepPolicies() {
  return (
    <div className="space-y-5">
      <Header
        title="Policies preview"
        subtitle="We've pre-configured sensible defaults. Open any policy from Admin Settings to fine-tune."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {POLICIES.map((p) => (
          <Card key={p.key} className="flex items-start gap-3 rounded-2xl border-border/60 p-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
              <p.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{p.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.body}</p>
            </div>
            <Badge variant="outline" className="shrink-0">
              Default
            </Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}

// -------- shared --------
function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function Field({
  label,
  className,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      <Input {...props} />
    </div>
  );
}

function SelectField({
  label,
  options,
  ...props
}: { label: string; options: string[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select
        {...props}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
