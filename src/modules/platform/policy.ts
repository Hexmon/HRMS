import type { AuthUser } from "#shared";
import { Roles } from "#shared";
import { forbidden } from "../../platform/errors.js";

export function assertCanReadFinanceGovernance(actor: AuthUser): void {
  if (actor.roles.includes(Roles.Admin) || actor.roles.includes(Roles.FinanceManager) || actor.roles.includes(Roles.Auditor)) {
    return;
  }
  throw forbidden("You do not have access to finance governance configuration");
}

export function assertCanWriteFinanceGovernance(actor: AuthUser): void {
  if (actor.roles.includes(Roles.Admin)) {
    return;
  }
  throw forbidden("Only Admin can update finance governance configuration");
}
