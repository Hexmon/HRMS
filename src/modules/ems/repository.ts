import { randomUUID } from "node:crypto";
import type {
  EmsAdminChecklist,
  EmsEmployeeProfile,
  EmsLetter,
  EmsPolicy,
  EmsPolicyAcknowledgement,
  EmsProbationReview,
  EmsProfileChangeRequest,
  EmsServiceRequest,
  UUID
} from "#shared";
import { EmsPolicyAcknowledgementStatuses } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { conflict, notFound } from "../../platform/errors.js";

export interface EmsListQuery {
  status?: string;
  type?: string;
  departmentId?: UUID;
  userId?: UUID;
}

export class EmsRepository {
  constructor(private readonly store: MemoryDataStore) {}

  nextCode(prefix: "EMS-PC" | "EMS-REQ"): string {
    const year = new Date().getUTCFullYear();
    const count =
      prefix === "EMS-PC"
        ? this.store.emsProfileChangeRequests.length + 1
        : this.store.emsServiceRequests.length + 1;
    return `${prefix}-${year}-${String(count).padStart(4, "0")}`;
  }

  listAdminChecklists(type: "onboarding" | "exit", status?: string): EmsAdminChecklist[] {
    return this.store.emsAdminChecklists
      .filter((checklist) => !checklist.deleted_at && checklist.checklist_type === type && (!status || checklist.status === status))
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "") || b.updated_at.localeCompare(a.updated_at));
  }

  findAdminChecklist(id: UUID): EmsAdminChecklist {
    const checklist = this.store.emsAdminChecklists.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!checklist) {
      throw notFound("EMS admin checklist not found", { id });
    }
    return checklist;
  }

  updateAdminChecklistVersioned(
    id: UUID,
    expectedVersion: number,
    mutator: (checklist: EmsAdminChecklist) => void
  ): EmsAdminChecklist {
    const checklist = this.findAdminChecklist(id);
    if (checklist.version !== expectedVersion) {
      throw conflict("EMS admin checklist was modified by another actor.", { aggregate: "ems_admin_checklist", id });
    }
    mutator(checklist);
    checklist.version += 1;
    checklist.updated_at = nowIso();
    return checklist;
  }

  listProbationReviews(status?: string): EmsProbationReview[] {
    return this.store.emsProbationReviews
      .filter((review) => !review.deleted_at && (!status || review.status === status))
      .sort((a, b) => a.due_on.localeCompare(b.due_on) || b.updated_at.localeCompare(a.updated_at));
  }

  findProbationReview(id: UUID): EmsProbationReview {
    const review = this.store.emsProbationReviews.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!review) {
      throw notFound("EMS probation review not found", { id });
    }
    return review;
  }

  updateProbationReviewVersioned(
    id: UUID,
    expectedVersion: number,
    mutator: (review: EmsProbationReview) => void
  ): EmsProbationReview {
    const review = this.findProbationReview(id);
    if (review.version !== expectedVersion) {
      throw conflict("EMS probation review was modified by another actor.", { aggregate: "ems_probation_review", id });
    }
    mutator(review);
    review.version += 1;
    review.updated_at = nowIso();
    return review;
  }

  profileForUser(userId: UUID): EmsEmployeeProfile {
    let profile = this.store.emsEmployeeProfiles.find((item) => item.employee_user_id === userId && !item.deleted_at);
    if (profile) {
      return profile;
    }
    const now = nowIso();
    profile = {
      id: randomUUID(),
      employee_user_id: userId,
      personal_email: null,
      phone: null,
      alternate_phone: null,
      current_address: null,
      permanent_address: null,
      city: null,
      country: null,
      emergency_contact: {},
      personal_details: {},
      work_preferences: {},
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null
    };
    this.store.emsEmployeeProfiles.push(profile);
    return profile;
  }

  updateProfileVersioned(userId: UUID, expectedVersion: number, mutator: (profile: EmsEmployeeProfile) => void): EmsEmployeeProfile {
    const profile = this.profileForUser(userId);
    if (profile.version !== expectedVersion) {
      throw conflict("EMS profile was modified by another actor.", { aggregate: "ems_profile", user_id: userId });
    }
    mutator(profile);
    profile.version += 1;
    profile.updated_at = nowIso();
    return profile;
  }

  addProfileChangeRequest(
    input: Omit<EmsProfileChangeRequest, "id" | "created_at" | "updated_at" | "version" | "deleted_at" | "decided_at" | "decided_by_user_id" | "decision_remarks">
  ): EmsProfileChangeRequest {
    const now = nowIso();
    const request: EmsProfileChangeRequest = {
      id: randomUUID(),
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      decided_at: null,
      decided_by_user_id: null,
      decision_remarks: null,
      ...input
    };
    this.store.emsProfileChangeRequests.push(request);
    return request;
  }

  findProfileChangeRequest(id: UUID): EmsProfileChangeRequest {
    const request = this.store.emsProfileChangeRequests.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!request) {
      throw notFound("EMS profile change request not found", { id });
    }
    return request;
  }

  updateProfileChangeVersioned(id: UUID, expectedVersion: number, mutator: (request: EmsProfileChangeRequest) => void): EmsProfileChangeRequest {
    const request = this.findProfileChangeRequest(id);
    if (request.version !== expectedVersion) {
      throw conflict("EMS profile change request was modified by another actor.", { aggregate: "ems_profile_change", id });
    }
    mutator(request);
    request.version += 1;
    request.updated_at = nowIso();
    return request;
  }

  listProfileChangeRequests(query: EmsListQuery = {}): EmsProfileChangeRequest[] {
    return this.store.emsProfileChangeRequests
      .filter((request) => {
        if (request.deleted_at) return false;
        if (query.userId && request.employee_user_id !== query.userId) return false;
        if (query.status && request.status !== query.status) return false;
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  addServiceRequest(
    input: Omit<EmsServiceRequest, "id" | "created_at" | "updated_at" | "version" | "deleted_at" | "decided_at" | "decided_by_user_id" | "decision_remarks">
  ): EmsServiceRequest {
    const now = nowIso();
    const request: EmsServiceRequest = {
      id: randomUUID(),
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      decided_at: null,
      decided_by_user_id: null,
      decision_remarks: null,
      ...input
    };
    this.store.emsServiceRequests.push(request);
    return request;
  }

  listServiceRequests(query: EmsListQuery = {}): EmsServiceRequest[] {
    return this.store.emsServiceRequests
      .filter((request) => {
        if (request.deleted_at) return false;
        if (query.userId && request.requester_user_id !== query.userId) return false;
        if (query.status && request.status !== query.status) return false;
        if (query.type && request.request_type !== query.type) return false;
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  updateServiceRequestVersioned(
    id: UUID,
    expectedVersion: number,
    mutator: (request: EmsServiceRequest) => void
  ): EmsServiceRequest {
    const request = this.store.emsServiceRequests.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!request) {
      throw notFound("EMS service request not found", { id });
    }
    if (request.version !== expectedVersion) {
      throw conflict("EMS service request was modified by another actor.", { aggregate: "ems_service_request", id });
    }
    mutator(request);
    request.version += 1;
    request.updated_at = nowIso();
    return request;
  }

  listLetters(userId: UUID, status?: string): EmsLetter[] {
    return this.store.emsLetters
      .filter((letter) => !letter.deleted_at && letter.employee_user_id === userId && (!status || letter.status === status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  findLetter(id: UUID): EmsLetter {
    const letter = this.store.emsLetters.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!letter) {
      throw notFound("EMS letter not found", { id });
    }
    return letter;
  }

  addLetter(
    input: Omit<EmsLetter, "id" | "created_at" | "updated_at" | "version" | "deleted_at" | "acknowledged_at">
  ): EmsLetter {
    const now = nowIso();
    const letter: EmsLetter = {
      id: randomUUID(),
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      acknowledged_at: null,
      ...input
    };
    this.store.emsLetters.push(letter);
    return letter;
  }

  listPolicies(): EmsPolicy[] {
    return this.store.emsPolicies
      .filter((policy) => !policy.deleted_at && policy.status === "active")
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  }

  findPolicy(id: UUID): EmsPolicy {
    const policy = this.store.emsPolicies.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!policy) {
      throw notFound("EMS policy not found", { id });
    }
    return policy;
  }

  updatePolicyVersioned(id: UUID, expectedVersion: number, mutator: (policy: EmsPolicy) => void): EmsPolicy {
    const policy = this.findPolicy(id);
    if (policy.version !== expectedVersion) {
      throw conflict("EMS policy was modified by another actor.", { aggregate: "ems_policy", id });
    }
    mutator(policy);
    policy.version += 1;
    policy.updated_at = nowIso();
    return policy;
  }

  acknowledgementFor(policyId: UUID, userId: UUID): EmsPolicyAcknowledgement {
    let acknowledgement = this.store.emsPolicyAcknowledgements.find(
      (candidate) => candidate.policy_id === policyId && candidate.employee_user_id === userId
    );
    if (acknowledgement) {
      return acknowledgement;
    }
    const now = nowIso();
    acknowledgement = {
      id: randomUUID(),
      policy_id: policyId,
      employee_user_id: userId,
      status: EmsPolicyAcknowledgementStatuses.Pending,
      acknowledged_at: null,
      version: 1,
      created_at: now,
      updated_at: now
    };
    this.store.emsPolicyAcknowledgements.push(acknowledgement);
    return acknowledgement;
  }
}
