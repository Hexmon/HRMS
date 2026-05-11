import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { DataCard } from "@/components/ui-kit";
import { Modal } from "@/components/ui-kit";
import { User, Phone, MapPin, Briefcase, AlertTriangle, Edit3 } from "lucide-react";

export const Route = createFileRoute("/_app/ems/profile")({
  component: MyProfile,
});

interface Field { label: string; value: string; }

function Section({ title, icon: Icon, fields }: { title: string; icon: any; fields: Field[] }) {
  return (
    <DataCard title={title} actions={<Icon className="h-4 w-4 text-primary" />}>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.label}>
            <dt className="text-xs font-medium text-muted-foreground">{f.label}</dt>
            <dd className="mt-0.5 text-sm font-medium">{f.value}</dd>
          </div>
        ))}
      </dl>
    </DataCard>
  );
}

function MyProfile() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState("");
  const [val, setVal] = useState("");

  if (!user) return null;

  const submit = () => {
    if (!field) return;
    toast.success("Profile update request sent to HR for approval");
    setOpen(false);
    setField("");
    setVal("");
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Profile changes require HR approval before they go live.</p>
        <Button onClick={() => setOpen(true)} className="rounded-full" size="sm">
          <Edit3 className="mr-2 h-4 w-4" /> Request profile update
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          title="Basic information"
          icon={User}
          fields={[
            { label: "Full name", value: user.name },
            { label: "Employee ID", value: "HK-00821" },
            { label: "Date of birth", value: "12 Aug 1992" },
            { label: "Gender", value: "Female" },
            { label: "Marital status", value: "Married" },
            { label: "Nationality", value: "Indian" },
          ]}
        />
        <Section
          title="Contact information"
          icon={Phone}
          fields={[
            { label: "Work email", value: user.email },
            { label: "Personal email", value: "personal@example.com" },
            { label: "Phone", value: "+91 98xxx xxxxx" },
            { label: "Alternate", value: "+91 91xxx xxxxx" },
          ]}
        />
        <Section
          title="Emergency contact"
          icon={AlertTriangle}
          fields={[
            { label: "Name", value: "Rohit Sharma" },
            { label: "Relation", value: "Spouse" },
            { label: "Phone", value: "+91 99xxx xxxxx" },
            { label: "Email", value: "rohit@example.com" },
          ]}
        />
        <Section
          title="Address"
          icon={MapPin}
          fields={[
            { label: "Current address", value: "12 Indiranagar, Bangalore 560038" },
            { label: "Permanent address", value: "44 Banjara Hills, Hyderabad 500034" },
            { label: "City", value: "Bangalore" },
            { label: "Country", value: "India" },
          ]}
        />
        <Section
          title="Job information"
          icon={Briefcase}
          fields={[
            { label: "Designation", value: user.designation },
            { label: "Department", value: user.department },
            { label: "Employment type", value: "Full time" },
            { label: "Work mode", value: "Hybrid" },
            { label: "Date of joining", value: "14 Mar 2022" },
            { label: "Confirmation date", value: "14 Sep 2022" },
          ]}
        />
        <Section
          title="Reporting structure"
          icon={User}
          fields={[
            { label: "Reporting manager", value: "Ananya Iyer" },
            { label: "Manager email", value: "ananya@hawkaii.app" },
            { label: "Skip-level", value: "Vikram Reddy" },
            { label: "HR business partner", value: "Priya Verma" },
          ]}
        />
      </div>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Request profile update"
        description="HR Admin will review and approve this change."
        footer={
          <>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="rounded-full" onClick={submit}>Submit request</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="field">Field to update</Label>
            <Input id="field" value={field} onChange={(e) => setField(e.target.value)} placeholder="e.g. Current address" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="val">New value</Label>
            <Input id="val" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Enter the new value" className="mt-1" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
