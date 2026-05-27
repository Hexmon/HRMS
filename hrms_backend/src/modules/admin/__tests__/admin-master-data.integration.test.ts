import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("admin master data", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("manages department master data with OCC, duplicate, and active-reference protection", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/master-data/departments?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/master-data/departments?page=1&page_size=10&search=sales",
      headers: authHeader(admin.token)
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items[0]).toMatchObject({ department_code: "SALES", version: 1 });

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/departments",
      headers: authHeader(admin.token),
      payload: { name: "Engineering", code: "ENG" }
    });
    expect(create.statusCode).toBe(200);
    expect(create.json().department).toMatchObject({
      department_code: "ENG",
      name: "Engineering",
      status: "active",
      version: 1
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/departments",
      headers: authHeader(admin.token),
      payload: { name: "Engineering Duplicate", code: "ENG" }
    });
    expect(duplicate.statusCode).toBe(409);

    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/departments/${create.json().department.id}`,
      headers: authHeader(admin.token),
      payload: { name: "Engineering Ops", expected_version: 1 }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().department).toMatchObject({ name: "Engineering Ops", version: 2 });

    const stale = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/departments/${create.json().department.id}`,
      headers: authHeader(admin.token),
      payload: { name: "Stale", expected_version: 1 }
    });
    expect(stale.statusCode).toBe(409);

    const inactive = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/departments/${create.json().department.id}`,
      headers: authHeader(admin.token),
      payload: { status: "inactive", expected_version: 2 }
    });
    expect(inactive.statusCode).toBe(200);
    expect(inactive.json().department).toMatchObject({ status: "inactive", active: false, version: 3 });

    const referenced = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/departments/${list.json().items[0].id}`,
      headers: authHeader(admin.token),
      payload: { status: "inactive", expected_version: list.json().items[0].version }
    });
    expect(referenced.statusCode).toBe(409);

    expect(app.store.outbox.at(-1)?.event_type).toBe("admin.master_data.department.updated");
  });

  it("manages designation master data with OCC and duplicate-code protection", async () => {
    const admin = await loginAs(app, "ADM");

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/designations",
      headers: authHeader(admin.token),
      payload: { title: "Principal Engineer", code: "PRINCIPAL_ENGINEER", level: 9 }
    });
    expect(create.statusCode).toBe(200);
    expect(create.json().designation).toMatchObject({
      designation_code: "PRINCIPAL_ENGINEER",
      title: "Principal Engineer",
      level: 9,
      version: 1
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/master-data/designations?page=1&page_size=10&search=principal",
      headers: authHeader(admin.token)
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/designations",
      headers: authHeader(admin.token),
      payload: { title: "Principal Duplicate", code: "PRINCIPAL_ENGINEER" }
    });
    expect(duplicate.statusCode).toBe(409);

    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/designations/${create.json().designation.id}`,
      headers: authHeader(admin.token),
      payload: { title: "Principal Consultant", level: 10, expected_version: 1 }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().designation).toMatchObject({
      title: "Principal Consultant",
      level: 10,
      version: 2
    });

    const inactive = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/designations/${create.json().designation.id}`,
      headers: authHeader(admin.token),
      payload: { status: "inactive", expected_version: 2 }
    });
    expect(inactive.statusCode).toBe(200);
    expect(inactive.json().designation).toMatchObject({ status: "inactive", active: false, version: 3 });
  });

  it("manages extended master-data groups for visible Admin Settings tabs", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/master-data/employmentTypes?page=1&page_size=10",
      headers: authHeader(employee.token)
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/master-data/employmentTypes?page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.length).toBeGreaterThan(0);
    expect(list.json().items[0]).toMatchObject({ master_key: "employmentTypes", active: true, version: 1 });

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/projectRoles",
      headers: authHeader(admin.token),
      payload: { name: "QA Lead", code: "QA_LEAD", description: "Owns release quality" }
    });
    expect(create.statusCode).toBe(200);
    expect(create.json().item).toMatchObject({
      master_key: "projectRoles",
      code: "QA_LEAD",
      name: "QA Lead",
      description: "Owns release quality",
      active: true,
      version: 1
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/admin/master-data/projectRoles",
      headers: authHeader(admin.token),
      payload: { name: "QA Lead Duplicate", code: "QA_LEAD" }
    });
    expect(duplicate.statusCode).toBe(409);

    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/master-data/projectRoles/${create.json().item.id}`,
      headers: authHeader(admin.token),
      payload: { name: "Release QA Lead", status: "inactive", expected_version: 1 }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().item).toMatchObject({
      name: "Release QA Lead",
      status: "inactive",
      active: false,
      version: 2
    });

    const invalidKey = await app.inject({
      method: "GET",
      url: "/api/v1/admin/master-data/notARealGroup",
      headers: authHeader(admin.token)
    });
    expect(invalidKey.statusCode).toBe(400);

    expect(app.store.outbox.at(-1)?.event_type).toBe("admin.master_data.item.updated");
  });
});
