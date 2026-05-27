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
  if (!store.objectStorage) {
    return queuedResult(input);
  }

  const rendered = renderExport(input.rows, input.columns, input.format);
  const now = nowIso();
  const extension = exportExtension(input.format);
  const mimeType = exportMimeType(input.format);
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
      storage: store.objectStorage.kind,
      storage_adapter: store.objectStorage.kind,
      folder: store.objectStorage.bucket,
      object_public_id: stored.publicId ?? null,
      object_resource_type: stored.resourceType ?? null,
      object_url: stored.url ?? null,
      object_upload_compressed: stored.compressed ?? false,
      cloudinary_public_id: store.objectStorage.kind === "cloudinary" ? stored.publicId ?? null : null,
      cloudinary_resource_type: store.objectStorage.kind === "cloudinary" ? stored.resourceType ?? null : null,
      cloudinary_url: store.objectStorage.kind === "cloudinary" ? stored.url ?? null : null,
      cloudinary_upload_compressed: store.objectStorage.kind === "cloudinary" ? stored.compressed ?? false : false,
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
    adapter: "outbox-queued-placeholder",
    download_document_id: null,
    download_url: null,
    file_name: null,
    row_count: input.rows.length,
    size_bytes: null,
    generated_at: null
  };
}

function exportExtension(format: GeneratedExportFormat): string {
  if (format === "json") return "json";
  if (format === "xlsx") return "xlsx";
  return "csv";
}

function exportMimeType(format: GeneratedExportFormat): string {
  if (format === "json") return "application/json";
  if (format === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "text/csv";
}

function renderExport(rows: Array<Record<string, unknown>>, columns: string[], format: GeneratedExportFormat): Buffer {
  if (format === "json") {
    return Buffer.from(JSON.stringify(rows, null, 2));
  }
  if (format === "xlsx") {
    return renderXlsx(rows, columns);
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

function renderXlsx(rows: Array<Record<string, unknown>>, columns: string[]): Buffer {
  const header = columns.length ? columns : inferColumns(rows);
  const allRows = [header, ...rows.map((row) => header.map((column) => row[column]))];
  const sheetData = allRows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex + 1)}${rowNumber}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlText(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return createZip([
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      path: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Export" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    {
      path: "xl/styles.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`
    },
    {
      path: "xl/worksheets/sheet1.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetData}</sheetData>
</worksheet>`
    }
  ]);
}

function columnName(index: number): string {
  let remaining = index;
  let name = "";
  while (remaining > 0) {
    const offset = (remaining - 1) % 26;
    name = String.fromCharCode(65 + offset) + name;
    remaining = Math.floor((remaining - offset - 1) / 26);
  }
  return name;
}

function xmlText(value: unknown): string {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

interface ZipEntryInput {
  path: string;
  content: string;
}

interface ZipEntry {
  path: Buffer;
  data: Buffer;
  crc: number;
  localOffset: number;
}

function createZip(entries: ZipEntryInput[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const zipEntries: ZipEntry[] = [];
  let offset = 0;

  for (const input of entries) {
    const entry: ZipEntry = {
      path: Buffer.from(input.path),
      data: Buffer.from(input.content),
      crc: crc32(Buffer.from(input.content)),
      localOffset: offset
    };
    const local = localHeader(entry);
    localParts.push(local, entry.path, entry.data);
    offset += local.length + entry.path.length + entry.data.length;
    zipEntries.push(entry);
  }

  const centralOffset = offset;
  for (const entry of zipEntries) {
    const central = centralHeader(entry);
    centralParts.push(central, entry.path);
    offset += central.length + entry.path.length;
  }
  const centralSize = offset - centralOffset;
  return Buffer.concat([...localParts, ...centralParts, endOfCentralDirectory(zipEntries.length, centralSize, centralOffset)]);
}

function localHeader(entry: ZipEntry): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  writeDosTimestamp(header, 10);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.data.length, 18);
  header.writeUInt32LE(entry.data.length, 22);
  header.writeUInt16LE(entry.path.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralHeader(entry: ZipEntry): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  writeDosTimestamp(header, 12);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.data.length, 20);
  header.writeUInt32LE(entry.data.length, 24);
  header.writeUInt16LE(entry.path.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.localOffset, 42);
  return header;
}

function endOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number): Buffer {
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(entryCount, 8);
  footer.writeUInt16LE(entryCount, 10);
  footer.writeUInt32LE(centralSize, 12);
  footer.writeUInt32LE(centralOffset, 16);
  footer.writeUInt16LE(0, 20);
  return footer;
}

function writeDosTimestamp(buffer: Buffer, offset: number): void {
  buffer.writeUInt16LE(0, offset);
  buffer.writeUInt16LE(0x0021, offset + 2);
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sanitizePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "") || "export";
}
