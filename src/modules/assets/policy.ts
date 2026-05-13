import type { AuthUser } from "#shared";
import { Roles } from "#shared";
import { forbidden } from "../../platform/errors.js";

export function assertAssetManager(actor: AuthUser): void {
  if (!actor.roles.includes(Roles.AssetManager) && !actor.roles.includes(Roles.Admin)) {
    throw forbidden("Asset Manager role required");
  }
}
