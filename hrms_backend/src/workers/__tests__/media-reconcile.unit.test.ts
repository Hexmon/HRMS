import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lifecycle = vi.hoisted(() => ({
  finalize: vi.fn(async (_intentId: string) => undefined),
}));

vi.mock("../../modules/documents/media-lifecycle.js", () => ({
  MediaLifecycleService: class {
    finalize = lifecycle.finalize;
  },
}));

import { reconcileMedia, type JobQueue, type MediaBucket } from "../cloudflare-jobs.js";

type IntentRow = {
  id: string;
  state: "prepared" | "uploading" | "retry_wait" | "object_confirmed";
  object_key: string;
  document_id: string;
  measured_size_bytes: string;
  checksum_sha256: string;
  expires_at: Date;
  attempt_count: number;
};

const leaseOwner = "99999999-9999-4999-8999-999999999999";

describe("bounded Cloudflare media reconciliation", () => {
  beforeEach(() => {
    lifecycle.finalize.mockReset();
    lifecycle.finalize.mockResolvedValue(undefined);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(leaseOwner);
  });

  afterEach(() => vi.restoreAllMocks());

  it("terminalizes expired and exhausted intents, then continues a full batch", async () => {
    const expired = intent({ expires_at: new Date("2000-01-01T00:00:00.000Z") });
    const exhausted = intent({ attempt_count: 5 });
    const { pool, clientQuery, release } = fakePool([expired, exhausted]);
    const jobs = queue();

    await expect(reconcileMedia(pool, bucket(), jobs, 2)).resolves.toEqual({
      leased: 0,
      finalized: 0,
      quarantined: 2,
      pending: 0,
    });

    const terminalUpdate = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("last_safe_error=CASE"),
    );
    expect(terminalUpdate?.[1]).toEqual([[expired.id, exhausted.id], [expired.id]]);
    expect(jobs.send).toHaveBeenCalledWith({ kind: "media" });
    expect(jobs.send).toHaveBeenCalledOnce();
    expect(lifecycle.finalize).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it("releases a missing object with backoff and does not self-requeue without progress", async () => {
    const row = intent();
    const { pool, poolQuery } = fakePool([row]);
    const jobs = queue();
    const mediaBucket = bucket(null);

    await expect(reconcileMedia(pool, mediaBucket, jobs, 1)).resolves.toEqual({
      leased: 1,
      finalized: 0,
      quarantined: 0,
      pending: 1,
    });

    expect(mediaBucket.head).toHaveBeenCalledWith(row.object_key);
    expect(poolQuery).toHaveBeenCalledOnce();
    expect(String(poolQuery.mock.calls[0]?.[0])).toContain("state=CASE WHEN state='object_confirmed'");
    expectLeaseGuard(poolQuery.mock.calls[0], row.id);
    expectMutableStateGuard(poolQuery.mock.calls[0]);
    expect(poolQuery.mock.calls[0]?.[1]).toEqual([row.id, leaseOwner, "object_not_visible"]);
    expect(jobs.send).not.toHaveBeenCalled();
  });

  it.each([
    "size",
    "missing-metadata",
    "missing-intent",
    "wrong-intent",
    "missing-document",
    "wrong-document",
    "missing-checksum",
    "wrong-checksum",
  ] as const)("quarantines %s provider evidence and requeues after terminal progress", async (variant) => {
    const row = intent();
    const { pool, poolQuery } = fakePool([row]);
    const jobs = queue();
    const mediaBucket = bucket(mismatchedHead(row, variant));

    await expect(reconcileMedia(pool, mediaBucket, jobs, 1)).resolves.toEqual({
      leased: 1,
      finalized: 0,
      quarantined: 1,
      pending: 0,
    });

    expect(String(poolQuery.mock.calls[0]?.[0])).toContain("provider_evidence_mismatch");
    expectLeaseGuard(poolQuery.mock.calls[0], row.id);
    expectMutableStateGuard(poolQuery.mock.calls[0]);
    expect(poolQuery.mock.calls[0]?.[1]).toEqual([row.id, leaseOwner]);
    expect(String(poolQuery.mock.calls[0]?.[0])).not.toContain("state='object_confirmed'");
    expect(lifecycle.finalize).not.toHaveBeenCalled();
    expect(jobs.send).toHaveBeenCalledWith({ kind: "media" });
    expect(jobs.send).toHaveBeenCalledOnce();
  });

  it("does not count or requeue a provider mismatch after losing the lease", async () => {
    const row = intent();
    const { pool } = fakePool([row], undefined, undefined, [0]);
    const jobs = queue();

    await expect(reconcileMedia(pool, bucket(mismatchedHead(row, "size")), jobs, 1)).resolves.toEqual({
      leased: 1,
      finalized: 0,
      quarantined: 0,
      pending: 0,
    });
    expect(lifecycle.finalize).not.toHaveBeenCalled();
    expect(jobs.send).not.toHaveBeenCalled();
  });

  it("keeps an old confirmed intent eligible, records matching HEAD evidence and finalizes once", async () => {
    const row = intent({
      state: "object_confirmed",
      expires_at: new Date("2000-01-01T00:00:00.000Z"),
      attempt_count: 99,
    });
    const { pool, clientQuery, poolQuery } = fakePool([row]);
    const jobs = queue();
    const mediaBucket = bucket(providerHead(row));

    await expect(reconcileMedia(pool, mediaBucket, jobs, 1)).resolves.toEqual({
      leased: 1,
      finalized: 1,
      quarantined: 0,
      pending: 0,
    });

    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("last_safe_error=CASE"))).toBe(false);
    const selectionSql = String(clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("SELECT id,state,object_key"),
    )?.[0]);
    expect(selectionSql).toContain("lease_expires_at IS NULL OR lease_expires_at <= now()");
    expect(selectionSql).toContain("lease_owner IS NULL AND expires_at <= now()");
    expect(selectionSql).toContain("FOR UPDATE SKIP LOCKED");
    const leaseUpdate = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("SET lease_owner=$1"),
    );
    expect(leaseUpdate?.[1]).toEqual([leaseOwner, [row.id]]);
    expect(String(poolQuery.mock.calls[0]?.[0])).toContain("state='object_confirmed'");
    expectLeaseGuard(poolQuery.mock.calls[0], row.id);
    expectMutableStateGuard(poolQuery.mock.calls[0]);
    expect(poolQuery.mock.calls[0]?.[1]).toEqual([
      row.id,
      leaseOwner,
      "etag-1",
      Number(row.measured_size_bytes),
      JSON.stringify({
        content_type: "application/pdf",
        intent_marker_present: true,
        document_marker_present: true,
        checksum_marker_present: true,
      }),
    ]);
    expect(lifecycle.finalize).toHaveBeenCalledOnce();
    expect(lifecycle.finalize).toHaveBeenCalledWith(row.id);
    expect(jobs.send).toHaveBeenCalledWith({ kind: "media" });
    expect(jobs.send).toHaveBeenCalledOnce();
  });

  it("does not finalize matching evidence after losing the lease", async () => {
    const row = intent();
    const { pool } = fakePool([row], undefined, undefined, [0]);
    const jobs = queue();

    await expect(reconcileMedia(pool, bucket(providerHead(row)), jobs, 1)).resolves.toEqual({
      leased: 1,
      finalized: 0,
      quarantined: 0,
      pending: 0,
    });
    expect(lifecycle.finalize).not.toHaveBeenCalled();
    expect(jobs.send).not.toHaveBeenCalled();
  });

  it.each([403, 404, 409])("quarantines a terminal %s finalization error", async (statusCode) => {
    const row = intent();
    const { pool, poolQuery } = fakePool([row]);
    lifecycle.finalize.mockRejectedValueOnce(Object.assign(new Error("terminal"), { statusCode }));

    await expect(reconcileMedia(pool, bucket(providerHead(row)), queue(), 2)).resolves.toEqual({
      leased: 1,
      finalized: 0,
      quarantined: 1,
      pending: 0,
    });

    expect(poolQuery).toHaveBeenCalledTimes(2);
    expect(String(poolQuery.mock.calls[1]?.[0])).toContain("state='quarantined'");
    expect(String(poolQuery.mock.calls[1]?.[0])).toContain("state <> 'finalized'");
    expectLeaseGuard(poolQuery.mock.calls[1], row.id);
    expect(poolQuery.mock.calls[1]?.[1]?.[1]).toBe(leaseOwner);
    expect(poolQuery.mock.calls[1]?.[1]?.[2]).toBe("Error: worker operation failed");
  });

  it("releases a transient finalization error without immediate requeue", async () => {
    const row = intent();
    const { pool, poolQuery } = fakePool([row]);
    const jobs = queue();
    lifecycle.finalize.mockRejectedValueOnce(new Error("provider credential secret"));

    await expect(reconcileMedia(pool, bucket(providerHead(row)), jobs, 1)).resolves.toEqual({
      leased: 1,
      finalized: 0,
      quarantined: 0,
      pending: 1,
    });

    expect(poolQuery).toHaveBeenCalledTimes(2);
    expect(String(poolQuery.mock.calls[1]?.[0])).toContain("state=CASE WHEN state='object_confirmed'");
    expectLeaseGuard(poolQuery.mock.calls[1], row.id);
    expectMutableStateGuard(poolQuery.mock.calls[1]);
    expect(poolQuery.mock.calls[1]?.[1]?.[1]).toBe(leaseOwner);
    expect(poolQuery.mock.calls[1]?.[1]?.[2]).toBe("Error: worker operation failed");
    expect(jobs.send).not.toHaveBeenCalled();
  });

  it("does not count a missing object after losing the lease", async () => {
    const row = intent();
    const { pool } = fakePool([row], undefined, undefined, [0]);

    await expect(reconcileMedia(pool, bucket(null), queue(), 1)).resolves.toEqual({
      leased: 1,
      finalized: 0,
      quarantined: 0,
      pending: 0,
    });
  });

  it("does not count a terminal finalize failure after losing the lease", async () => {
    const row = intent();
    const { pool } = fakePool([row], undefined, undefined, [1, 0]);
    const jobs = queue();
    lifecycle.finalize.mockRejectedValueOnce(Object.assign(new Error("terminal"), { statusCode: 409 }));

    await expect(reconcileMedia(pool, bucket(providerHead(row)), jobs, 1)).resolves.toEqual({
      leased: 1,
      finalized: 0,
      quarantined: 0,
      pending: 0,
    });
    expect(jobs.send).not.toHaveBeenCalled();
  });

  it("does not count a transient finalize failure after losing the lease", async () => {
    const row = intent();
    const { pool } = fakePool([row], undefined, undefined, [1, 0]);
    lifecycle.finalize.mockRejectedValueOnce(new Error("temporary"));

    await expect(reconcileMedia(pool, bucket(providerHead(row)), queue(), 1)).resolves.toEqual({
      leased: 1,
      finalized: 0,
      quarantined: 0,
      pending: 0,
    });
  });

  it.each([undefined, 403, 404, 409])(
    "backs off a bucket HEAD failure with status %s without exposing its message",
    async (statusCode) => {
      const row = intent();
      const { pool, poolQuery } = fakePool([row]);
      const mediaBucket = bucket();
      mediaBucket.head.mockRejectedValueOnce(Object.assign(
        new Error("provider credential secret"),
        statusCode === undefined ? {} : { statusCode },
      ));

      await expect(reconcileMedia(pool, mediaBucket, queue(), 1)).resolves.toEqual({
        leased: 1,
        finalized: 0,
        quarantined: 0,
        pending: 1,
      });
      expect(poolQuery.mock.calls[0]?.[1]?.[2]).toBe("Error: worker operation failed");
      expect(lifecycle.finalize).not.toHaveBeenCalled();
    },
  );

  it("rolls back and releases the connection when lease selection fails", async () => {
    const failure = new Error("selection failed");
    const { pool, clientQuery, release } = fakePool([], failure);
    const mediaBucket = bucket();
    const jobs = queue();

    await expect(reconcileMedia(pool, mediaBucket, jobs)).rejects.toBe(failure);
    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
    expect(mediaBucket.head).not.toHaveBeenCalled();
    expect(lifecycle.finalize).not.toHaveBeenCalled();
    expect(jobs.send).not.toHaveBeenCalled();
  });

  it("preserves the selection failure when rollback also fails", async () => {
    const failure = new Error("selection failed");
    const { pool, clientQuery, release } = fakePool([], failure, new Error("rollback failed"));
    const mediaBucket = bucket();
    const jobs = queue();

    await expect(reconcileMedia(pool, mediaBucket, jobs)).rejects.toBe(failure);
    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
    expect(mediaBucket.head).not.toHaveBeenCalled();
    expect(lifecycle.finalize).not.toHaveBeenCalled();
    expect(jobs.send).not.toHaveBeenCalled();
  });

  it("returns an empty bounded result without queue recursion", async () => {
    const { pool } = fakePool([]);
    const jobs = queue();

    await expect(reconcileMedia(pool, bucket(), jobs)).resolves.toEqual({
      leased: 0,
      finalized: 0,
      quarantined: 0,
      pending: 0,
    });
    expect(jobs.send).not.toHaveBeenCalled();
  });
});

