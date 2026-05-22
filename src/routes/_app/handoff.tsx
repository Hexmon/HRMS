import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-kit";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Layers, ShieldCheck, Database, Workflow, Server,
  AlertTriangle, FolderTree, Code2, Boxes,
} from "lucide-react";

export const Route = createFileRoute("/_app/handoff")({ component: HandoffPage });

function Section({
  icon: Icon, title, eyebrow, children,
}: { icon: typeof BookOpen; title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-2xl border-border/60 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>}
          <p className="text-sm font-semibold">{title}</p>
        </div>
      </div>
      <div className="text-sm leading-relaxed text-muted-foreground space-y-2">{children}</div>
    </Card>
  );
}

const ROUTES: [string, string][] = [
  ["/dashboard", "Role-aware dashboard"],
  ["/employees", "Employee directory + profile"],
  ["/ems", "Employee self-service"],
  ["/attendance", "Punch, calendar, exceptions"],
  ["/leave-wfh", "Apply / approve / monitor"],
  ["/projects", "Projects + allocation"],
  ["/team-utilization", "Capacity, bench, billable mix"],
  ["/timesheet", "Entry, approvals, project view"],
  ["/expenses", "Multi-stage expense workflow"],
  ["/assets", "Inventory, assignment, warranty"],
  ["/helpdesk", "Tickets, queue, SLA"],
  ["/reports", "Executive analytics"],
  ["/admin-settings", "Company, RBAC, workflows"],
];

const ROLES = [
  "main_admin", "hr_admin", "admin", "employee", "manager", "team_lead",
  "module_lead", "project_manager", "finance_manager", "asset_admin",
  "helpdesk_agent", "auditor",
];

const APIS = [
  "Auth", "Company", "Employee", "Role & Permission", "Attendance", "Leave / WFH",
  "Project", "Timesheet", "Expense", "Asset", "Helpdesk", "Reports", "Notification", "Audit Log",
];

