import { asArray, asRecord, dateText, text, type ApiRecord } from "@/shared/api";

export type DocumentUiStatus = "uploaded" | "pending" | "verified" | "rejected" | "missing";

export interface DocumentUiRecord {
  id: string;
  name: string;
  category: string;
  status: DocumentUiStatus;
  uploadedOn?: string;
  remarks?: string;
  owner: string;
  classification: string;
  businessObjectType: string;
  businessObjectId: string;
}

export function mapApiDocument(value: unknown): DocumentUiRecord {
  const row = asRecord(value);
  const metadata = asRecord(row.metadata);
  const verifiedAt = text(metadata.verified_at);
  return {
    id: text(row.id, "document"),
    name: text(row.file_name ?? row.name, "Document"),
    category: text(row.document_type ?? row.classification, "Document"),
    status: verifiedAt ? "verified" : "pending",
    uploadedOn: dateText(row.created_at, "").slice(0, 10) || undefined,
    remarks: text(metadata.rejection_reason) || undefined,
    owner: text(row.owner_user_id ?? row.created_by_user_id, "Employee"),
    classification: text(row.classification, "normal"),
    businessObjectType: text(row.business_object_type, "employee"),
    businessObjectId: text(row.business_object_id, ""),
  };
}

export function mapApiDocuments(values: unknown[]): DocumentUiRecord[] {
  return asArray(values).map(mapApiDocument);
}
