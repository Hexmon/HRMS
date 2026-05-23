import { createHash, randomUUID } from "node:crypto";
import type { AuthUser, DocumentMetadata, UUID } from "#shared";
import { DocumentClassifications } from "#shared";
import type { MemoryDataStore } from "./data-store.js";
import { makeStorageKey, nowIso } from "./data-store.js";

export type GeneratedExportFormat = "csv" | "json" | "xlsx";

export interface GeneratedExportDocumentInput {
  actor: AuthUser;
  businessObjectType: string;
  businessObjectId: UUID;
  reportType: string;
  format: GeneratedExportFormat;
  rows: Array<Record<string, unknown>>;
  columns: string[];
  filters?: Record<string, unknown>;
  filePrefix: string;
}

export interface GeneratedExportDocumentResult {
  status: "ready" | "queued";
  adapter: string;
  download_document_id: UUID | null;
  download_url: null;
  file_name: string | null;
  row_count: number;
  size_bytes: number | null;
  generated_at: string | null;
}

export async function createGeneratedExportDocument(
  store: MemoryDataStore,
  input: GeneratedExportDocumentInput
): Promise<GeneratedExportDocumentResult> {
  if (!store.objectStorage || input.format === "xlsx") {
    return queuedResult(input);
  }

  const rendered = renderExport(input.rows, input.columns, input.format);
  const now = nowIso();
  const extension = input.format === "json" ? "json" : "csv";
  const mimeType = input.format === "json" ? "application/json" : "text/csv";
  const fileName = `${sanitizePart(input.filePrefix)}-${now.slice(0, 10)}.${extension}`;
  const documentId = randomUUID();
  const storageKey = makeStorageKey({
    actor: input.actor,
    documentType: `${input.businessObjectType}_export`,
    fileName,
    version: 1
  });
  const checksum = createHash("sha256").update(rendered).digest("hex");

  const stored = await store.objectStorage.putObject(storageKey, rendered, {
    "content-type": mimeType,
    "x-hrms-document-id": documentId,
    "x-hrms-export-type": input.businessObjectType,
    "x-hrms-report-type": input.reportType
  });

  const document: DocumentMetadata = {
    id: documentId,
    business_object_type: input.businessObjectType,
    business_object_id: input.businessObjectId,
    owner_user_id: input.actor.id,
    classification: DocumentClassifications.Audit,
    document_type: `${input.businessObjectType}_export`,
    current_version: 1,
    file_name: fileName,
    storage_key: storageKey,
    mime_type: mimeType,
    size_bytes: rendered.length,
    checksum_sha256: checksum,
    metadata: {
      generated: true,
      generated_at: now,
      generated_by_user_id: input.actor.id,
      report_type: input.reportType,
      format: input.format,
      row_count: input.rows.length,
      columns: input.columns,
      filters: input.filters ?? {},
      storage: "cloudinary",
      storage_adapter: store.objectStorage.kind,
      folder: store.objectStorage.bucket,
      cloudinary_public_id: stored.publicId ?? null,
      cloudinary_resource_type: stored.resourceType ?? null,
      cloudinary_url: stored.url ?? null,
      cloudinary_upload_compressed: stored.compressed ?? false,
      stored_size_bytes: stored.size
    },
    created_by_user_id: input.actor.id,
    created_at: now,
    updated_at: now,
    deleted_at: null
  };

  store.documents.push(document);
  store.documentVersions.push({
    id: randomUUID(),
    document_id: document.id,
    version: 1,
    storage_key: document.storage_key,
    file_name: document.file_name,
    size_bytes: document.size_bytes,
    checksum_sha256: document.checksum_sha256,
    created_by_user_id: input.actor.id,
    created_at: now
  });

  return {
    status: "ready",
    adapter: `${store.objectStorage.kind}-generated-${input.format}`,
    download_document_id: document.id,
    download_url: null,
    file_name: document.file_name,
    row_count: input.rows.length,
    size_bytes: document.size_bytes,
    generated_at: now
  };
}

function queuedResult(input: GeneratedExportDocumentInput): GeneratedExportDocumentResult {
  return {
    status: "queued",
    adapter: input.format === "xlsx" ? "xlsx-renderer-pending" : "outbox-queued-placeholder",
    download_document_id: null,
    download_url: null,
    file_name: null,
    row_count: input.rows.length,
    size_bytes: null,
    generated_at: null
  };
}

function renderExport(rows: Array<Record<string, unknown>>, columns: string[], format: "csv" | "json"): Buffer {
  if (format === "json") {
    return Buffer.from(JSON.stringify(rows, null, 2));
  }

  const header = columns.length ? columns : inferColumns(rows);
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((row) => header.map((column) => csvCell(row[column])).join(","))
  ];
  return Buffer.from(`${lines.join("\n")}\n`);
}

function inferColumns(rows: Array<Record<string, unknown>>): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }
  return [...columns];
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function sanitizePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "") || "export";
}
