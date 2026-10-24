import type { MemoryDataStore } from "../../platform/data-store.js";
import { appendOutboxEvent } from "../../platform/outbox-events.js";

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
    companyId?: string | null;
  }
): void {
  appendOutboxEvent(store, input);
}
