import { useEffect, useMemo, useState } from "react";
import { Circle, FilePenLine, GitCommit, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui-kit";
import { CircleEditor } from "@/components/admin-geo/circle-editor";
import { PolygonEditor } from "@/components/admin-geo/polygon-editor";
import type {
  AdminGeoShapeType,
  AdminGeoVersion,
  GeofenceVersionInput,
} from "@/domains/admin-geo/api";
import { adminGeoFormError } from "@/domains/admin-geo/errors";
import {
  isCircleReady,
  isPolygonReady,
  resetCircleDraft,
  resetPolygonDraft,
  type CircleDraft,
  type PolygonDraft,
} from "@/domains/admin-geo/geometry";
import {
  useDeleteGeofenceVersionMutation,
  useGeofenceVersionMutation,
  usePublishGeofenceVersionMutation,
} from "@/domains/admin-geo/queries";
import { cn } from "@/lib/utils";

interface VersionPublishPanelProps {
  geofenceId: string | null;
  items: AdminGeoVersion[];
  selectedId: string | null;
  loading: boolean;
  error: unknown;
  shapeType: AdminGeoShapeType;
  circleDraft: CircleDraft;
  polygonDraft: PolygonDraft;
  onSelectedIdChange: (id: string | null) => void;
  onShapeTypeChange: (shapeType: AdminGeoShapeType) => void;
  onCircleDraftChange: (draft: CircleDraft) => void;
  onPolygonDraftChange: (draft: PolygonDraft) => void;
  onUseCircleMapClicks: () => void;
  onUsePolygonMapClicks: () => void;
  onFit: () => void;
}

export function VersionPublishPanel({
  geofenceId,
  items,
  selectedId,
  loading,
  error,
  shapeType,
  circleDraft,
  polygonDraft,
  onSelectedIdChange,
  onShapeTypeChange,
  onCircleDraftChange,
  onPolygonDraftChange,
  onUseCircleMapClicks,
  onUsePolygonMapClicks,
  onFit,
}: VersionPublishPanelProps) {
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const mutation = useGeofenceVersionMutation(geofenceId);
  const deleteMutation = useDeleteGeofenceVersionMutation(geofenceId);
  const publishMutation = usePublishGeofenceVersionMutation();
  const [metadataText, setMetadataText] = useState("{}");
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const readOnly = selected?.versionStatus === "published";
  const ready = shapeType === "circle" ? isCircleReady(circleDraft) : isPolygonReady(polygonDraft.vertices);
  const actionError =
    metadataError ??
    adminGeoFormError(
      mutation.error ?? deleteMutation.error ?? publishMutation.error ?? error,
      "Geofence version action failed",
    );

  useEffect(() => {
    if (!selectedId && !creatingNew && items[0]) onSelectedIdChange(items[0].id);
  }, [creatingNew, items, onSelectedIdChange, selectedId]);

  useEffect(() => {
    setCreatingNew(false);
  }, [geofenceId]);

  useEffect(() => {
    setMetadataText(JSON.stringify(selected?.shapeMetadata ?? {}, null, 2));
    setMetadataError(null);
    setEffectiveFrom("");
    setEffectiveUntil("");
  }, [selected]);

  const emptyState = useMemo(() => {
    if (!geofenceId) return "Select or create a geofence to manage shape versions.";
    if (loading) return "Loading versions...";
    if (items.length === 0) return "No draft or published versions yet.";
    return null;
  }, [geofenceId, items.length, loading]);

  function resetForNewDraft() {
    setCreatingNew(true);
    onSelectedIdChange(null);
    onShapeTypeChange("circle");
    onCircleDraftChange(resetCircleDraft());
    onPolygonDraftChange(resetPolygonDraft());
    setMetadataText("{}");
    setMetadataError(null);
  }

  async function saveDraft() {
    if (!geofenceId) return toast.error("Select a geofence first.");
    if (readOnly) return toast.error("Published versions are read-only.");
    if (!ready) return toast.error("Complete the selected shape before saving.");
    const shapeMetadata = parseJsonObject(metadataText);
    if (!shapeMetadata.ok) {
      setMetadataError(shapeMetadata.message);
      return;
    }
    setMetadataError(null);
    try {
      const response = await mutation.mutateAsync({
        id: selected?.versionStatus === "draft" ? selected.id : undefined,
        input: buildVersionInput(shapeType, circleDraft, polygonDraft, shapeMetadata.value),
      });
      toast.success(selected?.versionStatus === "draft" ? "Draft version updated" : "Draft version created");
      setCreatingNew(false);
      onSelectedIdChange(response.version.id);
    } catch {
      // Error is rendered in the panel.
    }
  }

  async function deleteDraft(version: AdminGeoVersion) {
    try {
      await deleteMutation.mutateAsync(version.id);
      toast.success("Draft version deleted");
      if (selectedId === version.id) onSelectedIdChange(null);
    } catch {
      // Error is rendered in the panel.
    }
  }

  async function publishDraft() {
    if (!geofenceId || !selected || selected.versionStatus !== "draft") return;
    if (!effectiveFrom) {
      toast.error("Effective from is required.");
      return;
    }
    try {
      await publishMutation.mutateAsync({
        geofenceId,
        versionId: selected.id,
        input: {
          effectiveFrom: new Date(effectiveFrom).toISOString(),
          effectiveUntil: effectiveUntil ? new Date(effectiveUntil).toISOString() : null,
        },
      });
      toast.success("Geofence version published");
    } catch {
      // Error is rendered in the panel.
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Versions & Publish</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Draft shapes are editable. Published versions are immutable effective-dated records.
            </p>
          </div>
          <Button type="button" size="sm" onClick={resetForNewDraft} disabled={!geofenceId}>
            <Plus className="h-4 w-4" />
            New draft
          </Button>
        </div>
        {actionError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {actionError}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">
        {emptyState ? (
          <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            {emptyState}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((version) => (
              <button
                key={version.id}
                type="button"
                onClick={() => {
                  setCreatingNew(false);
                  onSelectedIdChange(version.id);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition",
                  selectedId === version.id ? "border-primary bg-primary-soft" : "hover:bg-muted/60",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">Version {version.versionNumber}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {version.shapeType}
                    {version.effectiveFrom ? ` · from ${formatDateTime(version.effectiveFrom)}` : ""}
                  </span>
                </span>
                <Badge variant={version.versionStatus === "published" ? "default" : "outline"}>
                  {version.versionStatus}
                </Badge>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4 rounded-md border p-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={shapeType === "circle" ? "default" : "outline"}
              onClick={() => onShapeTypeChange("circle")}
              disabled={readOnly}
            >
              <Circle className="h-4 w-4" />
              Circle
            </Button>
            <Button
              type="button"
              variant={shapeType === "polygon" ? "default" : "outline"}
              onClick={() => onShapeTypeChange("polygon")}
              disabled={readOnly}
            >
              <FilePenLine className="h-4 w-4" />
              Polygon
            </Button>
          </div>

          {shapeType === "circle" ? (
            <CircleEditor
              disabled={readOnly}
              draft={circleDraft}
              onChange={onCircleDraftChange}
              onFit={onFit}
              onUseMapClicks={onUseCircleMapClicks}
            />
          ) : (
            <PolygonEditor
              disabled={readOnly}
              draft={polygonDraft}
              onChange={onPolygonDraftChange}
              onFit={onFit}
              onUseMapClicks={onUsePolygonMapClicks}
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="shape-metadata">Shape metadata JSON</Label>
            <Textarea
              disabled={readOnly}
              id="shape-metadata"
              onChange={(event) => setMetadataText(event.target.value)}
              rows={4}
              value={metadataText}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {selected?.versionStatus === "draft" ? (
              <ConfirmDialog
                title="Delete draft version?"
                description="Only draft versions can be deleted. Published versions remain immutable."
                confirmLabel="Delete"
                onConfirm={() => deleteDraft(selected)}
                trigger={
                  <Button type="button" variant="outline">
                    <Trash2 className="h-4 w-4" />
                    Delete draft
                  </Button>
                }
              />
            ) : null}
            <Button type="button" onClick={() => void saveDraft()} disabled={!geofenceId || readOnly || !ready}>
              <GitCommit className="h-4 w-4" />
              {selected?.versionStatus === "draft" ? "Update draft" : "Create draft"}
            </Button>
          </div>
        </div>

        {selected?.versionStatus === "draft" ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="effective-from">Effective from</Label>
                <Input
                  id="effective-from"
                  type="datetime-local"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="effective-until">Effective until</Label>
                <Input
                  id="effective-until"
                  type="datetime-local"
                  value={effectiveUntil}
                  onChange={(event) => setEffectiveUntil(event.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void publishDraft()}
                disabled={publishMutation.isPending}
              >
                <Send className="h-4 w-4" />
                {publishMutation.isPending ? "Publishing..." : "Publish"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function buildVersionInput(
  shapeType: AdminGeoShapeType,
  circleDraft: CircleDraft,
  polygonDraft: PolygonDraft,
  shapeMetadata: Record<string, unknown>,
): GeofenceVersionInput {
  if (shapeType === "circle") {
    return {
      shapeType: "circle",
      center: {
        longitude: circleDraft.center?.[0] ?? 0,
        latitude: circleDraft.center?.[1] ?? 0,
      },
      radiusMeters: circleDraft.radiusMeters ?? 0,
      shapeMetadata,
    };
  }
  return {
    shapeType: "polygon",
    vertices: polygonDraft.vertices,
    shapeMetadata,
  };
}

function parseJsonObject(value: string):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string } {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "Shape metadata must be a JSON object." };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, message: "Shape metadata JSON is not valid." };
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
