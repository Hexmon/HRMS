import type { AuthUser, RoleKey } from "#shared";
import { Roles } from "#shared";
import { forbidden } from "../../platform/errors.js";

export function assertReportRole(actor: AuthUser, roles: readonly RoleKey[]): void {
  if (!roles.some((role) => actor.roles.includes(role)) && !actor.roles.includes(Roles.Admin)) {
    throw forbidden("Report access denied");
  }
}
