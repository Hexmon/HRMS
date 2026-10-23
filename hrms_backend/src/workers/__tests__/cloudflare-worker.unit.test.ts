import { describe, expect, it } from "vitest";
import worker from "../cloudflare-worker.js";

type WorkerEnv = Parameters<typeof worker.fetch>[1];

function environment(active: boolean) {
  const jobs: unknown[] = [];
  const env = {
    HYPERDRIVE: { connectionString: "postgres://unused" },
    JOBS: { send: async (job: unknown) => { jobs.push(job); } },
    EVENTS: { send: async () => undefined },
    OUTBOX_SIGNAL_TOKEN: "test-token",
    WORKER_ACTIVE: active ? "true" : "false",
  } satisfies WorkerEnv;
  return { env, jobs };
}

describe("Cloudflare Worker cutover gate and schedules", () => {
  it("fails closed when the activation binding is absent", async () => {
    const { env, jobs } = environment(true);
    delete (env as WorkerEnv).WORKER_ACTIVE;
    const health = await worker.fetch(new Request("https://worker.example/health"), env);
    expect(await health.json()).toEqual({ status: "ok", active: false });
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.UTC(2026, 4, 20, 14) }, env);
    expect(jobs).toEqual([]);
  });

  it("does not enqueue work before activation", async () => {
    const { env, jobs } = environment(false);
    const health = await worker.fetch(new Request("https://worker.example/health"), env);
    expect(await health.json()).toEqual({ status: "ok", active: false });
    const signal = await worker.fetch(new Request("https://worker.example/internal/outbox-signal", {
      method: "POST", headers: { authorization: "Bearer test-token" },
    }), env);
    expect(signal.status).toBe(503);
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.UTC(2026, 4, 20, 14) }, env);
    const retried: Array<string | number> = [];
    await worker.queue({ queue: "hrms-background-jobs", messages: [{
      body: { kind: "outbox" }, ack: () => retried.push("ack"), retry: (options) => retried.push(options?.delaySeconds ?? 0),
    }] }, env);
    expect(jobs).toEqual([]);
    expect(retried).toEqual([3600]);
  });

  it("authenticates signals and enqueues bounded Cron jobs after activation", async () => {
    const { env, jobs } = environment(true);
    const unauthorized = await worker.fetch(new Request("https://worker.example/internal/outbox-signal", {
      method: "POST", headers: { authorization: "Bearer wrong" },
    }), env);
    expect(unauthorized.status).toBe(401);
    const signal = await worker.fetch(new Request("https://worker.example/internal/outbox-signal", {
      method: "POST", headers: { authorization: "Bearer test-token" },
    }), env);
    expect(signal.status).toBe(202);
    const scheduledTime = Date.UTC(2026, 4, 20, 14);
    for (const cron of ["* * * * *", "*/5 * * * *", "0 * * * *"]) {
      await worker.scheduled({ cron, scheduledTime }, env);
    }
    expect(jobs).toEqual([
      { kind: "outbox" },
      { kind: "outbox" },
      { kind: "attendance", referenceIso: "2026-05-20T14:00:00.000Z" },
      { kind: "purge" },
    ]);
  });
});
