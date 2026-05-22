import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { DataCard, EmptyState, StatusBadge } from "@/components/ui-kit";
import { Modal } from "@/components/ui-kit";
import {
  mapProfile,
  mapProfileChange,
  useEmsProfile,
  useEmsProfileChangeMutation,
  useMyProfileChanges,
} from "@/domains/ems";
import { asRecord, pageItems, text, useApiRouteEnabled } from "@/shared/api";
import {
  User,
  Phone,
  MapPin,
  Briefcase,
  AlertTriangle,
  Edit3,
  Inbox,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/_app/ems/profile")({
  component: MyProfile,
});

interface Field {
  label: string;
  value: string;
}

const PROFILE_FIELDS = [
  { key: "personal_email", label: "Personal email" },
  { key: "phone", label: "Phone" },
  { key: "alternate_phone", label: "Alternate phone" },
  { key: "current_address", label: "Current address" },
  { key: "permanent_address", label: "Permanent address" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
] as const;

function Section({
  title,
  icon: Icon,
  fields,
}: {
  title: string;
  icon: LucideIcon;
  fields: Field[];
}) {
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
  const apiEnabled = useApiRouteEnabled(["/ems"]);
  const profileQuery = useEmsProfile(apiEnabled);
  const changesQuery = useMyProfileChanges({ page: 1, page_size: 10 }, apiEnabled);
  const changeMutation = useEmsProfileChangeMutation();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<(typeof PROFILE_FIELDS)[number]["key"]>("current_address");
  const [val, setVal] = useState("");
  const [reason, setReason] = useState("");

  if (!user) return null;

  const submit = () => {
    if (!field || !val.trim()) return toast.error("Field and new value are required");
    if (!apiEnabled) {
      toast.success("Profile update request sent to HR for approval");
      setOpen(false);
      setVal("");
      setReason("");
      return;
    }
    changeMutation.mutate(
      {
        field_key: field,
        field_label: PROFILE_FIELDS.find((item) => item.key === field)?.label,
        new_value: val,
        reason: reason || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Profile update request sent to HR for approval");
          setOpen(false);
          setVal("");
          setReason("");
        },
        onError: () => toast.error("Profile update request could not be submitted."),
      },
    );
  };

  const fallback = {
    user: { id: user.id, fullName: user.name, employeeCode: "HK-00821", email: user.email },
    manager: {
      id: "manager",
      employeeCode: "MGR",
      fullName: "Ananya Iyer",
      email: "ananya@hawkaii.app",
    },
    department: user.department,
    designation: user.designation,
    joinedOn: "2022-03-14",
    employmentStatus: "active",
    personalEmail: "personal@example.com",
    phone: "+91 98xxx xxxxx",
    alternatePhone: "+91 91xxx xxxxx",
    currentAddress: "12 Indiranagar, Bangalore 560038",
    permanentAddress: "44 Banjara Hills, Hyderabad 500034",
    city: "Bangalore",
    country: "India",
    emergencyContact: {
      name: "Rohit Sharma",
      relation: "Spouse",
      phone: "+91 99xxx xxxxx",
      email: "rohit@example.com",
    },
    personalDetails: {
      date_of_birth: "12 Aug 1992",
      gender: "Female",
      marital_status: "Married",
      nationality: "Indian",
    },
    workPreferences: {
      employment_type: "Full time",
      work_mode: "Hybrid",
      confirmation_date: "14 Sep 2022",
    },
    version: 1,
    summaries: {},
  };
  const apiProfile = profileQuery.data ? mapProfile(profileQuery.data) : null;
  const profile = apiEnabled ? apiProfile : fallback;
  if (apiEnabled && profileQuery.isLoading) {
    return (
      <div className="space-y-4 pt-4">
        <DataCard title="My profile">
          <p className="text-sm text-muted-foreground">Loading profile from backend...</p>
        </DataCard>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="space-y-4 pt-4">
        <EmptyState
          icon={Inbox}
          title="Profile could not be loaded"
          description="The backend profile API returned an error."
        />
      </div>
    );
  }
  const emergency = asRecord(profile.emergencyContact);
  const personal = asRecord(profile.personalDetails);
  const preferences = asRecord(profile.workPreferences);
  const pendingChanges = apiEnabled ? pageItems(changesQuery.data).map(mapProfileChange) : [];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Profile changes require HR approval before they go live.
        </p>
        <Button onClick={() => setOpen(true)} className="rounded-full" size="sm">
          <Edit3 className="mr-2 h-4 w-4" /> Request profile update
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          title="Basic information"
          icon={User}
          fields={[
            { label: "Full name", value: profile.user.fullName },
            { label: "Employee ID", value: profile.user.employeeCode },
            { label: "Date of birth", value: text(personal.date_of_birth, "—") },
            { label: "Gender", value: text(personal.gender, "—") },
            { label: "Marital status", value: text(personal.marital_status, "—") },
            { label: "Nationality", value: text(personal.nationality, "—") },
          ]}
        />
        <Section
          title="Contact information"
          icon={Phone}
          fields={[
            { label: "Work email", value: profile.user.email },
            { label: "Personal email", value: profile.personalEmail },
            { label: "Phone", value: profile.phone },
            { label: "Alternate", value: profile.alternatePhone },
          ]}
        />
        <Section
          title="Emergency contact"
          icon={AlertTriangle}
          fields={[
            { label: "Name", value: text(emergency.name, "—") },
            {
              label: "Relation",
              value: text(emergency.relation, text(emergency.relationship, "—")),
            },
            { label: "Phone", value: text(emergency.phone, "—") },
            { label: "Email", value: text(emergency.email, "—") },
          ]}
        />
        <Section
          title="Address"
          icon={MapPin}
          fields={[
            { label: "Current address", value: profile.currentAddress },
            { label: "Permanent address", value: profile.permanentAddress },
            { label: "City", value: profile.city },
            { label: "Country", value: profile.country },
          ]}
        />
        <Section
          title="Job information"
          icon={Briefcase}
          fields={[
            { label: "Designation", value: profile.designation },
            { label: "Department", value: profile.department },
            { label: "Employment type", value: text(preferences.employment_type, "—") },
            { label: "Work mode", value: text(preferences.work_mode, "—") },
            { label: "Date of joining", value: profile.joinedOn || "—" },
            { label: "Confirmation date", value: text(preferences.confirmation_date, "—") },
          ]}
        />
        <Section
          title="Reporting structure"
          icon={User}
          fields={[
            { label: "Reporting manager", value: profile.manager?.fullName ?? "—" },
            { label: "Manager email", value: profile.manager?.email ?? "—" },
            { label: "Skip-level", value: "Vikram Reddy" },
            { label: "HR business partner", value: "Priya Verma" },
          ]}
        />
      </div>

      {apiEnabled ? (
        <DataCard title="My profile update requests" description="Latest HR review activity">
          {changesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading profile requests...</p>
          ) : pendingChanges.length === 0 ? (
            <EmptyState
              title="No profile requests"
              description="Submitted changes will appear here."
            />
          ) : (
            <div className="space-y-2">
              {pendingChanges.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{request.field}</p>
                    <p className="text-xs text-muted-foreground">
                      {request.oldValue} → {request.newValue}
                    </p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
              ))}
            </div>
          )}
        </DataCard>
      ) : null}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Request profile update"
        description="HR Admin will review and approve this change."
        footer={
          <>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={submit} disabled={changeMutation.isPending}>
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="field">Field to update</Label>
            <Select value={field} onValueChange={(value) => setField(value as typeof field)}>
              <SelectTrigger id="field" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROFILE_FIELDS.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="val">New value</Label>
            <Input
              id="val"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder="Enter the new value"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional context for HR"
              className="mt-1"
              rows={3}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
