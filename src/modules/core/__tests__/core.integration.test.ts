import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("core hierarchy API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("returns active subordinate subtree with summary/depth and hierarchy scoping", async () => {
    const reviewer = await loginAs(app, "D1");
    const employee = await loginAs(app, "E1");
    const auditor = await loginAs(app, "AUD");

    const reviewerSubtree = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${reviewer.user.id}/subtree?page=1&page_size=10`,
      headers: authHeader(reviewer.token)
    });
    expect(reviewerSubtree.statusCode).toBe(200);
    expect(reviewerSubtree.json().total_active_descendants).toBe(3);
    expect(reviewerSubtree.json().max_depth).toBe(1);
    expect(reviewerSubtree.json().summary.root_employee_code).toBe("D1");
    expect(reviewerSubtree.json().items.map((user: { employee_code: string }) => user.employee_code).sort()).toEqual(["E1", "E2", "E3"]);
    expect(reviewerSubtree.json().items.every((user: { depth: number }) => user.depth === 1)).toBe(true);

    const ownSubtree = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${employee.user.id}/subtree?page=1&page_size=10`,
      headers: authHeader(employee.token)
    });
    expect(ownSubtree.statusCode).toBe(200);
    expect(ownSubtree.json().total).toBe(0);

    const ancestorAttempt = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${reviewer.user.id}/subtree?page=1&page_size=10`,
      headers: authHeader(employee.token)
    });
    expect(ancestorAttempt.statusCode).toBe(403);

    const auditorSubtree = await app.inject({
      method: "GET",
      url: `/api/v1/core/users/${reviewer.user.id}/subtree?page=1&page_size=10`,
      headers: authHeader(auditor.token)
    });
    expect(auditorSubtree.statusCode).toBe(200);
  });
});
