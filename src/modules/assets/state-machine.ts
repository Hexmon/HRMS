import { AssetStatuses, type AssetStatus } from "#shared";
import { badRequest } from "../../platform/errors.js";

const transitions: Record<AssetStatus, readonly AssetStatus[]> = {
  [AssetStatuses.Procured]: [AssetStatuses.InStock],
  [AssetStatuses.InStock]: [AssetStatuses.Assigned, AssetStatuses.InMaintenance, AssetStatuses.Retired],
  [AssetStatuses.Assigned]: [AssetStatuses.ReturnPending, AssetStatuses.Returned, AssetStatuses.LostStolen],
  [AssetStatuses.InMaintenance]: [AssetStatuses.InStock, AssetStatuses.Retired],
  [AssetStatuses.ReturnPending]: [AssetStatuses.Returned, AssetStatuses.LostStolen],
  [AssetStatuses.Returned]: [AssetStatuses.InStock, AssetStatuses.Retired],
  [AssetStatuses.Retired]: [],
  [AssetStatuses.LostStolen]: []
};

export function assertAssetTransition(from: AssetStatus, to: AssetStatus): void {
  if (!transitions[from]?.includes(to)) {
    throw badRequest(`Invalid asset transition from ${from} to ${to}`);
  }
}
