import type { AuthUser } from "#shared";
import { Roles } from "#shared";
import { forbidden } from "../../platform/errors.js";

export function assertAssetManager(actor: AuthUser): void {
  if (!actor.roles.includes(Roles.AssetManager) && !actor.roles.includes(Roles.Admin)) {
    throw forbidden("Asset Manager role required");
  }
}

export function assertAssignedAssetEmployee(
  assignedUserId: string | null,
  actor: AuthUser,
): void {
  if (assignedUserId === actor.id) return;
  throw forbidden("Only the assigned employee can acknowledge this asset.");
}
