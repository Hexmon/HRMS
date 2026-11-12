import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcileMedia: vi.fn(async (_pool: unknown, _bucket: unknown, _jobs: unknown) => (
    { leased: 1, finalized: 1, quarantined: 0, pending: 0 }
  )),
}));

vi.mock("pg", () => ({
  Pool: class {
    async end() {}
  },
}));

vi.mock("../cloudflare-jobs.js", () => ({
  drainOutbox: vi.fn(),
  purgeCoordinates: vi.fn(),
  readOperationalLag: vi.fn(),
  readPublishedEvent: vi.fn(),
  reconcileMedia: mocks.reconcileMedia,
  sweepAttendance: vi.fn(),
}));

import worker from "../cloudflare-worker.js";

type WorkerEnv = Parameters<typeof worker.queue>[1];

function activeEnvironment(mediaBucket?: { head(key: string): Promise<unknown> }) {
  return {
    HYPERDRIVE: { connectionString: "postgres://unused" },
    JOBS: { send: vi.fn(async () => undefined) },
    EVENTS: { send: vi.fn(async () => undefined) },
    OUTBOX_SIGNAL_TOKEN: "test-token",
    WORKER_ACTIVE: "true",
    ...(mediaBucket ? { MEDIA_BUCKET: mediaBucket } : {}),
  } as WorkerEnv;
}

describe("Cloudflare media Queue dispatch", () => {
  beforeEach(() => {
    mocks.reconcileMedia.mockClear();
    vi.restoreAllMocks();
  });

  it("retries without acknowledgement when the private bucket binding is absent", async () => {
    const decisions: string[] = [];
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await worker.queue({ queue: "hrms-background-jobs", messages: [{
      body: { kind: "media" },
      ack: () => decisions.push("ack"),
      retry: () => decisions.push("retry"),
    }] }, activeEnvironment());

    expect(decisions).toEqual(["retry"]);
    expect(mocks.reconcileMedia).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledOnce();
    expect(JSON.parse(String(errorLog.mock.calls[0]?.[0]))).toEqual({
      job: "queue",
      queue: "hrms-background-jobs",
      error: "Error: worker operation failed",
    });
    expect(errorLog.mock.calls.flat().join(" ")).not.toContain("MEDIA_BUCKET");
  });

  it("passes the validated media job to reconciliation and acknowledges success", async () => {
    const decisions: string[] = [];
    const bucket = { head: vi.fn(async () => null) };
    const env = activeEnvironment(bucket);
    await worker.queue({ queue: "hrms-background-jobs", messages: [{
      body: { kind: "media" },
      ack: () => decisions.push("ack"),
      retry: () => decisions.push("retry"),
    }] }, env);

    expect(mocks.reconcileMedia).toHaveBeenCalledOnce();
    expect(mocks.reconcileMedia.mock.calls[0]?.[1]).toBe(bucket);
    expect(mocks.reconcileMedia.mock.calls[0]?.[2]).toBe(env.JOBS);
    expect(decisions).toEqual(["ack"]);
  });
});
