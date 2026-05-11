import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge, UserAvatar } from "@/components/ui-kit";
import { type Employee } from "@/lib/mock/employees";
import { ASSETS } from "@/lib/mock/assets";
import {
  Briefcase,
  Building2,
  Calendar,
  FileText,
  Mail,
  MapPin,
  Phone,
  UserCheck,
  Pencil,
  Download,
  Laptop,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: Employee | null;
  canEdit: boolean;
  onEdit: () => void;
}

export function EmployeeProfileDrawer({ open, onOpenChange, employee, canEdit, onEdit }: Props) {
  if (!employee) return null;
  const assets = ASSETS.filter((a) => a.assignedTo === employee.name);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <div className="border-b p-6" style={{ background: "var(--gradient-hero)" }}>
          <div className="flex items-start gap-4">
            <UserAvatar name={employee.name} size="lg" tone={employee.avatarTone ?? "primary"} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-semibold tracking-tight">{employee.name}</h2>
                <StatusBadge status={employee.status} />
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{employee.designation}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {employee.id} • {employee.department}
              </p>
            </div>
            {canEdit && (
              <Button onClick={onEdit} variant="outline" size="sm" className="rounded-full">
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <Tabs defaultValue="overview">
            <TabsList className="rounded-full">
              <TabsTrigger value="overview" className="rounded-full">Overview</TabsTrigger>
              <TabsTrigger value="job" className="rounded-full">Job</TabsTrigger>
              <TabsTrigger value="documents" className="rounded-full">Documents</TabsTrigger>
              <TabsTrigger value="assets" className="rounded-full">Assets</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-5 space-y-3">
              <Card className="rounded-2xl border-border/60 p-5">
                <h3 className="text-sm font-semibold">Contact</h3>
                <ul className="mt-3 space-y-2.5 text-sm">
                  <Row icon={Mail} label={employee.email} />
                  <Row icon={Phone} label={employee.phone || "—"} />
                  <Row icon={MapPin} label={employee.location} />
                </ul>
              </Card>
              <Card className="rounded-2xl border-border/60 p-5">
                <h3 className="text-sm font-semibold">At a glance</h3>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <Stat label="Tenure" value={tenure(employee.joinedAt)} />
                  <Stat label="Type" value={employmentLabel(employee.employmentType)} />
                  <Stat label="Manager" value={employee.manager} />
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="job" className="mt-5 space-y-3">
              <Card className="rounded-2xl border-border/60 p-5">
                <h3 className="text-sm font-semibold">Job details</h3>
                <ul className="mt-3 space-y-2.5 text-sm">
                  <Row icon={Briefcase} label={employee.designation} />
                  <Row icon={Building2} label={employee.department} />
                  <Row icon={UserCheck} label={`Reports to ${employee.manager}`} />
                  <Row icon={Calendar} label={`Joined ${formatDate(employee.joinedAt)}`} />
                </ul>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-5 space-y-2">
              {SAMPLE_DOCS.map((d) => (
                <Card key={d.name} className="flex items-center justify-between rounded-2xl border-border/60 p-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.size} • {d.uploaded}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="rounded-full">
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                  </Button>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="assets" className="mt-5 space-y-2">
              {assets.length === 0 ? (
                <Card className="rounded-2xl border-border/60 p-8 text-center text-sm text-muted-foreground">
                  No assets assigned to this employee.
                </Card>
              ) : (
                assets.map((a) => (
                  <Card key={a.id} className="flex items-center justify-between rounded-2xl border-border/60 p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
                        <Laptop className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.id} • {a.serial}</p>
                      </div>
                    </div>
                    <StatusBadge status={a.status} />
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <li className="flex items-center gap-2.5 text-muted-foreground">
      <Icon className="h-4 w-4" />
      <span className="text-foreground">{label}</span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-secondary/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

const SAMPLE_DOCS = [
  { name: "Offer letter.pdf", size: "184 KB", uploaded: "Mar 14, 2022" },
  { name: "ID proof.pdf", size: "96 KB", uploaded: "Mar 14, 2022" },
  { name: "Address proof.pdf", size: "112 KB", uploaded: "Mar 14, 2022" },
];

function tenure(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (months < 12) return `${Math.max(months, 0)} mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y}y ${m}m` : `${y}y`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function employmentLabel(t: Employee["employmentType"]) {
  return t === "full_time" ? "Full-time" : t === "part_time" ? "Part-time" : t === "contract" ? "Contract" : "Intern";
}
