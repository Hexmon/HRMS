import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Building2, Shield, Workflow, Bell, KeyRound, Users2 } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

const sections = [
  { icon: Building2, title: "Company profile", desc: "Legal name, branding, locations and working hours." },
  { icon: Users2, title: "Roles & permissions", desc: "Configure the 12 role types and their access scopes." },
  { icon: Workflow, title: "Approval workflows", desc: "Multi-level approval chains for leave, expenses and timesheets." },
  { icon: Shield, title: "Audit & compliance", desc: "Immutable audit log of every critical action." },
  { icon: Bell, title: "Notifications", desc: "Email, in-app and Slack alerts per workflow." },
  { icon: KeyRound, title: "Authentication", desc: "SSO, SCIM, password policy and MFA enforcement." },
];

function SettingsPage() {
  return (
    <>
      <PageHeader title="Admin settings" description="Configure your Hawkaii workspace, roles, workflows and policies." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <Card key={s.title} className="group cursor-pointer rounded-2xl border-border/60 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
              <s.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-base font-semibold tracking-tight">{s.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl border-border/60 p-6">
        <h3 className="text-sm font-semibold">Workspace preferences</h3>
        <p className="text-xs text-muted-foreground">Quick toggles for the most common policies.</p>
        <div className="mt-5 space-y-4">
          {[
            ["Require MFA for all admins", true],
            ["Auto-approve WFH for managers", false],
            ["Block self-approval on workflows", true],
            ["Send weekly digest to all employees", true],
          ].map(([label, defaultOn]) => (
            <div key={label as string} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <Label className="text-sm font-medium">{label}</Label>
              <Switch defaultChecked={defaultOn as boolean} />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
