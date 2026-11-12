import { randomUUID } from "node:crypto";
import type { AuthUser, DocumentMetadata, UUID } from "#shared";
import { documentUploadSchema, EmploymentStatuses, paginationQuerySchema, RetryableMutationScopes, Roles } from "#shared";
import type { z } from "zod";
import type { MediaUploadPolicy, MemoryDataStore } from "../../platform/data-store.js";
import { makeStorageKey, nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, forbidden, notFound } from "../../platform/errors.js";
import { compressPdfBuffer, isPdfUpload, type PdfCompressionResult } from "../../platform/pdf-compression.js";
import { appendOutboxEvent } from "../expenses/events.js";
import { ExpenseService } from "../expenses/service.js";
import { isTerminalExpenseStatus } from "../expenses/state-machine.js";
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

export type PublicDocumentMetadata = Omit<DocumentMetadata, "storage_key" | "metadata"> & {
  metadata: {
    verified_at?: string;
    verified_by?: UUID;
    rejection_reason?: string;
  };
};

export function presentDocument(document: DocumentMetadata): PublicDocumentMetadata {
  const { storage_key: _storageKey, metadata, ...publicFields } = document;
  return {
    ...publicFields,
    metadata: {
      ...(typeof metadata.verified_at === "string" ? { verified_at: metadata.verified_at } : {}),
      ...(typeof metadata.verified_by === "string" ? { verified_by: metadata.verified_by as UUID } : {}),
      ...(typeof metadata.rejection_reason === "string" ? { rejection_reason: metadata.rejection_reason } : {}),
    },
  };
}

export interface DocumentUploadPolicyResponse {
  max_bytes: number;
  image_max_width: number;
  image_max_height: number;
  image_jpeg_quality: number;
  allowed_mime_types: string[];
  image_output_mime_type: "image/jpeg";
  company_logo: {
    max_bytes: number;
    image_max_width: number;
    image_max_height: number;
    image_jpeg_quality: number;
    allowed_mime_types: string[];
    image_output_mime_type: "image/jpeg";
  };
}

