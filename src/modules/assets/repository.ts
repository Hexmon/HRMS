import { createHash, randomUUID } from "node:crypto";
import type { AssetRecord, UUID } from "#shared";
import { AssetStatuses } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
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

  hashFingerprint(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
