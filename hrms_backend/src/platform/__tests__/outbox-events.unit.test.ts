import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryDataStore } from "../data-store.js";
import { appendOutboxEvent } from "../outbox-events.js";

describe("appendOutboxEvent company attribution", () => {
  it("snapshots a known company from a persisted payload", () => {
    const store = createMemoryDataStore();
    const companyId = store.companyProfiles[0]!.id;
    const event = appendOutboxEvent(store, {
      aggregateType: "test",
      aggregateId: randomUUID(),
      eventType: "test.created",
      payload: { company_id: companyId },
      idempotencyKey: `test:${randomUUID()}`,
    });

    expect(event.company_id).toBe(companyId);
  });

  it("uses an explicit event-time company snapshot without mutating payload", () => {
    const store = createMemoryDataStore();
    const companyId = store.companyProfiles[0]!.id;
    const event = appendOutboxEvent(store, {
      aggregateType: "test",
      aggregateId: randomUUID(),
      eventType: "test.created",
      payload: { actor_user_id: randomUUID() },
      idempotencyKey: `test:${randomUUID()}`,
      companyId,
    });

    expect(event.company_id).toBe(companyId);
    expect(event.payload).not.toHaveProperty("company_id");
  });

  it("fails closed for an explicit unknown company", () => {
    const store = createMemoryDataStore();
    const unknownCompanyId = randomUUID();

    expect(() => appendOutboxEvent(store, {
      aggregateType: "test",
      aggregateId: randomUUID(),
      eventType: "test.created",
      payload: {},
      idempotencyKey: `test:${randomUUID()}`,
      companyId: unknownCompanyId,
    })).toThrow(`Outbox event company does not exist: ${unknownCompanyId}`);
  });

  it("keeps the original company when an idempotent event is retried", () => {
    const store = createMemoryDataStore();
    const originalCompanyId = store.companyProfiles[0]!.id;
    const otherCompanyId = randomUUID();
    store.companyProfiles.push({
      ...store.companyProfiles[0]!,
      id: otherCompanyId,
      company_slug: `outbox-${otherCompanyId}`,
    });
    const idempotencyKey = `test:${randomUUID()}`;
    const first = appendOutboxEvent(store, {
      aggregateType: "test",
      aggregateId: randomUUID(),
      eventType: "test.created",
      payload: {},
      idempotencyKey,
      companyId: originalCompanyId,
    });
    const retried = appendOutboxEvent(store, {
      aggregateType: "test",
      aggregateId: randomUUID(),
      eventType: "test.created",
      payload: {},
      idempotencyKey,
      companyId: otherCompanyId,
    });

    expect(retried).toBe(first);
    expect(retried.company_id).toBe(originalCompanyId);
  });
});
