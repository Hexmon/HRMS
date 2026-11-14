import { randomUUID } from "node:crypto";
import { AssetStatuses, type UUID } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { conflict } from "../../platform/errors.js";

export function createRecoveryTicketsForTerminatedEmployee(store: MemoryDataStore, companyId: UUID, employeeUserId: UUID): number {
  const assigned = store.assets.filter((asset) =>
    asset.company_id === companyId && asset.current_assigned_user_id === employeeUserId && asset.status === AssetStatuses.Assigned
  );
  for (const asset of assigned) {
    const activeAssignments = store.assetAssignments.filter((assignment) =>
      assignment.company_id === companyId && assignment.asset_id === asset.id && assignment.status === "active" &&
      assignment.assigned_to_user_id === employeeUserId
    );
    if (activeAssignments.length !== 1) {
      throw conflict("A terminated employee's asset has no unique active assignment.", { asset_id: asset.id });
    }
    const now = nowIso();
    asset.status = AssetStatuses.ReturnPending;
    asset.updated_at = now;
    asset.version += 1;
    store.assetRecoveryTickets.push({
      id: randomUUID(),
      company_id: companyId,
      employee_user_id: employeeUserId,
      asset_id: asset.id,
      assignment_id: activeAssignments[0]!.id,
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
      company_id: companyId,
      asset_id: asset.id,
      actor_user_id: null,
      event_type: "asset.recovery_requested",
      payload: { employee_user_id: employeeUserId },
      created_at: now
    });
  }
  return assigned.length;
}
