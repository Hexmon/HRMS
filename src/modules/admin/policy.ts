import { Roles, type AuthUser } from "#shared";
import { forbidden } from "../../platform/errors.js";

export function assertCanManageAdminSettings(actor: AuthUser): void {
  if (actor.roles.includes(Roles.Admin)) return;
  throw forbidden("Only Admin can manage company settings");
}

export function assertCanManageMasterData(actor: AuthUser): void {
  if (actor.roles.includes(Roles.Admin) || actor.roles.includes(Roles.HRManager)) return;
  throw forbidden("Only Admin or HR Manager can manage master data");
}

export function assertCanManageRbac(actor: AuthUser): void {
  if (actor.roles.includes(Roles.Admin)) return;
  throw forbidden("Only Admin can manage RBAC settings");
}

export function assertCanManageWorkflowSettings(actor: AuthUser): void {
  if (actor.roles.includes(Roles.Admin)) return;
  throw forbidden("Only Admin can manage workflow settings");
}

export function assertCanManagePolicySettings(actor: AuthUser): void {
  if (actor.roles.includes(Roles.Admin)) return;
  throw forbidden("Only Admin can manage policy settings");
}

export function assertCanManageEmailTemplates(actor: AuthUser): void {
  if (actor.roles.includes(Roles.Admin)) return;
  throw forbidden("Only Admin can manage email templates");
}

export function assertCanManageNotificationChannels(actor: AuthUser): void {
  if (actor.roles.includes(Roles.Admin)) return;
  throw forbidden("Only Admin can manage notification channels");
}
