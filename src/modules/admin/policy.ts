import { Roles, type AuthUser } from "#shared";
import { forbidden } from "../../platform/errors.js";

export function assertCanManageAdminSettings(actor: AuthUser): void {
  if (actor.roles.includes(Roles.Admin)) return;
  throw forbidden("Only Admin can manage company settings");
}
