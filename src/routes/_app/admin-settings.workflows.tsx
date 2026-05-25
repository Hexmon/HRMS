import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  type WorkflowKey,
  type WorkflowStage,
} from "@/lib/admin-settings-store";
import { toastApiError, useApiRouteEnabled } from "@/shared/api";
import { useAdminWorkflows, useUpdateAdminWorkflowMutation } from "@/domains/admin/queries";
import type { AdminWorkflowRecord } from "@/domains/admin/api";
import { Plus, Trash2, ArrowDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin-settings/workflows")({
  component: WorkflowsScreen,
});

const APPROVER_TYPES: WorkflowStage["approverType"][] = [
  "Reporting Manager",
  "Role",
  "Specific User",
];

type ScreenWorkflow = WorkflowConfig & {
  version?: number;
};

function WorkflowsScreen() {
  const localSettings = useAdminSettings();
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const workflowsQuery = useAdminWorkflows(apiEnabled);
  const updateWorkflow = useUpdateAdminWorkflowMutation();
  const [drafts, setDrafts] = useState<Record<string, ScreenWorkflow>>({});

  const apiWorkflows = useMemo(
    () => (workflowsQuery.data?.items ?? []).map(workflowFromApi),
    [workflowsQuery.data?.items],
  );

  useEffect(() => {
    if (!apiEnabled) return;
    setDrafts(Object.fromEntries(apiWorkflows.map((workflow) => [workflow.key, workflow])));
  }, [apiEnabled, apiWorkflows]);

  const workflows = apiEnabled
    ? apiWorkflows.map((workflow) => drafts[workflow.key] ?? workflow)
    : localSettings.workflows;
  const loading = apiEnabled && workflowsQuery.isLoading;
  const error = apiEnabled && workflowsQuery.error instanceof Error ? workflowsQuery.error : null;

  function updateWorkflowDraft(
    key: WorkflowKey,
    updater: (workflow: WorkflowConfig) => WorkflowConfig,
  ) {
    if (!apiEnabled) return;
    setDrafts((current) => {
      const workflow = current[key] ?? apiWorkflows.find((candidate) => candidate.key === key);
      if (!workflow) return current;
      return { ...current, [key]: { ...updater(workflow), version: workflow.version } };
    });
  }

  function toggleWorkflow(key: WorkflowKey) {
    if (!apiEnabled) {
      localSettings.toggleWorkflow(key);
      return;
    }
    updateWorkflowDraft(key, (workflow) => ({ ...workflow, active: !workflow.active }));
  }

  function addStage(key: WorkflowKey) {
    if (!apiEnabled) {
      localSettings.addStage(key);
      return;
    }
    updateWorkflowDraft(key, (workflow) => ({
      ...workflow,
      stages: [...workflow.stages, newStage(workflow)],
    }));
  }

  function updateStage(key: WorkflowKey, stageId: string, patch: Partial<WorkflowStage>) {
    if (!apiEnabled) {
      localSettings.updateStage(key, stageId, patch);
      return;
    }
    updateWorkflowDraft(key, (workflow) => ({
      ...workflow,
      stages: workflow.stages.map((stage) =>
        stage.id === stageId ? { ...stage, ...patch } : stage,
      ),
    }));
  }

  function removeStage(key: WorkflowKey, stageId: string) {
    if (!apiEnabled) {
      localSettings.removeStage(key, stageId);
      return;
    }
    updateWorkflowDraft(key, (workflow) => ({
      ...workflow,
      stages: workflow.stages.filter((stage) => stage.id !== stageId),
    }));
  }

  async function saveWorkflow(workflow: ScreenWorkflow) {
    if (!apiEnabled || !workflow.version) return;
    try {
      await updateWorkflow.mutateAsync({
        workflowKey: workflow.key,
        input: {
          label: workflow.label,
          active: workflow.active,
          expected_version: workflow.version,
          stages: workflow.stages.map((stage, index) => ({
            id: stage.id,
            order: index + 1,
            approverType: stage.approverType,
            approverValue: stage.approverValue,
            escalateAfterDays: stage.escalateAfterDays,
            mandatoryRemarksOnReject: stage.mandatoryRemarksOnReject,
          })),
        },
      });
      toast.success("Workflow saved");
    } catch (saveError) {
      toastApiError(saveError, "Workflow update failed");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex items-start gap-3 rounded-2xl border-warning/40 bg-warning/5 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
        <p className="text-muted-foreground">
          Self-approval is never allowed — even if a user matches the approver criteria, their own
          request will route to the next approver in the chain.
        </p>
      </Card>

      {loading ? (
        <Card className="rounded-2xl border-border/60 p-6 text-sm text-muted-foreground">
          Loading workflow configuration...
        </Card>
      ) : error ? (
        <Card className="rounded-2xl border-border/60 p-6 text-sm text-destructive">
          {error.message}
        </Card>
      ) : (
        workflows.map((workflow) => (
          <WorkflowCard
            key={workflow.key}
            wf={workflow}
            apiEnabled={apiEnabled}
            saving={updateWorkflow.isPending}
            onToggle={toggleWorkflow}
            onAddStage={addStage}
            onUpdateStage={updateStage}
            onRemoveStage={removeStage}
            onSave={saveWorkflow}
          />
        ))
      )}
    </div>
  );
}

function WorkflowCard({
  wf,
  apiEnabled,
  saving,
  onToggle,
  onAddStage,
  onUpdateStage,
  onRemoveStage,
  onSave,
}: {
  wf: ScreenWorkflow;
  apiEnabled: boolean;
  saving: boolean;
  onToggle: (key: WorkflowKey) => void;
  onAddStage: (key: WorkflowKey) => void;
  onUpdateStage: (key: WorkflowKey, stageId: string, patch: Partial<WorkflowStage>) => void;
  onRemoveStage: (key: WorkflowKey, stageId: string) => void;
  onSave: (workflow: ScreenWorkflow) => void;
}) {
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
          <Switch checked={wf.active} onCheckedChange={() => onToggle(wf.key)} />
        </div>
      </div>

      <div className="space-y-3 p-4">
        {wf.stages.map((stage, idx) => (
          <div key={stage.id}>
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
                    onClick={() => onRemoveStage(wf.key, stage.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Approver type</Label>
                  <Select
                    value={stage.approverType}
                    onValueChange={(value) =>
                      onUpdateStage(wf.key, stage.id, {
                        approverType: value as WorkflowStage["approverType"],
                      })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APPROVER_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {stage.approverType === "Reporting Manager"
                      ? "Manager scope"
                      : stage.approverType === "Role"
                        ? "Role"
                        : "User"}
                  </Label>
                  <Input
                    className="h-9"
                    value={stage.approverValue}
                    onChange={(event) =>
                      onUpdateStage(wf.key, stage.id, { approverValue: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Escalate after (days)</Label>
                  <Input
                    className="h-9"
                    type="number"
                    min={0}
                    value={stage.escalateAfterDays}
                    onChange={(event) =>
                      onUpdateStage(wf.key, stage.id, {
                        escalateAfterDays: Number(event.target.value),
                      })
                    }
                  />
                </div>
                <div className="flex items-center gap-2 pt-1 md:col-span-3">
                  <Switch
                    checked={stage.mandatoryRemarksOnReject}
                    onCheckedChange={(value) =>
                      onUpdateStage(wf.key, stage.id, { mandatoryRemarksOnReject: value })
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

        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => onAddStage(wf.key)}>
            <Plus className="mr-1 h-4 w-4" /> Add stage
          </Button>
          {apiEnabled && (
            <Button
              size="sm"
              onClick={() => onSave(wf)}
              disabled={saving}
              style={{ background: "var(--gradient-primary)" }}
              className="text-primary-foreground"
            >
              Save workflow
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function workflowFromApi(workflow: AdminWorkflowRecord): ScreenWorkflow {
  return {
    key: workflow.key as WorkflowKey,
    label: workflow.label,
    active: workflow.active,
    version: workflow.version,
    stages: workflow.stages.map((stage) => ({
      id: stage.id,
      approverType: stage.approverType,
      approverValue: stage.approverValue,
      escalateAfterDays: stage.escalateAfterDays,
      mandatoryRemarksOnReject: stage.mandatoryRemarksOnReject,
    })),
  };
}

function newStage(workflow: WorkflowConfig): WorkflowStage {
  const order = workflow.stages.length + 1;
  return {
    id: `${workflow.key}_stage_${Date.now().toString(36)}_${order}`,
    approverType: "Role",
    approverValue: "Manager",
    escalateAfterDays: 2,
    mandatoryRemarksOnReject: true,
  };
}
