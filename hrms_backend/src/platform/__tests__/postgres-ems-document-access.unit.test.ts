import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMemoryDataStore } from "../data-store.js";
import { createPostgresPersistenceForTesting } from "../postgres-data-store.js";

describe("PostgreSQL EMS employee-document company classifier", () => {
  it.each([
    ["authorized", [{ id: randomUUID() }]],
    ["hidden", []],
  ] as const)("returns %s from the current actor-company target query", async (expected, rows) => {
    const companyId = randomUUID();
    const actorId = randomUUID();
    const targetId = randomUUID();
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({});
    const release = vi.fn();
    const persistence = persistenceWithClient(query, release);
    durableSessionResolver(persistence).mockResolvedValue({ company: { id: companyId } });

    await expect(
      persistence.classifyEmsEmployeeDocumentAccess(actorId, targetId),
    ).resolves.toBe(expected);
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(query.mock.calls[1]?.[0]).toContain("target_pref.company_id = $2");
    expect(query.mock.calls[1]?.[1]).toEqual([targetId, companyId]);
    expect(query).toHaveBeenNthCalledWith(3, "COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back, releases, and preserves a database failure", async () => {
    const failure = new Error("target company query failed");
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({});
    const release = vi.fn();
    const persistence = persistenceWithClient(query, release);
    durableSessionResolver(persistence).mockResolvedValue({ company: { id: randomUUID() } });

    await expect(
      persistence.classifyEmsEmployeeDocumentAccess(randomUUID(), randomUUID()),
    ).rejects.toBe(failure);
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("preserves the original database failure when rollback also fails", async () => {
    const failure = new Error("target company query failed");
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(new Error("rollback failed"));
    const release = vi.fn();
    const persistence = persistenceWithClient(query, release);
    durableSessionResolver(persistence).mockResolvedValue({ company: { id: randomUUID() } });

    await expect(
      persistence.classifyEmsEmployeeDocumentAccess(randomUUID(), randomUUID()),
    ).rejects.toBe(failure);
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });
});

function persistenceWithClient(query: ReturnType<typeof vi.fn>, release: ReturnType<typeof vi.fn>) {
  const pool = {
    connect: vi.fn().mockResolvedValue({ query, release }),
  };
  return createPostgresPersistenceForTesting(
    pool as never,
    createMemoryDataStore(),
  );
}

function durableSessionResolver(persistence: ReturnType<typeof createPostgresPersistenceForTesting>) {
  const resolver = vi.fn();
  Object.defineProperty(persistence, "resolveDurableSessionContext", {
    configurable: true,
    value: resolver,
  });
  return resolver;
}
