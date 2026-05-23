import { createHash, randomUUID } from "node:crypto";
import type { AssetRecord, UUID } from "#shared";
import { AssetStatuses } from "#shared";
import type {
  AssetAcknowledgementRecord,
  AssetMaintenanceRecord,
  AssetRequestRecord,
  AssetVendorRecord,
  MemoryDataStore
} from "../../platform/data-store.js";
import { createQrHash, nowIso } from "../../platform/data-store.js";
import { conflict, notFound } from "../../platform/errors.js";

export class AssetRepository {
  constructor(private readonly store: MemoryDataStore) {}

  create(input: { asset_code: string; asset_type: string; name: string; serial_no?: string }): AssetRecord {
    const now = nowIso();
    const asset: AssetRecord = {
      id: randomUUID(),
      asset_code: input.asset_code,
      qr_hash: createQrHash(input.asset_code),
      asset_type: input.asset_type,
      name: input.name,
      serial_no: input.serial_no ?? null,
      status: AssetStatuses.InStock,
      current_assigned_user_id: null,
      metadata: {},
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null
    };
    this.store.assets.push(asset);
    return asset;
  }

  find(id: UUID): AssetRecord {
    const asset = this.store.assets.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!asset) {
      throw notFound("Asset not found", { id });
    }
    return asset;
  }

  findByQrHash(qrHash: string): AssetRecord {
    const asset = this.store.assets.find((candidate) => candidate.qr_hash === qrHash && !candidate.deleted_at);
    if (!asset) {
      throw notFound("Asset not found", { qr_hash: qrHash });
    }
    return asset;
  }

  list(): AssetRecord[] {
    return this.store.assets.filter((asset) => !asset.deleted_at);
  }

  activeAssignment(assetId: UUID) {
    return this.store.assetAssignments.find((candidate) => candidate.asset_id === assetId && candidate.status === "active") ?? null;
  }

  updateVersioned(id: UUID, expectedVersion: number, mutator: (asset: AssetRecord) => void): AssetRecord {
    const asset = this.find(id);
    if (asset.version !== expectedVersion) {
      throw conflict("Asset was modified by another actor.", { aggregate: "asset", id });
    }
    mutator(asset);
    asset.version += 1;
    asset.updated_at = nowIso();
    return asset;
  }

  createRequest(input: Omit<AssetRequestRecord, "id" | "request_code" | "version" | "created_at" | "updated_at" | "deleted_at">): AssetRequestRecord {
    const now = nowIso();
    const nextNumber = this.store.assetRequests.length + 401;
    const request: AssetRequestRecord = {
      id: randomUUID(),
      request_code: `REQ-${nextNumber}`,
      ...input,
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null
    };
    this.store.assetRequests.push(request);
    return request;
  }

  listRequests(filters: { requesterUserId?: UUID; status?: string; assetType?: string }): AssetRequestRecord[] {
    return this.store.assetRequests
      .filter((request) => !request.deleted_at)
      .filter((request) => !filters.requesterUserId || request.requester_user_id === filters.requesterUserId)
      .filter((request) => !filters.status || request.status === filters.status)
      .filter((request) => !filters.assetType || request.asset_type === filters.assetType)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  findRequest(id: UUID): AssetRequestRecord {
    const request = this.store.assetRequests.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!request) {
      throw notFound("Asset request not found", { id });
    }
    return request;
  }

  updateRequestVersioned(id: UUID, expectedVersion: number, mutator: (request: AssetRequestRecord) => void): AssetRequestRecord {
    const request = this.findRequest(id);
    if (request.version !== expectedVersion) {
      throw conflict("Asset request was modified by another actor.", { aggregate: "asset_request", id });
    }
    mutator(request);
    request.version += 1;
    request.updated_at = nowIso();
    return request;
  }

  createAcknowledgement(input: Omit<AssetAcknowledgementRecord, "id" | "status" | "acknowledged_at" | "version" | "created_at" | "updated_at">): AssetAcknowledgementRecord {
    const now = nowIso();
    const acknowledgement: AssetAcknowledgementRecord = {
      id: randomUUID(),
      ...input,
      status: "acknowledged",
      acknowledged_at: now,
      version: 1,
      created_at: now,
      updated_at: now
    };
    this.store.assetAcknowledgements.push(acknowledgement);
    return acknowledgement;
  }

  listMaintenance(assetId: UUID, status?: string): AssetMaintenanceRecord[] {
    return this.store.assetMaintenanceRecords
      .filter((record) => record.asset_id === assetId && !record.deleted_at)
      .filter((record) => !status || record.status === status)
      .sort((a, b) => b.started_on.localeCompare(a.started_on));
  }

  createMaintenance(input: Omit<AssetMaintenanceRecord, "id" | "version" | "created_at" | "updated_at" | "deleted_at">): AssetMaintenanceRecord {
    const now = nowIso();
    const record: AssetMaintenanceRecord = {
      id: randomUUID(),
      ...input,
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null
    };
    this.store.assetMaintenanceRecords.push(record);
    return record;
  }

  listVendors(filters: { activeOnly?: boolean; search?: string }): AssetVendorRecord[] {
    const search = filters.search?.toLowerCase();
    return this.store.assetVendors
      .filter((vendor) => !vendor.deleted_at)
      .filter((vendor) => !filters.activeOnly || vendor.status === "active")
      .filter((vendor) => !search || vendor.name.toLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  hashFingerprint(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
