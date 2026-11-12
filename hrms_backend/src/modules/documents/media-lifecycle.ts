import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { Roles, type AuthUser, type DocumentClassification, type DocumentMetadata, type UUID } from "#shared";
import type { ObjectStoragePort } from "../../platform/data-store.js";
import { conflict, forbidden, notFound } from "../../platform/errors.js";
import { ObjectStorageProviderError } from "../../platform/object-storage.js";

export type MediaOperation = "create" | "replace_company_logo" | "replace_profile_photo";
export type MediaParentType = "generic" | "company_profile" | "core_user";

export interface DurableMediaUploadInput {
  actor: AuthUser;
  operation: MediaOperation;
  parentType: MediaParentType;
  parentId: UUID;
  businessObjectType: string;
  ownerUserId: UUID | null;
  classification: DocumentClassification;
  documentType: string;
  fileName: string;
  mimeType: string;
  body: Buffer;
  idempotencyKey: string;
  expectedParentVersion?: number;
  expectedPointerDocumentId?: UUID | null;
}

interface IntentRow {
  id: UUID;
  company_id: UUID;
  actor_user_id: UUID;
  operation: MediaOperation;
  parent_type: MediaParentType;
  parent_id: UUID;
  business_object_type: string;
  request_fingerprint: string;
  object_key: string;
  document_id: UUID;
  expected_pointer_document_id: UUID | null;
  expected_parent_version: number | null;
  file_name: string;
  mime_type: string;
  measured_size_bytes: string | number;
  checksum_sha256: string;
  classification: DocumentClassification;
  document_type: string;
  owner_user_id: UUID | null;
  state: "prepared" | "uploading" | "retry_wait" | "object_confirmed" | "finalized" | "quarantined" | "failed";
  provider_etag: string | null;
  provider_size_bytes: string | number | null;
}

export interface DurableMediaUploadResult {
  intent_id: UUID;
  state: "finalized";
  document: DocumentMetadata;
}

/**
 * PostgreSQL is the publication coordinator. Object storage is deliberately
 * outside the SQL transaction; the durable intent makes every intermediate
 * state recoverable without deleting any bytes.
 */
export class MediaLifecycleService {
  constructor(
    private readonly pool: Pool,
    private readonly storage: ObjectStoragePort,
  ) {}

  async upload(input: DurableMediaUploadInput): Promise<DurableMediaUploadResult> {
    if (input.body.length <= 0) throw conflict("Media upload body is empty");
    const checksum = sha256(input.body);
    const fingerprint = requestFingerprint(input, checksum);
    const prepared = await this.prepare(input, checksum, fingerprint);
    let intent = prepared.intent;
    if (intent.state === "finalized") return this.finalizedResult(intent);
    if (intent.state === "object_confirmed") return this.finalize(intent.id);
    if (intent.state === "quarantined" || intent.state === "failed") {
      throw conflict("Media upload intent is not retryable", { intent_id: intent.id, state: intent.state });
    }
    let claimed = await this.claimIntentForPut(intent.id);
    if (!claimed) {
      intent = await this.awaitConcurrentIntent(intent.id);
      if (intent.state === "finalized") return this.finalizedResult(intent);
      if (intent.state === "object_confirmed") return this.finalize(intent.id);
      if (intent.state === "quarantined" || intent.state === "failed") {
        throw conflict("Media upload intent is not retryable", { intent_id: intent.id, state: intent.state });
      }
      claimed = await this.claimIntentForPut(intent.id);
      if (!claimed) {
        throw conflict("An identical media upload is still in progress; retry with the same idempotency key", {
          intent_id: intent.id,
        });
      }
    }
    intent = claimed;
    let evidence: Awaited<ReturnType<ObjectStoragePort["statObject"]>>;
    try {
      const stored = await this.storage.putObject(intent.object_key, input.body, {
        "content-type": intent.mime_type,
        "x-hrms-intent-id": intent.id,
        "x-hrms-document-id": intent.document_id,
        "x-hrms-checksum-sha256": intent.checksum_sha256,
      });
      evidence = {
        size: stored.size,
        ...(stored.etag ? { etag: stored.etag } : {}),
        contentType: intent.mime_type,
        metadata: {
          "x-hrms-intent-id": intent.id,
          "x-hrms-document-id": intent.document_id,
          "x-hrms-checksum-sha256": intent.checksum_sha256,
        },
      };
    } catch (error) {
      if (!(error instanceof ObjectStorageProviderError) || error.code !== "timeout") {
        await this.recordSafeFailure(intent.id, "object_put_failed");
        throw error;
      }
      try {
        evidence = await this.storage.statObject(intent.object_key);
      } catch (headError) {
        await this.recordSafeFailure(intent.id, "object_head_failed_after_ambiguous_put");
        throw headError;
      }
      if (!evidence || !headMatchesIntent(evidence, intent)) {
        await this.recordSafeFailure(intent.id, "object_put_outcome_unconfirmed");
        throw conflict("Media provider outcome could not be confirmed; retry with the same idempotency key", {
          intent_id: intent.id,
        });
      }
    }
    if (!evidence || !headMatchesIntent(evidence, intent)) {
      await this.quarantine(intent.id, "provider_evidence_mismatch");
      throw conflict("Stored media does not match the prepared upload", { intent_id: intent.id });
    }
    await this.confirmObject(intent.id, evidence);
    return this.finalize(intent.id);
  }

