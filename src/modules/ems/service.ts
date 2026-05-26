import type {
  AuthUser,
  CoreUser,
  EmsAdminChecklistUpdateInput,
  EmsDecisionInput,
  EmsPolicyUpdateInput,
  EmsProbationDecisionInput,
  EmsProfileChangeCreateInput,
  EmsProfilePatchInput,
  EmsRequestCreateInput,
  EmsServiceRequestDecisionInput,
  UUID
} from "#shared";
import {
  EmsLetterStatuses,
  EmsPolicyAcknowledgementStatuses,
  EmsProfileChangeStatuses,
  EmsServiceRequestStatuses,
  Roles
} from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, forbidden, missingRemarks, notFound } from "../../platform/errors.js";
import { canAccessDocument } from "../documents/policy.js";
import { DocumentService, type DocumentUploadBody } from "../documents/service.js";
import { appendEmsOutboxEvent, emsEvents } from "./events.js";
import { assertCanDecideProfileChange, assertCanManageEms, assertCanSeeEmsUser, canManageEms } from "./policy.js";
import { EmsRepository } from "./repository.js";

export interface EmsQuery {
  page: number;
  page_size: number;
  status?: string;
  type?: string;
  user_id?: UUID;
  department_id?: UUID;
}

export interface EmsDocumentQuery extends Pick<EmsQuery, "page" | "page_size"> {
  document_type?: string;
}

export type EmsDocumentUploadInput = Omit<DocumentUploadBody, "business_object_type" | "business_object_id"> & {
  replace_document_id?: UUID;
};

const FIELD_LABELS: Record<string, string> = {
  personal_email: "Personal email",
  phone: "Phone",
  alternate_phone: "Alternate phone",
  current_address: "Current address",
  permanent_address: "Permanent address",
  city: "City",
  country: "Country"
};

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
}

function userLabel(user: CoreUser | undefined) {
  return {
    id: user?.id ?? null,
    employee_code: user?.employee_code ?? "UNKNOWN",
    full_name: user?.full_name ?? "Unknown employee",
    email: user?.email ?? null,
    profile_photo_document_id: user?.profile_photo_document_id ?? null,
    profile_photo_url: user?.profile_photo_url ?? null,
    department_id: user?.department_id ?? null,
    designation_id: user?.designation_id ?? null
  };
}

