import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui-kit";
import {
  useAdminSettings,
  PERMISSION_GROUPS,
  PERMISSION_ACTIONS,
  type PermissionAction,
  type PermissionGroup,
  type RoleConfig,
} from "@/lib/admin-settings-store";
import { toastApiError, useApiRouteEnabled } from "@/shared/api";
import {
  useCreateRbacRoleMutation,
  useRbacPermissions,
  useRbacRoles,
  useReplaceRbacRolePermissionsMutation,
  useUpdateRbacRoleMutation,
} from "@/domains/admin/queries";
import type { RbacRoleRecord } from "@/domains/admin/api";
import { ChevronLeft, Plus, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin-settings/roles")({ component: RolesScreen });

type PermissionMatrix = RoleConfig["matrix"];
type ScreenRole = RoleConfig & {
  id?: string;
  version?: number;
  status?: "active" | "inactive";
  protectedSystemRole?: boolean;
};

function RolesScreen() {
  const { roles, togglePermission, toggleAllForGroup, updateRoleMeta } = useAdminSettings();
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const rbacRoles = useRbacRoles(apiEnabled);
  const rbacPermissions = useRbacPermissions(apiEnabled);
  const createRole = useCreateRbacRoleMutation();
  const updateRole = useUpdateRbacRoleMutation();
  const replacePermissions = useReplaceRbacRolePermissionsMutation();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", key: "", description: "" });
  const [draftMeta, setDraftMeta] = useState({ label: "", description: "" });
  const [draftMatrix, setDraftMatrix] = useState<PermissionMatrix>(() => emptyMatrix());

  const apiRoles = useMemo<ScreenRole[]>(
    () => (rbacRoles.data?.items ?? []).map(roleFromApi),
    [rbacRoles.data?.items],
  );
  const localRoles = useMemo<ScreenRole[]>(
    () =>
      roles.map((role) => ({
        ...role,
        protectedSystemRole: role.key === "main_admin",
      })),
    [roles],
  );
  const screenRoles = apiEnabled ? apiRoles : localRoles;
  const active = screenRoles.find((r) => r.key === activeKey) ?? null;
  const activeMatrix = apiEnabled ? draftMatrix : active?.matrix;
  const activeLabel = apiEnabled ? draftMeta.label : active?.label;
  const activeDescription = apiEnabled ? draftMeta.description : active?.description;
  const isSaving = updateRole.isPending || replacePermissions.isPending || createRole.isPending;

  useEffect(() => {
    if (!active) return;
    setDraftMeta({ label: active.label, description: active.description });
    setDraftMatrix(cloneMatrix(active.matrix));
  }, [active]);

  async function onSaveRole() {
    if (!active) return;

    if (!apiEnabled) {
      toast.success("Role permissions saved");
      setActiveKey(null);
      return;
    }

    if (!active.id || !active.version) {
      toast.error("Role metadata is missing from the backend response");
      return;
    }

    try {
      let expectedVersion = active.version;
      const nameChanged = draftMeta.label.trim() !== active.label;
      const descriptionChanged = draftMeta.description.trim() !== active.description;
      if (nameChanged || descriptionChanged) {
        const response = await updateRole.mutateAsync({
          id: active.id,
          input: {
            name: draftMeta.label.trim(),
            description: draftMeta.description.trim(),
            expected_version: expectedVersion,
          },
        });
        expectedVersion = response.version;
      }

      if (!active.protectedSystemRole) {
        await replacePermissions.mutateAsync({
          id: active.id,
          input: {
            permission_ids: matrixPermissionIds(draftMatrix),
            expected_version: expectedVersion,
            remarks: "Updated from Admin Settings roles screen.",
          },
        });
      }

      toast.success("Role permissions saved");
      setActiveKey(null);
    } catch (error) {
      toastApiError(error, "Role update failed");
    }
  }

  async function onCreateRole() {
    const name = newRole.name.trim();
    if (!name) {
      toast.error("Role name is required");
      return;
    }

    try {
      const response = await createRole.mutateAsync({
        role_key: newRole.key.trim() || undefined,
        name,
        description: newRole.description.trim(),
        permission_ids: [],
      });
      toast.success("Role created");
      setCreateOpen(false);
      setNewRole({ name: "", key: "", description: "" });
      setActiveKey(response.role.key);
    } catch (error) {
      toastApiError(error, "Role creation failed");
    }
  }

  function onTogglePermission(group: PermissionGroup, action: PermissionAction) {
    if (!active) return;
    if (!apiEnabled) {
      togglePermission(active.key, group, action);
      return;
    }
    if (active.protectedSystemRole) return;
    setDraftMatrix((current) => ({
      ...current,
      [group]: {
        ...current[group],
        [action]: !current[group][action],
      },
    }));
  }

  function onToggleAllForGroup(group: PermissionGroup, checked: boolean) {
    if (!active) return;
    if (!apiEnabled) {
      toggleAllForGroup(active.key, group, checked);
      return;
    }
    if (active.protectedSystemRole) return;
    setDraftMatrix((current) => ({
      ...current,
      [group]: Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, checked])) as Partial<
        Record<PermissionAction, boolean>
      >,
    }));
  }

  if (active && activeMatrix) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setActiveKey(null)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back to roles
        </Button>

        <Card className="rounded-2xl border-border/60 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Role name</label>
              <Input
                value={activeLabel ?? ""}
                onChange={(e) => {
                  if (apiEnabled)
                    setDraftMeta((current) => ({ ...current, label: e.target.value }));
                  else updateRoleMeta(active.key, { label: e.target.value });
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">Assigned users</p>
                <p className="text-2xl font-semibold">{active.assignedUsers}</p>
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                rows={2}
                value={activeDescription ?? ""}
                onChange={(e) => {
                  if (apiEnabled)
                    setDraftMeta((current) => ({ ...current, description: e.target.value }));
                  else updateRoleMeta(active.key, { description: e.target.value });
                }}
              />
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl border-border/60 p-0">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <p className="text-sm font-semibold">Permission matrix</p>
              <p className="text-xs text-muted-foreground">
                Toggle granular access by module and action.
              </p>
              {apiEnabled && active.protectedSystemRole && (
                <p className="mt-1 text-xs text-muted-foreground">
                  System Admin permissions are protected by backend policy.
                </p>
              )}
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">
              {active.key}
            </Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Module</th>
                  {PERMISSION_ACTIONS.map((a) => (
                    <th key={a} className="px-3 py-2.5 text-center font-semibold capitalize">
                      {a}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center font-semibold">All</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSION_GROUPS.map((g) => {
                  const allOn = PERMISSION_ACTIONS.every((a) => activeMatrix[g][a]);
                  return (
                    <tr key={g} className="border-b last:border-0 hover:bg-accent/40">
                      <td className="px-4 py-2.5 font-medium">{g}</td>
                      {PERMISSION_ACTIONS.map((a) => (
                        <td key={a} className="px-3 py-2.5 text-center">
                          <Checkbox
                            checked={!!activeMatrix[g][a]}
                            onCheckedChange={() => onTogglePermission(g, a)}
                            disabled={active.protectedSystemRole || active.key === "main_admin"}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-center">
                        <Checkbox
                          checked={allOn}
                          onCheckedChange={(v) => onToggleAllForGroup(g, !!v)}
                          disabled={active.protectedSystemRole || active.key === "main_admin"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2 border-t p-4">
            <Button variant="ghost" onClick={() => setActiveKey(null)}>
              Done
            </Button>
            <Button
              style={{ background: "var(--gradient-primary)" }}
              className="text-primary-foreground"
              onClick={() => void onSaveRole()}
              disabled={isSaving}
            >
              Save & close
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const loading = apiEnabled && (rbacRoles.isLoading || rbacPermissions.isLoading);
  const error =
    apiEnabled &&
    (rbacRoles.error instanceof Error
      ? rbacRoles.error
      : rbacPermissions.error instanceof Error
        ? rbacPermissions.error
        : null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Roles and permissions</p>
          <p className="text-xs text-muted-foreground">
            {apiEnabled
              ? `${screenRoles.length} backend role${screenRoles.length === 1 ? "" : "s"} · ${
                  rbacPermissions.data?.items.length ?? 0
                } permissions`
              : `${screenRoles.length} local role${screenRoles.length === 1 ? "" : "s"}`}
          </p>
          {error && <p className="mt-1 text-xs text-destructive">{error.message}</p>}
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          disabled={apiEnabled ? loading || createRole.isPending : true}
        >
          <Plus className="mr-1 h-4 w-4" /> Add role
        </Button>
      </div>

      {loading ? (
        <Card className="rounded-2xl border-border/60 p-6 text-sm text-muted-foreground">
          Loading roles and permission catalog...
        </Card>
      ) : error ? (
        <Card className="rounded-2xl border-border/60 p-6 text-sm text-destructive">
          {error.message}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {screenRoles.map((r) => {
            const enabled = PERMISSION_GROUPS.reduce(
              (acc, g) => acc + PERMISSION_ACTIONS.filter((a) => r.matrix[g][a]).length,
              0,
            );
            const total = PERMISSION_GROUPS.length * PERMISSION_ACTIONS.length;
            const pct = Math.round((enabled / total) * 100);
            return (
              <button key={r.key} onClick={() => setActiveKey(r.key)} className="text-left">
                <Card
                  className={cn(
                    "h-full rounded-2xl border-border/60 p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
                    (r.protectedSystemRole || r.key === "main_admin") &&
                      "border-primary/40 bg-primary-soft/20",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
                        <ShieldCheck className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{r.label}</p>
                        <p className="text-[11px] font-mono text-muted-foreground">{r.key}</p>
                      </div>
                    </div>
                    {r.builtin && (
                      <Badge variant="outline" className="text-[10px]">
                        Built-in
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      <span className="font-semibold text-foreground">{r.assignedUsers}</span> users
                    </span>
                    <span className="text-muted-foreground">
                      <span className="font-semibold text-foreground">{pct}%</span> permissions
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add role"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void onCreateRole()}
              disabled={createRole.isPending}
              style={{ background: "var(--gradient-primary)" }}
              className="text-primary-foreground"
            >
              Add role
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Role name</label>
            <Input
              value={newRole.name}
              onChange={(e) => setNewRole((current) => ({ ...current, name: e.target.value }))}
              placeholder="e.g. Payroll Coordinator"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Role key (optional)</label>
            <Input
              value={newRole.key}
              onChange={(e) => setNewRole((current) => ({ ...current, key: e.target.value }))}
              placeholder="Defaults to role name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              rows={2}
              value={newRole.description}
              onChange={(e) =>
                setNewRole((current) => ({ ...current, description: e.target.value }))
              }
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function roleFromApi(role: RbacRoleRecord): ScreenRole {
  return {
    id: role.id,
    key: role.key || role.role_key,
    label: role.label || role.name,
    description: role.description,
    builtin: role.builtin,
    assignedUsers: role.assigned_users,
    matrix: matrixFromPermissionIds(role.permission_ids ?? role.permissions ?? []),
    version: role.version,
    status: role.status,
    protectedSystemRole: role.protected_system_role,
  };
}

function emptyMatrix(): PermissionMatrix {
  const matrix = {} as PermissionMatrix;
  for (const group of PERMISSION_GROUPS) matrix[group] = {};
  return matrix;
}

function cloneMatrix(source: PermissionMatrix): PermissionMatrix {
  const matrix = emptyMatrix();
  for (const group of PERMISSION_GROUPS) {
    matrix[group] = { ...source[group] };
  }
  return matrix;
}

function matrixFromPermissionIds(permissionIds: readonly string[]): PermissionMatrix {
  const matrix = emptyMatrix();
  const selected = new Set(permissionIds);
  for (const group of PERMISSION_GROUPS) {
    for (const action of PERMISSION_ACTIONS) {
      matrix[group][action] = selected.has(permissionId(group, action));
    }
  }
  return matrix;
}

function matrixPermissionIds(matrix: PermissionMatrix): string[] {
  const ids: string[] = [];
  for (const group of PERMISSION_GROUPS) {
    for (const action of PERMISSION_ACTIONS) {
      if (matrix[group][action]) ids.push(permissionId(group, action));
    }
  }
  return ids.sort();
}

function permissionId(group: string, action: string): string {
  return `${group
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}:${action}`;
}
