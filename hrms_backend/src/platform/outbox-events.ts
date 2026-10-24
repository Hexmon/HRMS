import { randomUUID } from "node:crypto";
import type { OutboxEvent, UUID } from "#shared";
import type { MemoryDataStore } from "./data-store.js";

export interface AppendOutboxEventInput {
  aggregateType: string;
  aggregateId: UUID;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  /** Immutable tenant snapshot. Omit only when the event is genuinely global. */
  companyId?: UUID | null;
}

function payloadCompanyId(store: MemoryDataStore, payload: Record<string, unknown>): UUID | null {
  const candidate = payload.company_id;
  if (typeof candidate !== "string") return null;
  return store.companyProfiles.some((company) => company.id === candidate) ? candidate : null;
}

export function appendOutboxEvent(
  store: MemoryDataStore,
  input: AppendOutboxEventInput,
): OutboxEvent {
  const existing = store.outbox.find((event) => event.idempotency_key === input.idempotencyKey);
  if (existing) return existing;

  const companyId = input.companyId === undefined
    ? payloadCompanyId(store, input.payload)
    : input.companyId;
  if (companyId !== null && !store.companyProfiles.some((company) => company.id === companyId)) {
    throw new Error(`Outbox event company does not exist: ${companyId}`);
  }

  const now = new Date().toISOString();
  const event: OutboxEvent = {
    id: store.nextOutboxId++,
    company_id: companyId,
    event_id: randomUUID(),
    aggregate_type: input.aggregateType,
    aggregate_id: input.aggregateId,
    event_type: input.eventType,
    payload: input.payload,
    idempotency_key: input.idempotencyKey,
    status: "pending",
    retry_count: 0,
    available_at: now,
    created_at: now,
    published_at: null,
    failed_at: null,
    last_error: null,
  };
  store.outbox.push(event);
  return event;
}
