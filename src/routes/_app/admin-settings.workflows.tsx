import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAdminSettings,
  type WorkflowConfig,
  type WorkflowStage,
} from "@/lib/admin-settings-store";
import { Plus, Trash2, ArrowDown, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/admin-settings/workflows")({
  component: WorkflowsScreen,
});

const APPROVER_TYPES: WorkflowStage["approverType"][] = [
  "Reporting Manager",
  "Role",
  "Specific User",
];

function WorkflowsScreen() {
  const { workflows } = useAdminSettings();
  return (
    <div className="space-y-4">
      <Card className="flex items-start gap-3 rounded-2xl border-warning/40 bg-warning/5 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
        <p className="text-muted-foreground">
          Self-approval is never allowed — even if a user matches the approver criteria, their own
          request will route to the next approver in the chain.
        </p>
      </Card>
      {workflows.map((w) => (
        <WorkflowCard key={w.key} wf={w} />
      ))}
    </div>
  );
}

function WorkflowCard({ wf }: { wf: WorkflowConfig }) {
  const { toggleWorkflow, addStage, updateStage, removeStage } = useAdminSettings();

  return (
    <Card className="rounded-2xl border-border/60 p-0">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <p className="text-sm font-semibold">{wf.label}</p>
          <p className="text-xs text-muted-foreground">
            {wf.stages.length} stage{wf.stages.length === 1 ? "" : "s"} • Linear sequential
            approvals
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-[10px]">
            {wf.active ? "Active" : "Disabled"}
          </Badge>
          <Switch checked={wf.active} onCheckedChange={() => toggleWorkflow(wf.key)} />
        </div>
      </div>

      <div className="space-y-3 p-4">
        {wf.stages.map((s, idx) => (
          <div key={s.id}>
            <div className="rounded-2xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {idx + 1}
                  </span>
                  <p className="text-sm font-semibold">Stage {idx + 1}</p>
                </div>
                {wf.stages.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => removeStage(wf.key, s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Approver type</Label>
                  <Select
                    value={s.approverType}
                    onValueChange={(v) =>
                      updateStage(wf.key, s.id, {
                        approverType: v as WorkflowStage["approverType"],
                      })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APPROVER_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {s.approverType === "Reporting Manager"
                      ? "Manager scope"
                      : s.approverType === "Role"
                        ? "Role"
                        : "User"}
                  </Label>
                  <Input
                    className="h-9"
                    value={s.approverValue}
                    onChange={(e) => updateStage(wf.key, s.id, { approverValue: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Escalate after (days)</Label>
                  <Input
                    className="h-9"
                    type="number"
                    min={0}
                    value={s.escalateAfterDays}
                    onChange={(e) =>
                      updateStage(wf.key, s.id, { escalateAfterDays: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="md:col-span-3 flex items-center gap-2 pt-1">
                  <Switch
                    checked={s.mandatoryRemarksOnReject}
                    onCheckedChange={(v) =>
                      updateStage(wf.key, s.id, { mandatoryRemarksOnReject: v })
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    Mandatory remarks on rejection
                  </span>
                </div>
              </div>
            </div>
            {idx < wf.stages.length - 1 && (
              <div className="flex justify-center py-1.5 text-muted-foreground">
                <ArrowDown className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={() => addStage(wf.key)}>
          <Plus className="mr-1 h-4 w-4" /> Add stage
        </Button>
      </div>
    </Card>
  );
}
