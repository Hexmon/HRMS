import type { AuthUser, HelpdeskTicket, HelpdeskTicketCategory } from "#shared";
import { HelpdeskTicketCategories, Roles } from "#shared";

const HELP_DESK_MANAGER_ROLES: readonly string[] = [
  Roles.Admin,
  Roles.HRManager,
  Roles.AssetManager,
  Roles.FinanceManager
];

export function categoryScopeForActor(actor: AuthUser): HelpdeskTicketCategory[] {
  if (actor.roles.includes(Roles.Admin)) {
    return [
      HelpdeskTicketCategories.IT,
      HelpdeskTicketCategories.HR,
      HelpdeskTicketCategories.Finance,
      HelpdeskTicketCategories.Admin,
      HelpdeskTicketCategories.Assets,
      HelpdeskTicketCategories.ProjectSupport
    ];
  }
  const scope = new Set<HelpdeskTicketCategory>();
  if (actor.roles.includes(Roles.AssetManager)) {
    scope.add(HelpdeskTicketCategories.IT);
    scope.add(HelpdeskTicketCategories.Admin);
    scope.add(HelpdeskTicketCategories.Assets);
  }
  if (actor.roles.includes(Roles.HRManager)) {
    scope.add(HelpdeskTicketCategories.HR);
  }
  if (actor.roles.includes(Roles.FinanceManager)) {
    scope.add(HelpdeskTicketCategories.Finance);
  }
  return Array.from(scope);
}

export function canManageHelpdesk(actor: AuthUser): boolean {
  return actor.roles.some((role) => HELP_DESK_MANAGER_ROLES.includes(role));
}

export function canSeeTicket(actor: AuthUser, ticket: HelpdeskTicket): boolean {
  if (ticket.requester_user_id === actor.id || ticket.assignee_user_id === actor.id) return true;
  if (actor.roles.includes(Roles.Admin)) return true;
  return categoryScopeForActor(actor).includes(ticket.category_key);
}

export function canManageTicket(actor: AuthUser, ticket: HelpdeskTicket): boolean {
  if (actor.roles.includes(Roles.Admin) || ticket.assignee_user_id === actor.id) return true;
  return categoryScopeForActor(actor).includes(ticket.category_key);
}

export function canCloseOrReopenTicket(actor: AuthUser, ticket: HelpdeskTicket): boolean {
  return ticket.requester_user_id === actor.id || canManageTicket(actor, ticket);
}
