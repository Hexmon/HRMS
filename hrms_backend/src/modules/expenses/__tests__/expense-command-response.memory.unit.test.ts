import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, loginAs, projectTravelPayload } from "#testing";
import { buildApp } from "../../../app.js";
import { createMemoryDataStore, nowIso, type DataStore } from "../../../platform/data-store.js";

describe("expense command response contract in memory mode", () => {
  let app: FastifyInstance;
  let store: DataStore;

  beforeEach(async () => {
    store = createMemoryDataStore();
    app = await buildApp({ dataStore: store, rateLimit: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns only id, status and version for generic and Finance commands", async () => {
    const employee = await loginAs(app, "E1");
    const manager = await loginAs(app, "D1");
    const finance = await loginAs(app, "N1");
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: { ...authHeader(employee.token), "idempotency-key": "memory-create-contract" },
      payload: { ...projectTravelPayload, project_code: "MEMORY-CONTRACT" },
    });
    expect(created.statusCode, created.body).toBe(200);
    const ticketId = created.json().id;
    expect(created.json()).toEqual({
      id: ticketId,
      status: "Pending Manager Verification",
      version: 1,
    });

    const managerVerified = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticketId}/manager/verify`,
      headers: { ...authHeader(manager.token), "idempotency-key": "memory-manager-contract" },
      payload: { decision: "approve", expected_version: 1 },
    });
    expect(managerVerified.statusCode, managerVerified.body).toBe(200);
    expect(managerVerified.json()).toEqual({
      id: ticketId,
      status: "Manager Verified",
      version: 2,
    });

    const approveHeaders = { ...authHeader(finance.token), "idempotency-key": `memory-approve-${ticketId}` };
    const approvePayload = { decision: "verify", expected_version: 2 };
    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticketId}/finance/approve`,
      headers: approveHeaders,
      payload: approvePayload,
    });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json()).toEqual({ id: ticketId, status: "Finance Approved", version: 3 });
    const approveReplay = await app.inject({ method: "POST",
      url: `/api/v1/expenses/${ticketId}/finance/approve`, headers: approveHeaders, payload: approvePayload });
    expect(approveReplay.statusCode, approveReplay.body).toBe(200);
    expect(approveReplay.json()).toEqual(approved.json());
    expect(store.expenseApprovals.filter((approval) => approval.ticket_id === ticketId)).toHaveLength(2);
    const approveMismatch = await app.inject({ method: "POST",
      url: `/api/v1/expenses/${ticketId}/finance/approve`, headers: approveHeaders,
      payload: { ...approvePayload, remarks: "different" } });
    expect(approveMismatch.statusCode).toBe(409);

    const paymentHeaders = { ...authHeader(finance.token), "idempotency-key": `memory-payment-${ticketId}` };
    const paymentPayload = {
      payment_date: "2026-11-11",
      amount: "500.00",
      payment_mode: "NEFT",
      reference_no: `MEMORY-${ticketId}`,
      expected_version: 3,
    };
    const paid = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticketId}/finance/payment`,
      headers: paymentHeaders,
      payload: paymentPayload,
    });
    expect(paid.statusCode, paid.body).toBe(200);
    expect(paid.json()).toEqual({ id: ticketId, status: "Payment Released", version: 4 });
    const paidReplay = await app.inject({ method: "POST",
      url: `/api/v1/expenses/${ticketId}/finance/payment`, headers: paymentHeaders, payload: paymentPayload });
    expect(paidReplay.statusCode, paidReplay.body).toBe(200);
    expect(paidReplay.json()).toEqual(paid.json());
    expect(store.payments.filter((payment) => payment.ticket_id === ticketId)).toHaveLength(1);

    for (const documentType of ["travel_ticket", "boarding_pass", "receipt"]) {
      const documentId = randomUUID();
      store.expenseDocuments.push({
        id: randomUUID(),
        ticket_id: ticketId,
        document_id: documentId,
        document_type: documentType,
        verification_status: "verified",
        uploaded_by: employee.user.id,
        uploaded_at: nowIso(),
      });
    }
    const settleHeaders = { ...authHeader(finance.token), "idempotency-key": `memory-settle-${ticketId}` };
    const settlePayload = { actual_amount: "500.00", expected_version: 4 };
    const settled = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${ticketId}/settlement`,
      headers: settleHeaders,
      payload: settlePayload,
    });
    expect(settled.statusCode, settled.body).toBe(200);
    expect(settled.json()).toEqual({ id: ticketId, status: "Closed", version: 5 });
    const settledReplay = await app.inject({ method: "POST",
      url: `/api/v1/expenses/${ticketId}/settlement`, headers: settleHeaders, payload: settlePayload });
    expect(settledReplay.statusCode, settledReplay.body).toBe(200);
    expect(settledReplay.json()).toEqual(settled.json());
  });
});
