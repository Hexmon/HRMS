import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui-kit";
import { toast } from "sonner";
import { FileSignature, Download, Send, Eye } from "lucide-react";

export const Route = createFileRoute("/_app/ems/letters")({
  component: MyLetters,
});

interface Letter {
  id: string;
  name: string;
  description: string;
  status: "available" | "request" | "in_progress";
  issuedOn?: string;
}

const LETTERS: Letter[] = [
  { id: "L1", name: "Offer Letter", description: "Initial offer from Hawkaii", status: "available", issuedOn: "01 Mar 2022" },
  { id: "L2", name: "Appointment Letter", description: "Joining confirmation letter", status: "available", issuedOn: "14 Mar 2022" },
  { id: "L3", name: "Confirmation Letter", description: "Issued post probation completion", status: "available", issuedOn: "14 Sep 2022" },
  { id: "L4", name: "Experience Letter", description: "Employment evidence — request anytime", status: "request" },
  { id: "L5", name: "Relieving Letter", description: "Issued at exit only", status: "request" },
  { id: "L6", name: "Salary Certificate", description: "For loans, visas, account opening", status: "in_progress" },
];

function statusBadge(s: Letter["status"]) {
  if (s === "available") return <StatusBadge status="completed" label="Available" />;
  if (s === "in_progress") return <StatusBadge status="in_progress" label="In progress" />;
  return <StatusBadge status="draft" label="On request" />;
}

function MyLetters() {
  return (
    <div className="space-y-4 pt-4">
      <p className="text-sm text-muted-foreground">Download issued letters or request new ones from HR.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LETTERS.map((l) => (
          <Card key={l.id} className="rounded-2xl border-border/60 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                <FileSignature className="h-5 w-5" />
              </div>
              {statusBadge(l.status)}
            </div>
            <div className="mt-3">
              <p className="text-sm font-semibold">{l.name}</p>
              <p className="text-xs text-muted-foreground">{l.description}</p>
              {l.issuedOn && <p className="mt-1 text-xs text-muted-foreground">Issued: {l.issuedOn}</p>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {l.status === "available" ? (
                <>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => toast("Opening preview...")}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                  </Button>
                  <Button size="sm" className="rounded-full" onClick={() => toast.success("Download started")}>
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                  </Button>
                </>
              ) : (
                <Button size="sm" className="rounded-full" disabled={l.status === "in_progress"} onClick={() => toast.success("Letter request sent to HR")}>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {l.status === "in_progress" ? "Requested" : "Request letter"}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
