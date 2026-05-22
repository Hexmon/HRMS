import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui-kit";
import { toast } from "sonner";
import { FileText, Upload, Download, Eye, RefreshCw, AlertCircle } from "lucide-react";
import { documentsApi, mapApiDocuments, type DocumentUiRecord } from "@/domains/documents";
import { isUuid, pageItems, useApiRouteEnabled, withApiFallback } from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";

export const Route = createFileRoute("/_app/ems/documents")({
  component: MyDocuments,
});

type DocStatus = "uploaded" | "pending" | "verified" | "rejected" | "missing";

interface Doc {
  id: string;
  name: string;
  category: string;
  status: DocStatus;
  uploadedOn?: string;
  remarks?: string;
}

const DOCS: Doc[] = [
  {
    id: "d1",
    name: "Offer Letter",
    category: "Onboarding",
    status: "verified",
    uploadedOn: "14 Mar 2022",
  },
  {
    id: "d2",
    name: "ID Proof — Passport",
    category: "Identity",
    status: "verified",
    uploadedOn: "14 Mar 2022",
  },
  {
    id: "d3",
    name: "Address Proof — Aadhaar",
    category: "Identity",
    status: "pending",
    uploadedOn: "02 May 2026",
  },
  {
    id: "d4",
    name: "Education Certificate",
    category: "Education",
    status: "uploaded",
    uploadedOn: "14 Mar 2022",
  },
  {
    id: "d5",
    name: "Experience Certificate",
    category: "Experience",
    status: "rejected",
    uploadedOn: "16 Mar 2022",
    remarks: "Document scan unclear, please re-upload a higher resolution copy.",
  },
  { id: "d6", name: "PAN Card", category: "Identity", status: "missing" },
  {
    id: "d7",
    name: "Company Policies — Acknowledgement",
    category: "Compliance",
    status: "verified",
    uploadedOn: "20 Mar 2022",
  },
  { id: "d8", name: "Other Documents", category: "Other", status: "missing" },
];

function statusToBadge(s: DocStatus) {
  const map: Record<DocStatus, { status: string; label: string }> = {
    verified: { status: "completed", label: "Verified" },
    pending: { status: "pending", label: "Pending verification" },
    uploaded: { status: "in_progress", label: "Uploaded" },
    rejected: { status: "rejected", label: "Rejected" },
    missing: { status: "draft", label: "Not uploaded" },
  };
  const m = map[s];
  return <StatusBadge status={m.status} label={m.label} />;
}

function MyDocuments() {
  const apiEnabled = useApiRouteEnabled(["/ems", "/documents"]);
  const documentsQuery = useQuery({
    queryKey: queryKeys.list("documents", "ems-documents", { page_size: 100 }),
    queryFn: () =>
      withApiFallback(
        async () => mapApiDocuments(pageItems(await documentsApi.list({ page_size: 100 }))),
        () => DOCS as DocumentUiRecord[],
      ),
    enabled: apiEnabled,
    staleTime: queryTimings.listStaleMs,
  });
  const docs = apiEnabled ? (documentsQuery.data ?? []) : DOCS;
  const loading = apiEnabled && documentsQuery.isLoading;
  const error = documentsQuery.error instanceof Error ? documentsQuery.error : null;

  async function downloadDocument(document: Doc) {
    if (!apiEnabled || !isUuid(document.id)) {
      toast.success("Download started");
      return;
    }
    try {
      const response = await documentsApi.createDownloadUrl(document.id);
      const url = typeof response.url === "string" ? response.url : "";
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else toast.error("Download URL was not returned.");
    } catch {
      toast.error("Document download could not be started.");
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <p className="text-sm text-muted-foreground">
        Upload, replace, and track verification status of your personal documents.
      </p>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Document data could not be loaded from the backend.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} className="h-48 animate-pulse rounded-2xl border-border/60 p-5" />
            ))
          : docs.map((d) => (
              <Card
                key={d.id}
                className="rounded-2xl border-border/60 p-5 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  {statusToBadge(d.status)}
                </div>
                <div className="mt-3">
                  <p className="text-sm font-semibold">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.category}</p>
                  {d.uploadedOn && (
                    <p className="mt-1 text-xs text-muted-foreground">Uploaded: {d.uploadedOn}</p>
                  )}
                </div>
                {d.status === "rejected" && d.remarks && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{d.remarks}</span>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {d.status === "missing" || d.status === "rejected" ? (
                    <Button
                      size="sm"
                      className="rounded-full"
                      onClick={() => toast.success("Upload dialog opened")}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => toast("Opening preview...")}
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => void downloadDocument(d)}
                      >
                        <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full"
                        onClick={() => toast("Replace flow")}
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Replace
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
      </div>
    </div>
  );
}
