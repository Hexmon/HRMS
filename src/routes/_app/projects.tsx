import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/status-badge";
import { PROJECTS } from "@/lib/mock-data";
import { Plus, Users } from "lucide-react";

export const Route = createFileRoute("/_app/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Track delivery, allocations and progress across all engagements."
        actions={
          <Button className="rounded-full" style={{ background: "var(--gradient-primary)" }}>
            <Plus className="mr-1.5 h-4 w-4" /> New project
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PROJECTS.map((p) => (
          <Card key={p.id} className="group rounded-2xl border-border/60 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{p.id} · {p.client}</p>
                <h3 className="mt-1 text-base font-semibold tracking-tight">{p.name}</h3>
              </div>
              <StatusBadge status={p.status} />
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-semibold">{p.progress}%</span>
              </div>
              <Progress value={p.progress} className="mt-1.5 h-2" />
            </div>
            <div className="mt-4 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {p.team} members</span>
              <span>Due {p.dueDate}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">PM · <span className="font-medium text-foreground">{p.manager}</span></p>
          </Card>
        ))}
      </div>
    </>
  );
}
