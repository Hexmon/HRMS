import { randomUUID } from "node:crypto";
import type { OutboxEvent, UUID } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";

export function appendOutboxEvent(
  store: MemoryDataStore,
  input: {
    aggregateType: string;
    aggregateId: UUID;
    eventType: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }
): OutboxEvent {
  const existing = store.outbox.find((event) => event.idempotency_key === input.idempotencyKey);
  if (existing) {
    return existing;
  }
  const event: OutboxEvent = {
    id: store.nextOutboxId++,
    event_id: randomUUID(),
    aggregate_type: input.aggregateType,
    aggregate_id: input.aggregateId,
    event_type: input.eventType,
    payload: input.payload,
    idempotency_key: input.idempotencyKey,
    status: "pending",
    retry_count: 0,
    available_at: nowIso(),
    created_at: nowIso(),
    published_at: null,
    failed_at: null,
    last_error: null
  };
  store.outbox.push(event);
  return event;
}
