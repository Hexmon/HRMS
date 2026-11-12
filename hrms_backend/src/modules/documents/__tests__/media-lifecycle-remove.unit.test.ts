import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { Roles, type AuthUser, type UUID } from "#shared";
import type { ObjectStoragePort } from "../../../platform/data-store.js";
import { MediaLifecycleService } from "../media-lifecycle.js";

const actorId = "11111111-1111-4111-8111-111111111111" as UUID;
const companyId = "22222222-2222-4222-8222-222222222222" as UUID;
const documentId = "33333333-3333-4333-8333-333333333333" as UUID;
const targetId = "44444444-4444-4444-8444-444444444444" as UUID;
const replayKey = `media-remove:${companyId}:${actorId}:remove-profile-photo-1`;

describe("durable profile-photo logical removal", () => {
  it("clears the current pointer, tombstones metadata, and publishes audit/outbox atomically", async () => {
    const fixture = removalFixture();

    await expect(fixture.service.removeProfilePhoto(removalInput())).resolves.toBeUndefined();

    expect(fixture.sql()).toContainEqual(expect.stringContaining("UPDATE core.users SET profile_photo_document_id=NULL"));
    expect(fixture.sql()).toContainEqual(expect.stringContaining("SET lifecycle_state='tombstoned'"));
    expect(fixture.sql()).toContainEqual(expect.stringContaining("INSERT INTO documents.media_lifecycle_audit"));
    expect(fixture.sql()).toContainEqual(expect.stringContaining("INSERT INTO platform.outbox_events"));
    expect(fixture.call("SELECT payload FROM platform.outbox_events").params).toEqual([replayKey]);
    const pointer = fixture.call("UPDATE core.users SET profile_photo_document_id=NULL");
    expect(pointer.sql).toContain("WHERE id=$1 AND version=$2 AND profile_photo_document_id=$3");
    expect(pointer.params).toEqual([actorId, 7, documentId]);
    const tombstone = fixture.call("SET lifecycle_state='tombstoned'");
    expect(tombstone.sql).toContain("WHERE id=$1 AND company_id=$2 AND lifecycle_state='active'");
    expect(tombstone.params).toEqual([documentId, companyId]);
    expect(fixture.call("INSERT INTO documents.media_lifecycle_audit").params).toEqual([
      companyId,
      documentId,
      actorId,
      JSON.stringify({ parent_type: "core_user", parent_id: actorId }),
    ]);
    const outbox = fixture.call("INSERT INTO platform.outbox_events");
    expect(outbox.sql).toContain("'document.media_tombstoned'");
    expect(outbox.params).toEqual([
      documentId,
      JSON.stringify({
        company_id: companyId,
        document_id: documentId,
        parent_id: actorId,
        expected_version: 7,
      }),
      replayKey,
    ]);
    expect(fixture.query).toHaveBeenLastCalledWith("COMMIT");
    expect(fixture.storage.removeObject).not.toHaveBeenCalled();
    expect(fixture.release).toHaveBeenCalledTimes(1);
  });

  it("commits an exact replay without repeating any business mutation", async () => {
    const fixture = removalFixture({
      replay: { document_id: documentId, parent_id: actorId, expected_version: 7 },
    });

    await expect(fixture.service.removeProfilePhoto(removalInput())).resolves.toBeUndefined();

    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("UPDATE core.users SET profile_photo_document_id=NULL"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("SET lifecycle_state='tombstoned'"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO documents.media_lifecycle_audit"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO platform.outbox_events\n"));
    expect(fixture.query).toHaveBeenLastCalledWith("COMMIT");
  });

  it.each([
    ["document", { document_id: "44444444-4444-4444-8444-444444444444", parent_id: actorId, expected_version: 7 }],
    ["parent", { document_id: documentId, parent_id: companyId, expected_version: 7 }],
    ["version", { document_id: documentId, parent_id: actorId, expected_version: 8 }],
  ])("rejects an idempotency key replay with changed %s identity", async (_case, replay) => {
    const fixture = removalFixture({ replay });

    await expect(fixture.service.removeProfilePhoto(removalInput())).rejects.toMatchObject({
      statusCode: 409,
      message: "Idempotency key was already used with a different logical removal",
    });

    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
    expect(fixture.storage.removeObject).not.toHaveBeenCalled();
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO documents.media_lifecycle_audit"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO platform.outbox_events\n"));
  });

  it("rolls back when the profile pointer changes concurrently", async () => {
    const fixture = removalFixture({ pointerUpdateRows: 0 });

    await expect(fixture.service.removeProfilePhoto(removalInput())).rejects.toMatchObject({
      statusCode: 409,
      message: "Profile photo changed concurrently",
    });

    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("SET lifecycle_state='tombstoned'"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO documents.media_lifecycle_audit"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO platform.outbox_events\n"));
    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
  });

  it("rolls back when current metadata cannot be tombstoned", async () => {
    const fixture = removalFixture({ tombstoneRows: 0 });

    await expect(fixture.service.removeProfilePhoto(removalInput())).rejects.toMatchObject({
      statusCode: 409,
      message: "Current profile photo metadata is unavailable",
    });

    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO documents.media_lifecycle_audit"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO platform.outbox_events\n"));
    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
  });

  it("preserves a database failure while rolling back and releasing the client", async () => {
    const failure = new Error("synthetic tombstone failure");
    const fixture = removalFixture({ tombstoneError: failure });

    await expect(fixture.service.removeProfilePhoto(removalInput())).rejects.toBe(failure);

    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
    expect(fixture.release).toHaveBeenCalledTimes(1);
    expect(fixture.storage.removeObject).not.toHaveBeenCalled();
  });

  it("denies removal when the actor tenant context changes before authorization", async () => {
    const fixture = removalFixture({ currentCompanyId: targetId });

    await expect(fixture.service.removeProfilePhoto(removalInput())).rejects.toMatchObject({
      statusCode: 403,
      message: "Media tenant context changed",
    });

    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("UPDATE core.users SET profile_photo_document_id=NULL"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO documents.media_lifecycle_audit"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO platform.outbox_events\n"));
    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
  });

  it("denies a peer removal when a stale Admin snapshot has no live privileged role", async () => {
    const fixture = removalFixture({ liveRoles: [], targetUserId: targetId });

    await expect(fixture.service.removeProfilePhoto(removalInput({
      actor: { ...actor(), roles: [Roles.Admin] },
      userId: targetId,
    }))).rejects.toMatchObject({
      statusCode: 403,
      message: "Profile photo upload denied",
    });

    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("UPDATE core.users SET profile_photo_document_id=NULL"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO documents.media_lifecycle_audit"));
    expect(fixture.sql()).not.toContainEqual(expect.stringContaining("INSERT INTO platform.outbox_events\n"));
    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
  });

  it.each([
    ["audit", "INSERT INTO documents.media_lifecycle_audit"],
    ["outbox", "INSERT INTO platform.outbox_events\n"],
  ])("rolls back when the %s evidence insert fails", async (label, failureFragment) => {
    const failure = new Error(`synthetic ${label} failure`);
    const fixture = removalFixture({ failureFragment, failure });

    await expect(fixture.service.removeProfilePhoto(removalInput())).rejects.toBe(failure);

    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
    expect(fixture.sql()).not.toContain("COMMIT");
    expect(fixture.release).toHaveBeenCalledTimes(1);
  });

  it("preserves the original mutation failure when rollback also fails", async () => {
    const failure = new Error("synthetic tombstone failure");
    const fixture = removalFixture({
      tombstoneError: failure,
      rollbackError: new Error("rollback failed"),
    });

    await expect(fixture.service.removeProfilePhoto(removalInput())).rejects.toBe(failure);

    expect(fixture.sql().at(-1)).toBe("ROLLBACK");
    expect(fixture.release).toHaveBeenCalledTimes(1);
  });
});

