import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs } from "#testing";
import { buildRealApp } from "../../../__tests__/real-infra.js";

describe("helpdesk", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRealApp();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("supports ticket lifecycle, comments, internal notes, attachments, assignment, and SLA report", async () => {
    const requester = await loginAs(app, "E1");
    const agent = await loginAs(app, "AST");
    const admin = await loginAs(app, "ADM");
    const unrelated = await loginAs(app, "E2");

    const categories = await app.inject({
      method: "GET",
      url: "/api/v1/helpdesk/categories",
      headers: authHeader(requester.token)
    });
    expect(categories.statusCode).toBe(200);
    expect(categories.json().categories.map((category: { category_key: string }) => category.category_key)).toContain("IT");

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/helpdesk/tickets",
      headers: authHeader(requester.token),
      payload: {
        category_key: "IT",
        sub_category: "vpn",
        subject: "VPN fails during QA",
        description: "VPN client times out while validating the release.",
        priority: "High",
        attachment_name: "vpn-error.png"
      }
    });
    expect(create.statusCode).toBe(200);
    let ticket = create.json().ticket;
    expect(ticket).toMatchObject({
      ticket_no: "TKT-12003",
      category_key: "IT",
      status: "assigned",
      requester_user_id: requester.user.id,
      assignee_user_id: agent.user.id,
      version: 1
    });

    const requesterList = await app.inject({
      method: "GET",
      url: "/api/v1/helpdesk/tickets?page=1&page_size=10",
      headers: authHeader(requester.token)
    });
    expect(requesterList.statusCode).toBe(200);
    expect(requesterList.json().items.map((item: { id: string }) => item.id)).toContain(ticket.id);

    const agentList = await app.inject({
      method: "GET",
      url: "/api/v1/helpdesk/tickets?category_key=IT",
      headers: authHeader(agent.token)
    });
    expect(agentList.statusCode).toBe(200);
    expect(agentList.json().queue_counts.total).toBeGreaterThanOrEqual(1);

    const comment = await app.inject({
      method: "POST",
      url: `/api/v1/helpdesk/tickets/${ticket.id}/comments`,
      headers: authHeader(agent.token),
      payload: {
        message: "Checking the VPN gateway logs.",
        expected_version: ticket.version
      }
    });
    expect(comment.statusCode).toBe(200);
    expect(comment.json().ticket_version).toBe(2);

    const internalNote = await app.inject({
      method: "POST",
      url: `/api/v1/helpdesk/tickets/${ticket.id}/internal-notes`,
      headers: authHeader(agent.token),
      payload: {
        message: "Suspect office gateway route drift.",
        expected_version: 2
      }
    });
    expect(internalNote.statusCode).toBe(200);
    expect(internalNote.json().ticket_version).toBe(3);

    const attachment = await app.inject({
      method: "POST",
      url: `/api/v1/helpdesk/tickets/${ticket.id}/attachments`,
      headers: authHeader(requester.token),
      payload: {
        file_name: "vpn-retry.png",
        attachment_type: "screenshot",
        expected_version: 3
      }
    });
    expect(attachment.statusCode).toBe(200);
    expect(attachment.json().ticket_version).toBe(4);

    const assign = await app.inject({
      method: "POST",
      url: `/api/v1/helpdesk/tickets/${ticket.id}/assign`,
      headers: authHeader(agent.token),
      payload: {
        assignee_user_id: admin.user.id,
        remarks: "Escalating to admin",
        expected_version: 4
      }
    });
    expect(assign.statusCode).toBe(200);
    ticket = assign.json().ticket;
    expect(ticket).toMatchObject({ assignee_user_id: admin.user.id, version: 5 });

    const forbiddenAssign = await app.inject({
      method: "POST",
      url: `/api/v1/helpdesk/tickets/${ticket.id}/assign`,
      headers: authHeader(unrelated.token),
      payload: {
        assignee_user_id: unrelated.user.id,
        expected_version: ticket.version
      }
    });
    expect(forbiddenAssign.statusCode).toBe(403);

    const urgent = await app.inject({
      method: "POST",
      url: `/api/v1/helpdesk/tickets/${ticket.id}/priority`,
      headers: authHeader(admin.token),
      payload: {
        priority: "Urgent",
        remarks: "Release blocker",
        expected_version: ticket.version
      }
    });
    expect(urgent.statusCode).toBe(200);
    ticket = urgent.json().ticket;
    expect(ticket).toMatchObject({ priority: "Urgent", status: "escalated", escalated: true, version: 6 });

    const hold = await app.inject({
      method: "POST",
      url: `/api/v1/helpdesk/tickets/${ticket.id}/status`,
      headers: authHeader(admin.token),
      payload: {
        status: "on_hold",
        remarks: "Waiting for network team confirmation.",
        expected_version: ticket.version
      }
    });
    expect(hold.statusCode).toBe(200);
    ticket = hold.json().ticket;
    expect(ticket).toMatchObject({ status: "on_hold", version: 7 });

    const progress = await app.inject({
      method: "POST",
      url: `/api/v1/helpdesk/tickets/${ticket.id}/status`,
      headers: authHeader(admin.token),
      payload: {
        status: "in_progress",
        expected_version: ticket.version
      }
    });
    expect(progress.statusCode).toBe(200);
    ticket = progress.json().ticket;
    expect(ticket).toMatchObject({ status: "in_progress", version: 8 });

    const stalePatch = await app.inject({
      method: "PATCH",
      url: `/api/v1/helpdesk/tickets/${ticket.id}`,
      headers: authHeader(admin.token),
      payload: {
        subject: "Stale update",
        expected_version: 1
      }
    });
    expect(stalePatch.statusCode).toBe(409);

    const resolve = await app.inject({
      method: "POST",
      url: `/api/v1/helpdesk/tickets/${ticket.id}/resolve`,
      headers: authHeader(admin.token),
      payload: {
        resolution: "VPN profile reset and connection confirmed.",
        expected_version: ticket.version
      }
    });
    expect(resolve.statusCode).toBe(200);
    ticket = resolve.json().ticket;
    expect(ticket).toMatchObject({ status: "resolved", version: 9 });
    expect(ticket.resolved_at).toBeTruthy();

    const close = await app.inject({
      method: "POST",
      url: `/api/v1/helpdesk/tickets/${ticket.id}/close`,
      headers: authHeader(requester.token),
      payload: {
        satisfaction: 5,
        remarks: "Confirmed",
        expected_version: ticket.version
      }
    });
    expect(close.statusCode).toBe(200);
    ticket = close.json().ticket;
    expect(ticket).toMatchObject({ status: "closed", version: 10 });

    const reopen = await app.inject({
      method: "POST",
      url: `/api/v1/helpdesk/tickets/${ticket.id}/reopen`,
      headers: authHeader(requester.token),
      payload: {
        reason: "Issue returned on the next connection attempt.",
        expected_version: ticket.version
      }
    });
    expect(reopen.statusCode).toBe(200);
    ticket = reopen.json().ticket;
    expect(ticket).toMatchObject({ status: "reopened", reopen_count: 1, version: 11 });

    const detailForRequester = await app.inject({
      method: "GET",
      url: `/api/v1/helpdesk/tickets/${ticket.id}`,
      headers: authHeader(requester.token)
    });
    expect(detailForRequester.statusCode).toBe(200);
    expect(detailForRequester.json().comments.some((entry: { internal?: boolean }) => entry.internal)).toBe(false);
    expect(detailForRequester.json().attachments).toHaveLength(2);

    const detailForAdmin = await app.inject({
      method: "GET",
      url: `/api/v1/helpdesk/tickets/${ticket.id}`,
      headers: authHeader(admin.token)
    });
    expect(detailForAdmin.statusCode).toBe(200);
    expect(detailForAdmin.json().comments.some((entry: { internal?: boolean }) => entry.internal)).toBe(true);
    expect(detailForAdmin.json().events.length).toBeGreaterThanOrEqual(8);

    const slaReport = await app.inject({
      method: "GET",
      url: "/api/v1/helpdesk/sla-report?page=1&page_size=10",
      headers: authHeader(admin.token)
    });
    expect(slaReport.statusCode).toBe(200);
    expect(slaReport.json().items.length).toBeGreaterThanOrEqual(1);
    expect(slaReport.json().totals.total).toBeGreaterThanOrEqual(1);
  });
});
