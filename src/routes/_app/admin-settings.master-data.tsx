import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DataTable, type Column, ActionButton, Modal } from "@/components/ui-kit";
import { useAdminSettings, MASTER_LABELS, type MasterKey, type MasterRow } from "@/lib/admin-settings-store";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin-settings/master-data")({ component: MasterDataScreen });

const KEYS: MasterKey[] = [
  "departments", "designations", "employmentTypes", "workLocations", "shifts",
  "leaveTypes", "expenseCategories", "assetCategories", "helpdeskCategories", "projectRoles",
];

function MasterDataScreen() {
  const { masters, addMaster, updateMaster, toggleMasterActive, deleteMaster } = useAdminSettings();
  const [activeKey, setActiveKey] = useState<MasterKey>("departments");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const startAdd = () => { setEditing(null); setForm({ name: "", description: "" }); setOpen(true); };
  const startEdit = (row: MasterRow) => { setEditing(row); setForm({ name: row.name, description: row.description ?? "" }); setOpen(true); };

  const onSave = () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (editing) {
      updateMaster(activeKey, editing.id, { name: form.name, description: form.description });
      toast.success(`${MASTER_LABELS[activeKey].replace(/s$/, "")} updated`);
    } else {
      addMaster(activeKey, form.name, form.description);
      toast.success(`Added to ${MASTER_LABELS[activeKey]}`);
    }
    setOpen(false);
  };

  const columns = (key: MasterKey): Column<MasterRow>[] => [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.id}</span> },
    { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "meta", header: "Details", render: (r) => <span className="text-sm text-muted-foreground">{r.meta ?? r.description ?? "—"}</span> },
    {
      key: "active", header: "Status", render: (r) => (
        <div className="flex items-center gap-2">
          <Switch checked={r.active} onCheckedChange={() => toggleMasterActive(key, r.id)} />
          <span className="text-xs">{r.active ? "Active" : "Inactive"}</span>
        </div>
      ),
    },
  ];

  return (
    <Tabs value={activeKey} onValueChange={(v) => setActiveKey(v as MasterKey)}>
      <TabsList className="h-auto flex-wrap">
        {KEYS.map((k) => <TabsTrigger key={k} value={k}>{MASTER_LABELS[k]}</TabsTrigger>)}
      </TabsList>

      {KEYS.map((k) => (
        <TabsContent key={k} value={k} className="mt-4">
          <Card className="rounded-2xl border-border/60 p-0">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <p className="text-sm font-semibold">{MASTER_LABELS[k]}</p>
                <p className="text-xs text-muted-foreground">{masters[k].length} record{masters[k].length === 1 ? "" : "s"}</p>
              </div>
              <ActionButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={startAdd}>Add</ActionButton>
            </div>
            <DataTable
              columns={columns(k)}
              rows={masters[k]}
              searchKeys={["name", "id", "meta", "description"]}
              rowActions={(row) => [
                { label: "Edit", onClick: () => startEdit(row) },
                { label: row.active ? "Deactivate" : "Activate", onClick: () => toggleMasterActive(k, row.id) },
                { label: "Delete", tone: "destructive", onClick: () => { deleteMaster(k, row.id); toast.success("Deleted"); } },
              ]}
              emptyTitle={`No ${MASTER_LABELS[k].toLowerCase()} yet`}
            />
          </Card>
        </TabsContent>
      ))}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? `Edit ${MASTER_LABELS[activeKey].replace(/s$/, "")}` : `Add ${MASTER_LABELS[activeKey].replace(/s$/, "")}`}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={onSave} style={{ background: "var(--gradient-primary)" }} className="text-primary-foreground">
              {editing ? "Save changes" : "Add"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Engineering" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description" />
          </div>
          {editing && (
            <button
              onClick={() => { deleteMaster(activeKey, editing.id); toast.success("Deleted"); setOpen(false); }}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-destructive hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete this record
            </button>
          )}
        </div>
      </Modal>
    </Tabs>
  );
}
