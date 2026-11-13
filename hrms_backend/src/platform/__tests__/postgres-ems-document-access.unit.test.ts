import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Roles } from "#shared";
import { createMemoryDataStore } from "../data-store.js";
import { createPostgresPersistenceForTesting } from "../postgres-data-store.js";

describe("PostgreSQL EMS employee-document company classifier", () => {
  it.each([
    ["self read", "read", [], "actor", "actor", "authorized"],
    ["self write", "write", [], "actor", "actor", "authorized"],
    ["Admin write", "write", [Roles.Admin], "actor", "peer", "authorized"],
    ["HR write", "write", [Roles.HRManager], "actor", "peer", "authorized"],
    ["Auditor read", "read", [Roles.Auditor], "actor", "peer", "authorized"],
    ["Auditor write", "write", [Roles.Auditor], "actor", "peer", "forbidden"],
    ["manager read", "read", [], "company.manager", "company.manager.employee", "authorized"],
    ["manager write", "write", [], "company.manager", "company.manager.employee", "forbidden"],
    ["peer read", "read", [], "company.peer", "company.employee", "forbidden"],
  ] as const)("classifies %s from current durable roles and hierarchy", async (
    _case,
    permission,
    roles,
    actorPath,
    targetPath,
    expected,
  ) => {
    const companyId = randomUUID();
    const actorId = actorPath === "actor" ? randomUUID() : randomUUID();
    const targetId = targetPath === "actor" ? actorId : randomUUID();
    const rows = [{ id: targetId, hierarchy_path: targetPath }];
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({});
    const release = vi.fn();
    const persistence = persistenceWithClient(query, release);
    const durableActor = { id: actorId, hierarchy_path: actorPath, roles };
    durableSessionResolver(persistence).mockResolvedValue({
      company: { id: companyId },
      actor: durableActor,
    });

    const result = await persistence.classifyEmsEmployeeDocumentAccess(actorId, targetId, permission);
    expect(result).toEqual(expected === "authorized"
      ? { decision: "authorized", actor: durableActor }
      : { decision: expected });
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(query.mock.calls[1]?.[0]).toContain("target_pref.company_id = $2");
    expect(query.mock.calls[1]?.[1]).toEqual([targetId, companyId]);
    expect(query).toHaveBeenNthCalledWith(3, "COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("hides a target outside the actor's current company", async () => {
    const actorId = randomUUID();
    const targetId = randomUUID();
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});
    const release = vi.fn();
    const persistence = persistenceWithClient(query, release);
    durableSessionResolver(persistence).mockResolvedValue({
      company: { id: randomUUID() },
      actor: { id: actorId, hierarchy_path: "company.actor", roles: [Roles.Admin] },
    });

    await expect(
      persistence.classifyEmsEmployeeDocumentAccess(actorId, targetId, "read"),
    ).resolves.toEqual({ decision: "hidden" });
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
      persistence.classifyEmsEmployeeDocumentAccess(randomUUID(), randomUUID(), "read"),
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
      persistence.classifyEmsEmployeeDocumentAccess(randomUUID(), randomUUID(), "write"),
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
