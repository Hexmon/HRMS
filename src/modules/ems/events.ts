import type { MemoryDataStore } from "../../platform/data-store.js";

export const emsEvents = {
  ProfileChangeSubmitted: "ems.profile_change.submitted",
  ProfileChangeDecided: "ems.profile_change.decided",
  ServiceRequestSubmitted: "ems.service_request.submitted",
  ServiceRequestDecided: "ems.service_request.decided",
  LetterAcknowledged: "ems.letter.acknowledged",
  PolicyAcknowledged: "ems.policy.acknowledged",
  PolicyUpdated: "ems.policy.updated",
  OnboardingChecklistUpdated: "ems.onboarding_checklist.updated",
  ExitChecklistUpdated: "ems.exit_checklist.updated",
  ProbationDecided: "ems.probation.decided"
} as const;

export function appendEmsOutboxEvent(
  store: MemoryDataStore,
  input: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }
): void {
  const now = new Date().toISOString();
  store.outbox.push({
    id: store.nextOutboxId++,
    event_id: crypto.randomUUID(),
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
    last_error: null
  });
}