  async activeDocument(actorId: UUID, documentId: UUID): Promise<DocumentMetadata> {
    return this.authorizedActiveDocument(actorId, documentId, "metadata", true);
  }

  async activeContent(actorId: UUID, documentId: UUID): Promise<{ document: DocumentMetadata; body: Buffer; contentType: string; size: number }> {
    const document = await this.authorizedActiveDocument(actorId, documentId, "raw", true);
    const object = await this.storage.getObject(document.storage_key);
    if (!object) throw notFound("Document bytes are not available in private object storage.");
    if (object.size !== document.size_bytes || object.body.length !== document.size_bytes ||
        (document.checksum_sha256 !== null && sha256(object.body) !== document.checksum_sha256)) {
      throw notFound("Document bytes failed integrity verification.");
    }
    const revalidated = await this.authorizedActiveDocument(actorId, documentId, "raw", false);
    if (revalidated.storage_key !== document.storage_key) throw notFound("Document not found");
    return {
      document: revalidated,
      body: object.body,
      contentType: document.mime_type || "application/octet-stream",
      size: object.size,
    };
  }

  private async authorizedActiveDocument(
    actorId: UUID,
    documentId: UUID,
    mode: "metadata" | "raw",
    recordAccess: boolean,
  ): Promise<DocumentMetadata> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `WITH actor_context AS (
           SELECT actor.id,actor.hierarchy_path,preference.company_id,
                  array_remove(array_agg(role.role_key),NULL) AS roles
           FROM core.users actor
           JOIN platform.user_session_preferences preference ON preference.user_id=actor.id
           JOIN platform.company_profiles company
             ON company.id=preference.company_id AND company.status='active'
           LEFT JOIN core.user_roles role ON role.user_id=actor.id AND role.status='active'
             AND role.deleted_at IS NULL AND role.effective_from<=current_date
             AND (role.effective_to IS NULL OR role.effective_to>=current_date)
           WHERE actor.id=$1 AND actor.deleted_at IS NULL AND actor.employment_status='active'
           GROUP BY actor.id,actor.hierarchy_path,preference.company_id
         )
         SELECT metadata.*,
                company.logo_document_id=metadata.id AS current_logo,
                target.profile_photo_document_id=metadata.id
                  AND target_pref.company_id=actor.company_id AS current_profile,
                target.id AS target_user_id,target.hierarchy_path AS target_hierarchy_path,
                actor.id AS actor_id,actor.hierarchy_path AS actor_hierarchy_path,actor.roles
         FROM actor_context actor
         JOIN documents.doc_metadata metadata
           ON metadata.id=$2 AND metadata.company_id=actor.company_id
          AND metadata.lifecycle_state='active' AND metadata.deleted_at IS NULL
         LEFT JOIN platform.company_profiles company ON company.id=actor.company_id
         LEFT JOIN core.users target ON target.id=metadata.business_object_id
           AND metadata.business_object_type='core_user' AND target.deleted_at IS NULL
         LEFT JOIN platform.user_session_preferences target_pref ON target_pref.user_id=target.id`,
        [actorId, documentId],
      );
      const row = result.rows[0];
      const authorized = row ? durableReadAllowed(row) : false;
      if (recordAccess) {
        await client.query(
          `INSERT INTO documents.doc_access_logs
            (id,document_id,actor_user_id,action,decision,reason,created_at)
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,now())`,
          [documentId, actorId, mode === "raw" ? "download-content" : "metadata",
            authorized ? "allowed" : "denied", authorized ? null : "tenant_or_lifecycle_policy"],
        );
      }
      await client.query("COMMIT");
      if (!row || !authorized) throw notFound("Document not found");
      return mapDocument(row);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async removeProfilePhoto(input: {
    actor: AuthUser;
    userId: UUID;
    expectedVersion: number;
    expectedPointerDocumentId: UUID;
    idempotencyKey: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const companyId = await currentCompanyForActor(client, input.actor.id);
      const replayKey = `media-remove:${companyId}:${input.actor.id}:${input.idempotencyKey}`;
      const replay = await client.query<{ payload: { document_id?: string; parent_id?: string; expected_version?: number } }>(
        "SELECT payload FROM platform.outbox_events WHERE idempotency_key=$1",
        [replayKey],
      );
      if (replay.rows[0]) {
        const payload = replay.rows[0].payload;
        if (payload.document_id !== input.expectedPointerDocumentId || payload.parent_id !== input.userId ||
            payload.expected_version !== input.expectedVersion) {
          throw conflict("Idempotency key was already used with a different logical removal");
        }
        await client.query("COMMIT");
        return;
      }
      await assertParentAuthorization(client, companyId, {
        actor: input.actor,
        operation: "replace_profile_photo",
        parentType: "core_user",
        parentId: input.userId,
        businessObjectType: "core_user",
        ownerUserId: input.userId,
        classification: "normal",
        documentType: "profile_photo",
        fileName: "",
        mimeType: "",
        body: Buffer.alloc(0),
        idempotencyKey: input.idempotencyKey,
        expectedParentVersion: input.expectedVersion,
        expectedPointerDocumentId: input.expectedPointerDocumentId,
      }, true);
      const updated = await client.query(
        `UPDATE core.users SET profile_photo_document_id=NULL,profile_photo_url=NULL,
            version=version+1,updated_at=now()
         WHERE id=$1 AND version=$2 AND profile_photo_document_id=$3`,
        [input.userId, input.expectedVersion, input.expectedPointerDocumentId],
      );
      if (updated.rowCount !== 1) throw conflict("Profile photo changed concurrently");
      const tombstoned = await client.query(
        `UPDATE documents.doc_metadata
         SET lifecycle_state='tombstoned',lifecycle_reason='logical_remove',updated_at=now()
         WHERE id=$1 AND company_id=$2 AND lifecycle_state='active'`,
        [input.expectedPointerDocumentId, companyId],
      );
      if (tombstoned.rowCount !== 1) throw conflict("Current profile photo metadata is unavailable");
      await client.query(
        `INSERT INTO documents.media_lifecycle_audit
          (company_id,document_id,actor_user_id,action,previous_state,new_state,evidence)
         VALUES ($1,$2,$3,'logical_remove','active','tombstoned',$4::jsonb)`,
        [companyId, input.expectedPointerDocumentId, input.actor.id,
          JSON.stringify({ parent_type: "core_user", parent_id: input.userId })],
      );
      await client.query(
        `INSERT INTO platform.outbox_events
          (aggregate_type,aggregate_id,event_type,payload,idempotency_key)
         VALUES ('document',$1,'document.media_tombstoned',$2::jsonb,$3)`,
        [input.expectedPointerDocumentId, JSON.stringify({ company_id: companyId,
          document_id: input.expectedPointerDocumentId, parent_id: input.userId,
          expected_version: input.expectedVersion }),
          replayKey],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async prepare(
    input: DurableMediaUploadInput,
    checksum: string,
    fingerprint: string,
  ): Promise<{ intent: IntentRow; created: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const companyId = await currentCompanyForActor(client, input.actor.id);
      const existing = await client.query<IntentRow>(
        `SELECT * FROM documents.media_upload_intents
         WHERE company_id=$1 AND actor_user_id=$2 AND operation=$3 AND idempotency_key=$4
         FOR UPDATE`,
        [companyId, input.actor.id, input.operation, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_fingerprint !== fingerprint) {
          throw conflict("Idempotency key was already used with a different media payload");
        }
        if (existing.rows[0].state !== "finalized") {
          await assertParentAuthorization(client, companyId, input, false);
        }
        await client.query("COMMIT");
        return { intent: existing.rows[0], created: false };
      }
      await assertParentAuthorization(client, companyId, input, false);
      const id = randomUUID();
      const documentId = randomUUID();
      const objectKey = `${randomUUID()}/${randomUUID()}`;
      const inserted = await client.query<IntentRow>(
        `INSERT INTO documents.media_upload_intents
          (id,company_id,actor_user_id,operation,parent_type,parent_id,business_object_type,
           idempotency_key,request_fingerprint,object_key,document_id,
           expected_pointer_document_id,expected_parent_version,file_name,mime_type,
           measured_size_bytes,checksum_sha256,classification,document_type,owner_user_id,
           state,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                 'prepared',now()+interval '24 hours')
         ON CONFLICT (company_id,actor_user_id,operation,idempotency_key) DO NOTHING
         RETURNING *`,
        [id, companyId, input.actor.id, input.operation, input.parentType, input.parentId,
          input.businessObjectType, input.idempotencyKey, fingerprint, objectKey, documentId,
          input.expectedPointerDocumentId ?? null, input.expectedParentVersion ?? null,
          input.fileName, input.mimeType, input.body.length, checksum, input.classification,
          input.documentType, input.ownerUserId],
      );
      if (inserted.rows[0]) {
        await client.query("COMMIT");
        return { intent: inserted.rows[0], created: true };
      }
      const raced = await client.query<IntentRow>(
        `SELECT * FROM documents.media_upload_intents
         WHERE company_id=$1 AND actor_user_id=$2 AND operation=$3 AND idempotency_key=$4
         FOR UPDATE`,
        [companyId, input.actor.id, input.operation, input.idempotencyKey],
      );
      const row = raced.rows[0];
      if (!row) throw conflict("Concurrent media upload intent is unavailable");
      if (row.request_fingerprint !== fingerprint) {
        throw conflict("Idempotency key was already used with a different media payload");
      }
      await client.query("COMMIT");
      return { intent: row, created: false };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async awaitConcurrentIntent(intentId: UUID): Promise<IntentRow> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = await this.pool.query<IntentRow>(
        "SELECT * FROM documents.media_upload_intents WHERE id=$1",
        [intentId],
      );
      const intent = result.rows[0];
      if (!intent) throw conflict("Concurrent media upload intent disappeared");
      if (["finalized", "object_confirmed", "quarantined", "failed", "retry_wait"].includes(intent.state)) {
        return intent;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const result = await this.pool.query<IntentRow>(
      "SELECT * FROM documents.media_upload_intents WHERE id=$1",
      [intentId],
    );
    return result.rows[0]!;
  }

  private async claimIntentForPut(intentId: UUID): Promise<IntentRow | null> {
    const leaseOwner = `api:${randomUUID()}`;
    const result = await this.pool.query<IntentRow>(
      `UPDATE documents.media_upload_intents
       SET state='uploading',lease_owner=$2,lease_expires_at=now()+interval '2 minutes',
           attempt_count=attempt_count+1,last_safe_error=NULL,updated_at=now()
       WHERE id=$1 AND state IN ('prepared','retry_wait')
         AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at<=now())
       RETURNING *`,
      [intentId, leaseOwner],
    );
    return result.rows[0] ?? null;
  }

  private async confirmObject(
    intentId: UUID,
    evidence: NonNullable<Awaited<ReturnType<ObjectStoragePort["statObject"]>>>,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE documents.media_upload_intents
       SET state='object_confirmed',provider_etag=$2,provider_size_bytes=$3,
           provider_metadata=$4::jsonb,lease_owner=NULL,lease_expires_at=NULL,
           last_safe_error=NULL,updated_at=now()
       WHERE id=$1 AND state IN ('prepared','uploading','retry_wait','object_confirmed')`,
      [intentId, evidence.etag ?? null, evidence.size, JSON.stringify({
        content_type: evidence.contentType ?? null,
        intent_marker_present: evidence.metadata?.["x-hrms-intent-id"] === intentId,
      })],
    );
  }

  async finalize(intentId: UUID): Promise<DurableMediaUploadResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<IntentRow>(
        "SELECT * FROM documents.media_upload_intents WHERE id=$1 FOR UPDATE",
        [intentId],
      );
      const intent = result.rows[0];
      if (!intent) throw notFound("Media upload intent not found");
      if (intent.state === "finalized") {
        await client.query("COMMIT");
        return this.finalizedResult(intent, client);
      }
      if (intent.state !== "object_confirmed") throw conflict("Media object is not confirmed", { intent_id: intent.id });
      const liveActor: AuthUser = {
        id: intent.actor_user_id,
        employee_code: "",
        email: "",
        full_name: "",
        department_id: "",
        designation_id: "",
        roles: [],
        employment_status: "active",
        hierarchy_path: "",
      };
      await assertParentAuthorization(client, intent.company_id, {
        actor: liveActor,
        operation: intent.operation,
        parentType: intent.parent_type,
        parentId: intent.parent_id,
        businessObjectType: intent.business_object_type,
        ownerUserId: intent.owner_user_id,
        classification: intent.classification,
        documentType: intent.document_type,
        fileName: intent.file_name,
        mimeType: intent.mime_type,
        body: Buffer.alloc(0),
        idempotencyKey: "",
        expectedParentVersion: intent.expected_parent_version ?? undefined,
        expectedPointerDocumentId: intent.expected_pointer_document_id,
      }, true);

      await client.query(
        `INSERT INTO documents.doc_metadata
          (id,company_id,business_object_type,business_object_id,owner_user_id,classification,
           document_type,current_version,file_name,storage_key,mime_type,size_bytes,checksum_sha256,
           metadata,created_by_user_id,lifecycle_state,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10,$11,$12,$13::jsonb,$14,'active',now(),now())
         ON CONFLICT (id) DO NOTHING`,
        [intent.document_id, intent.company_id, intent.business_object_type, intent.parent_id,
          intent.owner_user_id, intent.classification, intent.document_type, intent.file_name,
          intent.object_key, intent.mime_type, Number(intent.measured_size_bytes), intent.checksum_sha256,
          JSON.stringify({ storage: this.storage.kind, storage_adapter: this.storage.kind,
            folder: this.storage.bucket, storage_etag: intent.provider_etag,
            stored_size_bytes: Number(intent.measured_size_bytes),
            media_upload_policy_applied: true }), intent.actor_user_id],
      );
      await client.query(
        `INSERT INTO documents.doc_versions
          (id,document_id,version,storage_key,file_name,size_bytes,checksum_sha256,created_by_user_id,created_at)
         VALUES (gen_random_uuid(),$1,1,$2,$3,$4,$5,$6,now())
         ON CONFLICT (document_id,version) DO NOTHING`,
        [intent.document_id, intent.object_key, intent.file_name, Number(intent.measured_size_bytes),
          intent.checksum_sha256, intent.actor_user_id],
      );
      const previousDocumentId = await publishParentPointer(client, intent);
      if (previousDocumentId && previousDocumentId !== intent.document_id) {
        await client.query(
          `UPDATE documents.doc_metadata
           SET lifecycle_state='replaced',replaced_by_document_id=$2,lifecycle_reason='superseded',updated_at=now()
           WHERE id=$1 AND company_id=$3 AND lifecycle_state='active'`,
          [previousDocumentId, intent.document_id, intent.company_id],
        );
      }
      await client.query(
        `INSERT INTO documents.media_lifecycle_audit
          (company_id,document_id,intent_id,actor_user_id,action,previous_state,new_state,evidence)
         VALUES ($1,$2,$3,$4,'finalize','staged','active',$5::jsonb)`,
        [intent.company_id, intent.document_id, intent.id, intent.actor_user_id,
          JSON.stringify({ previous_document_id: previousDocumentId, object_size: Number(intent.measured_size_bytes) })],
      );
      await client.query(
        `INSERT INTO platform.outbox_events
          (aggregate_type,aggregate_id,event_type,payload,idempotency_key)
         VALUES ('document',$1,'document.media_finalized',$2::jsonb,$3)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [intent.document_id, JSON.stringify({ company_id: intent.company_id, document_id: intent.document_id,
          parent_type: intent.parent_type, parent_id: intent.parent_id }), `media-finalize:${intent.id}`],
      );
      await client.query(
        `UPDATE documents.media_upload_intents
         SET state='finalized',finalized_at=now(),lease_owner=NULL,lease_expires_at=NULL,
             last_safe_error=NULL,updated_at=now() WHERE id=$1`,
        [intent.id],
      );
      await client.query("COMMIT");
      return this.finalizedResult({ ...intent, state: "finalized" });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async finalizedResult(intent: IntentRow, client?: PoolClient): Promise<DurableMediaUploadResult> {
    const runner = client ?? this.pool;
    const result = await runner.query(
      "SELECT * FROM documents.doc_metadata WHERE id=$1 AND lifecycle_state NOT IN ('staged','quarantined')",
      [intent.document_id],
    );
    const row = result.rows[0];
    if (!row) throw conflict("Finalized media metadata is unavailable", { intent_id: intent.id });
    return { intent_id: intent.id, state: "finalized", document: mapDocument(row) };
  }

  private async recordSafeFailure(intentId: UUID, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE documents.media_upload_intents
       SET state='retry_wait',lease_owner=NULL,lease_expires_at=NULL,
           last_safe_error=$2,updated_at=now()
       WHERE id=$1 AND state IN ('prepared','uploading','retry_wait','object_confirmed')`,
      [intentId, reason],
    );
  }

  private async quarantine(intentId: UUID, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE documents.media_upload_intents
       SET state='quarantined',attempt_count=attempt_count+1,last_safe_error=$2,
           lease_owner=NULL,lease_expires_at=NULL,updated_at=now()
       WHERE id=$1 AND state <> 'finalized'`,
      [intentId, reason],
    );
  }
}

async function currentCompanyForActor(client: PoolClient, actorId: UUID): Promise<UUID> {
  const result = await client.query<{ company_id: UUID }>(
    `SELECT preference.company_id
     FROM platform.user_session_preferences preference
     JOIN core.users actor ON actor.id=preference.user_id
     JOIN platform.company_profiles company ON company.id=preference.company_id
     WHERE preference.user_id=$1 AND preference.company_id IS NOT NULL
       AND actor.deleted_at IS NULL AND actor.employment_status='active'
       AND company.status='active'`,
    [actorId],
  );
  if (!result.rows[0]) throw forbidden("Active company context is required for media upload");
  return result.rows[0].company_id;
}

async function liveRoles(client: PoolClient, actorId: UUID): Promise<string[]> {
  const result = await client.query<{ role_key: string }>(
    `SELECT role_key FROM core.user_roles
     WHERE user_id=$1 AND status='active' AND deleted_at IS NULL
       AND effective_from <= current_date AND (effective_to IS NULL OR effective_to >= current_date)`,
    [actorId],
  );
  return result.rows.map((row) => row.role_key);
}

async function assertParentAuthorization(
  client: PoolClient,
  companyId: UUID,
  input: DurableMediaUploadInput,
  lock: boolean,
): Promise<void> {
  const currentCompany = await currentCompanyForActor(client, input.actor.id);
  if (currentCompany !== companyId) throw forbidden("Media tenant context changed");
  const roles = await liveRoles(client, input.actor.id);
  const role = (value: string) => roles.includes(value);
  if (input.parentType === "company_profile") {
    if (!role(Roles.Admin) || input.parentId !== companyId) throw forbidden("Company logo upload denied");
    const row = await client.query(
      `SELECT id,version,logo_document_id FROM platform.company_profiles WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [companyId],
    );
    assertExpectedParent(row.rows[0], input);
    return;
  }
  if (input.parentType === "core_user") {
    const row = await client.query(
      `SELECT target.id,target.version,target.profile_photo_document_id
       FROM core.users target
       JOIN platform.user_session_preferences membership ON membership.user_id=target.id
       WHERE target.id=$1 AND membership.company_id=$2 AND target.deleted_at IS NULL
       ${lock ? "FOR UPDATE OF target" : ""}`,
      [input.parentId, companyId],
    );
    if (!row.rows[0]) throw notFound("Media parent not found");
    const ownsParent = input.actor.id === input.parentId;
    const peopleManager = role(Roles.Admin) || role(Roles.HRManager);
    if (input.operation === "replace_profile_photo" && !ownsParent && !peopleManager) {
      throw forbidden("Profile photo upload denied");
    }
    if (input.operation === "create" && !ownsParent) {
      const restricted = input.classification === "medical" || input.classification === "compensation";
      const allowed = restricted
        ? role(Roles.Admin) || role(Roles.Auditor) || role(Roles.HRManager)
        : peopleManager || role(Roles.Auditor) || role(Roles.FinanceManager) ||
          role(Roles.Director) || role(Roles.AssetManager);
      if (!allowed) throw forbidden("Document upload denied");
    }
    assertExpectedParent(row.rows[0], input);
    return;
  }
  throw conflict("Unsupported durable media parent type");
}

function assertExpectedParent(
  row: { version?: number; logo_document_id?: UUID | null; profile_photo_document_id?: UUID | null } | undefined,
  input: DurableMediaUploadInput,
): void {
  if (!row) throw notFound("Media parent not found");
  const pointer = input.parentType === "company_profile" ? row.logo_document_id : row.profile_photo_document_id;
  if (input.expectedParentVersion !== undefined && row.version !== input.expectedParentVersion) {
    throw conflict("Media parent changed concurrently");
  }
  if (input.expectedPointerDocumentId !== undefined && pointer !== input.expectedPointerDocumentId) {
    throw conflict("Media pointer changed concurrently");
  }
}

async function publishParentPointer(client: PoolClient, intent: IntentRow): Promise<UUID | null> {
  if (intent.parent_type === "company_profile") {
    const result = await client.query<{ previous_document_id: UUID | null }>(
      `UPDATE platform.company_profiles
       SET logo_document_id=$1,logo_url=$2,logo_file_name=$3,logo_mime_type=$4,
           logo_size_bytes=$5,version=version+1,updated_at=now()
       WHERE id=$6 AND version=$7 AND logo_document_id IS NOT DISTINCT FROM $8
       RETURNING $8::uuid AS previous_document_id`,
      [intent.document_id, `/api/v1/documents/${intent.document_id}/content`, intent.file_name,
        intent.mime_type, Number(intent.measured_size_bytes), intent.parent_id,
        intent.expected_parent_version, intent.expected_pointer_document_id],
    );
    if (!result.rows[0]) throw conflict("Company logo changed concurrently");
    return result.rows[0].previous_document_id;
  }
  if (intent.parent_type === "core_user" && intent.operation === "replace_profile_photo") {
    const result = await client.query<{ previous_document_id: UUID | null }>(
      `UPDATE core.users SET profile_photo_document_id=$1,profile_photo_url=$2,
          version=version+1,updated_at=now()
       WHERE id=$3 AND version=$4 AND profile_photo_document_id IS NOT DISTINCT FROM $5
       RETURNING $5::uuid AS previous_document_id`,
      [intent.document_id, `/api/v1/documents/${intent.document_id}/content`, intent.parent_id,
        intent.expected_parent_version, intent.expected_pointer_document_id],
    );
    if (!result.rows[0]) throw conflict("Profile photo changed concurrently");
    return result.rows[0].previous_document_id;
  }
  return null;
}

function requestFingerprint(input: DurableMediaUploadInput, checksum: string): string {
  return sha256(Buffer.from(JSON.stringify({
    operation: input.operation,
    parent_type: input.parentType,
    parent_id: input.parentId,
    business_object_type: input.businessObjectType,
    owner_user_id: input.ownerUserId,
    classification: input.classification,
    document_type: input.documentType,
    file_name: input.fileName,
    mime_type: input.mimeType,
    size: input.body.length,
    checksum,
    expected_parent_version: input.expectedParentVersion ?? null,
    expected_pointer_document_id: input.expectedPointerDocumentId ?? null,
  })));
}

function headMatchesIntent(
  evidence: NonNullable<Awaited<ReturnType<ObjectStoragePort["statObject"]>>>,
  intent: IntentRow,
): boolean {
  if (evidence.size !== Number(intent.measured_size_bytes)) return false;
  if (!evidence.metadata) return false;
  return evidence.metadata["x-hrms-intent-id"] === intent.id &&
    evidence.metadata["x-hrms-document-id"] === intent.document_id &&
    evidence.metadata["x-hrms-checksum-sha256"] === intent.checksum_sha256;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function mapDocument(row: Record<string, any>): DocumentMetadata {
  return {
    id: row.id,
    company_id: row.company_id,
    business_object_type: row.business_object_type,
    business_object_id: row.business_object_id,
    owner_user_id: row.owner_user_id,
    classification: row.classification,
    document_type: row.document_type,
    current_version: row.current_version,
    file_name: row.file_name,
    storage_key: row.storage_key,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes),
    checksum_sha256: row.checksum_sha256,
    metadata: row.metadata ?? {},
    created_by_user_id: row.created_by_user_id,
    lifecycle_state: row.lifecycle_state,
    replaced_by_document_id: row.replaced_by_document_id,
    lifecycle_reason: row.lifecycle_reason,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
  };
}

function durableReadAllowed(row: Record<string, any>): boolean {
  const roles = Array.isArray(row.roles) ? row.roles as string[] : [];
  const has = (role: string) => roles.includes(role);
  if (row.document_type === "company_logo") return row.current_logo === true;
  if (row.document_type === "profile_photo") {
    if (row.current_profile !== true) return false;
    return row.target_user_id === row.actor_id || has(Roles.Admin) || has(Roles.Auditor) ||
      has(Roles.HRManager) || Boolean(
        row.target_hierarchy_path && row.actor_hierarchy_path &&
        String(row.target_hierarchy_path).startsWith(`${row.actor_hierarchy_path}.`),
      );
  }
  if (row.classification === "medical" || row.classification === "compensation") {
    return has(Roles.Admin) || has(Roles.Auditor) || has(Roles.HRManager);
  }
  return row.owner_user_id === row.actor_id || row.created_by_user_id === row.actor_id ||
    has(Roles.Admin) || has(Roles.Auditor) || has(Roles.FinanceManager) ||
    has(Roles.Director) || has(Roles.AssetManager);
}