function intent(overrides: Partial<IntentRow> = {}): IntentRow {
  const id = randomUUID();
  return {
    id,
    state: "prepared",
    object_key: `companies/company/media/${id}`,
    document_id: randomUUID(),
    measured_size_bytes: "12",
    checksum_sha256: "a".repeat(64),
    expires_at: new Date("2099-01-01T00:00:00.000Z"),
    attempt_count: 0,
    ...overrides,
  };
}

function providerHead(row: IntentRow, overrides: Record<string, unknown> = {}) {
  return {
    size: Number(row.measured_size_bytes),
    etag: "etag-1",
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: {
      "x-hrms-intent-id": row.id,
      "x-hrms-document-id": row.document_id,
      "x-hrms-checksum-sha256": row.checksum_sha256,
    },
    ...overrides,
  };
}

function mismatchedHead(
  row: IntentRow,
  variant: "size" | "missing-metadata" | "missing-intent" | "wrong-intent" |
    "missing-document" | "wrong-document" | "missing-checksum" | "wrong-checksum",
) {
  const head = providerHead(row);
  if (variant === "size") return { ...head, size: 99 };
  if (variant === "missing-metadata") return { ...head, customMetadata: undefined };
  const customMetadata: Record<string, string> = { ...head.customMetadata };
  const field = variant.includes("intent")
    ? "x-hrms-intent-id"
    : variant.includes("document")
      ? "x-hrms-document-id"
      : "x-hrms-checksum-sha256";
  if (variant.startsWith("missing")) delete customMetadata[field];
  else customMetadata[field] = randomUUID();
  return { ...head, customMetadata };
}

