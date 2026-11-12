import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import type { DocumentMetadata, UUID } from "#shared";
import type { ObjectStoragePort } from "../../../platform/data-store.js";
import { MediaLifecycleService } from "../media-lifecycle.js";

const actorId = "11111111-1111-4111-8111-111111111111" as UUID;
const companyId = "22222222-2222-4222-8222-222222222222" as UUID;
const documentId = "33333333-3333-4333-8333-333333333333" as UUID;
const body = Buffer.from("verified-private-document");

describe("durable media content reads", () => {
  it("denies and audits a read when private storage has no bytes", async () => {
    const fixture = contentFixture({ objects: [null] });

    await expect(fixture.service.activeContent(actorId, documentId)).rejects.toMatchObject({
      statusCode: 404,
      message: "Document bytes are not available in private object storage.",
    });

    expect(fixture.readDecisions()).toEqual([
      [documentId, actorId, "denied", "storage_object_missing"],
    ]);
    expect(fixture.authorizationDecisions()).toEqual([
      [documentId, actorId, "authorize-content", "allowed", null],
    ]);
  });

  it.each([
    ["reported size", { size: body.length + 1, body }],
    ["body size", { size: body.length, body: body.subarray(1) }],
    ["checksum", { size: body.length, body: Buffer.from("tampered-private-document") }],
  ])("denies and audits a %s integrity mismatch", async (_case, object) => {
    const fixture = contentFixture({ objects: [object] });

    await expect(fixture.service.activeContent(actorId, documentId)).rejects.toMatchObject({
      statusCode: 404,
      message: "Document bytes failed integrity verification.",
    });

    expect(fixture.readDecisions()).toEqual([
      [documentId, actorId, "denied", "storage_integrity_mismatch"],
    ]);
    expect(fixture.authorizationRowsRead()).toBe(1);
  });

  it("denies and audits when authorization is revoked while bytes are loading", async () => {
    const fixture = contentFixture({ authorizationRows: [documentRow(), null] });

    await expect(fixture.service.activeContent(actorId, documentId)).rejects.toMatchObject({
      statusCode: 404,
      message: "Document not found",
    });

    expect(fixture.readDecisions()).toEqual([
      [documentId, actorId, "denied", "authorization_or_lifecycle_changed_during_read"],
    ]);
    expect(fixture.authorizationRowsRead()).toBe(2);
  });

  it("denies and audits when the storage pointer changes while bytes are loading", async () => {
    const fixture = contentFixture({
      authorizationRows: [documentRow(), documentRow({ storage_key: "private/replaced" })],
    });

    await expect(fixture.service.activeContent(actorId, documentId)).rejects.toMatchObject({
      statusCode: 404,
      message: "Document not found",
    });

    expect(fixture.readDecisions()).toEqual([
      [documentId, actorId, "denied", "storage_pointer_changed_during_read"],
    ]);
  });

  it("returns verified bytes only after reauthorization and records an allowed read", async () => {
    const fixture = contentFixture({
      authorizationRows: [documentRow({ mime_type: "" }), documentRow({ mime_type: "" })],
    });

    await expect(fixture.service.activeContent(actorId, documentId)).resolves.toEqual({
      document: expect.objectContaining({ id: documentId, storage_key: "private/current" }),
      body,
      contentType: "application/octet-stream",
      size: body.length,
    });

    expect(fixture.storage.getObject).toHaveBeenCalledWith("private/current");
    expect(fixture.authorizationRowsRead()).toBe(2);
    expect(fixture.readDecisions()).toEqual([
      [documentId, actorId, "allowed", null],
    ]);
  });
});

function contentFixture(options: {
  authorizationRows?: Array<Record<string, unknown> | null>;
  objects?: Array<{ body: Buffer; size: number; contentType?: string } | null>;
} = {}) {
  const authorizationRows = [...(options.authorizationRows ?? [documentRow(), documentRow()])];
  const objects = [...(options.objects ?? [{ body, size: body.length }])];
  const clientQueries: Array<{ sql: string; params: unknown[] }> = [];
  const poolQueries: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    clientQueries.push({ sql, params });
    if (sql.includes("WITH actor_context AS")) {
      const row = authorizationRows.shift();
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    return { rows: [], rowCount: 1 };
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const pool = {
    connect: vi.fn(async () => client),
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      poolQueries.push({ sql, params });
      return { rows: [], rowCount: 1 };
    }),
  } as unknown as Pool;
  const storage = {
    kind: "memory",
    bucket: "unit-private-media",
    putObject: vi.fn(),
    getObject: vi.fn(async () => objects.shift() ?? null),
    statObject: vi.fn(),
    removeObject: vi.fn(),
  } as unknown as ObjectStoragePort;

  return {
    service: new MediaLifecycleService(pool, storage),
    storage: storage as ObjectStoragePort & { getObject: ReturnType<typeof vi.fn> },
    authorizationRowsRead: () => clientQueries.filter(({ sql }) => sql.includes("WITH actor_context AS")).length,
    authorizationDecisions: () => clientQueries
      .filter(({ sql }) => sql.includes("INSERT INTO documents.doc_access_logs"))
      .map(({ params }) => params),
    readDecisions: () => poolQueries
      .filter(({ sql }) => sql.includes("INSERT INTO documents.doc_access_logs"))
      .map(({ params }) => params),
  };
}

function documentRow(overrides: Partial<DocumentMetadata> = {}): Record<string, unknown> {
  const now = new Date("2026-11-12T12:00:00.000Z");
  return {
    id: documentId,
    company_id: companyId,
    business_object_type: "core_user",
    business_object_id: actorId,
    owner_user_id: actorId,
    classification: "normal",
    document_type: "identity_proof",
    current_version: 1,
    file_name: "identity.pdf",
    storage_key: "private/current",
    mime_type: "application/pdf",
    size_bytes: body.length,
    checksum_sha256: createHash("sha256").update(body).digest("hex"),
    metadata: {},
    created_by_user_id: actorId,
    lifecycle_state: "active",
    replaced_by_document_id: null,
    lifecycle_reason: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    actor_id: actorId,
    actor_hierarchy_path: "company.employee",
    target_user_id: actorId,
    target_hierarchy_path: "company.employee",
    roles: [],
    current_logo: false,
    current_profile: false,
    ...overrides,
  };
}
