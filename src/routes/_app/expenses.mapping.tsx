import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useExpenses, type ReviewerMapping } from "@/lib/expenses-store";
import { DataTable, type Column } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DrawerForm } from "@/components/ui-kit";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/expenses/mapping")({ component: ReviewerMappingScreen });

function ReviewerMappingScreen() {
  const { mappings, setMappingActive, addMapping } = useExpenses();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<ReviewerMapping, "id">>({ employee: "", reviewer: "", department: "", effectiveFrom: new Date().toISOString().slice(0, 10), active: true });

  const cols: Column<ReviewerMapping>[] = [
    { key: "emp", header: "Employee", render: (r) => <span className="font-medium">{r.employee}</span> },
    { key: "dept", header: "Department", render: (r) => <span className="text-sm text-muted-foreground">{r.department}</span> },
    { key: "rev", header: "Reviewer", render: (r) => <span className="text-sm">{r.reviewer}</span> },
    { key: "eff", header: "Effective from", render: (r) => <span className="text-xs text-muted-foreground">{r.effectiveFrom}</span> },
    { key: "act", header: "Active", render: (r) => <Switch checked={r.active} onCheckedChange={(v) => setMappingActive(r.id, v)} /> },
  ];

  return (
    <>
      <DataTable
        columns={cols} rows={mappings} searchKeys={["employee", "reviewer", "department"]}
        toolbarRight={<Button className="rounded-full" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add mapping</Button>}
      />
      <DrawerForm open={open} onOpenChange={setOpen} title="Add reviewer mapping" description="Assign an expense reviewer to an employee."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => {
            if (!form.employee || !form.reviewer) { toast.error("Employee and reviewer required."); return; }
            if (form.employee === form.reviewer) { toast.error("Self-approval not allowed — employee and reviewer must differ."); return; }
            addMapping(form); toast.success("Mapping added"); setOpen(false);
            setForm({ employee: "", reviewer: "", department: "", effectiveFrom: new Date().toISOString().slice(0, 10), active: true });
          }}>Save</Button></>}
      >
        <div className="space-y-4">
          <div><Label>Employee</Label><Input value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })} /></div>
          <div><Label>Reviewer</Label><Input value={form.reviewer} onChange={(e) => setForm({ ...form, reviewer: e.target.value })} /></div>
          <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
          <div><Label>Effective from</Label><Input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></div>
          <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /> Active</div>
          <p className="rounded-lg bg-info/10 p-3 text-xs text-info">Self-approval is blocked at the workflow layer; this screen only manages assignments.</p>
        </div>
      </DrawerForm>
    </>
  );
}