function bucket(head: Awaited<ReturnType<MediaBucket["head"]>> = null): MediaBucket & { head: ReturnType<typeof vi.fn> } {
  return { head: vi.fn(async () => head) };
}

function queue(): JobQueue & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async () => undefined) };
}

function fakePool(
  rows: IntentRow[],
  selectFailure?: Error,
  rollbackFailure?: Error,
  poolRowCounts: number[] = [],
) {
  const clientQuery = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql === "ROLLBACK" && rollbackFailure) throw rollbackFailure;
    if (sql.includes("SELECT id,state,object_key")) {
      if (selectFailure) throw selectFailure;
      return { rows };
    }
    return { rows: [] };
  });
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query: clientQuery, release }));
  const poolQuery = vi.fn(async (_sql: string, _params?: unknown[]) => ({
    rows: [],
    rowCount: poolRowCounts.shift() ?? 1,
  }));
  return {
    pool: { connect, query: poolQuery } as unknown as Pool,
    clientQuery,
    poolQuery,
    release,
  };
}

function expectLeaseGuard(call: [string, unknown[]?] | undefined, intentId: string) {
  expect(call).toBeDefined();
  expect(String(call?.[0])).toContain("WHERE id=$1 AND lease_owner=$2");
  expect(call?.[1]?.[0]).toBe(intentId);
  expect(call?.[1]?.[1]).toBe(leaseOwner);
}

function expectMutableStateGuard(call: [string, unknown[]?] | undefined) {
  expect(String(call?.[0])).toContain(
    "AND state IN ('prepared','uploading','retry_wait','object_confirmed')",
  );
}
