import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui-kit";
import { toast } from "sonner";
import { BookOpen, Download, Eye } from "lucide-react";

export const Route = createFileRoute("/_app/ems/policies")({
  component: MyPolicies,
});

interface Policy { id: string; name: string; version: string; updatedOn: string; acknowledged: boolean; }

const POLICIES: Policy[] = [
  { id: "P1", name: "Attendance policy", version: "v3.1", updatedOn: "12 Jan 2026", acknowledged: true },
  { id: "P2", name: "Leave policy", version: "v4.0", updatedOn: "01 Jun 2026", acknowledged: false },
  { id: "P3", name: "Expense & reimbursement policy", version: "v2.4", updatedOn: "20 Feb 2026", acknowledged: true },
  { id: "P4", name: "IT asset policy", version: "v1.8", updatedOn: "05 Apr 2026", acknowledged: true },
  { id: "P5", name: "Work from home policy", version: "v2.0", updatedOn: "15 Mar 2026", acknowledged: true },
  { id: "P6", name: "Code of conduct", version: "v5.2", updatedOn: "01 Jan 2026", acknowledged: true },
];

function MyPolicies() {
  return (
    <div className="space-y-4 pt-4">
      <p className="text-sm text-muted-foreground">Read and acknowledge company policies. New versions appear at the top.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {POLICIES.map((p) => (
          <Card key={p.id} className="rounded-2xl border-border/60 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{p.name}</p>
                  {p.acknowledged
                    ? <StatusBadge status="completed" label="Acknowledged" />
                    : <StatusBadge status="pending" label="Action needed" />}
                </div>
                <p className="text-xs text-muted-foreground">{p.version} · Updated {p.updatedOn}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => toast("Opening policy...")}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> Read
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => toast.success("Download started")}>
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                  </Button>
                  {!p.acknowledged && (
                    <Button size="sm" className="rounded-full" onClick={() => toast.success("Policy acknowledged")}>
                      Acknowledge
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
