import { randomUUID } from "node:crypto";
import type { AssetRecord, AuthUser, UUID } from "#shared";
import { AssetStatuses, LicenseStatuses, Roles } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { badRequest, conflict, forbidden, notFound } from "../../platform/errors.js";
import { appendOutboxEvent } from "../expenses/events.js";
import { assertAssetManager } from "./policy.js";
import { AssetRepository } from "./repository.js";
import { assertAssetTransition } from "./state-machine.js";
import { createRecoveryTicketsForTerminatedEmployee } from "./events.js";

export class AssetService {
  private readonly repository: AssetRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new AssetRepository(store);
  }

  create(actor: AuthUser, input: { asset_code: string; asset_type: string; name: string; serial_no?: string }): AssetRecord {
    assertAssetManager(actor);
    return this.repository.create(input);
  }

  list(actor: AuthUser, page: number, pageSize: number) {
    assertAssetManager(actor);
    const items = this.repository.list().map((asset) => this.presentAsset(asset));
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), page, page_size: pageSize, total: items.length };
  }

  detail(actor: AuthUser, id: UUID) {
    assertAssetManager(actor);
    return this.presentAsset(this.repository.find(id));
  }

  assign(actor: AuthUser, id: UUID, assignedToUserId: UUID, expectedVersion: number): AssetRecord {
    assertAssetManager(actor);
    const asset = this.repository.find(id);
    assertAssetTransition(asset.status, AssetStatuses.Assigned);
    const updated = this.repository.updateVersioned(id, expectedVersion, (candidate) => {
      candidate.status = AssetStatuses.Assigned;
      candidate.current_assigned_user_id = assignedToUserId;
    });
    const now = nowIso();
    this.store.assetAssignments.push({
      id: randomUUID(),
      asset_id: id,
      assigned_to_user_id: assignedToUserId,
      assigned_by_user_id: actor.id,
      assigned_at: now,
      returned_at: null,
      status: "active",
      created_at: now,
      updated_at: now
    });
    this.store.assetStateEvents.push({
      id: randomUUID(),
      asset_id: id,
      actor_user_id: actor.id,
      event_type: "asset.assigned",
      payload: { assigned_to_user_id: assignedToUserId },
      created_at: now
    });
    return updated;
  }

  myRequests(actor: AuthUser, query: { page: number; page_size: number; status?: string; type?: string }) {
    const items = this.repository
      .listRequests({ requesterUserId: actor.id, status: query.status, assetType: query.type })
      .map((request) => this.presentRequest(request));
    return page(items, query.page, query.page_size);
  }

  createRequest(
    actor: AuthUser,
    input: {
      request_type: "new" | "replacement" | "repair" | "return";
      asset_type: string;
      asset_id?: UUID | null;
      reason: string;
      priority?: "low" | "medium" | "high" | "urgent";
      needed_by?: string | null;
      preferred_specs?: Record<string, unknown>;
    }
  ) {
    if (input.asset_id) {
      this.repository.find(input.asset_id);
    }
    const duplicate = this.repository
      .listRequests({ requesterUserId: actor.id })
      .find((request) => request.status === "pending" && request.asset_type === input.asset_type);
    if (duplicate) {
      throw conflict("An active asset request already exists for this asset type.", {
        id: duplicate.id,
        request_code: duplicate.request_code
      });
    }
    const request = this.repository.createRequest({
      requester_user_id: actor.id,
      request_type: input.request_type,
      asset_type: input.asset_type,
      asset_id: input.asset_id ?? null,
      reason: input.reason,
      priority: input.priority ?? "medium",
      needed_by: input.needed_by ?? null,
      preferred_specs: input.preferred_specs ?? {},
      status: "pending",
      decision_by_user_id: null,
      decision_at: null,
      decision_remarks: null,
      assigned_asset_id: null
    });
    this.appendAssetEvent(input.asset_id ?? null, actor.id, "asset.request_created", {
      request_id: request.id,
      request_code: request.request_code,
      asset_type: request.asset_type
    });
    return { request: this.presentRequest(request), version: request.version };
  }

  requestQueue(actor: AuthUser, query: { page: number; page_size: number; status?: string; type?: string }) {
    assertAssetManager(actor);
    const all = this.repository.listRequests({ status: query.status, assetType: query.type });
    const items = all.map((request) => this.presentRequest(request));
    const queue_counts = {
      pending: all.filter((request) => request.status === "pending").length,
      approved: all.filter((request) => request.status === "approved").length,
      rejected: all.filter((request) => request.status === "rejected").length,
      fulfilled: all.filter((request) => request.status === "fulfilled").length
    };
    return { ...page(items, query.page, query.page_size), queue_counts };
  }

  decideRequest(
    actor: AuthUser,
    id: UUID,
    input: {
      decision: "approved" | "rejected" | "returned" | "fulfilled";
      remarks?: string | null;
      expected_version: number;
      asset_id?: UUID | null;
    }
  ) {
    assertAssetManager(actor);
    if ((input.decision === "rejected" || input.decision === "returned") && !input.remarks?.trim()) {
      throw badRequest("Remarks are required for reject or return decisions.");
    }
    let assignedAsset: AssetRecord | null = null;
    const request = this.repository.updateRequestVersioned(id, input.expected_version, (candidate) => {
      if (candidate.status !== "pending" && candidate.status !== "approved") {
        throw conflict("Asset request cannot be decided in its current status.", { id });
      }
      candidate.status = input.decision;
      candidate.decision_by_user_id = actor.id;
      candidate.decision_at = nowIso();
      candidate.decision_remarks = input.remarks ?? null;
      candidate.assigned_asset_id = input.asset_id ?? null;
    });
    if ((input.decision === "approved" || input.decision === "fulfilled") && input.asset_id) {
      assignedAsset = this.repository.find(input.asset_id);
    }
    this.appendAssetEvent(assignedAsset?.id ?? request.asset_id, actor.id, `asset.request_${input.decision}`, {
      request_id: request.id,
      request_code: request.request_code,
      remarks: input.remarks ?? null
    });
    return {
      request: this.presentRequest(request),
      assigned_asset: assignedAsset ? this.presentAsset(assignedAsset) : null,
      version: request.version
    };
  }

  cancelRequest(actor: AuthUser, id: UUID, input: { expected_version: number; remarks?: string | null }) {
    const current = this.repository.findRequest(id);
    if (current.requester_user_id !== actor.id) {
      throw notFound("Asset request not found", { id });
    }
    const request = this.repository.updateRequestVersioned(id, input.expected_version, (candidate) => {
      if (candidate.status !== "pending") {
        throw conflict("Only pending asset requests can be cancelled.", { id });
      }
      candidate.status = "cancelled";
      candidate.decision_remarks = input.remarks ?? null;
    });
    return { request: this.presentRequest(request), version: request.version };
  }

  acknowledge(actor: AuthUser, id: UUID, input: { acknowledgement_type: "received" | "returned"; expected_version: number }) {
    const asset = this.repository.find(id);
    if (asset.current_assigned_user_id !== actor.id && !actor.roles.includes(Roles.Admin)) {
      throw forbidden("Only the assigned employee can acknowledge this asset.");
    }
    const assignment = this.repository.activeAssignment(id);
    const updated = this.repository.updateVersioned(id, input.expected_version, (candidate) => {
      candidate.updated_at = nowIso();
    });
    const acknowledgement = this.repository.createAcknowledgement({
      asset_id: id,
      employee_user_id: actor.id,
      assignment_id: assignment?.id ?? null,
      acknowledgement_type: input.acknowledgement_type
    });
    this.appendAssetEvent(id, actor.id, "asset.acknowledged", {
      acknowledgement_id: acknowledgement.id,
      acknowledgement_type: acknowledgement.acknowledgement_type
    });
    return {
      asset: this.presentAsset(updated),
      acknowledgement,
      version: updated.version
    };
  }

  listMaintenance(actor: AuthUser, id: UUID, query: { page: number; page_size: number; status?: string }) {
    this.assertAssetVisible(actor, id);
    const items = this.repository.listMaintenance(id, query.status).map((record) => this.presentMaintenance(record));
    return page(items, query.page, query.page_size);
  }

  createMaintenance(
    actor: AuthUser,
    id: UUID,
    input: {
      maintenance_type: "repair" | "preventive" | "warranty" | "inspection" | "other";
      vendor_id?: UUID | null;
      cost?: string | null;
      started_on: string;
      completed_on?: string | null;
      status?: "scheduled" | "in_progress" | "completed" | "cancelled";
      notes?: string | null;
      expected_version: number;
    }
  ) {
    assertAssetManager(actor);
    const asset = this.repository.updateVersioned(id, input.expected_version, (candidate) => {
      candidate.status = input.status === "completed" ? AssetStatuses.InStock : AssetStatuses.InMaintenance;
    });
    const record = this.repository.createMaintenance({
      asset_id: id,
      maintenance_type: input.maintenance_type,
      vendor_id: input.vendor_id ?? null,
      cost: input.cost ?? null,
      started_on: input.started_on,
      completed_on: input.completed_on ?? null,
      status: input.status ?? "in_progress",
      notes: input.notes ?? null
    });
    this.appendAssetEvent(id, actor.id, "asset.maintenance_logged", {
      maintenance_id: record.id,
      maintenance_type: record.maintenance_type
    });
    return {
      maintenance: this.presentMaintenance(record),
      asset: this.presentAsset(asset),
      asset_version: asset.version
    };
  }

  vendors(actor: AuthUser, query: { page: number; page_size: number; active_only?: boolean; search?: string }) {
    assertAssetManager(actor);
    return page(this.repository.listVendors({ activeOnly: query.active_only, search: query.search }), query.page, query.page_size);
  }

  createVendor(
    actor: AuthUser,
    input: {
      name: string;
      contact_email?: string | null;
      phone?: string | null;
      status?: "active" | "inactive";
      metadata?: Record<string, unknown>;
    }
  ) {
    assertAssetManager(actor);
    const vendor = this.repository.createVendor(input);
    appendOutboxEvent(this.store, {
      aggregateType: "asset_vendor",
      aggregateId: vendor.id,
      eventType: "asset.vendor_created",
      payload: { name: vendor.name, actor_user_id: actor.id },
      idempotencyKey: `asset.vendor_created:${vendor.id}`
    });
    return { vendor, version: vendor.version };
  }

  updateVendor(
    actor: AuthUser,
    id: UUID,
    input: {
      name?: string;
      contact_email?: string | null;
      phone?: string | null;
      status?: "active" | "inactive";
      metadata?: Record<string, unknown>;
      expected_version: number;
    }
  ) {
    assertAssetManager(actor);
    const vendor = this.repository.updateVendorVersioned(id, input.expected_version, (candidate) => {
      candidate.name = input.name?.trim() || candidate.name;
      if ("contact_email" in input) candidate.contact_email = input.contact_email ?? null;
      if ("phone" in input) candidate.phone = input.phone ?? null;
      if (input.status) candidate.status = input.status;
      if (input.metadata) candidate.metadata = { ...candidate.metadata, ...input.metadata };
    });
    appendOutboxEvent(this.store, {
      aggregateType: "asset_vendor",
      aggregateId: vendor.id,
      eventType: "asset.vendor_updated",
      payload: { name: vendor.name, status: vendor.status, actor_user_id: actor.id },
      idempotencyKey: `asset.vendor_updated:${vendor.id}:${vendor.version}`
    });
    return { vendor, version: vendor.version };
  }

  recoveryQueue(actor: AuthUser, query: { page: number; page_size: number; user_id?: UUID; status?: string }) {
    if (!actor.roles.includes(Roles.AssetManager) && !actor.roles.includes(Roles.Admin) && !actor.roles.includes(Roles.HRManager)) {
      throw forbidden("Asset, HR, or Admin role required");
    }
    const tickets = this.store.assetRecoveryTickets
      .filter((ticket) => !query.user_id || ticket.employee_user_id === query.user_id)
      .filter((ticket) => !query.status || ticket.status === query.status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const items = tickets.map((ticket) => ({
      ...ticket,
      employee: this.store.users.find((user) => user.id === ticket.employee_user_id) ?? null,
      asset: this.store.assets.find((asset) => asset.id === ticket.asset_id) ?? null
    }));
    return {
      ...page(items, query.page, query.page_size),
      totals: {
        open: tickets.filter((ticket) => ticket.status === "open").length,
        in_progress: tickets.filter((ticket) => ticket.status === "in_progress").length,
        closed: tickets.filter((ticket) => ticket.status === "closed").length
      }
    };
  }

  settleRecovery(
    actor: AuthUser,
    id: UUID,
    input: {
      settlement_status: "recovered" | "deduction" | "waived" | "lost_damaged";
      settlement_amount?: string | null;
      remarks?: string | null;
      expected_version: number;
    }
  ) {
    assertAssetManager(actor);
    const ticket = this.repository.findRecoveryTicket(id);
    if (ticket.version !== input.expected_version) {
      throw conflict("Asset recovery ticket was modified by another actor.", { aggregate: "asset_recovery_ticket", id });
    }
    if (ticket.status === "closed") {
      throw conflict("Asset recovery ticket is already closed.", { id });
    }
    const asset = this.repository.find(ticket.asset_id);
    const now = nowIso();
    if (input.settlement_status === "lost_damaged") {
      asset.status = AssetStatuses.LostStolen;
    } else {
      asset.status = AssetStatuses.Returned;
    }
    if (asset.current_assigned_user_id === ticket.employee_user_id) {
      asset.current_assigned_user_id = null;
    }
    asset.version += 1;
    asset.updated_at = now;
    const assignment = this.store.assetAssignments.find(
      (candidate) => candidate.asset_id === asset.id && candidate.status === "active"
    );
    if (assignment) {
      assignment.status = "returned";
      assignment.returned_at = now;
      assignment.updated_at = now;
    }
    ticket.status = "closed";
    ticket.settlement_status = input.settlement_status;
    ticket.settlement_amount = input.settlement_amount ?? null;
    ticket.settlement_remarks = input.remarks ?? null;
    ticket.settled_by_user_id = actor.id;
    ticket.settled_at = now;
    ticket.version += 1;
    ticket.updated_at = now;
    this.appendAssetEvent(asset.id, actor.id, "asset.recovery_settled", {
      recovery_ticket_id: ticket.id,
      employee_user_id: ticket.employee_user_id,
      settlement_status: ticket.settlement_status,
      settlement_amount: ticket.settlement_amount,
      remarks: ticket.settlement_remarks
    });
    return {
      ticket: this.presentRecoveryTicket(ticket),
      asset: this.presentAsset(asset),
      version: ticket.version
    };
  }

  returnAsset(actor: AuthUser, id: UUID, expectedVersion: number): AssetRecord {
    assertAssetManager(actor);
    const asset = this.repository.find(id);
    assertAssetTransition(asset.status, AssetStatuses.Returned);
    const updated = this.repository.updateVersioned(id, expectedVersion, (candidate) => {
      candidate.status = AssetStatuses.Returned;
      candidate.current_assigned_user_id = null;
    });
    const now = nowIso();
    const assignment = this.store.assetAssignments.find(
      (candidate) => candidate.asset_id === id && candidate.status === "active"
    );
    if (assignment) {
      assignment.status = "returned";
      assignment.returned_at = now;
      assignment.updated_at = now;
    }
    this.store.assetStateEvents.push({
      id: randomUUID(),
      asset_id: id,
      actor_user_id: actor.id,
      event_type: "asset.returned",
      payload: {},
      created_at: now
    });
    return updated;
  }

  scan(qrHash: string) {
    const asset = this.repository.findByQrHash(qrHash);
    return {
      qr_hash: asset.qr_hash,
      asset_code: asset.asset_code,
      asset_type: asset.asset_type,
      name: asset.name,
      status: asset.status,
      assigned: asset.current_assigned_user_id ? "assigned" : "unassigned"
    };
  }

  activateLicense(input: { product_id: UUID; entitlement_id: UUID; hardware_fingerprint: string }) {
    const fingerprintHash = this.repository.hashFingerprint(input.hardware_fingerprint);
    const compromised = this.store.compromisedKeys.some((key) => key.key_hash === fingerprintHash && key.status === "active");
    if (compromised) {
      throw badRequest("Revoked or compromised devices cannot activate licenses");
    }
    const entitlement = this.store.licenseEntitlements.find(
      (candidate) => candidate.id === input.entitlement_id && candidate.product_id === input.product_id && candidate.status === LicenseStatuses.Active
    );
    if (!entitlement) {
      throw badRequest("Active license entitlement not found");
    }
    const activeSeats = this.store.licenseActivations.filter(
      (activation) => activation.entitlement_id === entitlement.id && activation.status === LicenseStatuses.Active
    ).length;
    if (activeSeats >= entitlement.seat_count) {
      throw badRequest("License seats cannot be overused");
    }
    const activation = {
      id: randomUUID(),
      product_id: input.product_id,
      entitlement_id: input.entitlement_id,
      hardware_fingerprint_hash: fingerprintHash,
      status: LicenseStatuses.Active,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    this.store.licenseActivations.push(activation);
    return {
      activation_id: activation.id,
      status: activation.status,
      offline_license_file: "signed-dev-license-placeholder"
    };
  }

  validateLicense(input: { product_id: UUID; hardware_fingerprint: string }) {
    const fingerprintHash = this.repository.hashFingerprint(input.hardware_fingerprint);
    const activation = this.store.licenseActivations.find(
      (candidate) =>
        candidate.product_id === input.product_id &&
        candidate.hardware_fingerprint_hash === fingerprintHash &&
        candidate.status === LicenseStatuses.Active
    );
    return { valid: Boolean(activation) };
  }

  revokeLicense(actor: AuthUser, input: { hardware_fingerprint: string }) {
    assertAssetManager(actor);
    const keyHash = this.repository.hashFingerprint(input.hardware_fingerprint);
    this.store.compromisedKeys.push({
      id: randomUUID(),
      key_hash: keyHash,
      status: "active",
      created_at: nowIso()
    });
    for (const activation of this.store.licenseActivations) {
      if (activation.hardware_fingerprint_hash === keyHash) {
        activation.status = LicenseStatuses.Revoked;
        activation.updated_at = nowIso();
      }
    }
    return { status: "revoked" };
  }

  consumeEmployeeTerminated(employeeUserId: UUID): { recovery_tickets_created: number } {
    appendOutboxEvent(this.store, {
      aggregateType: "employee",
      aggregateId: employeeUserId,
      eventType: "employee.terminated",
      payload: { employee_user_id: employeeUserId },
      idempotencyKey: `employee.terminated:${employeeUserId}`
    });
    return { recovery_tickets_created: createRecoveryTicketsForTerminatedEmployee(this.store, employeeUserId) };
  }

  private assertAssetVisible(actor: AuthUser, id: UUID): AssetRecord {
    const asset = this.repository.find(id);
    if (asset.current_assigned_user_id === actor.id || actor.roles.includes(Roles.AssetManager) || actor.roles.includes(Roles.Admin)) {
      return asset;
    }
    throw forbidden("Asset is outside actor scope.");
  }

  private appendAssetEvent(assetId: UUID | null, actorId: UUID | null, eventType: string, payload: Record<string, unknown>) {
    if (!assetId) return;
    this.store.assetStateEvents.push({
      id: randomUUID(),
      asset_id: assetId,
      actor_user_id: actorId,
      event_type: eventType,
      payload,
      created_at: nowIso()
    });
  }

  private presentRequest(request: MemoryDataStore["assetRequests"][number]) {
    const requester = this.store.users.find((user) => user.id === request.requester_user_id);
    const decisionBy = request.decision_by_user_id
      ? this.store.users.find((user) => user.id === request.decision_by_user_id)
      : null;
    return {
      ...request,
      requester_name: requester?.full_name ?? null,
      decision_by_name: decisionBy?.full_name ?? null
    };
  }

  private presentMaintenance(record: MemoryDataStore["assetMaintenanceRecords"][number]) {
    const vendor = record.vendor_id ? this.store.assetVendors.find((candidate) => candidate.id === record.vendor_id) : null;
    return {
      ...record,
      vendor_name: vendor?.name ?? null
    };
  }

  private presentRecoveryTicket(ticket: MemoryDataStore["assetRecoveryTickets"][number]) {
    return {
      ...ticket,
      employee: this.store.users.find((user) => user.id === ticket.employee_user_id) ?? null,
      asset: this.store.assets.find((asset) => asset.id === ticket.asset_id) ?? null
    };
  }

  private presentAsset(asset: AssetRecord) {
    const assigned = asset.current_assigned_user_id
      ? this.store.users.find((candidate) => candidate.id === asset.current_assigned_user_id)
      : null;
    const activeAssignment = this.repository.activeAssignment(asset.id);
    const latestAcknowledgement = this.store.assetAcknowledgements
      .filter((acknowledgement) => acknowledgement.asset_id === asset.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const metadata = asset.metadata ?? {};
    return {
      ...asset,
      category: metadata.category,
      brand: metadata.brand,
      model: metadata.model,
      purchase_date: metadata.purchase_date,
      vendor: metadata.vendor,
      invoice_no: metadata.invoice_no,
      warranty_expiry: metadata.warranty_expiry,
      cost: metadata.procurement_cost ?? metadata.cost,
      location: metadata.location,
      condition: metadata.condition,
      assigned_to_user_id: asset.current_assigned_user_id,
      assigned_to_name: assigned?.full_name ?? null,
      assigned_on: activeAssignment?.assigned_at ?? null,
      latest_acknowledgement: latestAcknowledgement ?? null,
      maintenance: this.repository.listMaintenance(asset.id).map((record) => this.presentMaintenance(record))
    };
  }
}

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, page_size: pageSize, total: items.length };
}
