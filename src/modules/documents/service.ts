import { randomUUID } from "node:crypto";
import type { AuthUser, DocumentMetadata, UUID } from "#shared";
import { documentUploadSchema, paginationQuerySchema, RetryableMutationScopes } from "#shared";
import type { z } from "zod";
import type { MediaUploadPolicy, MemoryDataStore } from "../../platform/data-store.js";
import { makeStorageKey, nowIso } from "../../platform/data-store.js";
import { badRequest, forbidden, notFound } from "../../platform/errors.js";
import { compressPdfBuffer, isPdfUpload, type PdfCompressionResult } from "../../platform/pdf-compression.js";
import { appendOutboxEvent } from "../expenses/events.js";
import { ExpenseService } from "../expenses/service.js";
import { canAccessDocument } from "./policy.js";
import { DocumentRepository } from "./repository.js";

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
export type DocumentUploadBody = DocumentUploadInput & {
  file_buffer?: Buffer;
  owner_user_id?: UUID | null;
  storage_metadata?: Record<string, string>;
};
export type DocumentListQuery = z.infer<typeof paginationQuerySchema> & {
  business_object_type?: string;
  business_object_id?: UUID;
};

export interface DocumentContentResult {
  body: Buffer;
  contentType: string;
  fileName: string;
  size: number;
}

export interface DocumentDeleteResult {
  document_id: UUID;
  status: "deleted";
}

export interface DocumentUploadPolicyResponse {
  max_bytes: number;
  image_max_width: number;
  image_max_height: number;
  image_jpeg_quality: number;
  allowed_mime_types: string[];
  image_output_mime_type: "image/jpeg";
  cloudinary_transformation: string;
  company_logo: {
    max_bytes: number;
    image_max_width: number;
    image_max_height: number;
    image_jpeg_quality: number;
    allowed_mime_types: string[];
    image_output_mime_type: "image/jpeg";
    cloudinary_transformation: string;
  };
}