export class EmsService {
  private readonly repository: EmsRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new EmsRepository(store);
  }

  getMyProfile(actor: AuthUser) {
    return this.profileFor(actor, actor.id);
  }

  patchMyProfile(actor: AuthUser, input: EmsProfilePatchInput) {
    const profile = this.repository.updateProfileVersioned(actor.id, input.expected_version, (target) => {
      for (const key of Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>) {
        const value = input[key as keyof EmsProfilePatchInput];
        if (typeof value === "string") {
          (target as unknown as Record<string, string | null>)[key] = value;
        }
      }
    });
    return { profile: this.profileFor(actor, actor.id), version: profile.version, pending_approval: false };
  }

  createProfileChangeRequest(actor: AuthUser, input: EmsProfileChangeCreateInput) {
    const fieldLabel = FIELD_LABELS[input.field_key];
    if (!fieldLabel) {
      throw badRequest("Unsupported EMS profile field.", { field_key: input.field_key });
    }
    const existingPending = this.repository
      .listProfileChangeRequests({ userId: actor.id, status: EmsProfileChangeStatuses.Pending })
      .find((request) => request.field_key === input.field_key);
    if (existingPending) {
      throw conflict("A profile change request is already pending for this field.", { request_id: existingPending.id });
    }
    const profile = this.repository.profileForUser(actor.id);
    const approver = this.hrFallback();
    const request = this.repository.addProfileChangeRequest({
      request_code: this.repository.nextCode("EMS-PC"),
      employee_user_id: actor.id,
      field_key: input.field_key,
      field_label: input.field_label ?? fieldLabel,
      old_value: String((profile as unknown as Record<string, unknown>)[input.field_key] ?? ""),
      new_value: input.new_value.trim(),
      reason: input.reason?.trim() || null,
      supporting_document_ids: input.supporting_document_ids,
      status: EmsProfileChangeStatuses.Pending,
      current_approver_user_id: approver?.id ?? null
    });
    appendEmsOutboxEvent(this.store, {
      aggregateType: "ems_profile_change",
      aggregateId: request.id,
      eventType: emsEvents.ProfileChangeSubmitted,
      payload: { request_id: request.id, request_code: request.request_code, employee_user_id: actor.id, approver_user_id: request.current_approver_user_id },
      idempotencyKey: `ems.profile_change.submitted:${request.id}`
    });
    return { request_id: request.id, request: this.presentProfileChangeRequest(request), status: request.status, version: request.version };
  }

  listMyProfileChangeRequests(actor: AuthUser, query: EmsQuery) {
    return page(
      this.repository
        .listProfileChangeRequests({ userId: actor.id, status: query.status })
        .map((request) => this.presentProfileChangeRequest(request)),
      query.page,
      query.page_size
    );
  }

  profileChangeQueue(actor: AuthUser, query: EmsQuery) {
    assertCanManageEms(actor);
    const requests = this.repository
      .listProfileChangeRequests({ status: query.status ?? EmsProfileChangeStatuses.Pending })
      .filter((request) => this.matchesUserFilters(request.employee_user_id, query));
    return {
      ...page(requests.map((request) => this.presentProfileChangeRequest(request, actor)), query.page, query.page_size),
      queue_counts: this.queueCounts(requests.map((request) => request.status))
    };
  }

  decideProfileChange(actor: AuthUser, id: UUID, input: EmsDecisionInput) {
    const current = this.repository.findProfileChangeRequest(id);
    assertCanDecideProfileChange(actor, current);
    if (current.status !== EmsProfileChangeStatuses.Pending) {
      throw conflict("Only pending EMS profile change requests can be decided.", { request_id: id, status: current.status });
    }
    if ((input.decision === EmsProfileChangeStatuses.Returned || input.decision === EmsProfileChangeStatuses.Rejected) && !input.remarks?.trim()) {
      throw missingRemarks("EMS_PROFILE_CHANGE_DECISION");
    }
    const previousStatus = current.status;
    const updated = this.repository.updateProfileChangeVersioned(id, input.expected_version, (request) => {
      request.status = input.decision;
      request.decision_remarks = input.remarks?.trim() || null;
      request.decided_by_user_id = actor.id;
      request.decided_at = nowIso();
      request.current_approver_user_id = null;
    });
    if (updated.status === EmsProfileChangeStatuses.Approved) {
      const profile = this.repository.profileForUser(updated.employee_user_id);
      this.repository.updateProfileVersioned(updated.employee_user_id, profile.version, (target) => {
        (target as unknown as Record<string, string | null>)[updated.field_key] = updated.new_value;
      });
    }
    appendEmsOutboxEvent(this.store, {
      aggregateType: "ems_profile_change",
      aggregateId: updated.id,
      eventType: emsEvents.ProfileChangeDecided,
      payload: { request_id: updated.id, previous_status: previousStatus, next_status: updated.status, actor_user_id: actor.id },
      idempotencyKey: `ems.profile_change.decided:${updated.id}:${updated.version}`
    });
    return {
      request: this.presentProfileChangeRequest(updated, actor),
      previous_status: previousStatus,
      next_status: updated.status,
      status: updated.status,
      version: updated.version
    };
  }

  createServiceRequest(actor: AuthUser, input: EmsRequestCreateInput) {
    const assignee = this.hrFallback();
    const request = this.repository.addServiceRequest({
      request_code: this.repository.nextCode("EMS-REQ"),
      requester_user_id: actor.id,
      request_type: input.request_type,
      subject: input.subject.trim(),
      description: input.description.trim(),
      document_ids: input.document_ids,
      status: EmsServiceRequestStatuses.Pending,
      assignee_user_id: assignee?.id ?? null
    });
    appendEmsOutboxEvent(this.store, {
      aggregateType: "ems_service_request",
      aggregateId: request.id,
      eventType: emsEvents.ServiceRequestSubmitted,
      payload: { request_id: request.id, request_code: request.request_code, requester_user_id: actor.id, assignee_user_id: request.assignee_user_id },
      idempotencyKey: `ems.service_request.submitted:${request.id}`
    });
    return { request_id: request.id, request: this.presentServiceRequest(request), status: request.status, version: request.version };
  }

  listMyServiceRequests(actor: AuthUser, query: EmsQuery) {
    return page(
      this.repository
        .listServiceRequests({ userId: actor.id, status: query.status, type: query.type })
        .map((request) => this.presentServiceRequest(request)),
      query.page,
      query.page_size
    );
  }

  serviceRequestQueue(actor: AuthUser, query: EmsQuery) {
    assertCanManageEms(actor);
    const requests = this.repository
      .listServiceRequests({ status: query.status, type: query.type })
      .filter((request) => this.matchesUserFilters(request.requester_user_id, query));
    return {
      ...page(requests.map((request) => this.presentServiceRequest(request)), query.page, query.page_size),
      queue_counts: this.queueCounts(requests.map((request) => request.status))
    };
  }

  decideServiceRequest(actor: AuthUser, id: UUID, input: EmsServiceRequestDecisionInput) {
    assertCanManageEms(actor);
    const current = this.repository
      .listServiceRequests()
      .find((request) => request.id === id && !request.deleted_at);
    if (!current) {
      throw notFound("EMS service request not found", { id });
    }
    if (current.requester_user_id === actor.id) {
      throw forbidden("EMS service requests cannot be decided by their requester.");
    }
    if (
      current.status !== EmsServiceRequestStatuses.Pending &&
      current.status !== EmsServiceRequestStatuses.InProgress
    ) {
      throw conflict("Only pending or in-progress EMS service requests can be decided.", { id, status: current.status });
    }
    if ((input.decision === EmsServiceRequestStatuses.Returned || input.decision === EmsServiceRequestStatuses.Rejected) && !input.remarks?.trim()) {
      throw missingRemarks("EMS_SERVICE_REQUEST_DECISION");
    }
    const previousStatus = current.status;
    const request = this.repository.updateServiceRequestVersioned(id, input.expected_version, (target) => {
      target.status = input.decision;
      target.decision_remarks = input.remarks?.trim() || null;
      target.decided_by_user_id = actor.id;
      target.decided_at = nowIso();
      target.assignee_user_id = null;
    });
    const generatedLetter =
      request.request_type === "letter" && request.status === EmsServiceRequestStatuses.Approved
        ? this.repository.addLetter({
            employee_user_id: request.requester_user_id,
            letter_type: slugifyLetterType(request.subject),
            title: request.subject,
            description: request.description,
            status: EmsLetterStatuses.Available,
            document_id: null,
            issued_on: todayIsoDate()
          })
        : null;
    appendEmsOutboxEvent(this.store, {
      aggregateType: "ems_service_request",
      aggregateId: request.id,
      eventType: emsEvents.ServiceRequestDecided,
      payload: {
        request_id: request.id,
        previous_status: previousStatus,
        next_status: request.status,
        actor_user_id: actor.id,
        generated_letter_id: generatedLetter?.id ?? null
      },
      idempotencyKey: `ems.service_request.decided:${request.id}:${request.version}`
    });
    return {
      request: this.presentServiceRequest(request),
      generated_letter: generatedLetter ? this.presentLetter(generatedLetter) : null,
      previous_status: previousStatus,
      next_status: request.status,
      status: request.status,
      version: request.version
    };
  }

  listAdminChecklists(actor: AuthUser, type: "onboarding" | "exit", query: EmsQuery) {
    assertCanManageEms(actor);
    return page(
      this.repository
        .listAdminChecklists(type, query.status)
        .filter((checklist) => this.matchesUserFilters(checklist.employee_user_id, query))
        .map((checklist) => this.presentAdminChecklist(checklist)),
      query.page,
      query.page_size
    );
  }

  updateAdminChecklist(actor: AuthUser, type: "onboarding" | "exit", id: UUID, input: EmsAdminChecklistUpdateInput) {
    assertCanManageEms(actor);
    const current = this.repository.findAdminChecklist(id);
    if (current.checklist_type !== type) {
      throw notFound("EMS admin checklist not found", { id });
    }
    const checklist = this.repository.updateAdminChecklistVersioned(id, input.expected_version, (target) => {
      if (input.checklist) {
        target.checklist = { ...target.checklist, ...input.checklist };
      }
      if (input.status) {
        target.status = input.status;
      } else if (Object.values(target.checklist).every(Boolean)) {
        target.status = "completed";
      }
      if ("due_date" in input) {
        target.due_date = input.due_date ?? null;
      }
      if ("remarks" in input) {
        target.remarks = input.remarks ?? null;
      }
      target.completed_at = target.status === "completed" ? target.completed_at ?? nowIso() : null;
    });
    appendEmsOutboxEvent(this.store, {
      aggregateType: `ems_${type}_checklist`,
      aggregateId: checklist.id,
      eventType: type === "onboarding" ? emsEvents.OnboardingChecklistUpdated : emsEvents.ExitChecklistUpdated,
      payload: { checklist_id: checklist.id, actor_user_id: actor.id, status: checklist.status },
      idempotencyKey: `ems.${type}.checklist.updated:${checklist.id}:${checklist.version}`
    });
    return { checklist: this.presentAdminChecklist(checklist), status: checklist.status, version: checklist.version };
  }

  listProbationReviews(actor: AuthUser, query: EmsQuery) {
    assertCanManageEms(actor);
    return page(
      this.repository
        .listProbationReviews(query.status)
        .filter((review) => this.matchesUserFilters(review.employee_user_id, query))
        .map((review) => this.presentProbationReview(review)),
      query.page,
      query.page_size
    );
  }

  decideProbation(actor: AuthUser, id: UUID, input: EmsProbationDecisionInput) {
    assertCanManageEms(actor);
    const current = this.repository.findProbationReview(id);
    if (current.employee_user_id === actor.id) {
      throw forbidden("Probation review cannot be decided by the employee under review.");
    }
    if (current.status !== "pending" && current.status !== "extended") {
      throw conflict("Only pending or extended probation reviews can be decided.", { id, status: current.status });
    }
    const review = this.repository.updateProbationReviewVersioned(id, input.expected_version, (target) => {
      target.status = input.decision;
      target.extended_until = input.decision === "extended" ? input.extended_until ?? null : null;
      target.remarks = input.remarks?.trim() || null;
      target.decided_by_user_id = actor.id;
      target.decided_at = nowIso();
    });
    appendEmsOutboxEvent(this.store, {
      aggregateType: "ems_probation_review",
      aggregateId: review.id,
      eventType: emsEvents.ProbationDecided,
      payload: { review_id: review.id, employee_user_id: review.employee_user_id, status: review.status },
      idempotencyKey: `ems.probation.decided:${review.id}:${review.version}`
    });
    return { review: this.presentProbationReview(review), status: review.status, version: review.version };
  }

  listLetters(actor: AuthUser, query: EmsQuery) {
    const userId = canManageEms(actor) && query.user_id ? query.user_id : actor.id;
    const user = this.requireUser(userId);
    assertCanSeeEmsUser(actor, user);
    return page(this.repository.listLetters(userId, query.status).map((letter) => this.presentLetter(letter)), query.page, query.page_size);
  }

  acknowledgeLetter(actor: AuthUser, id: UUID, expectedVersion: number) {
    const letter = this.repository.findLetter(id);
    if (letter.employee_user_id !== actor.id && !canManageEms(actor)) {
      throw notFound("EMS letter not found", { id });
    }
    if (letter.version !== expectedVersion) {
      throw conflict("EMS letter was modified by another actor.", { aggregate: "ems_letter", id });
    }
    if (letter.status === EmsLetterStatuses.Acknowledged) {
      throw conflict("EMS letter is already acknowledged.", { id });
    }
    letter.status = EmsLetterStatuses.Acknowledged;
    letter.acknowledged_at = nowIso();
    letter.version += 1;
    letter.updated_at = nowIso();
    appendEmsOutboxEvent(this.store, {
      aggregateType: "ems_letter",
      aggregateId: letter.id,
      eventType: emsEvents.LetterAcknowledged,
      payload: { letter_id: letter.id, employee_user_id: letter.employee_user_id },
      idempotencyKey: `ems.letter.acknowledged:${letter.id}:${letter.version}`
    });
    return { letter: this.presentLetter(letter), status: letter.status, version: letter.version };
  }

  listPolicies(actor: AuthUser, query: EmsQuery) {
    const policies = this.repository.listPolicies().map((policy) => this.presentPolicy(policy, actor.id));
    return {
      ...page(policies, query.page, query.page_size),
      acknowledgement_summary: {
        total: policies.length,
        acknowledged: policies.filter((policy) => policy.acknowledgement_status === EmsPolicyAcknowledgementStatuses.Acknowledged).length,
        pending: policies.filter((policy) => policy.acknowledgement_status === EmsPolicyAcknowledgementStatuses.Pending).length
      }
    };
  }

  acknowledgePolicy(actor: AuthUser, id: UUID, expectedVersion: number) {
    const policy = this.repository.listPolicies().find((candidate) => candidate.id === id);
    if (!policy) {
      throw notFound("EMS policy not found", { id });
    }
    const acknowledgement = this.repository.acknowledgementFor(id, actor.id);
    if (acknowledgement.version !== expectedVersion) {
      throw conflict("EMS policy acknowledgement was modified by another actor.", { aggregate: "ems_policy_acknowledgement", id });
    }
    if (acknowledgement.status === EmsPolicyAcknowledgementStatuses.Acknowledged) {
      throw conflict("EMS policy is already acknowledged.", { id });
    }
    acknowledgement.status = EmsPolicyAcknowledgementStatuses.Acknowledged;
    acknowledgement.acknowledged_at = nowIso();
    acknowledgement.version += 1;
    acknowledgement.updated_at = nowIso();
    appendEmsOutboxEvent(this.store, {
      aggregateType: "ems_policy",
      aggregateId: policy.id,
      eventType: emsEvents.PolicyAcknowledged,
      payload: { policy_id: policy.id, employee_user_id: actor.id },
      idempotencyKey: `ems.policy.acknowledged:${policy.id}:${actor.id}:${acknowledgement.version}`
    });
    return { policy: this.presentPolicy(policy, actor.id), status: acknowledgement.status, version: acknowledgement.version };
  }

  updatePolicy(actor: AuthUser, id: UUID, input: EmsPolicyUpdateInput) {
    assertCanManageEms(actor);
    const policy = this.repository.updatePolicyVersioned(id, input.expected_version, (target) => {
      target.title = input.title?.trim() || target.title;
      target.category = input.category?.trim() || target.category;
      target.version_label = input.version_label?.trim() || target.version_label;
      target.effective_from = input.effective_from ?? target.effective_from;
      if ("document_id" in input) {
        target.document_id = input.document_id ?? null;
      }
      target.status = input.status ?? target.status;
    });
    appendEmsOutboxEvent(this.store, {
      aggregateType: "ems_policy",
      aggregateId: policy.id,
      eventType: emsEvents.PolicyUpdated,
      payload: { policy_id: policy.id, actor_user_id: actor.id, version_label: policy.version_label },
      idempotencyKey: `ems.policy.updated:${policy.id}:${policy.version}`
    });
    return { policy: this.presentPolicy(policy, actor.id), status: policy.status, version: policy.version };
  }

  listEmployeeDocuments(actor: AuthUser, userId: UUID, query: EmsDocumentQuery) {
    const user = this.requireUser(userId);
    assertCanSeeEmsUser(actor, user);
    const visible = this.store.documents
      .filter((document) => document.business_object_type === "employee" && document.business_object_id === userId && !document.deleted_at)
      .filter((document) => canAccessDocument(actor, document, "read"));
    const filtered = query.document_type
      ? visible.filter((document) => document.document_type === query.document_type)
      : visible;
    return {
      ...page(filtered, query.page, query.page_size),
      document_summary: this.documentSummary(visible)
    };
  }

  async attachEmployeeDocument(actor: AuthUser, userId: UUID, input: EmsDocumentUploadInput) {
    const user = this.requireUser(userId);
    assertCanSeeEmsUser(actor, user);
    if (actor.id !== userId && !canManageEms(actor)) {
      throw forbidden("Only the employee or HR/Admin can attach EMS employee documents.");
    }
    const replaceTarget = input.replace_document_id
      ? this.requireReplaceTarget(actor, userId, input.replace_document_id)
      : null;
    const document = await new DocumentService(this.store).upload(actor, {
      ...input,
      business_object_type: "employee",
      business_object_id: userId
    });
    document.owner_user_id = userId;
    document.metadata = {
      ...document.metadata,
      ems_employee_user_id: userId,
      ems_document_scope: "employee_self_service",
      replaces_document_id: replaceTarget?.id ?? null
    };
    if (replaceTarget) {
      const now = nowIso();
      replaceTarget.deleted_at = now;
      replaceTarget.updated_at = now;
      replaceTarget.metadata = {
        ...replaceTarget.metadata,
        replaced_by_document_id: document.id,
        replaced_by_user_id: actor.id,
        replaced_at: now
      };
    }
    return {
      document,
      access_policy: {
        business_object_type: "employee",
        business_object_id: userId,
        owner_user_id: userId,
        classification: document.classification
      }
    };
  }

  private requireReplaceTarget(actor: AuthUser, userId: UUID, documentId: UUID) {
    const document = this.store.documents.find((candidate) => candidate.id === documentId && !candidate.deleted_at);
    if (!document) {
      throw notFound("Document to replace was not found", { document_id: documentId });
    }
    if (document.business_object_type !== "employee" || document.business_object_id !== userId) {
      throw forbidden("Document replacement is only allowed within the same employee document scope.");
    }
    if (!canAccessDocument(actor, document, "write")) {
      throw forbidden("Document replacement denied");
    }
    return document;
  }

  private profileFor(actor: AuthUser, userId: UUID) {
    const user = this.requireUser(userId);
    assertCanSeeEmsUser(actor, user);
    const profile = this.repository.profileForUser(userId);
    const manager = user.manager_user_id ? this.store.users.find((candidate) => candidate.id === user.manager_user_id) : undefined;
    const department = this.store.departments.find((candidate) => candidate.id === user.department_id);
    const designation = this.store.designations.find((candidate) => candidate.id === user.designation_id);
    return {
      profile: {
        user: userLabel(user),
        department,
        designation,
        manager: userLabel(manager),
        joined_on: user.joined_on,
        employment_status: user.employment_status,
        personal_email: profile.personal_email,
        phone: profile.phone,
        alternate_phone: profile.alternate_phone,
        current_address: profile.current_address,
        permanent_address: profile.permanent_address,
        city: profile.city,
        country: profile.country,
        emergency_contact: profile.emergency_contact,
        personal_details: profile.personal_details,
        work_preferences: profile.work_preferences,
        version: profile.version
      },
      reporting_line: manager ? [userLabel(manager)] : [],
      emergency_contacts: [profile.emergency_contact].filter((contact) => Object.keys(contact).length > 0),
      summaries: {
        pending_profile_changes: this.repository.listProfileChangeRequests({ userId, status: EmsProfileChangeStatuses.Pending }).length,
        open_service_requests: this.repository.listServiceRequests({ userId }).filter((request) => !["closed", "rejected"].includes(request.status)).length,
        pending_policy_acknowledgements: this.repository
          .listPolicies()
          .filter((policy) => this.repository.acknowledgementFor(policy.id, userId).status === EmsPolicyAcknowledgementStatuses.Pending).length
      }
    };
  }

  private presentProfileChangeRequest(request: ReturnType<EmsRepository["findProfileChangeRequest"]>, actor?: AuthUser) {
    const user = this.store.users.find((candidate) => candidate.id === request.employee_user_id);
    return {
      ...request,
      employee: userLabel(user),
      can_decide: actor ? canManageEms(actor) && actor.id !== request.employee_user_id && request.status === EmsProfileChangeStatuses.Pending : false
    };
  }

  private presentServiceRequest(request: ReturnType<EmsRepository["addServiceRequest"]>) {
    const user = this.store.users.find((candidate) => candidate.id === request.requester_user_id);
    const assignee = request.assignee_user_id ? this.store.users.find((candidate) => candidate.id === request.assignee_user_id) : undefined;
    return {
      ...request,
      requester: userLabel(user),
      assignee: assignee ? userLabel(assignee) : null
    };
  }

  private presentAdminChecklist(checklist: ReturnType<EmsRepository["findAdminChecklist"]>) {
    const user = this.store.users.find((candidate) => candidate.id === checklist.employee_user_id);
    return {
      ...checklist,
      employee: userLabel(user)
    };
  }

  private presentProbationReview(review: ReturnType<EmsRepository["findProbationReview"]>) {
    const user = this.store.users.find((candidate) => candidate.id === review.employee_user_id);
    return {
      ...review,
      employee: userLabel(user)
    };
  }

  private presentLetter(letter: ReturnType<EmsRepository["findLetter"]>) {
    return {
      ...letter,
      issued_on: letter.issued_on,
      download_document_id: letter.document_id,
      acknowledgement_required: letter.status === EmsLetterStatuses.Available
    };
  }

  private presentPolicy(policy: ReturnType<EmsRepository["listPolicies"]>[number], userId: UUID) {
    const acknowledgement = this.repository.acknowledgementFor(policy.id, userId);
    return {
      ...policy,
      acknowledgement_status: acknowledgement.status,
      acknowledged_at: acknowledgement.acknowledged_at,
      acknowledgement_version: acknowledgement.version,
      document_download_id: policy.document_id
    };
  }

  private matchesUserFilters(userId: UUID, query: EmsQuery): boolean {
    const user = this.store.users.find((candidate) => candidate.id === userId);
    if (!user) return false;
    if (query.user_id && user.id !== query.user_id) return false;
    if (query.department_id && user.department_id !== query.department_id) return false;
    return true;
  }

  private queueCounts(statuses: string[]) {
    return {
      total: statuses.length,
      pending: statuses.filter((status) => status === "pending").length,
      in_progress: statuses.filter((status) => status === "in_progress").length,
      approved: statuses.filter((status) => status === "approved").length,
      returned: statuses.filter((status) => status === "returned").length,
      rejected: statuses.filter((status) => status === "rejected").length,
      closed: statuses.filter((status) => status === "closed").length
    };
  }

  private documentSummary(documents: Array<{ classification: string; document_type: string; metadata: Record<string, unknown> }>) {
    return {
      total: documents.length,
      verified: documents.filter((document) => typeof document.metadata.verified_at === "string").length,
      pending_verification: documents.filter((document) => typeof document.metadata.verified_at !== "string").length,
      restricted: documents.filter((document) => document.classification !== "normal").length,
      by_type: Object.fromEntries(
        [...new Set(documents.map((document) => document.document_type))].map((type) => [
          type,
          documents.filter((document) => document.document_type === type).length
        ])
      )
    };
  }

  private requireUser(userId: UUID): CoreUser {
    const user = this.store.users.find((candidate) => candidate.id === userId && !candidate.deleted_at);
    if (!user) {
      throw notFound("EMS employee not found", { user_id: userId });
    }
    return user;
  }

  private hrFallback(): CoreUser | null {
    return this.store.users.find((user) => user.roles.includes(Roles.HRManager) || user.roles.includes(Roles.Admin)) ?? null;
  }
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugifyLetterType(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return slug || "letter";
}
