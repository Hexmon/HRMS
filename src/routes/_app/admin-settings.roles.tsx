import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useAdminSettings,
  PERMISSION_GROUPS,
  PERMISSION_ACTIONS,
  type PermissionAction,
  type PermissionGroup,
} from "@/lib/admin-settings-store";
import { ChevronLeft, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin-settings/roles")({ component: RolesScreen });

function RolesScreen() {
  const { roles, togglePermission, toggleAllForGroup, updateRoleMeta } = useAdminSettings();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = roles.find((r) => r.key === activeKey) ?? null;

  if (active) {
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
                value={active.label}
                onChange={(e) => updateRoleMeta(active.key, { label: e.target.value })}
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
                value={active.description}
                onChange={(e) => updateRoleMeta(active.key, { description: e.target.value })}
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
                  const allOn = PERMISSION_ACTIONS.every((a) => active.matrix[g][a]);
                  return (
                    <tr key={g} className="border-b last:border-0 hover:bg-accent/40">
                      <td className="px-4 py-2.5 font-medium">{g}</td>
                      {PERMISSION_ACTIONS.map((a) => (
                        <td key={a} className="px-3 py-2.5 text-center">
                          <Checkbox
                            checked={!!active.matrix[g][a]}
                            onCheckedChange={() =>
                              togglePermission(
                                active.key,
                                g as PermissionGroup,
                                a as PermissionAction,
                              )
                            }
                            disabled={active.key === "main_admin"}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-center">
                        <Checkbox
                          checked={allOn}
                          onCheckedChange={(v) =>
                            toggleAllForGroup(active.key, g as PermissionGroup, !!v)
                          }
                          disabled={active.key === "main_admin"}
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
              onClick={() => {
                toast.success("Role permissions saved");
                setActiveKey(null);
              }}
            >
              Save & close
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {roles.map((r) => {
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
                r.key === "main_admin" && "border-primary/40 bg-primary-soft/20",
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
  );
}