export class DocumentService {
  private readonly repository: DocumentRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new DocumentRepository(store);
  }

  uploadPolicy(): DocumentUploadPolicyResponse {
    const policy = this.store.documentProcessing.mediaUploads;
    const companyLogoPolicy = this.store.documentProcessing.companyLogoUploads;
    return {
      max_bytes: policy.maxBytes,
      image_max_width: policy.imageMaxWidth,
      image_max_height: policy.imageMaxHeight,
      image_jpeg_quality: policy.imageJpegQuality,
      allowed_mime_types: [...policy.allowedMimeTypes],
      image_output_mime_type: policy.imageOutputMimeType,
      cloudinary_transformation: policy.cloudinaryTransformation,
      company_logo: {
        max_bytes: companyLogoPolicy.maxBytes,
        image_max_width: companyLogoPolicy.imageMaxWidth,
        image_max_height: companyLogoPolicy.imageMaxHeight,
        image_jpeg_quality: companyLogoPolicy.imageJpegQuality,
        allowed_mime_types: [...companyLogoPolicy.allowedMimeTypes],
        image_output_mime_type: companyLogoPolicy.imageOutputMimeType,
        cloudinary_transformation: companyLogoPolicy.cloudinaryTransformation
      }
    };
  }

  async upload(actor: AuthUser, input: DocumentUploadBody): Promise<DocumentMetadata> {
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
      owner_user_id: input.owner_user_id ?? (input.business_object_type === "expense_ticket" ? null : actor.id),
      classification: input.classification,
      document_type: input.document_type,
      current_version: 1,
      file_name: input.file_name,
      storage_key: storageKey,
      mime_type: input.mime_type,
      size_bytes: input.size_bytes,
      checksum_sha256: input.checksum_sha256 ?? null,
      metadata: {
        storage: this.store.objectStorage?.kind ?? "unconfigured",
        storage_adapter: this.store.objectStorage?.kind ?? "unconfigured",
        folder: this.store.objectStorage?.bucket ?? null
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
    if (!this.store.objectStorage) {
      throw forbidden("Document object storage adapter is not configured for release acceptance");
    }
    const rawBody = input.file_buffer ?? Buffer.from(
      JSON.stringify({
        document_id: document.id,
        file_name: document.file_name,
        mime_type: document.mime_type,
        size_bytes: document.size_bytes,
        checksum_sha256: document.checksum_sha256
      })
    );
    const uploadPolicy = this.uploadPolicyForDocument(document);
    this.assertUploadAllowed(document, rawBody, uploadPolicy);
    const pdfCompression = input.file_buffer
      ? await this.preparePdfUploadBody(rawBody, document)
      : null;
    const uploadBody = pdfCompression?.buffer ?? rawBody;
    const stored = await this.store.objectStorage.putObject(document.storage_key, uploadBody, {
      "content-type": document.mime_type,
      "x-hrms-document-id": document.id,
      "x-cloudinary-transformation": uploadPolicy.cloudinaryTransformation,
      ...input.storage_metadata
    });
    document.metadata = {
      ...document.metadata,
      object_public_id: stored.publicId ?? null,
      object_resource_type: stored.resourceType ?? null,
      object_url: stored.url ?? null,
      object_upload_compressed: stored.compressed ?? false,
      cloudinary_public_id: this.store.objectStorage.kind === "cloudinary" ? stored.publicId ?? null : null,
      cloudinary_resource_type: this.store.objectStorage.kind === "cloudinary" ? stored.resourceType ?? null : null,
      cloudinary_url: this.store.objectStorage.kind === "cloudinary" ? stored.url ?? null : null,
      cloudinary_upload_compressed: this.store.objectStorage.kind === "cloudinary" ? stored.compressed ?? false : false,
      pdf_compression_attempted: pdfCompression?.attempted ?? false,
      pdf_compressed: pdfCompression?.compressed ?? false,
      pdf_compression_reason: pdfCompression?.reason ?? null,
      pdf_original_size_bytes: pdfCompression?.originalSize ?? null,
      pdf_output_size_bytes: pdfCompression?.outputSize ?? null,
      original_size_bytes: input.file_buffer ? input.size_bytes : null,
      stored_size_bytes: stored.size,
      media_upload_policy_max_bytes: uploadPolicy.maxBytes,
      media_upload_policy_applied: true
    };
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

  private async preparePdfUploadBody(
    body: Buffer,
    document: Pick<DocumentMetadata, "mime_type" | "file_name">
  ): Promise<PdfCompressionResult | null> {
    if (!isPdfUpload(document.mime_type, document.file_name, body)) {
      return null;
    }
    return compressPdfBuffer(body, this.store.documentProcessing.pdfCompression);
  }

  private assertUploadAllowed(
    document: Pick<DocumentMetadata, "mime_type" | "file_name" | "size_bytes">,
    body: Buffer,
    policy: MediaUploadPolicy
  ): void {
    const mimeType = document.mime_type.trim().toLowerCase();
    if (!policy.allowedMimeTypes.includes(mimeType)) {
      throw badRequest("This file type is not allowed for media uploads", {
        mime_type: mimeType,
        allowed_mime_types: policy.allowedMimeTypes
      });
    }
    const size = Math.max(document.size_bytes, body.length);
    if (size > policy.maxBytes) {
      throw badRequest("File is larger than the configured media upload limit", {
        max_bytes: policy.maxBytes,
        actual_bytes: size
      });
    }
  }

  private uploadPolicyForDocument(document: Pick<DocumentMetadata, "document_type">): MediaUploadPolicy {
    return document.document_type === "company_logo"
      ? this.store.documentProcessing.companyLogoUploads
      : this.store.documentProcessing.mediaUploads;
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

  async downloadUrl(
    actor: AuthUser,
    id: UUID,
    apiBaseUrl = ""
  ): Promise<{ document_id: UUID; url: string; expires_in_seconds: number }> {
    const document = this.repository.find(id);
    if (!canAccessDocument(actor, document, "read")) {
      this.log(actor, id, "download-url", "denied", "classification_policy");
      throw forbidden("Document access denied");
    }
    this.log(actor, id, "download-url", "allowed", null);
    if (!this.store.objectStorage) {
      throw forbidden("Document object storage adapter is not configured for release acceptance");
    }
    const objectUrl = typeof document.metadata.object_url === "string" ? document.metadata.object_url : "";
    const cloudinaryUrl = typeof document.metadata.cloudinary_url === "string" ? document.metadata.cloudinary_url : "";
    const candidateUrl = objectUrl || cloudinaryUrl || await this.store.objectStorage.presignedGetUrl(document.storage_key, 900);
    return {
      document_id: id,
      url: isBrowserOpenableUrl(candidateUrl) ? candidateUrl : documentContentUrl(apiBaseUrl, id),
      expires_in_seconds: 900
    };
  }

  async downloadContent(actor: AuthUser, id: UUID): Promise<DocumentContentResult> {
    const document = this.repository.find(id);
    if (!canAccessDocument(actor, document, "read")) {
      this.log(actor, id, "download-content", "denied", "classification_policy");
      throw forbidden("Document access denied");
    }
    if (!this.store.objectStorage) {
      throw forbidden("Document object storage adapter is not configured for release acceptance");
    }
    const object = await this.store.objectStorage.getObject(document.storage_key);
    if (!object) {
      this.log(actor, id, "download-content", "denied", "object_not_available");
      throw notFound("Document bytes are not available in the local object-storage adapter. Re-upload the file or disable mock uploads to use real Cloudinary storage.");
    }
    this.log(actor, id, "download-content", "allowed", null);
    return {
      body: object.body,
      contentType: object.contentType || document.mime_type || "application/octet-stream",
      fileName: document.file_name,
      size: object.size
    };
  }

  async delete(actor: AuthUser, id: UUID): Promise<DocumentDeleteResult> {
    const document = this.repository.find(id);
    if (!canAccessDocument(actor, document, "write")) {
      this.log(actor, id, "delete", "denied", "classification_policy");
      throw forbidden("Document delete denied");
    }
    if (!this.store.objectStorage) {
      throw forbidden("Document object storage adapter is not configured for release acceptance");
    }
    await this.store.objectStorage.removeObject(document.storage_key);
    const deletedAt = nowIso();
    document.deleted_at = deletedAt;
    document.updated_at = deletedAt;
    document.metadata = {
      ...document.metadata,
      deleted_by_user_id: actor.id,
      deleted_at: deletedAt,
      storage_object_removed: true
    };
    this.log(actor, id, "delete", "allowed", null);
    appendOutboxEvent(this.store, {
      aggregateType: "document",
      aggregateId: document.id,
      eventType: "document.deleted",
      payload: {
        document_id: document.id,
        business_object_type: document.business_object_type,
        business_object_id: document.business_object_id
      },
      idempotencyKey: `${RetryableMutationScopes.DocumentUpload}:delete:${document.id}:${deletedAt}`
    });
    return { document_id: id, status: "deleted" };
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

function isBrowserOpenableUrl(url: string): boolean {
  return /^https?:\/\//iu.test(url);
}

function documentContentUrl(apiBaseUrl: string, id: UUID): string {
  const path = `/api/v1/documents/${id}/content`;
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/u, "");
  return normalizedBaseUrl ? `${normalizedBaseUrl}${path}` : path;
}
