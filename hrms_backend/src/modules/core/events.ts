import type { OutboxEvent, UUID } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { appendOutboxEvent } from "../../platform/outbox-events.js";

export function appendCoreOutboxEvent(
  store: MemoryDataStore,
  input: {
    aggregateType: string;
    aggregateId: UUID;
    eventType: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    companyId?: UUID | null;
  }
): OutboxEvent {
  return appendOutboxEvent(store, input);
}

export const coreEvents = { appendCoreOutboxEvent };
