import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MapPin, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui-kit";
import {
  SITE_TYPE_OPTIONS,
  type AdminGeoWorkSite,
  type WorkSiteInput,
  type WorkSiteUpdateInput,
} from "@/domains/admin-geo/api";
import { useDeleteWorkSiteMutation, useWorkSiteMutation } from "@/domains/admin-geo/queries";
import { adminGeoFieldError, adminGeoFormError } from "@/domains/admin-geo/errors";
import { cn } from "@/lib/utils";

interface WorkSitePanelProps {
  items: AdminGeoWorkSite[];
  selectedId: string | null;
  loading: boolean;
  error: unknown;
  onSelectedIdChange: (id: string | null) => void;
}

const DEFAULT_FORM = {
  siteCode: "",
  name: "",
  siteType: "office",
  timezone: "Asia/Kolkata",
  isActive: true,
};

export function WorkSitePanel({
  items,
  selectedId,
  loading,
  error,
  onSelectedIdChange,
}: WorkSitePanelProps) {
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const [editing, setEditing] = useState<AdminGeoWorkSite | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const mutation = useWorkSiteMutation();
  const deleteMutation = useDeleteWorkSiteMutation();
  const activeForm = creating || editing;
  const mutationError = mutation.error ?? deleteMutation.error ?? error;

  useEffect(() => {
    if (!selectedId && items[0]) onSelectedIdChange(items[0].id);
  }, [items, onSelectedIdChange, selectedId]);

  const siteTypeOptions = useMemo(() => {
    if (!form.siteType || SITE_TYPE_OPTIONS.some((option) => option.value === form.siteType)) {
      return SITE_TYPE_OPTIONS;
    }
    return [{ value: form.siteType, label: `Existing: ${form.siteType}` }, ...SITE_TYPE_OPTIONS];
  }, [form.siteType]);

  function beginCreate() {
    setCreating(true);
    setEditing(null);
    setForm(DEFAULT_FORM);
  }

  function beginEdit(site: AdminGeoWorkSite) {
    setCreating(false);
    setEditing(site);
    setForm({
      siteCode: site.siteCode,
      name: site.name,
      siteType: site.siteType,
      timezone: site.timezone,
      isActive: site.isActive,
    });
  }

  async function save() {
    if (
      !form.siteCode.trim() ||
      !form.name.trim() ||
      !form.siteType.trim() ||
      !form.timezone.trim()
    ) {
      toast.error("Site code, name, type and timezone are required.");
      return;
    }
    try {
      const input: WorkSiteInput | WorkSiteUpdateInput = editing
        ? { ...form, expectedVersion: editing.version }
        : form;
      const response = await mutation.mutateAsync({
        id: editing?.id,
        input,
      });
      toast.success(editing ? "Work site updated" : "Work site created");
      setCreating(false);
      setEditing(null);
      onSelectedIdChange(response.workSite.id);
    } catch {
      // Error is rendered in the form.
    }
  }

  async function remove(site: AdminGeoWorkSite) {
    try {
      await deleteMutation.mutateAsync({ id: site.id, expectedVersion: site.version });
      toast.success("Work site deactivated");
      if (selectedId === site.id) onSelectedIdChange(null);
    } catch {
      // Error is rendered in the form.
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Work Sites</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Company-scoped site records. Location geometry lives in geofences.
            </p>
          </div>
          <Button type="button" size="sm" onClick={beginCreate}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        {adminGeoFormError(mutationError, "Work-site action failed") ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {adminGeoFormError(mutationError, "Work-site action failed")}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {loading ? (
            <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
              Loading work sites...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
              No work sites yet.
            </div>
          ) : (
            items.map((site) => (
              <button
                key={site.id}
                type="button"
                onClick={() => onSelectedIdChange(site.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition",
                  selectedId === site.id ? "border-primary bg-primary-soft" : "hover:bg-muted/60",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{site.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {site.siteCode} · {site.siteType} · {site.timezone}
                  </span>
                </span>
                <Badge variant={site.isActive ? "default" : "outline"}>
                  {site.isActive ? "Active" : "Inactive"}
                </Badge>
              </button>
            ))
          )}
        </div>

        {selected && !activeForm ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => beginEdit(selected)}>
              <MapPin className="h-4 w-4" />
              Edit site
            </Button>
            <ConfirmDialog
              title="Deactivate work site?"
              description="The site will be hidden from admin geo lists, but historical geofence records stay intact."
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
              <Field label="Site code" error={adminGeoFieldError(mutation.error, "siteCode")}>
                <Input
                  value={form.siteCode}
                  onChange={(event) => setForm({ ...form, siteCode: event.target.value })}
                  placeholder="BLR-HQ"
                />
              </Field>
              <Field label="Name" error={adminGeoFieldError(mutation.error, "name")}>
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Bengaluru HQ"
                />
              </Field>
              <Field label="Site type" error={adminGeoFieldError(mutation.error, "siteType")}>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.siteType}
                  onChange={(event) => setForm({ ...form, siteType: event.target.value })}
                >
                  {siteTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Timezone" error={adminGeoFieldError(mutation.error, "timezone")}>
                <Input
                  value={form.timezone}
                  onChange={(event) => setForm({ ...form, timezone: event.target.value })}
                  placeholder="Asia/Kolkata"
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
