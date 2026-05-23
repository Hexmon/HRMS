import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui-kit";
import { toast } from "sonner";
import { FileText, Upload, Download, Eye, RefreshCw, AlertCircle } from "lucide-react";
import { documentsApi, mapApiDocuments } from "@/domains/documents";
import {
  type EmsDocumentUploadBody,
  useEmsDocumentMutation,
  useEmsEmployeeDocuments,
} from "@/domains/ems";
import { useAuth } from "@/lib/auth";
import { isUuid, pageItems, useApiRouteEnabled } from "@/shared/api";

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
  const { user } = useAuth();
  const apiEnabled = useApiRouteEnabled(["/ems", "/documents"]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<Doc | null>(null);
  const documentsQuery = useEmsEmployeeDocuments(user?.id, { page: 1, page_size: 100 }, apiEnabled);
  const uploadMutation = useEmsDocumentMutation(user?.id);
  const docs = apiEnabled ? mapApiDocuments(pageItems(documentsQuery.data)) : DOCS;
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

  function startUpload(document?: Doc) {
    if (!apiEnabled) {
      toast.success(document ? "Replace flow" : "Upload dialog opened");
      return;
    }
    if (!user?.id) {
      toast.error("User session is not ready.");
      return;
    }
    setUploadTarget(document ?? null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  async function uploadSelectedFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size <= 0) {
      toast.error("Selected file is empty.");
      return;
    }

    const target = uploadTarget;
    try {
      await uploadMutation.mutateAsync({
        classification: classificationFor(target),
        document_type: documentTypeFor(target),
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      });
      toast.success(target ? "Replacement uploaded" : "Document uploaded", {
        description: `${file.name} is pending verification.`,
      });
      setUploadTarget(null);
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : "Document upload failed.");
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        onChange={(event) => void uploadSelectedFile(event)}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Upload, replace, and track verification status of your personal documents.
        </p>
        <Button
          size="sm"
          className="rounded-full"
          onClick={() => startUpload()}
          disabled={apiEnabled && uploadMutation.isPending}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {apiEnabled && uploadMutation.isPending ? "Uploading" : "Upload document"}
        </Button>
      </div>

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
                      onClick={() => startUpload(d)}
                      disabled={apiEnabled && uploadMutation.isPending}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => void downloadDocument(d)}
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
                        onClick={() => startUpload(d)}
                        disabled={apiEnabled && uploadMutation.isPending}
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

function documentTypeFor(document: Doc | null): string {
  return slug(document?.category || document?.name || "employee_document");
}

function classificationFor(document: Doc | null): EmsDocumentUploadBody["classification"] {
  const value = `${document?.category ?? ""} ${document?.name ?? ""}`.toLowerCase();
  if (value.includes("medical")) return "medical";
  if (value.includes("compensation") || value.includes("salary") || value.includes("payroll")) {
    return "compensation";
  }
  if (value.includes("legal")) return "legal";
  if (value.includes("finance") || value.includes("tax")) return "finance";
  return "normal";
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "_")
      .replace(/^_+|_+$/gu, "")
      .slice(0, 80) || "employee_document"
  );
}
