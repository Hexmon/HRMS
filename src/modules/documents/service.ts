import { randomUUID } from "node:crypto";
import type { AuthUser, DocumentMetadata, UUID } from "#shared";
import { documentUploadSchema, paginationQuerySchema, RetryableMutationScopes } from "#shared";
import type { z } from "zod";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { makeStorageKey, nowIso } from "../../platform/data-store.js";
import { forbidden } from "../../platform/errors.js";
import { appendOutboxEvent } from "../expenses/events.js";
import { ExpenseService } from "../expenses/service.js";
import { canAccessDocument } from "./policy.js";
import { DocumentRepository } from "./repository.js";

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
export type DocumentListQuery = z.infer<typeof paginationQuerySchema> & {
  business_object_type?: string;
  business_object_id?: UUID;
};

export class DocumentService {
  private readonly repository: DocumentRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new DocumentRepository(store);
  }

  async upload(actor: AuthUser, input: DocumentUploadInput): Promise<DocumentMetadata> {
    const now = nowIso();
    const storageKey = makeStorageKey({
      actor,
      documentType: input.document_type,
      fileName: input.file_name,
      version: 1
    });
    const document: DocumentMetadata = {
      id: randomUUID(),
      business_object_type: input.business_object_type,
      business_object_id: input.business_object_id,
      owner_user_id: input.business_object_type === "expense_ticket" ? null : actor.id,
      classification: input.classification,
      document_type: input.document_type,
      current_version: 1,
      file_name: input.file_name,
      storage_key: storageKey,
      mime_type: input.mime_type,
      size_bytes: input.size_bytes,
      checksum_sha256: input.checksum_sha256 ?? null,
      metadata: {
        storage: "s3-compatible",
        storage_adapter: this.store.objectStorage?.kind ?? "unconfigured",
        bucket: this.store.objectStorage?.bucket ?? null
      },
      created_by_user_id: actor.id,
      created_at: now,
      updated_at: now,
      deleted_at: null
    };
    if (!canAccessDocument(actor, document, "write")) {
      this.log(actor, document.id, "upload", "denied", "classification_policy");
      throw forbidden("You cannot upload this document classification");
    }
    if (!this.store.objectStorage || this.store.objectStorage.kind !== "minio") {
      throw forbidden("Document object storage adapter is not configured for release acceptance");
    }
    const body = Buffer.from(
      JSON.stringify({
        document_id: document.id,
        file_name: document.file_name,
        mime_type: document.mime_type,
        size_bytes: document.size_bytes,
        checksum_sha256: document.checksum_sha256
      })
    );
    await this.store.objectStorage.putObject(document.storage_key, body, {
      "content-type": document.mime_type,
      "x-amz-meta-document-id": document.id
    });
    this.repository.insert(document);
    this.store.documentVersions.push({
      id: randomUUID(),
      document_id: document.id,
      version: 1,
      storage_key: document.storage_key,
      file_name: document.file_name,
      size_bytes: document.size_bytes,
      checksum_sha256: document.checksum_sha256,
      created_by_user_id: actor.id,
      created_at: now
    });
    this.log(actor, document.id, "upload", "allowed", null);
    appendOutboxEvent(this.store, {
      aggregateType: "document",
      aggregateId: document.id,
      eventType: "document.uploaded",
      payload: {
        document_id: document.id,
        business_object_type: document.business_object_type,
        business_object_id: document.business_object_id
      },
      idempotencyKey: `${RetryableMutationScopes.DocumentUpload}:${document.id}`
    });
    if (document.business_object_type === "expense_ticket") {
      new ExpenseService(this.store).attachVerifiedDocument(
        actor,
        document.business_object_id,
        document.id,
        document.document_type
      );
    }
    return document;
  }

  metadata(actor: AuthUser, id: UUID): DocumentMetadata {
    const document = this.repository.find(id);
    if (!canAccessDocument(actor, document, "read")) {
      this.log(actor, id, "metadata", "denied", "classification_policy");
      throw forbidden("Document access denied");
    }
    this.log(actor, id, "metadata", "allowed", null);
    return document;
  }

  async downloadUrl(actor: AuthUser, id: UUID): Promise<{ document_id: UUID; url: string; expires_in_seconds: number }> {
    const document = this.repository.find(id);
    if (!canAccessDocument(actor, document, "read")) {
      this.log(actor, id, "download-url", "denied", "classification_policy");
      throw forbidden("Document access denied");
    }
    this.log(actor, id, "download-url", "allowed", null);
    if (!this.store.objectStorage || this.store.objectStorage.kind !== "minio") {
      throw forbidden("Document object storage adapter is not configured for release acceptance");
    }
    return {
      document_id: id,
      url: await this.store.objectStorage.presignedGetUrl(document.storage_key, 900),
      expires_in_seconds: 900
    };
  }

  verify(actor: AuthUser, id: UUID): DocumentMetadata {
    const document = this.repository.find(id);
    if (!canAccessDocument(actor, document, "verify")) {
      this.log(actor, id, "verify", "denied", "classification_policy");
      throw forbidden("Document verification denied");
    }
    document.metadata = { ...document.metadata, verified_by: actor.id, verified_at: nowIso() };
    document.updated_at = nowIso();
    this.log(actor, id, "verify", "allowed", null);
    return document;
  }

  list(actor: AuthUser, query: DocumentListQuery) {
    const base =
      query.business_object_type && query.business_object_id
        ? this.repository.listForObject(query.business_object_type, query.business_object_id)
        : this.store.documents.filter((document) => !document.deleted_at);
    const visible = base.filter((document) => canAccessDocument(actor, document, "read"));
    const start = (query.page - 1) * query.page_size;
    return {
      items: visible.slice(start, start + query.page_size),
      page: query.page,
      page_size: query.page_size,
      total: visible.length
    };
  }

  accessLog(actor: AuthUser, id: UUID, page: number, pageSize: number) {
    const document = this.repository.find(id);
    if (!canAccessDocument(actor, document, "audit")) {
      throw forbidden("Document access log denied");
    }
    const logs = this.repository.accessLogs(id);
    const start = (page - 1) * pageSize;
    return {
      items: logs.slice(start, start + pageSize),
      page,
      page_size: pageSize,
      total: logs.length
    };
  }

  private log(
    actor: AuthUser,
    documentId: UUID,
    action: string,
    decision: "allowed" | "denied",
    reason: string | null
  ): void {
    this.repository.logAccess({
      document_id: documentId,
      actor_user_id: actor.id,
      action,
      decision,
      reason,
      created_at: nowIso()
    });
  }
}
