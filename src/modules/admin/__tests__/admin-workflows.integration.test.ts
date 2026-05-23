import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("admin workflow settings", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("lists workflow configurations for admins only", async () => {
    const admin = await loginAs(app, "ADM");
    const employee = await loginAs(app, "E1");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/workflows",
      headers: authHeader(employee.token)
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/admin/workflows",
      headers: authHeader(admin.token)
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflow_key: "leave",
          key: "leave",
          label: "Leave approval",
          active: true,
          version: 1,
          stages: expect.arrayContaining([
            expect.objectContaining({
              approver_type: "Reporting Manager",
              approverType: "Reporting Manager",
              approver_value: "Direct manager",
              approverValue: "Direct manager"
            })
          ])
        })
      ])
    );
    expect(list.json().versions.leave).toBe(1);

    const filtered = await app.inject({
      method: "GET",
      url: "/api/v1/admin/workflows?module=leave_wfh",
      headers: authHeader(admin.token)
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().items.map((workflow: { workflow_key: string }) => workflow.workflow_key).sort()).toEqual(["leave", "wfh"]);
  });

  it("updates workflow stages with OCC and validation", async () => {
    const admin = await loginAs(app, "ADM");

    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/workflows/leave",
      headers: authHeader(admin.token),
      payload: {
        label: "Leave workflow",
        active: true,
        expected_version: 1,
        stages: [
          {
            id: "leave_stage_1",
            approverType: "Reporting Manager",
            approverValue: "Direct manager",
            escalateAfterDays: 1,
            mandatoryRemarksOnReject: true
          },
          {
            id: "leave_stage_2",
            approver_type: "Role",
            approver_value: "HR Manager",
            escalate_after_days: 2,
            mandatory_remarks_on_reject: true
          }
        ]
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().workflow).toMatchObject({
      workflow_key: "leave",
      label: "Leave workflow",
      active: true,
      version: 2
    });
    expect(update.json().workflow.stages).toHaveLength(2);
    expect(update.json().workflow.stages[1]).toMatchObject({
      approver_type: "Role",
      approver_value: "HR Manager",
      escalate_after_days: 2
    });

    const stale = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/workflows/leave",
      headers: authHeader(admin.token),
      payload: {
        active: false,
        expected_version: 1
      }
    });
    expect(stale.statusCode).toBe(409);

    const duplicateStage = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/workflows/leave",
      headers: authHeader(admin.token),
      payload: {
        expected_version: 2,
        stages: [
          { id: "stage", approver_type: "Role", approver_value: "HR Manager" },
          { id: "stage", approver_type: "Role", approver_value: "Admin" }
        ]
      }
    });
    expect(duplicateStage.statusCode).toBe(400);

    expect(app.store.outbox.at(-1)?.event_type).toBe("admin.workflow.updated");
  });
});
