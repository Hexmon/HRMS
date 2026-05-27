import { randomUUID } from "node:crypto";
import { AssetStatuses, type UUID } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";

export function createRecoveryTicketsForTerminatedEmployee(store: MemoryDataStore, employeeUserId: UUID): number {
  const assigned = store.assets.filter((asset) => asset.current_assigned_user_id === employeeUserId && asset.status === AssetStatuses.Assigned);
  for (const asset of assigned) {
    const now = nowIso();
    asset.status = AssetStatuses.ReturnPending;
    asset.updated_at = now;
    asset.version += 1;
    store.assetRecoveryTickets.push({
      id: randomUUID(),
      employee_user_id: employeeUserId,
      asset_id: asset.id,
      status: "open",
      settlement_status: null,
      settlement_amount: null,
      settlement_remarks: null,
      settled_by_user_id: null,
      settled_at: null,
      version: 1,
      created_at: now,
      updated_at: now
    });
    store.assetStateEvents.push({
      id: randomUUID(),
      asset_id: asset.id,
      actor_user_id: null,
      event_type: "asset.recovery_requested",
      payload: { employee_user_id: employeeUserId },
      created_at: now
    });
  }
  return assigned.length;
}
