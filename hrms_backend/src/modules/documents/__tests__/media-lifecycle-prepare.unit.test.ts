import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { Roles, type AuthUser, type UUID } from "#shared";
import type { ObjectStoragePort } from "../../../platform/data-store.js";
import {
  MediaLifecycleService,
  requestFingerprint,
  type DurableMediaUploadInput,
  type IntentRow,
} from "../media-lifecycle.js";

const actorId = "11111111-1111-4111-8111-111111111111" as UUID;
const companyId = "22222222-2222-4222-8222-222222222222" as UUID;
const documentId = "33333333-3333-4333-8333-333333333333" as UUID;
const intentId = "44444444-4444-4444-8444-444444444444" as UUID;
const bytes = Buffer.from("prepared-media-bytes");
const checksum = createHash("sha256").update(bytes).digest("hex");

describe("durable media intent preparation", () => {
  it("replays a matching finalized intent without reauthorizing or inserting", async () => {
    const input = uploadInput();
    const existing = intent({ state: "finalized", request_fingerprint: requestFingerprint(input, checksum) });
    const fixture = prepareFixture({ lookups: [[existing]] });

    await expect(fixture.prepare(input)).resolves.toEqual({ intent: existing, created: false });

    expect(fixture.sql()[0]).toBe("BEGIN");
    expectIntentLookups(fixture, 1);
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("SELECT assignment.role_key"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO documents.media_upload_intents"));
    expect(fixture.query).toHaveBeenLastCalledWith("COMMIT");
    expect(fixture.release).toHaveBeenCalledTimes(1);
  });

  it("reauthorizes a matching unfinished intent before replaying it", async () => {
    const input = uploadInput();
    const existing = intent({ state: "retry_wait", request_fingerprint: requestFingerprint(input, checksum) });
    const fixture = prepareFixture({ lookups: [[existing]] });

    await expect(fixture.prepare(input)).resolves.toEqual({ intent: existing, created: false });

    expectIntentLookups(fixture, 1);
    expect(fixture.sql()).toContainEqual(expect.stringContaining("SELECT assignment.role_key"));
    expect(fixture.sql()).toContainEqual(expect.stringContaining("SELECT target.id,target.version,target.profile_photo_document_id"));
    expect(fixture.query).toHaveBeenLastCalledWith("COMMIT");
  });

  it("rejects a reused idempotency key with a changed payload before authorization", async () => {
    const fixture = prepareFixture({
      lookups: [[intent({ request_fingerprint: "f".repeat(64) })]],
    });

    await expect(fixture.prepare(uploadInput())).rejects.toMatchObject({
      statusCode: 409,
      message: "Idempotency key was already used with a different media payload",
    });

    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("SELECT assignment.role_key"));
    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
    expect(fixture.release).toHaveBeenCalledTimes(1);
  });

  it("authorizes and inserts a prepared intent with immutable request evidence", async () => {
    const input = uploadInput();
    const inserted = intent({ request_fingerprint: requestFingerprint(input, checksum) });
    const fixture = prepareFixture({ lookups: [[]], inserted });

    await expect(fixture.prepare(input)).resolves.toEqual({ intent: inserted, created: true });

    expect(fixture.sql()[0]).toBe("BEGIN");
    const insert = fixture.call("INSERT INTO documents.media_upload_intents");
    expect(insert.sql).toContain("ON CONFLICT (company_id,actor_user_id,operation,idempotency_key) DO NOTHING");
    expect(insert.params.slice(1, 9)).toEqual([
      companyId,
      actorId,
      "replace_profile_photo",
      "core_user",
      actorId,
      "core_user",
      "prepare-unit-1",
      requestFingerprint(input, checksum),
    ]);
    expect(insert.params.slice(11)).toEqual([
      null,
      7,
      "profile.png",
      "image/png",
      bytes.length,
      checksum,
      "normal",
      "profile_photo",
      actorId,
    ]);
    const generated = [
      insert.params[0],
      ...String(insert.params[9]).split("/"),
      insert.params[10],
    ];
    expect(generated).toHaveLength(4);
    for (const value of generated) expect(value).toMatch(/^[0-9a-f-]{36}$/u);
    expect(new Set(generated).size).toBe(4);
    expect(String(insert.params[9])).not.toContain(companyId);
    expect(String(insert.params[9])).not.toContain(actorId);
    expect(String(insert.params[9])).not.toContain("profile.png");
    expect(fixture.query).toHaveBeenLastCalledWith("COMMIT");
  });

  it("returns the matching winner when a concurrent insert wins the unique key", async () => {
    const input = uploadInput();
    const winner = intent({ request_fingerprint: requestFingerprint(input, checksum) });
    const fixture = prepareFixture({ lookups: [[], [winner]], inserted: null });

    await expect(fixture.prepare(input)).resolves.toEqual({ intent: winner, created: false });

    expectIntentLookups(fixture, 2);
    expect(fixture.lookupCount()).toBe(2);
    expect(fixture.query).toHaveBeenLastCalledWith("COMMIT");
  });

  it("rejects a missing or mismatched concurrent winner", async () => {
    const missing = prepareFixture({ lookups: [[], []], inserted: null });
    await expect(missing.prepare(uploadInput())).rejects.toMatchObject({
      statusCode: 409,
      message: "Concurrent media upload intent is unavailable",
    });
    expect(missing.sql().at(-1)).toBe("ROLLBACK");
    expect(missing.release).toHaveBeenCalledTimes(1);

    const mismatched = prepareFixture({
      lookups: [[], [intent({ request_fingerprint: "e".repeat(64) })]],
      inserted: null,
    });
    await expect(mismatched.prepare(uploadInput())).rejects.toMatchObject({
      statusCode: 409,
      message: "Idempotency key was already used with a different media payload",
    });
    expect(mismatched.sql().at(-1)).toBe("ROLLBACK");
    expect(mismatched.release).toHaveBeenCalledTimes(1);
  });

  it("reauthorizes unfinished replay with live roles and denies a stale Admin snapshot", async () => {
    const input = uploadInput({
      actor: { ...actor(), roles: [Roles.Admin] },
      parentId: documentId,
      ownerUserId: documentId,
    });
    const existing = intent({
      parent_id: documentId,
      owner_user_id: documentId,
      state: "retry_wait",
      request_fingerprint: requestFingerprint(input, checksum),
    });
    const fixture = prepareFixture({ lookups: [[existing]], liveRoles: [], targetUserId: documentId });

    await expect(fixture.prepare(input)).rejects.toMatchObject({
      statusCode: 403,
      message: "Profile photo upload denied",
    });

    expectIntentLookups(fixture, 1);
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO documents.media_upload_intents"));
    expect(fixture.sql()).not.toContain("COMMIT");
    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
    expect(fixture.release).toHaveBeenCalledTimes(1);
  });

  it("preserves an INSERT failure even when rollback also fails", async () => {
    const failure = new Error("synthetic intent insert failure");
    const fixture = prepareFixture({
      lookups: [[]],
      failureFragment: "INSERT INTO documents.media_upload_intents",
      failure,
      rollbackError: new Error("rollback failed"),
    });

    await expect(fixture.prepare(uploadInput())).rejects.toBe(failure);

    expect(fixture.sql()[0]).toBe("BEGIN");
    expect(fixture.sql()).toContainEqual(expect.stringContaining("INSERT INTO documents.media_upload_intents"));
    expect(fixture.sql()).not.toContain("COMMIT");
    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
    expect(fixture.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back, releases, and preserves an authorization database failure", async () => {
    const failure = new Error("synthetic live-role query failure");
    const fixture = prepareFixture({ lookups: [[]], failureFragment: "SELECT assignment.role_key", failure });

    await expect(fixture.prepare(uploadInput())).rejects.toBe(failure);

    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO documents.media_upload_intents"));
    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
    expect(fixture.release).toHaveBeenCalledTimes(1);
  });
});

function expectIntentLookups(
  fixture: ReturnType<typeof prepareFixture>,
  expectedCount: number,
): void {
  const lookups = fixture.calls("SELECT * FROM documents.media_upload_intents");
  expect(lookups).toHaveLength(expectedCount);
  for (const lookup of lookups) {
    expect(lookup.sql).toContain("WHERE company_id=$1 AND actor_user_id=$2 AND operation=$3 AND idempotency_key=$4");
    expect(lookup.sql).toContain("FOR UPDATE");
    expect(lookup.params).toEqual([
      companyId,
      actorId,
      "replace_profile_photo",
      "prepare-unit-1",
    ]);
  }
}

function prepareFixture(options: {
  lookups?: IntentRow[][];
  inserted?: IntentRow | null;
  failureFragment?: string;
  failure?: Error;
  rollbackError?: Error;
  liveRoles?: string[];
  targetUserId?: UUID;
} = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const lookups = [...(options.lookups ?? [[]])];
  let lookupCount = 0;
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql === "ROLLBACK" && options.rollbackError) throw options.rollbackError;
    if (options.failureFragment && sql.includes(options.failureFragment)) throw options.failure;
    if (sql.includes("SELECT preference.company_id") && sql.includes("FOR SHARE OF preference")) {
      return { rows: [{ company_id: companyId }], rowCount: 1 };
    }
    if (sql.includes("SELECT * FROM documents.media_upload_intents") && sql.includes("FOR UPDATE")) {
      const rows = lookups[lookupCount] ?? [];
      lookupCount += 1;
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("SELECT assignment.role_key")) {
      const roles = options.liveRoles ?? [Roles.Employee];
      return { rows: roles.map((role_key) => ({ role_key })), rowCount: roles.length };
    }
    if (sql.includes("SELECT target.id,target.version,target.profile_photo_document_id")) {
      return {
        rows: [{ id: options.targetUserId ?? actorId, version: 7, profile_photo_document_id: null }],
        rowCount: 1,
      };
    }
    if (sql.includes("INSERT INTO documents.media_upload_intents")) {
      const rows = options.inserted ? [options.inserted] : [];
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 1 };
  });
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const service = new MediaLifecycleService(
    { connect: vi.fn(async () => client) } as unknown as Pool,
    {} as ObjectStoragePort,
  );
  const internals = service as unknown as {
    prepare(input: DurableMediaUploadInput, checksum: string, fingerprint: string): Promise<{
      intent: IntentRow;
      created: boolean;
    }>;
  };

  return {
    prepare: (input: DurableMediaUploadInput) => internals.prepare(
      input,
      checksum,
      requestFingerprint(input, checksum),
    ),
    query,
    release,
    sql: () => calls.map(({ sql }) => sql),
    calls: (fragment: string) => calls.filter(({ sql }) => sql.includes(fragment)),
    lookupCount: () => lookupCount,
    call: (fragment: string) => {
      const call = calls.find(({ sql }) => sql.includes(fragment));
      if (!call) throw new Error(`Expected SQL call containing: ${fragment}`);
      return call;
    },
  };
}

