import type { AuthUser, CoreUser, Department, Designation, UUID } from "#shared";
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

export interface UserDirectoryQuery {
  page: number;
  page_size: number;
  q?: string;
  department_id?: UUID;
  designation_id?: UUID;
  role?: string;
  employment_status?: string;
  manager_user_id?: UUID;
  login_state?: "enabled" | "disabled";
  sort?: string;
}

export interface UserReference {
  id: UUID;
  employee_code: string;
  full_name: string;
}

export interface DepartmentReference {
  id: UUID;
  department_code: string;
  name: string;
}

export interface DesignationReference {
  id: UUID;
  designation_code: string;
  title: string;
  level: number | null;
}

export interface CoreUserListItem extends CoreUser {
  department: DepartmentReference | null;
  designation: DesignationReference | null;
  manager: UserReference | null;
  display_label: string;
  status: string;
  login_state: "enabled" | "disabled";
  role_labels: string[];
}

export interface CoreUserDetail extends CoreUserListItem {
  reporting_line: UserReference[];
  role_assignments: Array<{ role: string; status: "active" }>;
  direct_reports_summary: {
    total: number;
    active: number;
  };
  documents_summary: {
    total: number;
    restricted: number;
  };
  assets_summary: {
    assigned: number;
    recovery_pending: number;
  };
  attendance_summary: {
    status: "not_available";
  };
  leave_summary: {
    status: "not_available";
  };
  timesheet_summary: {
    total_submissions: number;
    pending_approval: number;
    approved: number;
  };
  expense_summary: {
    total_requests: number;
    open_requests: number;
    closed_requests: number;
  };
  profile_tabs_available: string[];
}

export interface UserDirectoryResult {
  items: CoreUserListItem[];
  page: number;
  page_size: number;
  total: number;
  summary: {
    total_visible: number;
    total_active: number;
    total_inactive: number;
    total_suspended: number;
    total_terminated: number;
    filters_applied: string[];
    sort: string;
  };
}

export class CoreService {
  private readonly repository: CoreRepository;

  constructor(private readonly store: MemoryDataStore) {
    this.repository = new CoreRepository(store);
  }

  listUsers(actor: AuthUser, params: UserDirectoryQuery): UserDirectoryResult {
    const visibleUsers = this.visibleUsersFor(actor);
    const filtered = this.sortUsers(visibleUsers.filter((user) => this.matchesDirectoryFilters(user, params)), params.sort);
    const start = (params.page - 1) * params.page_size;
    const items = filtered.slice(start, start + params.page_size).map((user) => this.toListItem(user));
    return {
      items,
      page: params.page,
      page_size: params.page_size,
      total: filtered.length,
      summary: {
        total_visible: visibleUsers.length,
        total_active: visibleUsers.filter((user) => user.employment_status === "active").length,
        total_inactive: visibleUsers.filter((user) => user.employment_status === "inactive").length,
        total_suspended: visibleUsers.filter((user) => user.employment_status === "suspended").length,
        total_terminated: visibleUsers.filter((user) => user.employment_status === "terminated").length,
        filters_applied: appliedFilters(params),
        sort: params.sort ?? "employee_code"
      }
    };
  }

