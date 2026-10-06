import { useEffect, useState, type ReactNode } from "react";
import { Fence, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui-kit";
import type {
  AdminGeoGeofence,
  GeofenceInput,
  GeofenceUpdateInput,
} from "@/domains/admin-geo/api";
import {
  useDeleteGeofenceMutation,
  useGeofenceMutation,
} from "@/domains/admin-geo/queries";
import { adminGeoFieldError, adminGeoFormError } from "@/domains/admin-geo/errors";
import { cn } from "@/lib/utils";

interface GeofencePanelProps {
  workSiteId: string | null;
  items: AdminGeoGeofence[];
  selectedId: string | null;
  loading: boolean;
  error: unknown;
  onSelectedIdChange: (id: string | null) => void;
}

const DEFAULT_FORM = {
  geofenceCode: "",
  name: "",
  isActive: true,
};

export function GeofencePanel({
  workSiteId,
  items,
  selectedId,
  loading,
  error,
  onSelectedIdChange,
}: GeofencePanelProps) {
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const [editing, setEditing] = useState<AdminGeoGeofence | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const mutation = useGeofenceMutation(workSiteId);
  const deleteMutation = useDeleteGeofenceMutation();
  const activeForm = creating || editing;
  const mutationError = mutation.error ?? deleteMutation.error ?? error;

  useEffect(() => {
    if (!selectedId && items[0]) onSelectedIdChange(items[0].id);
  }, [items, onSelectedIdChange, selectedId]);

  function beginCreate() {
    setCreating(true);
    setEditing(null);
    setForm(DEFAULT_FORM);
  }

  function beginEdit(geofence: AdminGeoGeofence) {
    setCreating(false);
    setEditing(geofence);
    setForm({
      geofenceCode: geofence.geofenceCode,
      name: geofence.name,
      isActive: geofence.isActive,
    });
  }

  async function save() {
    if (!workSiteId) return toast.error("Select a work site first.");
    if (!form.geofenceCode.trim() || !form.name.trim()) {
      toast.error("Geofence code and name are required.");
      return;
    }
    try {
      const input: GeofenceInput | GeofenceUpdateInput = editing
        ? { ...form, expectedVersion: editing.version }
        : form;
      const response = await mutation.mutateAsync({ id: editing?.id, input });
      toast.success(editing ? "Geofence updated" : "Geofence created");
      setCreating(false);
      setEditing(null);
      onSelectedIdChange(response.geofence.id);
    } catch {
      // Error is rendered in the form.
    }
  }

  async function remove(geofence: AdminGeoGeofence) {
    try {
      await deleteMutation.mutateAsync({ id: geofence.id, expectedVersion: geofence.version });
      toast.success("Geofence deactivated");
      if (selectedId === geofence.id) onSelectedIdChange(null);
    } catch {
      // Error is rendered in the form.
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Geofences</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Circle and polygon zones attached to the selected work site.
            </p>
          </div>
          <Button type="button" size="sm" onClick={beginCreate} disabled={!workSiteId}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        {adminGeoFormError(mutationError, "Geofence action failed") ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {adminGeoFormError(mutationError, "Geofence action failed")}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {!workSiteId ? (
          <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            Select or create a work site to manage geofences.
          </div>
        ) : loading ? (
          <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            Loading geofences...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            No geofences for this work site yet.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((geofence) => (
              <button
                key={geofence.id}
                type="button"
                onClick={() => onSelectedIdChange(geofence.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition",
                  selectedId === geofence.id ? "border-primary bg-primary-soft" : "hover:bg-muted/60",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{geofence.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {geofence.geofenceCode}
                    {geofence.currentPublishedVersionId ? " · published" : " · no published version"}
                  </span>
                </span>
                <Badge variant={geofence.isActive ? "default" : "outline"}>
                  {geofence.isActive ? "Active" : "Inactive"}
                </Badge>
              </button>
            ))}
          </div>
        )}

        {selected && !activeForm ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => beginEdit(selected)}>
              <Fence className="h-4 w-4" />
              Edit geofence
            </Button>
            <ConfirmDialog
              title="Deactivate geofence?"
              description="The geofence will be hidden from admin geo lists, but draft and published versions remain preserved."
              confirmLabel="Deactivate"
              onConfirm={() => remove(selected)}
              trigger={
                <Button type="button" variant="outline">
                  <Trash2 className="h-4 w-4" />
                  Deactivate
                </Button>
              }
            />
          </div>
        ) : null}

        {activeForm ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Geofence code" error={adminGeoFieldError(mutation.error, "geofenceCode")}>
                <Input
                  value={form.geofenceCode}
                  onChange={(event) => setForm({ ...form, geofenceCode: event.target.value })}
                  placeholder="MAIN-GATE"
                />
              </Field>
              <Field label="Name" error={adminGeoFieldError(mutation.error, "name")}>
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Main gate"
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              Active
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={() => void save()} disabled={mutation.isPending}>
                <Save className="h-4 w-4" />
                {mutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
