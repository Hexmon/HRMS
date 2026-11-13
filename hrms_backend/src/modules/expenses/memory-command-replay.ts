import { conflict } from "../../platform/errors.js";

interface ReplayRecord<Response> {
  requestHash: string;
  response: Response;
}

/** Bounded, non-evicting replay storage for the isolated in-memory runtime. */
export class BoundedMemoryCommandReplay<Response> {
  private readonly results = new Map<string, ReplayRecord<Response>>();

  constructor(private readonly capacity = 10_000) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("Memory command replay capacity must be a positive integer");
    }
  }

  execute(input: {
    key: string;
    requestHash: string;
    action: string;
    run: () => Response;
  }): Response {
    const existing = this.results.get(input.key);
    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        throw conflict("Idempotency key was already used with a different request", {
          action: input.action,
        });
      }
      return existing.response;
    }
    // Never evict a replay record: doing so could execute an old key twice.
    if (this.results.size >= this.capacity) {
      throw conflict(
        "Memory expense command replay capacity is exhausted; restart the isolated local/test instance",
      );
    }
    const response = input.run();
    this.results.set(input.key, { requestHash: input.requestHash, response });
    return response;
  }

  get size(): number {
    return this.results.size;
  }
}
