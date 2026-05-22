import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, type Column, StatusBadge, EmptyState, StatCard } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/mock/roles";
import { toast } from "sonner";
import {
  FileCheck2,
  UserCog,
  ClipboardList,
  BadgeCheck,
  LogOut,
  BookOpen,
  FileSignature,
  Check,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_app/ems/admin")({
  component: EmsAdmin,
});

const ADMIN_ROLES: Role[] = ["hr_admin", "main_admin"];

interface DocRow {
  id: string;
  employee: string;
  doc: string;
  uploadedOn: string;
  status: string;
}
const DOC_QUEUE: DocRow[] = [
  {
    id: "D-501",
    employee: "Aryan Mehta",
    doc: "Address Proof",
    uploadedOn: "Today",
    status: "pending",
  },
  {
    id: "D-502",
    employee: "Fatima Noor",
    doc: "Education Certificate",
    uploadedOn: "Yesterday",
    status: "pending",
  },
  {
    id: "D-503",
    employee: "Jacob Owens",
    doc: "ID Proof — Passport",
    uploadedOn: "08 May",
    status: "pending",
  },
];

interface ProfRow {
  id: string;
  employee: string;
  field: string;
  oldVal: string;
  newVal: string;
  raisedOn: string;
}
const PROFILE_QUEUE: ProfRow[] = [
  {
    id: "P-201",
    employee: "Daniel Park",
    field: "Current address",
    oldVal: "Old St 12",
    newVal: "44 New Lane, BLR",
    raisedOn: "Today",
  },
  {
    id: "P-202",
    employee: "Aryan Mehta",
    field: "Phone",
    oldVal: "+91 90...",
    newVal: "+91 91...",
    raisedOn: "Yesterday",
  },
];

interface Onboard {
  name: string;
  offer: boolean;
  docs: boolean;
  assets: boolean;
  access: boolean;
  orientation: boolean;
}
const ONBOARDING: Onboard[] = [
  { name: "Sneha Roy", offer: true, docs: true, assets: false, access: false, orientation: false },
  { name: "Imran Ali", offer: true, docs: false, assets: false, access: false, orientation: false },
];

interface Probation {
  id: string;
  employee: string;
  joining: string;
  due: string;
  status: string;
}
const PROBATION: Probation[] = [
  {
    id: "PB-12",
    employee: "Kabir Shah",
    joining: "14 Nov 2025",
    due: "14 May 2026",
    status: "pending",
  },
  {
    id: "PB-13",
    employee: "Lia Chen",
    joining: "01 Dec 2025",
    due: "01 Jun 2026",
    status: "pending",
  },
];

interface ExitRow {
  name: string;
  clearance: boolean;
  assets: boolean;
  finance: boolean;
  letter: boolean;
  lwd: string;
}
const EXITS: ExitRow[] = [
  {
    name: "Vikram Reddy",
    clearance: true,
    assets: false,
    finance: false,
    letter: false,
    lwd: "31 May",
  },
];

interface LetterRow {
  id: string;
  employee: string;
  type: string;
  raisedOn: string;
  status: string;
}
const LETTERS: LetterRow[] = [
  {
    id: "LR-401",
    employee: "Daniel Park",
    type: "Salary Certificate",
    raisedOn: "08 May",
    status: "in_progress",
  },
  {
    id: "LR-402",
    employee: "Fatima Noor",
    type: "Experience Letter",
    raisedOn: "06 May",
    status: "pending",
  },
];

const POLICIES = [
  { name: "Attendance policy", version: "v3.1", updated: "12 Jan 2026", ack: "94%" },
  { name: "Leave policy", version: "v4.0", updated: "01 Jun 2026", ack: "61%" },
  { name: "WFH policy", version: "v2.0", updated: "15 Mar 2026", ack: "88%" },
];

