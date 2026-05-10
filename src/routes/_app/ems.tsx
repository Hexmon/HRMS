import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { Briefcase, Mail, MapPin, Calendar, Phone, Award } from "lucide-react";

export const Route = createFileRoute("/_app/ems")({
  component: MySpacePage,
});

function MySpacePage() {
  const { user, activeRole } = useAuth();
  if (!user) return null;
  const initials = user.name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  const quick = [
    { label: "Leave balance", value: "12 days" },
    { label: "Pending timesheet", value: "1 week" },
    { label: "Open tickets", value: "0" },
    { label: "Assets assigned", value: "3" },
  ];

  return (
    <>
      <PageHeader title="My space" description="Your personal employee self-service hub." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border-border/60 lg:col-span-1">
          <div className="p-6 text-center" style={{ background: "var(--gradient-hero)" }}>
            <Avatar className="mx-auto h-20 w-20 ring-4 ring-background">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <h3 className="mt-3 text-lg font-semibold">{user.name}</h3>
            <p className="text-xs text-muted-foreground">{user.designation}</p>
            <span className="mt-3 inline-flex rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground">
              {activeRole && ROLE_LABELS[activeRole]}
            </span>
          </div>
          <ul className="space-y-3 p-6 text-sm">
            <li className="flex items-center gap-2.5 text-muted-foreground"><Mail className="h-4 w-4" /> {user.email}</li>
            <li className="flex items-center gap-2.5 text-muted-foreground"><Briefcase className="h-4 w-4" /> {user.department}</li>
            <li className="flex items-center gap-2.5 text-muted-foreground"><MapPin className="h-4 w-4" /> Bangalore, IN</li>
            <li className="flex items-center gap-2.5 text-muted-foreground"><Phone className="h-4 w-4" /> +91 98xxx xxxxx</li>
            <li className="flex items-center gap-2.5 text-muted-foreground"><Calendar className="h-4 w-4" /> Joined Mar 2022</li>
          </ul>
          <div className="border-t p-4">
            <Button variant="outline" className="w-full rounded-full">Edit profile</Button>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quick.map((q) => (
              <Card key={q.label} className="rounded-2xl p-4">
                <p className="text-xs text-muted-foreground">{q.label}</p>
                <p className="mt-1 text-xl font-semibold">{q.value}</p>
              </Card>
            ))}
          </div>

          <Card className="rounded-2xl border-border/60 p-6">
            <h3 className="text-sm font-semibold">Recent activity</h3>
            <ul className="mt-4 space-y-4">
              {[
                { icon: Award, label: "Goal completed", desc: "Q1 Performance review submitted to manager.", time: "2 days ago" },
                { icon: Calendar, label: "Leave approved", desc: "Earned leave from 12 → 14 May approved.", time: "5 days ago" },
                { icon: Briefcase, label: "Assigned to project", desc: "Atlas Payments Platform — Senior Engineer role.", time: "1 week ago" },
              ].map((a, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
                    <a.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{a.label}</p>
                    <p className="text-xs text-muted-foreground">{a.desc}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{a.time}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
