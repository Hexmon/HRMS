import type { AuthUser, CoreUser, ProjectMemberRecord, ProjectRecord } from "#shared";
import { ProjectMemberStatuses, Roles } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { forbidden } from "../../platform/errors.js";

const PROJECT_PORTFOLIO_ROLES: readonly string[] = [Roles.Admin, Roles.HRManager, Roles.Auditor, Roles.FinanceManager];

export function canSeeProjectPortfolio(actor: AuthUser): boolean {
  return actor.roles.some((role) => PROJECT_PORTFOLIO_ROLES.includes(role));
}

export function canMutateProject(actor: AuthUser, project: ProjectRecord): boolean {
  return actor.roles.includes(Roles.Admin) || project.manager_user_id === actor.id;
}

export function canSeeProject(
  actor: AuthUser,
  project: ProjectRecord,
  members: readonly ProjectMemberRecord[],
  users: readonly CoreUser[]
): boolean {
  if (canSeeProjectPortfolio(actor) || project.manager_user_id === actor.id) {
    return true;
  }
  if (members.some((member) => member.employee_user_id === actor.id && member.status === ProjectMemberStatuses.Active && !member.deleted_at)) {
    return true;
  }
  const actorUser = users.find((user) => user.id === actor.id);
  if (!actorUser) {
    return false;
  }
  const memberUsers = members
    .filter((member) => member.status === ProjectMemberStatuses.Active && !member.deleted_at)
    .map((member) => users.find((user) => user.id === member.employee_user_id))
    .filter((user): user is CoreUser => Boolean(user));
  return memberUsers.some((user) => user.hierarchy_path.startsWith(`${actorUser.hierarchy_path}.`));
}

export function assertCanSeeProject(
  actor: AuthUser,
  project: ProjectRecord,
  store: MemoryDataStore
): void {
  const members = store.projectMembers.filter((member) => member.project_id === project.id);
  if (!canSeeProject(actor, project, members, store.users)) {
    throw forbidden("Project access is limited to portfolio roles, project managers, reporting managers, or project members.");
  }
}

export function assertCanMutateProject(actor: AuthUser, project: ProjectRecord): void {
  if (!canMutateProject(actor, project)) {
    throw forbidden("Only Admin or the assigned project manager can change this project.");
  }
}
