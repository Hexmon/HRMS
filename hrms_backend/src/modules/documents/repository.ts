import { randomUUID } from "node:crypto";
import type { DocumentMetadata, UUID } from "#shared";
import type { DocumentAccessLogRecord, MemoryDataStore } from "../../platform/data-store.js";
import { notFound } from "../../platform/errors.js";

export type DocumentAccessLog = Omit<DocumentAccessLogRecord, "id">;

export class DocumentRepository {
  constructor(private readonly store: MemoryDataStore) {}

  insert(document: DocumentMetadata): DocumentMetadata {
    this.store.documents.push(document);
    return document;
  }

  find(id: UUID): DocumentMetadata {
    const document = this.store.documents.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!document) {
      throw notFound("Document not found", { id });
    }
    return document;
  }

  listForObject(businessObjectType: string, businessObjectId: UUID): DocumentMetadata[] {
    return this.store.documents.filter(
      (document) =>
        document.business_object_type === businessObjectType &&
        document.business_object_id === businessObjectId &&
        !document.deleted_at
    );
  }

  logAccess(input: DocumentAccessLog): void {
    this.store.documentAccessLogs.push({
      id: randomUUID(),
      ...input
    });
  }

  accessLogs(documentId: UUID): DocumentAccessLogRecord[] {
    return this.store.documentAccessLogs.filter((log) => log.document_id === documentId);
  }
}
