import { randomUUID } from "node:crypto";
import type { AssetRecord, AuthUser, UUID } from "#shared";
import { AssetStatuses, LicenseStatuses } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { badRequest } from "../../platform/errors.js";
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
    const items = this.repository.list();
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), page, page_size: pageSize, total: items.length };
  }

  detail(actor: AuthUser, id: UUID): AssetRecord {
    assertAssetManager(actor);
    return this.repository.find(id);
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
}
