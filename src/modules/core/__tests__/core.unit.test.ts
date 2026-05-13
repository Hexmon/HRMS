import { describe, expect, it } from "vitest";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { CoreService } from "../service.js";

describe("core hierarchy", () => {
  it("resolves ltree-style subtree without recursive traversal", () => {
    const store = createMemoryDataStore();
    const service = new CoreService(store);
    const subtree = service.resolveSubtree(seedIds.reviewer);
    expect(subtree.map((user) => user.employee_code).sort()).toEqual(["E1", "E2", "E3"]);
  });

  it("excludes inactive users from active lookup", () => {
    const store = createMemoryDataStore();
    store.users.find((user) => user.id === seedIds.employee1)!.employment_status = "inactive";
    const service = new CoreService(store);
    const subtree = service.resolveSubtree(seedIds.reviewer);
    expect(subtree.map((user) => user.employee_code)).not.toContain("E1");
  });
});