export class DocumentService {
  private readonly repository: DocumentRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new DocumentRepository(store);
  }

  private expenseReceiptReadDecision(actor: AuthUser, document: DocumentMetadata, rawBytes: boolean): boolean | null {
    const links = this.store.expenseDocuments.filter((item) => item.document_id === document.id);
    if (document.business_object_type !== "expense_ticket" && links.length === 0) return null;
    if (document.business_object_type !== "expense_ticket" || links.length !== 1 ||
        links[0]?.ticket_id !== document.business_object_id ||
        links[0]?.document_type !== document.document_type || document.classification !== "finance") return false;
    const ticket = this.store.tickets.find((item) => item.id === document.business_object_id && !item.deleted_at);
    const currentUser = this.store.users.find((item) => item.id === actor.id && !item.deleted_at);
    const currentCompany = this.store.userSessionPreferences.find((item) => item.user_id === actor.id)?.company_id;
    if (!ticket?.company_id || !currentUser || currentUser.employment_status !== EmploymentStatuses.Active ||
        !currentCompany || !this.store.companyProfiles.some((item) => item.id === currentCompany && item.status === "active") ||
        ticket.owner_resolution_status === "quarantined") {
      return false;
    }
    const hasRole = (role: AuthUser["roles"][number]) => actor.roles.includes(role) && currentUser.roles.includes(role);
    if (ticket.requester_user_id === actor.id) return true;
    if (ticket.company_id !== currentCompany) return false;
    if (hasRole(Roles.Admin)) return true;
    if (hasRole(Roles.FinanceManager) && ticket.finance_approver_id === actor.id) return true;
    if (hasRole(Roles.Reviewer) && ticket.manager_verifier_id === actor.id) return true;
    if (rawBytes) return false;
    return hasRole(Roles.Auditor);
  }

  private mayReadDocument(actor: AuthUser, document: DocumentMetadata, rawBytes: boolean): boolean {
    return this.expenseReceiptReadDecision(actor, document, rawBytes) ??
      canAccessDocument(actor, document, "read");
  }

  private assertExpenseReceiptUpload(actor: AuthUser, input: DocumentUploadBody): void {
    const ticket = this.store.tickets.find((item) => item.id === input.business_object_id && !item.deleted_at);
    if (!ticket?.company_id || ticket.owner_resolution_status === "quarantined") {
      throw notFound("Expense ticket not found");
    }
    const currentUser = this.store.users.find((item) => item.id === actor.id && !item.deleted_at);
    const currentCompany = this.store.userSessionPreferences.find((item) => item.user_id === actor.id)?.company_id;
    if (!currentUser || currentUser.employment_status !== EmploymentStatuses.Active ||
        currentCompany !== ticket.company_id ||
        !this.store.companyProfiles.some((item) => item.id === currentCompany && item.status === "active")) {
      throw notFound("Expense ticket not found");
    }
    if (isTerminalExpenseStatus(ticket.status)) {
      throw conflict("This expense no longer accepts receipt uploads");
    }
    if (input.classification !== "finance") {
      throw badRequest("Expense receipts require finance classification");
    }
    const hasRole = (role: AuthUser["roles"][number]) => actor.roles.includes(role) && currentUser.roles.includes(role);
    if (ticket.requester_user_id === actor.id || hasRole(Roles.Admin) ||
        (hasRole(Roles.Reviewer) && ticket.manager_verifier_id === actor.id) ||
        (hasRole(Roles.FinanceManager) && ticket.finance_approver_id === actor.id)) return;
    throw forbidden("Expense receipt upload denied");
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
      company_logo: {
        max_bytes: companyLogoPolicy.maxBytes,
        image_max_width: companyLogoPolicy.imageMaxWidth,
        image_max_height: companyLogoPolicy.imageMaxHeight,
        image_jpeg_quality: companyLogoPolicy.imageJpegQuality,
        allowed_mime_types: [...companyLogoPolicy.allowedMimeTypes],
        image_output_mime_type: companyLogoPolicy.imageOutputMimeType,
      }
    };
  }

  async upload(actor: AuthUser, input: DocumentUploadBody): Promise<DocumentMetadata> {
    if (this.store.kind === "postgres" && input.business_object_type === "expense_ticket") {
      throw conflict("Expense receipt upload requires transaction-owned parent authorization");
    }
    if (input.business_object_type === "expense_ticket") this.assertExpenseReceiptUpload(actor, input);
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
    if (input.business_object_type !== "expense_ticket" && !canAccessDocument(actor, document, "write")) {
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
      ...input.storage_metadata
    });
    document.metadata = {
      ...document.metadata,
      storage_etag: stored.etag ?? null,
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
    if (!this.mayReadDocument(actor, document, false)) {
      this.log(actor, id, "metadata", "denied", "classification_policy");
      throw forbidden("Document access denied");
    }
    this.log(actor, id, "metadata", "allowed", null);
    return document;
  }

  tenantMediaMetadata(actor: AuthUser, id: UUID): DocumentMetadata {
    const document = this.requireTenantMedia(id);
    this.log(actor, id, "metadata", "allowed", null);
    return document;
  }

  async tenantMediaDownloadUrl(actor: AuthUser, id: UUID, apiBaseUrl = "") {
    this.requireTenantMedia(id);
    this.log(actor, id, "download-url", "allowed", null);
    return { document_id: id, url: documentContentUrl(apiBaseUrl, id), expires_in_seconds: 0 };
  }

  async tenantMediaContent(actor: AuthUser, id: UUID): Promise<DocumentContentResult> {
    const document = this.requireTenantMedia(id);
    if (!this.store.objectStorage) throw forbidden("Document object storage adapter is not configured for release acceptance");
    const object = await this.store.objectStorage.getObject(document.storage_key);
    if (!object) throw notFound("Document bytes are not available in private object storage.");
    this.log(actor, id, "download-content", "allowed", null);
    return {
      body: object.body,
      contentType: object.contentType || document.mime_type || "application/octet-stream",
      fileName: document.file_name,
      size: object.size,
    };
  }

  private requireTenantMedia(id: UUID): DocumentMetadata {
    const document = this.repository.find(id);
    if (document.document_type !== "company_logo" && document.document_type !== "profile_photo") {
      throw notFound("Document not found");
    }
    return document;
  }

  async downloadUrl(
    actor: AuthUser,
    id: UUID,
    apiBaseUrl = ""
  ): Promise<{ document_id: UUID; url: string; expires_in_seconds: number }> {
    const document = this.repository.find(id);
    if (!this.mayReadDocument(actor, document, true)) {
      this.log(actor, id, "download-url", "denied", "classification_policy");
      throw forbidden("Document access denied");
    }
    this.log(actor, id, "download-url", "allowed", null);
    if (!this.store.objectStorage) {
      throw forbidden("Document object storage adapter is not configured for release acceptance");
    }
    return {
      document_id: id,
      url: documentContentUrl(apiBaseUrl, id),
      expires_in_seconds: 0
    };
  }

  async downloadContent(actor: AuthUser, id: UUID): Promise<DocumentContentResult> {
    const document = this.repository.find(id);
    if (!this.mayReadDocument(actor, document, true)) {
      this.log(actor, id, "download-content", "denied", "classification_policy");
      throw forbidden("Document access denied");
    }
    if (!this.store.objectStorage) {
      throw forbidden("Document object storage adapter is not configured for release acceptance");
    }
    const object = await this.store.objectStorage.getObject(document.storage_key);
    if (!object) {
      this.log(actor, id, "download-content", "denied", "object_not_available");
      throw notFound("Document bytes are not available in private object storage.");
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
    if (this.expenseReceiptReadDecision(actor, document, false) !== null) {
      throw conflict("Expense receipt deletion requires a parent-authorized workflow");
    }
    if (!canAccessDocument(actor, document, "write")) {
      this.log(actor, id, "delete", "denied", "classification_policy");
      throw forbidden("Document delete denied");
    }
    if (!this.store.objectStorage) {
      throw forbidden("Document object storage adapter is not configured for release acceptance");
    }
    this.assertCanHardDelete(id);
    await this.store.objectStorage.removeObject(document.storage_key);
    const deletedAt = nowIso();
    await this.hardDeletePersistedDocument(id);
    this.hardDeleteInMemoryDocument(id);
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

  private assertCanHardDelete(id: UUID): void {
    const letter = this.store.emsLetters.find((candidate) => candidate.document_id === id && !candidate.deleted_at);
    if (letter) {
      throw badRequest("This generated employee letter cannot be deleted because it is still referenced by EMS records.", {
        document_id: id,
        reference_type: "ems_letter",
        reference_id: letter.id
      });
    }
    const policy = this.store.emsPolicies.find((candidate) => candidate.document_id === id && !candidate.deleted_at);
    if (policy) {
      throw badRequest("This policy document cannot be deleted because it is still referenced by EMS policy records.", {
        document_id: id,
        reference_type: "ems_policy",
        reference_id: policy.id
      });
    }
  }

  private hardDeleteInMemoryDocument(id: UUID): void {
    this.store.expenseDocuments = this.store.expenseDocuments.filter((document) => document.document_id !== id);
    this.store.helpdeskAttachments = this.store.helpdeskAttachments.filter((attachment) => attachment.document_id !== id);
    for (const comment of this.store.helpdeskComments) {
      comment.document_ids = comment.document_ids.filter((documentId) => documentId !== id);
    }
    for (const request of this.store.leaveRequests) {
      request.document_ids = request.document_ids.filter((documentId) => documentId !== id);
    }
    for (const request of this.store.emsProfileChangeRequests) {
      request.supporting_document_ids = request.supporting_document_ids.filter((documentId) => documentId !== id);
    }
    for (const request of this.store.emsServiceRequests) {
      request.document_ids = request.document_ids.filter((documentId) => documentId !== id);
    }
    for (const user of this.store.users) {
      if (user.profile_photo_document_id === id) {
        user.profile_photo_document_id = null;
        user.profile_photo_url = null;
      }
    }
    for (const company of this.store.companyProfiles) {
      if (company.logo_document_id === id) {
        company.logo_document_id = null;
        company.logo_url = null;
        company.logo_file_name = null;
        company.logo_mime_type = null;
        company.logo_size_bytes = null;
        company.updated_at = nowIso();
      }
    }
    this.store.documentVersions = this.store.documentVersions.filter((version) => version.document_id !== id);
    this.store.documents = this.store.documents.filter((document) => document.id !== id);
  }

  private async hardDeletePersistedDocument(id: UUID): Promise<void> {
    if (!this.store.pgPool) {
      return;
    }
    const client = await this.store.pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE core.users SET profile_photo_document_id = NULL, profile_photo_url = NULL, updated_at = now() WHERE profile_photo_document_id = $1",
        [id]
      );
      await client.query(
        "UPDATE platform.company_profiles SET logo_document_id = NULL, logo_url = NULL, logo_file_name = NULL, logo_mime_type = NULL, logo_size_bytes = NULL, updated_at = now() WHERE logo_document_id = $1",
        [id]
      );
      await client.query("DELETE FROM expenses.expense_documents WHERE document_id = $1", [id]);
      await client.query("DELETE FROM helpdesk.ticket_attachments WHERE document_id = $1", [id]);
      await client.query("UPDATE helpdesk.ticket_comments SET document_ids = document_ids - $1 WHERE document_ids ? $1", [id]);
      await client.query("UPDATE leave_wfh.leave_requests SET document_ids = document_ids - $1 WHERE document_ids ? $1", [id]);
      await client.query("UPDATE ems.profile_change_requests SET supporting_document_ids = supporting_document_ids - $1 WHERE supporting_document_ids ? $1", [id]);
      await client.query("UPDATE ems.service_requests SET document_ids = document_ids - $1 WHERE document_ids ? $1", [id]);
      await client.query("DELETE FROM documents.doc_permissions WHERE document_id = $1", [id]);
      await client.query("DELETE FROM documents.doc_versions WHERE document_id = $1", [id]);
      await client.query("DELETE FROM documents.doc_metadata WHERE id = $1", [id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  verify(actor: AuthUser, id: UUID): DocumentMetadata {
    const document = this.repository.find(id);
    if (this.expenseReceiptReadDecision(actor, document, false) !== null) {
      throw conflict("Expense receipt verification requires the expense workflow");
    }
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
    const visible = base.filter((document) => this.mayReadDocument(actor, document, false));
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
    if (!(this.expenseReceiptReadDecision(actor, document, false) ??
      canAccessDocument(actor, document, "audit"))) {
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

function documentContentUrl(apiBaseUrl: string, id: UUID): string {
  const path = `/api/v1/documents/${id}/content`;
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/u, "");
  return normalizedBaseUrl ? `${normalizedBaseUrl}${path}` : path;
}
