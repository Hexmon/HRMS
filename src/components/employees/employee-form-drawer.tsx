import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DrawerForm } from "@/components/ui-kit";
import { DEPARTMENTS } from "@/lib/mock/departments";
import { DESIGNATIONS } from "@/lib/mock/designations";
import {
  type Employee,
  type EmployeeStatus,
  type EmploymentType,
} from "@/lib/mock/employees";
import { nextEmployeeId, useEmployees } from "@/lib/employees-store";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Employee | null;
}

const EMPTY: Omit<Employee, "id"> = {
  name: "",
  email: "",
  phone: "",
  designation: "Software Engineer",
  department: "Engineering",
  manager: "Sara Iqbal",
  location: "",
  status: "active",
  employmentType: "full_time",
  joinedAt: new Date().toISOString().slice(0, 10),
  avatarTone: "primary",
};

export function EmployeeFormDrawer({ open, onOpenChange, initial }: Props) {
  const { employees, upsert } = useEmployees();
  const [form, setForm] = useState<Omit<Employee, "id">>(EMPTY);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setError("");
      setForm(initial ? { ...initial } : EMPTY);
    }
  }, [open, initial]);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name || !form.email || !form.location) {
      setError("Please fill in name, email and location.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Enter a valid email.");
      return;
    }
    const id = initial?.id ?? nextEmployeeId(employees);
    upsert({ id, ...form });
    toast.success(initial ? "Employee updated" : "Employee added", {
      description: `${form.name} • ${form.designation}`,
    });
    onOpenChange(false);
  };

  return (
    <DrawerForm
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit employee" : "Add employee"}
      description={initial ? "Update job, department or contact info." : "Create a new employee profile."}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-full text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
            onClick={handleSave}
          >
            {initial ? "Save changes" : "Add employee"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Full name" id="name" value={form.name} onChange={(v) => update("name", v)} required />
          <Field label="Email" id="email" type="email" value={form.email} onChange={(v) => update("email", v)} required />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone" id="phone" value={form.phone} onChange={(v) => update("phone", v)} />
          <Field label="Location" id="location" value={form.location} onChange={(v) => update("location", v)} required />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField
            label="Department"
            value={form.department}
            onChange={(v) => update("department", v)}
            options={DEPARTMENTS.map((d) => d.name)}
          />
          <SelectField
            label="Designation"
            value={form.designation}
            onChange={(v) => update("designation", v)}
            options={Array.from(new Set(DESIGNATIONS.map((d) => d.title)))}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Reporting manager" id="manager" value={form.manager} onChange={(v) => update("manager", v)} />
          <Field label="Joined on" id="joinedAt" type="date" value={form.joinedAt} onChange={(v) => update("joinedAt", v)} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField
            label="Employment type"
            value={form.employmentType}
            onChange={(v) => update("employmentType", v as EmploymentType)}
            options={[
              { value: "full_time", label: "Full-time" },
              { value: "part_time", label: "Part-time" },
              { value: "contract", label: "Contract" },
              { value: "intern", label: "Intern" },
            ]}
          />
          <SelectField
            label="Status"
            value={form.status}
            onChange={(v) => update("status", v as EmployeeStatus)}
            options={[
              { value: "active", label: "Active" },
              { value: "on_leave", label: "On leave" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </div>

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </DrawerForm>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

type Opt = string | { value: string; label: string };

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Opt[];
}) {
  const norm = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {norm.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
