import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { Roles, type DocumentMetadata, type UUID } from "#shared";
import type { ObjectStoragePort } from "../../../platform/data-store.js";
import { MediaLifecycleService, type IntentRow } from "../media-lifecycle.js";

const actorId = "11111111-1111-4111-8111-111111111111" as UUID;
const companyId = "22222222-2222-4222-8222-222222222222" as UUID;
const parentId = "33333333-3333-4333-8333-333333333333" as UUID;
const documentId = "44444444-4444-4444-8444-444444444444" as UUID;
const previousDocumentId = "55555555-5555-4555-8555-555555555555" as UUID;
const intentId = "66666666-6666-4666-8666-666666666666" as UUID;

describe("durable media finalization", () => {
  it("publishes metadata, version, pointer, replacement, audit, outbox and final intent atomically", async () => {
    const fixture = finalizeFixture();

    await expect(fixture.service.finalize(intentId)).resolves.toEqual({
      intent_id: intentId,
      state: "finalized",
      document: expect.objectContaining({ id: documentId, lifecycle_state: "active" }),
    });

    expect(fixture.sql()[0]).toBe("BEGIN");
    expect(fixture.call("INSERT INTO documents.doc_metadata").params.slice(0, 12)).toEqual([
      documentId, companyId, "core_user", parentId, parentId, "normal", "profile_photo",
      "profile.png", "private/object", "image/png", 19, "a".repeat(64),
    ]);
    expect(fixture.call("INSERT INTO documents.doc_versions").params).toEqual([
      documentId, "private/object", "profile.png", 19, "a".repeat(64), actorId,
    ]);
    const pointer = fixture.call("UPDATE core.users SET profile_photo_document_id=$1");
    expect(pointer.sql).toContain("WHERE id=$3 AND version=$4 AND profile_photo_document_id IS NOT DISTINCT FROM $5");
    expect(pointer.params).toEqual([
      documentId,
      `/api/v1/documents/${documentId}/content`,
      parentId,
      7,
      previousDocumentId,
    ]);
    expect(fixture.call("SET lifecycle_state='replaced'").params).toEqual([
      previousDocumentId, documentId, companyId,
    ]);
    expect(fixture.call("INSERT INTO documents.media_lifecycle_audit").params).toEqual([
      companyId,
      documentId,
      intentId,
      actorId,
      JSON.stringify({ previous_document_id: previousDocumentId, object_size: 19 }),
    ]);
    expect(fixture.call("INSERT INTO platform.outbox_events").params).toEqual([
      documentId,
      JSON.stringify({
        company_id: companyId,
        document_id: documentId,
        parent_type: "core_user",
        parent_id: parentId,
      }),
      `media-finalize:${intentId}`,
    ]);
    expect(fixture.call("SET state='finalized'").params).toEqual([intentId]);
    expect(fixture.call("SELECT * FROM documents.media_upload_intents").params).toEqual([intentId]);
    expect(fixture.call("SELECT * FROM documents.doc_metadata WHERE id=$1").params).toEqual([documentId]);
    expect(fixture.sql().at(-1)).toBe("COMMIT");
    expect(fixture.sql()).not.toContain("ROLLBACK");
    expect(fixture.release).toHaveBeenCalledTimes(1);
  });

  it("replays an already finalized intent without republishing business evidence", async () => {
    const fixture = finalizeFixture({ intent: intent({ state: "finalized" }) });

    await expect(fixture.service.finalize(intentId)).resolves.toEqual({
      intent_id: intentId,
      state: "finalized",
      document: expect.objectContaining({ id: documentId }),
    });

    expect(fixture.sql()[0]).toBe("BEGIN");
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO documents.media_lifecycle_audit"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO platform.outbox_events"));
    expect(fixture.call("SELECT * FROM documents.media_upload_intents").params).toEqual([intentId]);
    expect(fixture.call("SELECT * FROM documents.doc_metadata WHERE id=$1").params).toEqual([documentId]);
    expect(fixture.sql().at(-1)).toBe("COMMIT");
    expect(fixture.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing", null, 404, "Media upload intent not found"],
    ["unconfirmed", intent({ state: "retry_wait" }), 409, "Media object is not confirmed"],
  ])("rolls back a %s intent before publication", async (_case, row, statusCode, message) => {
    const fixture = finalizeFixture({ intent: row });

    await expect(fixture.service.finalize(intentId)).rejects.toMatchObject({ statusCode, message });

    expect(fixture.sql()[0]).toBe("BEGIN");
    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO documents.doc_metadata"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO platform.outbox_events"));
    expect(fixture.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back a stale profile pointer without audit, outbox or final intent publication", async () => {
    const fixture = finalizeFixture({ pointerRows: [] });

    await expect(fixture.service.finalize(intentId)).rejects.toMatchObject({
      statusCode: 409,
      message: "Profile photo changed concurrently",
    });

    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO documents.media_lifecycle_audit"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO platform.outbox_events"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("SET state='finalized'"));
  });

  it("terminalizes a duplicate active proof after rollback and preserves the deterministic conflict", async () => {
    const fixture = finalizeFixture({
      intent: proofIntent(),
      activeProof: true,
    });

    await expect(fixture.service.finalize(intentId)).rejects.toMatchObject({
      statusCode: 409,
      message: "Employee proof already exists; replace the current document",
      details: { reason: "active_employee_proof_exists" },
    });

    expect(fixture.call("last_safe_error='active_employee_proof_exists'").params).toEqual([intentId]);
    expect(fixture.sql().at(-2)).toBe("ROLLBACK");
    expect(fixture.sql().at(-1)).toContain("last_safe_error='active_employee_proof_exists'");
    expect(fixture.poolCalls()).toEqual([]);
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO documents.doc_metadata"));
  });

  it("preserves the business conflict and attaches a failed terminalization as diagnostic cause", async () => {
    const terminalizationFailure = new Error("synthetic terminalization outage");
    const fixture = finalizeFixture({
      intent: proofIntent(),
      activeProof: true,
      terminalizationFailure,
      diagnosticFailure: new Error("synthetic diagnostic sink failure"),
    });

    const error = await fixture.service.finalize(intentId).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      statusCode: 409,
      message: "Employee proof already exists; replace the current document",
      cause: terminalizationFailure,
    });
    expect(fixture.sql().at(-2)).toBe("ROLLBACK");
    expect(fixture.sql().at(-1)).toContain("last_safe_error='active_employee_proof_exists'");
    expect(fixture.diagnostics).toHaveBeenCalledWith({
      event: "media_lifecycle_terminalization_failed",
      intent_id: intentId,
      failure_kind: "database_operation_failed",
    });
    expect(JSON.stringify(fixture.diagnostics.mock.calls)).not.toContain("synthetic terminalization outage");
    expect(fixture.release).toHaveBeenCalledTimes(1);
  });

  it("preserves a rollback failure without reusing a poisoned client or leaking database details", async () => {
    const rollbackFailure = new Error("synthetic rollback connection details");
    const fixture = finalizeFixture({
      intent: proofIntent(),
      activeProof: true,
      rollbackFailure,
    });

    const error = await fixture.service.finalize(intentId).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      statusCode: 409,
      message: "Employee proof already exists; replace the current document",
      cause: rollbackFailure,
    });
    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("last_safe_error='active_employee_proof_exists'"));
    expect(fixture.diagnostics).toHaveBeenCalledWith({
      event: "media_lifecycle_finalize_rollback_failed",
      intent_id: intentId,
      failure_kind: "database_operation_failed",
    });
    expect(JSON.stringify(fixture.diagnostics.mock.calls)).not.toContain("synthetic rollback connection details");
    expect(fixture.release).toHaveBeenCalledTimes(1);
    expect(fixture.release).toHaveBeenCalledWith(rollbackFailure);
  });

  it("rolls back a late publication failure after evidence writes and never returns finalized metadata", async () => {
    const lateFailure = new Error("synthetic final-intent write failure");
    const fixture = finalizeFixture({
      lateFailure: {
        sqlFragment: "SET state='finalized'",
        error: lateFailure,
      },
    });

    await expect(fixture.service.finalize(intentId)).rejects.toBe(lateFailure);

    expect(fixture.sql()).toContainEqual(expect.stringContaining("INSERT INTO documents.media_lifecycle_audit"));
    expect(fixture.sql()).toContainEqual(expect.stringContaining("INSERT INTO platform.outbox_events"));
    expect(fixture.sql()).not.toContain("COMMIT");
    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("SELECT * FROM documents.doc_metadata WHERE id=$1"));
    expect(fixture.release).toHaveBeenCalledTimes(1);
  });
});

