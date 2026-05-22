import type { UUID } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { appendOutboxEvent } from "../expenses/events.js";

export const projectEvents = {
  Created: "project.created",
  Updated: "project.updated",
  Archived: "project.archived",
  MemberChanged: "project.member_changed",
  AllocationChanged: "project.allocation_changed",
  MilestoneCreated: "project.milestone_created"
} as const;

export function appendProjectOutboxEvent(
  store: MemoryDataStore,
  input: {
    aggregateType: string;
    aggregateId: UUID;
    eventType: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }
): void {
  appendOutboxEvent(store, input);
}
