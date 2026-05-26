import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("projects and utilization", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("supports project CRUD, members, allocations, milestones, summary, and utilization", async () => {
    const admin = await loginAs(app, "ADM");
    const manager = await loginAs(app, "D1");
    const employee = await loginAs(app, "E3");
    const otherEmployee = await loginAs(app, "E2");

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeader(admin.token),
      payload: {
        project_code: "QA-PROJ",
        name: "QA Project Delivery",
        client_name: "Quality Labs",
        project_type: "client",
        billing_type: "hourly",
        manager_user_id: manager.user.id,
        start_date: "2026-05-01",
        end_date: "2026-09-30",
        status: "active",
        estimated_hours: "1200.00",
        estimated_budget: "240000.00",
        tech_stack: ["TypeScript"],
        priority: "high",
        cost_center: null
      }
    });
    expect(create.statusCode).toBe(200);
    const project = create.json().project;
    expect(project).toMatchObject({
      project_code: "QA-PROJ",
      manager_user_id: manager.user.id,
      cost_center: null,
      version: 1
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/projects?status=active&page=1&page_size=10",
      headers: authHeader(manager.token)
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.map((item: { project_code: string }) => item.project_code)).toContain("QA-PROJ");

    const addMember = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/members`,
      headers: authHeader(manager.token),
      payload: {
        user_id: employee.user.id,
        project_role: "Engineer",
        allocation_percent: 60,
        billable: true,
        start_date: "2026-05-01",
        expected_version: project.version
      }
    });
    expect(addMember.statusCode).toBe(200);
    expect(addMember.json().member).toMatchObject({
      employee_user_id: employee.user.id,
      allocation_percent: 60,
      version: 1
    });
    expect(addMember.json().project_version).toBe(2);

    const allocation = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/allocations`,
      headers: authHeader(manager.token),
      payload: {
        user_id: employee.user.id,
        date_from: "2026-06-01",
        date_to: "2026-06-30",
        allocation_percent: 80,
        billable: true,
        expected_version: 2
      }
    });
    expect(allocation.statusCode).toBe(200);
    expect(allocation.json().allocation).toMatchObject({
      employee_user_id: employee.user.id,
      allocation_percent: 80
    });
    expect(allocation.json().version).toBe(3);

    const milestone = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/milestones`,
      headers: authHeader(manager.token),
      payload: {
        name: "Launch readiness",
        owner_user_id: employee.user.id,
        status: "planned",
        due_date: "2026-08-31",
        priority: "high",
        expected_version: 3
      }
    });
    expect(milestone.statusCode).toBe(200);
    expect(milestone.json().milestone).toMatchObject({
      name: "Launch readiness",
      lead: employee.user.full_name
    });
    expect(milestone.json().project_version).toBe(4);

    const stalePatch = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}`,
      headers: authHeader(manager.token),
      payload: {
        health: "amber",
        expected_version: 1
      }
    });
    expect(stalePatch.statusCode).toBe(409);

    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}`,
      headers: authHeader(manager.token),
      payload: {
        health: "amber",
        expected_version: 4
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().project).toMatchObject({ health: "amber", version: 5 });

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}?include=members,allocations,milestones,summary`,
      headers: authHeader(employee.token)
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().members).toHaveLength(1);
    expect(detail.json().allocations.length).toBeGreaterThanOrEqual(2);
    expect(detail.json().milestones).toHaveLength(1);
    expect(detail.json().summary.allocation.total_allocation_percent).toBe(80);

    const documents = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/documents?page=1&page_size=10`,
      headers: authHeader(manager.token)
    });
    expect(documents.statusCode).toBe(200);
    expect(documents.json()).toMatchObject({ total: 0 });

    const utilization = await app.inject({
      method: "GET",
      url: "/api/v1/team-utilization/summary?page=1&page_size=25&date_from=2026-06-01&date_to=2026-06-30",
      headers: authHeader(admin.token)
    });
    expect(utilization.statusCode).toBe(200);
    const employeeRow = utilization.json().employees.find((item: { user: { id: string } }) => item.user.id === employee.user.id);
    expect(employeeRow).toMatchObject({
      utilization_percent: 80,
      status: "healthy"
    });

    const forbiddenPatch = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}`,
      headers: authHeader(otherEmployee.token),
      payload: {
        health: "red",
        expected_version: 5
      }
    });
    expect(forbiddenPatch.statusCode).toBe(403);
  });
});