function DocQueue() {
  const cols: Column<DocRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "employee", header: "Employee", render: (r) => <>{r.employee}</> },
    { key: "doc", header: "Document", render: (r) => <span className="font-medium">{r.doc}</span> },
    { key: "uploadedOn", header: "Uploaded", render: (r) => <>{r.uploadedOn}</> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "a",
      header: "Actions",
      render: () => (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 rounded-full"
            onClick={() => toast.success("Document verified")}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full"
            onClick={() => toast("Rejection note required")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];
  return <DataTable rows={DOC_QUEUE} columns={cols} />;
}

function ProfileQueue() {
  const cols: Column<ProfRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "employee", header: "Employee", render: (r) => <>{r.employee}</> },
    { key: "field", header: "Field", render: (r) => <>{r.field}</> },
    {
      key: "oldVal",
      header: "Current",
      render: (r) => <span className="text-muted-foreground">{r.oldVal}</span>,
    },
    {
      key: "newVal",
      header: "Requested",
      render: (r) => <span className="font-medium">{r.newVal}</span>,
    },
    { key: "raisedOn", header: "Raised", render: (r) => <>{r.raisedOn}</> },
    {
      key: "a",
      header: "Actions",
      render: () => (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 rounded-full"
            onClick={() => toast.success("Update approved")}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full"
            onClick={() => toast("Update rejected")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];
  return <DataTable rows={PROFILE_QUEUE} columns={cols} />;
}

function OnboardingChecklist() {
  return (
    <div className="space-y-3">
      {ONBOARDING.map((o) => (
        <Card key={o.name} className="rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{o.name}</p>
            <span className="text-xs text-muted-foreground">Onboarding in progress</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ["offer", "Offer accepted"],
                ["docs", "Docs verified"],
                ["assets", "Assets allocated"],
                ["access", "Access provisioned"],
                ["orientation", "Orientation"],
              ] as const
            ).map(([k, label]) => (
              <label
                key={k}
                className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={o[k]}
                  onCheckedChange={() => toast.success(`${label} updated`)}
                />
                <span className={o[k] ? "" : "text-muted-foreground"}>{label}</span>
              </label>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ProbationQueue() {
  const cols: Column<Probation>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "employee", header: "Employee", render: (r) => <>{r.employee}</> },
    { key: "joining", header: "Joining", render: (r) => <>{r.joining}</> },
    { key: "due", header: "Confirmation due", render: (r) => <>{r.due}</> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "a",
      header: "Actions",
      render: () => (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 rounded-full"
            onClick={() => toast.success("Confirmation issued")}
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full"
            onClick={() => toast("Probation extended")}
          >
            Extend
          </Button>
        </div>
      ),
    },
  ];
  return <DataTable rows={PROBATION} columns={cols} />;
}

function ExitChecklist() {
  return (
    <div className="space-y-3">
      {EXITS.map((e) => (
        <Card key={e.name} className="rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{e.name}</p>
              <p className="text-xs text-muted-foreground">Last working day: {e.lwd}</p>
            </div>
            <StatusBadge status="notice_period" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["clearance", "Manager clearance"],
                ["assets", "Assets returned"],
                ["finance", "Finance settled"],
                ["letter", "Relieving letter"],
              ] as const
            ).map(([k, label]) => (
              <label
                key={k}
                className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={e[k]}
                  onCheckedChange={() => toast.success(`${label} updated`)}
                />
                <span className={e[k] ? "" : "text-muted-foreground"}>{label}</span>
              </label>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function PolicyMgmt() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {POLICIES.map((p) => (
        <Card key={p.name} className="rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {p.version} · Updated {p.updated}
              </p>
            </div>
            <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
              {p.ack} acked
            </span>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" className="rounded-full">
              Edit
            </Button>
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => toast.success("New version published")}
            >
              Publish version
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function LetterQueue() {
  const cols: Column<LetterRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "employee", header: "Employee", render: (r) => <>{r.employee}</> },
    {
      key: "type",
      header: "Letter type",
      render: (r) => <span className="font-medium">{r.type}</span>,
    },
    { key: "raisedOn", header: "Raised", render: (r) => <>{r.raisedOn}</> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "a",
      header: "Actions",
      render: () => (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 rounded-full"
            onClick={() => toast.success("Letter generated")}
          >
            Generate
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full"
            onClick={() => toast("Sent to employee")}
          >
            Send
          </Button>
        </div>
      ),
    },
  ];
  return <DataTable rows={LETTERS} columns={cols} />;
}

function EmsAdmin() {
  const { activeRole } = useAuth();
  if (!activeRole || !ADMIN_ROLES.includes(activeRole)) return <Navigate to="/ems" />;

  return (
    <div className="space-y-4 pt-4">
      <p className="text-sm text-muted-foreground">Operational queues for the people-ops team.</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Docs to verify"
          value={DOC_QUEUE.length}
          icon={FileCheck2}
          tone="warning"
        />
        <StatCard label="Profile updates" value={PROFILE_QUEUE.length} icon={UserCog} tone="info" />
        <StatCard label="Probation due" value={PROBATION.length} icon={BadgeCheck} tone="primary" />
        <StatCard
          label="Letters in queue"
          value={LETTERS.length}
          icon={FileSignature}
          tone="success"
        />
      </div>

      <Tabs defaultValue="docs">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="docs">
            <FileCheck2 className="mr-1.5 h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="profile">
            <UserCog className="mr-1.5 h-4 w-4" />
            Profile updates
          </TabsTrigger>
          <TabsTrigger value="onboard">
            <ClipboardList className="mr-1.5 h-4 w-4" />
            Onboarding
          </TabsTrigger>
          <TabsTrigger value="probation">
            <BadgeCheck className="mr-1.5 h-4 w-4" />
            Probation
          </TabsTrigger>
          <TabsTrigger value="exit">
            <LogOut className="mr-1.5 h-4 w-4" />
            Exits
          </TabsTrigger>
          <TabsTrigger value="policy">
            <BookOpen className="mr-1.5 h-4 w-4" />
            Policies
          </TabsTrigger>
          <TabsTrigger value="letter">
            <FileSignature className="mr-1.5 h-4 w-4" />
            Letters
          </TabsTrigger>
        </TabsList>
        <TabsContent value="docs" className="mt-4">
          {DOC_QUEUE.length ? <DocQueue /> : <EmptyState title="No documents pending" />}
        </TabsContent>
        <TabsContent value="profile" className="mt-4">
          {PROFILE_QUEUE.length ? <ProfileQueue /> : <EmptyState title="No profile changes" />}
        </TabsContent>
        <TabsContent value="onboard" className="mt-4">
          <OnboardingChecklist />
        </TabsContent>
        <TabsContent value="probation" className="mt-4">
          <ProbationQueue />
        </TabsContent>
        <TabsContent value="exit" className="mt-4">
          <ExitChecklist />
        </TabsContent>
        <TabsContent value="policy" className="mt-4">
          <PolicyMgmt />
        </TabsContent>
        <TabsContent value="letter" className="mt-4">
          <LetterQueue />
        </TabsContent>
      </Tabs>
    </div>
  );
}
