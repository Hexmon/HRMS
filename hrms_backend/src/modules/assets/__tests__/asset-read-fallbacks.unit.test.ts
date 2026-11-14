import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "#shared";
import { errorsPlugin } from "../../../plugins/errors.js";
import { createMemoryDataStore, seedIds } from "../../../platform/data-store.js";
import { coreRoutes } from "../../core/routes.js";
import { dashboardRoutes } from "../../dashboard/routes.js";
import { reportRoutes } from "../../reports/routes.js";

describe("asset-backed cross-module memory reads", () => {
  const actorHeader = "x-test-actor";
  let app: FastifyInstance;

  beforeEach(async () => {
    const store = createMemoryDataStore();
    app = Fastify();
    app.decorate("store", store);
    app.decorateRequest("actor", undefined);
    app.addHook("onRequest", async (request) => {
      const id = request.headers[actorHeader];
      request.actor = typeof id === "string"
        ? store.users.find((user) => user.id === id) as AuthUser | undefined
        : undefined;
    });
    await app.register(errorsPlugin);
    await app.register(coreRoutes, { prefix: "/core" });
    await app.register(dashboardRoutes, { prefix: "/dashboard" });
    await app.register(reportRoutes, { prefix: "/reports" });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("uses the current memory snapshot when optional asset/attendance readers are absent", async () => {
    const headers = { [actorHeader]: seedIds.admin };
    const user = await app.inject({ method: "GET", url: `/core/users/${seedIds.employee1}`, headers });
    expect(user.statusCode).toBe(200);
    expect(user.json()).toHaveProperty("assets_summary");

    const dashboard = await app.inject({ method: "GET", url: "/dashboard/summary", headers });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json()).toHaveProperty("operations.assets_assigned");

    const report = await app.inject({ method: "GET", url: "/reports/assets/summary?page=1&page_size=10", headers });
    expect(report.statusCode).toBe(200);
    expect(report.json().items).toBeInstanceOf(Array);
  });
});