function finalizeFixture(options: {
  intent?: IntentRow | null;
  pointerRows?: Array<{ previous_document_id: UUID | null }>;
  activeProof?: boolean;
  terminalizationFailure?: Error;
  rollbackFailure?: Error;
  diagnosticFailure?: Error;
  lateFailure?: { sqlFragment: string; error: Error };
} = {}) {
  const clientCalls: Array<{ sql: string; params: unknown[] }> = [];
  const poolCalls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    clientCalls.push({ sql, params });
    if (sql === "ROLLBACK" && options.rollbackFailure) throw options.rollbackFailure;
    if (options.lateFailure && sql.includes(options.lateFailure.sqlFragment)) {
      throw options.lateFailure.error;
    }
    if (sql.includes("last_safe_error='active_employee_proof_exists'") && options.terminalizationFailure) {
      throw options.terminalizationFailure;
    }
    if (sql.includes("SELECT * FROM documents.media_upload_intents") && sql.includes("FOR UPDATE")) {
      const row = options.intent === undefined ? intent() : options.intent;
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes("SELECT preference.company_id") && sql.includes("FOR SHARE OF preference")) {
      return { rows: [{ company_id: companyId }], rowCount: 1 };
    }
    if (sql.includes("SELECT assignment.role_key")) {
      return { rows: [{ role_key: Roles.Admin }], rowCount: 1 };
    }
    if (sql.includes("SELECT target.id,target.version,target.profile_photo_document_id")) {
      return {
        rows: [{
          id: options.intent?.parent_id ?? parentId,
          version: options.intent?.expected_parent_version ?? 7,
          profile_photo_document_id: options.intent?.expected_pointer_document_id ?? previousDocumentId,
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM documents.doc_metadata") && sql.includes("document_type=$3")) {
      return options.activeProof
        ? { rows: [{ id: previousDocumentId }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (sql.includes("UPDATE core.users SET profile_photo_document_id=$1")) {
      const rows = options.pointerRows ?? [{ previous_document_id: previousDocumentId }];
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("SELECT * FROM documents.doc_metadata WHERE id=$1")) {
      return { rows: [documentRow()], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const poolQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
    poolCalls.push({ sql, params });
    if (sql.includes("SELECT * FROM documents.doc_metadata WHERE id=$1")) {
      return { rows: [documentRow()], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const pool = {
    connect: vi.fn(async () => client),
    query: poolQuery,
  } as unknown as Pool;
  const storage = {
    kind: "memory",
    bucket: "private-media",
  } as ObjectStoragePort;
  const diagnostics = vi.fn(() => {
    if (options.diagnosticFailure) throw options.diagnosticFailure;
  });

  return {
    service: new MediaLifecycleService(pool, storage, diagnostics),
    query,
    release,
    diagnostics,
    sql: () => clientCalls.map(({ sql }) => sql),
    call: (fragment: string) => requiredCall(clientCalls, fragment),
    poolCalls: () => poolCalls,
  };
}

function requiredCall(
  calls: Array<{ sql: string; params: unknown[] }>,
  fragment: string,
): { sql: string; params: unknown[] } {
  const call = calls.find(({ sql }) => sql.includes(fragment));
  if (!call) throw new Error(`Expected SQL call containing: ${fragment}`);
  return call;
}

function intent(overrides: Partial<IntentRow> = {}): IntentRow {
  return {
    id: intentId,
    company_id: companyId,
    actor_user_id: actorId,
    operation: "replace_profile_photo",
    parent_type: "core_user",
    parent_id: parentId,
    business_object_type: "core_user",
    request_fingerprint: "f".repeat(64),
    object_key: "private/object",
    document_id: documentId,
    expected_pointer_document_id: previousDocumentId,
    expected_parent_version: 7,
    file_name: "profile.png",
    mime_type: "image/png",
    measured_size_bytes: 19,
    checksum_sha256: "a".repeat(64),
    classification: "normal",
    document_type: "profile_photo",
    owner_user_id: parentId,
    state: "object_confirmed",
    provider_etag: "etag-1",
    provider_size_bytes: 19,
    lease_owner: null,
    ...overrides,
  };
}

function proofIntent(): IntentRow {
  return intent({
    operation: "create",
    parent_id: actorId,
    owner_user_id: actorId,
    expected_pointer_document_id: null,
    expected_parent_version: null,
    document_type: "identity_proof",
    file_name: "identity.pdf",
    mime_type: "application/pdf",
  });
}

function documentRow(): Record<string, unknown> {
  const now = new Date("2026-11-12T12:00:00.000Z");
  const row: DocumentMetadata = {
    id: documentId,
    company_id: companyId,
    business_object_type: "core_user",
    business_object_id: parentId,
    owner_user_id: parentId,
    classification: "normal",
    document_type: "profile_photo",
    current_version: 1,
    file_name: "profile.png",
    storage_key: "private/object",
    mime_type: "image/png",
    size_bytes: 19,
    checksum_sha256: "a".repeat(64),
    metadata: {},
    created_by_user_id: actorId,
    lifecycle_state: "active",
    replaced_by_document_id: null,
    lifecycle_reason: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    deleted_at: null,
  };
  return { ...row, created_at: now, updated_at: now };
}
