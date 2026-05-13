import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("timesheets", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("snapshots workflow and returns 409 on concurrent approval", async () => {
    const employee = await loginAs(app, "E1");
    const reviewer = await loginAs(app, "D1");

    const segment = await app.inject({
      method: "POST",
      url: "/api/v1/timesheets/work-segments",
      headers: authHeader(employee.token),
      payload: {
        work_date: "2026-05-01",
        project_code: "PRJ-100",
        hours: "8.00",
        billable: true
      }
    });
    expect(segment.statusCode).toBe(200);

    const submit = await app.inject({
      method: "POST",
      url: "/api/v1/timesheets/submissions",
      headers: authHeader(employee.token),
      payload: { cycle_start: "2026-05-01", cycle_end: "2026-05-07" }
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json().workflow_snapshot.approver_user_id).toBe(reviewer.user.id);

    const approve = await app.inject({
      method: "POST",
      url: `/api/v1/timesheets/submissions/${submit.json().id}/approve`,
      headers: authHeader(reviewer.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(approve.statusCode).toBe(200);

    const stale = await app.inject({
      method: "POST",
      url: `/api/v1/timesheets/submissions/${submit.json().id}/approve`,
      headers: authHeader(reviewer.token),
      payload: { decision: "approve", expected_version: 1 }
    });
    expect(stale.statusCode).toBe(409);
  });
});