function removalFixture(options: {
  replay?: { document_id?: string; parent_id?: string; expected_version?: number };
  pointerUpdateRows?: number;
  tombstoneRows?: number;
  tombstoneError?: Error;
  currentCompanyId?: UUID;
  liveRoles?: string[];
  targetUserId?: UUID;
  failureFragment?: string;
  failure?: Error;
  rollbackError?: Error;
} = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql === "ROLLBACK" && options.rollbackError) throw options.rollbackError;
    if (options.failureFragment && sql.includes(options.failureFragment)) throw options.failure;
    if (sql.includes("SELECT company_id FROM platform.user_session_preferences")) {
      return { rows: [{ company_id: companyId }], rowCount: 1 };
    }
    if (sql.includes("SELECT payload FROM platform.outbox_events")) {
      return { rows: options.replay ? [{ payload: options.replay }] : [], rowCount: options.replay ? 1 : 0 };
    }
    if (sql.includes("SELECT preference.company_id") && sql.includes("FOR SHARE OF preference")) {
      return { rows: [{ company_id: options.currentCompanyId ?? companyId }], rowCount: 1 };
    }
    if (sql.includes("SELECT assignment.role_key")) {
      const roles = options.liveRoles ?? [Roles.Employee];
      return { rows: roles.map((role_key) => ({ role_key })), rowCount: roles.length };
    }
    if (sql.includes("SELECT target.id,target.version,target.profile_photo_document_id")) {
      return {
        rows: [{ id: options.targetUserId ?? actorId, version: 7, profile_photo_document_id: documentId }],
        rowCount: 1,
      };
    }
    if (sql.includes("UPDATE core.users SET profile_photo_document_id=NULL")) {
      const rowCount = options.pointerUpdateRows ?? 1;
      return { rows: [], rowCount };
    }
    if (sql.includes("SET lifecycle_state='tombstoned'")) {
      if (options.tombstoneError) throw options.tombstoneError;
      const rowCount = options.tombstoneRows ?? 1;
      return { rows: [], rowCount };
    }
    return { rows: [], rowCount: 1 };
  });
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const pool = {
    connect: vi.fn(async () => client),
  } as unknown as Pool;
  const storage = {
    kind: "memory",
    bucket: "unit-private-media",
    putObject: vi.fn(),
    getObject: vi.fn(),
    statObject: vi.fn(),
    removeObject: vi.fn(),
  } as unknown as ObjectStoragePort & { removeObject: ReturnType<typeof vi.fn> };

  return {
    service: new MediaLifecycleService(pool, storage),
    storage,
    query,
    release,
    sql: () => calls.map(({ sql }) => sql),
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

function removalInput(overrides: Partial<ReturnType<typeof baseRemovalInput>> = {}) {
  return { ...baseRemovalInput(), ...overrides };
}

function baseRemovalInput() {
  return {
    actor: actor(),
    userId: actorId,
    expectedVersion: 7,
    expectedPointerDocumentId: documentId,
    idempotencyKey: "remove-profile-photo-1",
  };
}