function HandoffPage() {
  return (
    <>
      <PageHeader
        eyebrow="Developer Handoff"
        title="Hawkaii HRMS — Handoff Notes"
        description="Frontend prototype overview, mock-data map, and the plan for connecting a real Node.js / Next.js backend later."
        actions={<Badge variant="outline" className="text-[10px]">Frontend prototype · v1.0</Badge>}
      />

      <div className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-2">
        <Section icon={BookOpen} eyebrow="Section 1" title="Product overview">
          <p>
            Hawkaii HRMS is a modern HRMS and workforce-operations platform for software companies.
            It centralises employee lifecycle, attendance, leave, projects, timesheets, expenses,
            assets, helpdesk, reports and admin governance in a single role-aware workspace.
          </p>
          <p><strong className="text-foreground">Target users:</strong> 50–2,000-person software / services companies.</p>
        </Section>

        <Section icon={ShieldCheck} eyebrow="Section 2" title="Roles (single login)">
          <p>One login screen, role-driven UI. Switch roles from the topbar avatar menu to demo each persona.</p>
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((r) => <Badge key={r} variant="outline" className="text-[10px] font-mono">{r}</Badge>)}
          </div>
        </Section>

        <Section icon={Layers} eyebrow="Section 3" title="Main routes">
          <ul className="grid grid-cols-1 gap-1.5">
            {ROUTES.map(([route, desc]) => (
              <li key={route} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-1.5">
                <code className="text-xs text-foreground">{route}</code>
                <span className="text-xs">{desc}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={Database} eyebrow="Section 4" title="Mock data location">
          <p>All mock data lives in <code className="rounded bg-muted px-1 text-xs">src/lib/mock/</code> and re-exports through <code className="rounded bg-muted px-1 text-xs">src/lib/mock/index.ts</code>.</p>
          <p>Stateful demo logic is in <code className="rounded bg-muted px-1 text-xs">src/lib/*-store.tsx</code>, persisted to <code>localStorage</code>. Replace these providers with React Query + API clients when the backend lands — the Context surface stays identical so screens do not need to change.</p>
        </Section>

        <Section icon={Workflow} eyebrow="Section 5" title="Role logic">
          <ul className="list-disc pl-5">
            <li>Active session: <code className="rounded bg-muted px-1 text-xs">src/lib/auth.tsx</code></li>
            <li>Role definitions: <code className="rounded bg-muted px-1 text-xs">src/lib/mock/roles.ts</code></li>
            <li>Permission matrix: <code className="rounded bg-muted px-1 text-xs">src/lib/admin-settings-store.tsx</code></li>
            <li>Sidebar gating: <code className="rounded bg-muted px-1 text-xs">src/components/app-sidebar.tsx</code></li>
            <li>Per-role dashboards: <code className="rounded bg-muted px-1 text-xs">src/components/dashboards/*</code></li>
          </ul>
        </Section>

        <Section icon={Server} eyebrow="Section 6" title="Future backend API plan">
          <p>Real backend will be built in <strong className="text-foreground">Node.js / Next.js</strong> separately. Each mock store maps to one API group:</p>
          <div className="flex flex-wrap gap-1.5">
            {APIS.map((a) => <Badge key={a} variant="outline" className="text-[10px]">{a} API</Badge>)}
          </div>
        </Section>

        <Section icon={AlertTriangle} eyebrow="Section 7" title="Known limitations">
          <ul className="list-disc pl-5">
            <li>All data is mock, persisted only in <code>localStorage</code>.</li>
            <li>Authentication is mock — role switcher is a demo aid.</li>
            <li>File uploads are placeholders.</li>
            <li>Export buttons (CSV / PDF) are mock and only show a toast.</li>
            <li>Approval workflows run entirely in the browser.</li>
            <li>Email, push and SMS channels are stubbed.</li>
            <li>MFA, IP/device audit and SSO are UI-only.</li>
          </ul>
        </Section>

        <Section icon={FolderTree} eyebrow="Section 8" title="Folder map">
          <pre className="overflow-x-auto rounded-xl bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground">
{`src/
├── routes/_app/*.tsx         module routes
├── components/
│   ├── app-sidebar.tsx       role-filtered sidebar
│   ├── topbar.tsx            search · quick actions · role switcher
│   ├── dashboards/           per-role dashboards
│   ├── ui/                   shadcn primitives
│   └── ui-kit/               Hawkaii HRMS shared primitives
├── lib/
│   ├── auth.tsx              mock auth + ROLE_MAP
│   ├── *-store.tsx           per-module stateful stores
│   └── mock/                 all mock data
└── styles.css                design tokens`}
          </pre>
        </Section>

        <Section icon={Code2} eyebrow="Section 9" title="Tech stack">
          <ul className="list-disc pl-5">
            <li>TanStack Start v1 (React 19 + Vite 7), file-based routing</li>
            <li>Tailwind CSS v4 with semantic OKLCH tokens in <code>src/styles.css</code></li>
            <li>shadcn/ui + custom <code>ui-kit/</code> primitives</li>
            <li>lucide-react · sonner · React Context + localStorage</li>
          </ul>
        </Section>

        <Section icon={Boxes} eyebrow="Section 10" title="Integration recipe">
          <ol className="list-decimal pl-5">
            <li>Stand up the Node.js / Next.js API and match the route map above.</li>
            <li>Add a thin React Query layer per module.</li>
            <li>Swap each <code className="rounded bg-muted px-1 text-xs">*-store.tsx</code> provider's mock state for query/mutation hooks — keep the same Context exports.</li>
            <li>Replace mock auth in <code className="rounded bg-muted px-1 text-xs">src/lib/auth.tsx</code> with real session + JWT.</li>
            <li>Wire file uploads, exports, email and push to real services.</li>
            <li>Remove <code className="rounded bg-muted px-1 text-xs">src/lib/mock/</code> once every module is live.</li>
          </ol>
        </Section>
      </div>
    </>
  );
}
