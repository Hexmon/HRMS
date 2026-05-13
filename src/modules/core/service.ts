import type { AuthUser, CoreUser, UUID } from "#shared";
import { Roles } from "#shared";
import { forbidden, notFound } from "../../platform/errors.js";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { CoreRepository } from "./repository.js";

export interface SubtreeUser extends CoreUser {
  depth: number;
}

export interface UserSubtreeResult {
  items: SubtreeUser[];
  page: number;
  page_size: number;
  total: number;
  total_active_descendants: number;
  max_depth: number;
  summary: {
    root_user_id: UUID;
    root_employee_code: string;
    root_full_name: string;
    total_active_descendants: number;
    max_depth: number;
  };
}

export class CoreService {
  private readonly repository: CoreRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new CoreRepository(store);
  }

  listUsers(params: { page: number; page_size: number; q?: string }): { items: CoreUser[]; total: number } {
    const q = params.q?.toLowerCase();
    const users = this.repository
      .listUsers()
      .filter((user) => user.employment_status === "active")
      .filter((user) => !q || user.full_name.toLowerCase().includes(q) || user.employee_code.toLowerCase().includes(q));
    const start = (params.page - 1) * params.page_size;
    return { items: users.slice(start, start + params.page_size), total: users.length };
  }

  getUser(id: UUID): CoreUser {
    const user = this.repository.findUser(id);
    if (!user) {
      throw notFound("User not found", { id });
    }
    return user;
  }

  resolveSubtree(managerUserId: UUID): CoreUser[] {
    const manager = this.repository.findActiveUser(managerUserId);
    if (!manager) {
      throw notFound("Manager not found", { id: managerUserId });
    }
    const prefix = `${manager.hierarchy_path}.`;
    return this.repository
      .listUsers()
      .filter((user) => user.employment_status === "active" && user.hierarchy_path.startsWith(prefix));
  }

  resolveSubtreeView(actor: AuthUser, managerUserId: UUID, page: number, pageSize: number): UserSubtreeResult {
    const manager = this.repository.findActiveUser(managerUserId);
    if (!manager) {
      throw notFound("Manager not found", { id: managerUserId });
    }
    if (!this.canReadSubtree(actor, manager)) {
      throw forbidden("You do not have access to this hierarchy subtree");
    }
    const rootDepth = hierarchyDepth(manager.hierarchy_path);
    const items = this.resolveSubtree(managerUserId).map((user) => ({
      ...user,
      depth: Math.max(1, hierarchyDepth(user.hierarchy_path) - rootDepth)
    }));
    const start = (page - 1) * pageSize;
    const maxDepth = items.reduce((max, user) => Math.max(max, user.depth), 0);
    return {
      items: items.slice(start, start + pageSize),
      page,
      page_size: pageSize,
      total: items.length,
      total_active_descendants: items.length,
      max_depth: maxDepth,
      summary: {
        root_user_id: manager.id,
        root_employee_code: manager.employee_code,
        root_full_name: manager.full_name,
        total_active_descendants: items.length,
        max_depth: maxDepth
      }
    };
  }

  resolveImmediateManager(userId: UUID): CoreUser | null {
    const user = this.repository.findActiveUser(userId);
    if (!user?.manager_user_id) {
      return null;
    }
    return this.repository.findActiveUser(user.manager_user_id);
  }

  resolveDirectorOrHoD(userId: UUID): CoreUser | null {
    const user = this.repository.findActiveUser(userId);
    if (!user) {
      return null;
    }
    const department = this.store.departments.find((candidate) => candidate.id === user.department_id && !candidate.deleted_at);
    if (department?.director_user_id) {
      const director = this.repository.findActiveUser(department.director_user_id);
      if (director) {
        return director;
      }
    }
    return this.store.users.find((candidate) => candidate.roles.includes(Roles.Director) && candidate.department_id === user.department_id && candidate.employment_status === "active" && !candidate.deleted_at) ?? null;
  }

  resolveAlternateApprover(excludedUserIds: readonly UUID[]): CoreUser | null {
    return (
      this.store.users.find(
        (user) =>
          user.employment_status === "active" &&
          !user.deleted_at &&
          user.roles.includes(Roles.Director) &&
          !excludedUserIds.includes(user.id)
      ) ?? null
    );
  }

  resolveFinanceManager(excludedUserIds: readonly UUID[]): CoreUser | null {
    return (
      this.store.users.find(
        (user) =>
          user.employment_status === "active" &&
          !user.deleted_at &&
          user.roles.includes(Roles.FinanceManager) &&
          !excludedUserIds.includes(user.id)
      ) ?? null
    );
  }

  private canReadSubtree(actor: AuthUser, root: CoreUser): boolean {
    const privilegedRoles: readonly string[] = [Roles.Admin, Roles.Auditor, Roles.HRManager];
    if (actor.roles.some((role) => privilegedRoles.includes(role))) {
      return true;
    }
    return actor.id === root.id || root.hierarchy_path.startsWith(`${actor.hierarchy_path}.`);
  }
}

function hierarchyDepth(path: string): number {
  return path.split(".").filter(Boolean).length;
}