  getUser(id: UUID): CoreUser;
  getUser(actor: AuthUser, id: UUID): CoreUserDetail;
  getUser(actorOrId: AuthUser | UUID, maybeId?: UUID): CoreUser | CoreUserDetail {
    const id = maybeId ?? actorOrId;
    const user = this.repository.findUser(id as UUID);
    if (!user) {
      throw notFound("User not found", { id });
    }
    if (!maybeId) {
      return user;
    }
    const actor = actorOrId as AuthUser;
    if (!this.canReadUser(actor, user)) {
      throw forbidden("You do not have access to this employee profile");
    }
    return this.toDetail(user);
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

  private visibleUsersFor(actor: AuthUser): CoreUser[] {
    const users = this.repository.listUsers();
    if (hasPrivilegedProfileRead(actor)) {
      return users;
    }
    return users.filter(
      (user) =>
        user.id === actor.id ||
        (user.employment_status === "active" && user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`))
    );
  }

  private matchesDirectoryFilters(user: CoreUser, params: UserDirectoryQuery): boolean {
    const q = params.q?.trim().toLowerCase();
    if (q && ![user.full_name, user.employee_code, user.email].some((value) => value.toLowerCase().includes(q))) {
      return false;
    }
    if (params.department_id && user.department_id !== params.department_id) {
      return false;
    }
    if (params.designation_id && user.designation_id !== params.designation_id) {
      return false;
    }
    if (params.manager_user_id && user.manager_user_id !== params.manager_user_id) {
      return false;
    }
    if (params.role && !user.roles.includes(params.role as CoreUser["roles"][number])) {
      return false;
    }
    if (params.employment_status && user.employment_status !== params.employment_status) {
      return false;
    }
    if (params.login_state && this.loginState(user.id) !== params.login_state) {
      return false;
    }
    return true;
  }

  private sortUsers(users: CoreUser[], sort = "employee_code"): CoreUser[] {
    const descending = sort.startsWith("-");
    const key = descending ? sort.slice(1) : sort;
    const allowed = new Set(["employee_code", "full_name", "email", "department", "designation", "joined_on", "employment_status"]);
    const sortKey = allowed.has(key) ? key : "employee_code";
    return [...users].sort((left, right) => {
      const compared = this.valueForSort(left, sortKey).localeCompare(this.valueForSort(right, sortKey));
      return descending ? -compared : compared;
    });
  }

  private valueForSort(user: CoreUser, key: string): string {
    switch (key) {
      case "department":
        return this.departmentFor(user.department_id)?.name ?? "";
      case "designation":
        return this.designationFor(user.designation_id)?.title ?? "";
      case "joined_on":
        return user.joined_on ?? "";
      case "full_name":
        return user.full_name;
      case "email":
        return user.email;
      case "employment_status":
        return user.employment_status;
      case "employee_code":
      default:
        return user.employee_code;
    }
  }

  private toListItem(user: CoreUser): CoreUserListItem {
    const department = this.departmentFor(user.department_id);
    const designation = this.designationFor(user.designation_id);
    const manager = user.manager_user_id ? this.repository.findUser(user.manager_user_id) : null;
    return {
      ...user,
      department: department ? toDepartmentReference(department) : null,
      designation: designation ? toDesignationReference(designation) : null,
      manager: manager ? toUserReference(manager) : null,
      display_label: `${user.employee_code} - ${user.full_name}`,
      status: user.employment_status,
      login_state: this.loginState(user.id),
      role_labels: [...user.roles]
    };
  }

  private toDetail(user: CoreUser): CoreUserDetail {
    const item = this.toListItem(user);
    const directReports = this.repository.listUsers().filter((candidate) => candidate.manager_user_id === user.id && !candidate.deleted_at);
    const documents = this.store.documents.filter((document) => document.owner_user_id === user.id && !document.deleted_at);
    const assignedAssets = this.store.assets.filter((asset) => asset.current_assigned_user_id === user.id && !asset.deleted_at);
    const recoveryTickets = this.store.assetRecoveryTickets.filter((ticket) => ticket.employee_user_id === user.id && ticket.status !== "closed");
    const submissions = this.store.timesheetSubmissions.filter((submission) => submission.employee_user_id === user.id && !submission.deleted_at);
    const expenseTickets = this.store.tickets.filter((ticket) => ticket.requester_user_id === user.id && !ticket.deleted_at);

    return {
      ...item,
      reporting_line: this.reportingLine(user),
      role_assignments: user.roles.map((role) => ({ role, status: "active" })),
      direct_reports_summary: {
        total: directReports.length,
        active: directReports.filter((candidate) => candidate.employment_status === "active").length
      },
      documents_summary: {
        total: documents.length,
        restricted: documents.filter((document) => document.classification !== "normal").length
      },
      assets_summary: {
        assigned: assignedAssets.length,
        recovery_pending: recoveryTickets.length
      },
      attendance_summary: { status: "not_available" },
      leave_summary: { status: "not_available" },
      timesheet_summary: {
        total_submissions: submissions.length,
        pending_approval: submissions.filter((submission) => submission.status === "Pending Approval").length,
        approved: submissions.filter((submission) => submission.status === "Approved").length
      },
      expense_summary: {
        total_requests: expenseTickets.length,
        open_requests: expenseTickets.filter((ticket) => !["Closed", "Cancelled"].includes(ticket.status)).length,
        closed_requests: expenseTickets.filter((ticket) => ticket.status === "Closed").length
      },
      profile_tabs_available: ["profile", "reporting", "roles", "documents", "assets", "attendance", "leave", "timesheets", "expenses"]
    };
  }

  private reportingLine(user: CoreUser): UserReference[] {
    const line: UserReference[] = [];
    const seen = new Set<UUID>();
    let current = user.manager_user_id ? this.repository.findUser(user.manager_user_id) : null;
    while (current && !seen.has(current.id)) {
      line.unshift(toUserReference(current));
      seen.add(current.id);
      current = current.manager_user_id ? this.repository.findUser(current.manager_user_id) : null;
    }
    return line;
  }

  private departmentFor(id: UUID): Department | null {
    return this.repository.departments().find((department) => department.id === id) ?? null;
  }

  private designationFor(id: UUID): Designation | null {
    return this.repository.designations().find((designation) => designation.id === id) ?? null;
  }

  private loginState(userId: UUID): "enabled" | "disabled" {
    return this.store.userCredentials.some((credential) => credential.user_id === userId && credential.status === "active" && !credential.deleted_at) ? "enabled" : "disabled";
  }

  private canReadSubtree(actor: AuthUser, root: CoreUser): boolean {
    if (hasPrivilegedProfileRead(actor)) {
      return true;
    }
    return actor.id === root.id || root.hierarchy_path.startsWith(`${actor.hierarchy_path}.`);
  }

  private canReadUser(actor: AuthUser, user: CoreUser): boolean {
    if (hasPrivilegedProfileRead(actor)) {
      return true;
    }
    return actor.id === user.id || user.hierarchy_path.startsWith(`${actor.hierarchy_path}.`);
  }
}

function hierarchyDepth(path: string): number {
  return path.split(".").filter(Boolean).length;
}

function hasPrivilegedProfileRead(actor: AuthUser): boolean {
  const privilegedRoles: readonly string[] = [Roles.Admin, Roles.Auditor, Roles.HRManager];
  return actor.roles.some((role) => privilegedRoles.includes(role));
}

function toUserReference(user: CoreUser): UserReference {
  return {
    id: user.id,
    employee_code: user.employee_code,
    full_name: user.full_name
  };
}

function toDepartmentReference(department: Department): DepartmentReference {
  return {
    id: department.id,
    department_code: department.department_code,
    name: department.name
  };
}

function toDesignationReference(designation: Designation): DesignationReference {
  return {
    id: designation.id,
    designation_code: designation.designation_code,
    title: designation.title,
    level: designation.level
  };
}

function appliedFilters(params: UserDirectoryQuery): string[] {
  return ["q", "department_id", "designation_id", "role", "employment_status", "manager_user_id", "login_state"].filter((key) => Boolean(params[key as keyof UserDirectoryQuery]));
}
