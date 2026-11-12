import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("bounded Cloudflare media reconciliation", () => {
  beforeEach(() => {
    lifecycle.finalize.mockReset();
    lifecycle.finalize.mockResolvedValue(undefined);
  });

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
    expect(poolQuery.mock.calls[0]?.[1]?.[2]).toBe("object_not_visible");
    expect(jobs.send).not.toHaveBeenCalled();
  });

  it("quarantines mismatched provider evidence and requeues after terminal progress", async () => {
    const row = intent();
    const { pool, poolQuery } = fakePool([row]);
    const jobs = queue();
    const mediaBucket = bucket(providerHead(row, { size: 99 }));

    await expect(reconcileMedia(pool, mediaBucket, jobs, 1)).resolves.toEqual({
      leased: 1,
      finalized: 0,
      quarantined: 1,
      pending: 0,
    });

    expect(String(poolQuery.mock.calls[0]?.[0])).toContain("provider_evidence_mismatch");
    expect(poolQuery.mock.calls[0]?.[1]).toEqual([row.id, expect.any(String)]);
    expect(lifecycle.finalize).not.toHaveBeenCalled();
    expect(jobs.send).toHaveBeenCalledWith({ kind: "media" });
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
    expect(String(poolQuery.mock.calls[0]?.[0])).toContain("state='object_confirmed'");
    expect(poolQuery.mock.calls[0]?.[1]).toEqual([
      row.id,
      expect.any(String),
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
    expect(poolQuery.mock.calls[1]?.[1]?.[2]).toBe("Error: worker operation failed");
    expect(jobs.send).not.toHaveBeenCalled();
  });

  it("rolls back and releases the connection when lease selection fails", async () => {
    const failure = new Error("selection failed");
    const { pool, clientQuery, release } = fakePool([], failure);

    await expect(reconcileMedia(pool, bucket(), queue())).rejects.toBe(failure);
    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
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

function bucket(head: Awaited<ReturnType<MediaBucket["head"]>> = null): MediaBucket & { head: ReturnType<typeof vi.fn> } {
  return { head: vi.fn(async () => head) };
}

function queue(): JobQueue & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async () => undefined) };
}

function fakePool(rows: IntentRow[], selectFailure?: Error) {
  const clientQuery = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes("SELECT id,state,object_key")) {
      if (selectFailure) throw selectFailure;
      return { rows };
    }
    return { rows: [] };
  });
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query: clientQuery, release }));
  const poolQuery = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
  return {
    pool: { connect, query: poolQuery } as unknown as Pool,
    clientQuery,
    poolQuery,
    release,
  };
}