function actor(): AuthUser {
  return {
    id: actorId,
    employee_code: "MEDIA-001",
    email: "media.actor@example.test",
    full_name: "Media Actor",
    department_id: companyId,
    designation_id: companyId,
    roles: [Roles.Employee],
    hierarchy_path: "company.employee",
    employment_status: "active",
  };
}

function uploadInput(overrides: Partial<DurableMediaUploadInput> = {}): DurableMediaUploadInput {
  return {
    actor: actor(),
    operation: "replace_profile_photo",
    parentType: "core_user",
    parentId: actorId,
    businessObjectType: "core_user",
    ownerUserId: actorId,
    classification: "normal",
    documentType: "profile_photo",
    fileName: "profile.png",
    mimeType: "image/png",
    body: bytes,
    idempotencyKey: "prepare-unit-1",
    expectedParentVersion: 7,
    expectedPointerDocumentId: null,
    ...overrides,
  };
}

function intent(overrides: Partial<IntentRow> = {}): IntentRow {
  return {
    id: intentId,
    company_id: companyId,
    actor_user_id: actorId,
    operation: "replace_profile_photo",
    parent_type: "core_user",
    parent_id: actorId,
    business_object_type: "core_user",
    request_fingerprint: "a".repeat(64),
    object_key: "private/object",
    document_id: documentId,
    expected_pointer_document_id: null,
    expected_parent_version: 7,
    file_name: "profile.png",
    mime_type: "image/png",
    measured_size_bytes: bytes.length,
    checksum_sha256: checksum,
    classification: "normal",
    document_type: "profile_photo",
    owner_user_id: actorId,
    state: "prepared",
    provider_etag: null,
    provider_size_bytes: null,
    lease_owner: null,
    ...overrides,
  };
}
