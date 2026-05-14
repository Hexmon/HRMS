import { createJwt, verifyPasswordSync } from "#auth";
import { Permissions, Roles, type AuthUser } from "#shared";
import { forbidden, unauthorized } from "../../platform/errors.js";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { AuthRepository } from "./repository.js";
import type { LoginInput } from "./schemas.js";

export interface SessionRole {
  key: string;
  label: string;
  is_active: boolean;
  permissions: string[];
}

export interface SessionNavigationItem {
  key: string;
  label: string;
  path: string;
  permission: string | null;
}

export interface SessionContext {
  user: AuthUser;
  active_role: SessionRole;
  available_roles: SessionRole[];
  permissions: string[];
  navigation: SessionNavigationItem[];
  company: {
    id: string;
    name: string;
    timezone: string;
  };
  preferences: {
    active_role: string;
    landing_page: string;
    locale: string;
    timezone: string;
  };
  session_metadata: {
    auth_mode: "cookie_or_bearer";
    low_bandwidth_defaults: {
      page_size: number;
      max_page_size: number;
      use_include_for_nested_data: boolean;
    };
  };
}

export class AuthService {
  private readonly repository: AuthRepository;

  constructor(
    private readonly store: MemoryDataStore,
    private readonly jwtSecret: string
  ) {
    this.repository = new AuthRepository(store);
  }

  async login(input: LoginInput): Promise<{ user: AuthUser; token: string; expires_at: string; jti: string }> {
    const user = input.email && input.password
      ? this.authenticatePassword(input.email, input.password)
      : this.authenticateEmployeeCode(input.employee_code ?? "");
    const jwt = createJwt(user, this.jwtSecret, 3600);
    await this.store.sessionStore.create({
      jti: jwt.jti,
      user_id: user.id,
      expires_at: jwt.expiresAt,
      revoked_at: null
    });
    return { user, token: jwt.token, expires_at: jwt.expiresAt, jti: jwt.jti };
  }

  sessionContext(user: AuthUser): SessionContext {
    const availableRoles = user.roles.map((role) => ({
      key: role,
      label: role,
      is_active: true,
      permissions: permissionsForRole(role)
    }));
    const activeRole = availableRoles[0] ?? {
      key: Roles.Employee,
      label: Roles.Employee,
      is_active: true,
      permissions: permissionsForRole(Roles.Employee)
    };
    const permissions = unique(user.roles.flatMap((role) => permissionsForRole(role)));
    const timezone = readTimezone(user) ?? "Asia/Kolkata";

    return {
      user,
      active_role: activeRole,
      available_roles: availableRoles,
      permissions,
      navigation: navigationFor(permissions, user.roles),
      company: {
        id: "local-hrms",
        name: "HRMS",
        timezone
      },
      preferences: {
        active_role: activeRole.key,
        landing_page: "/dashboard",
        locale: "en-IN",
        timezone
      },
      session_metadata: {
        auth_mode: "cookie_or_bearer",
        low_bandwidth_defaults: {
          page_size: 25,
          max_page_size: 100,
          use_include_for_nested_data: true
        }
      }
    };
  }

  private authenticateEmployeeCode(employeeCode: string): AuthUser {
    const user = this.repository.findUserByEmployeeCode(employeeCode);
    if (!user) {
      throw unauthorized("Invalid email or password");
    }
    return user;
  }

  private authenticatePassword(email: string, password: string): AuthUser {
    const user = this.repository.findUserByEmail(email);
    if (!user) {
      throw unauthorized("Invalid email or password");
    }
    if (user.employment_status !== "active") {
      throw forbidden("User account is inactive or blocked");
    }
    const passwordHash = this.repository.findActivePasswordHash(user.id);
    if (!passwordHash || !verifyPasswordSync(password, passwordHash)) {
      throw unauthorized("Invalid email or password");
    }
    return user;
  }

  async logout(jti: string): Promise<void> {
    await this.store.sessionStore.revoke(jti, "logout");
  }
}

function permissionsForRole(role: string): string[] {
  switch (role) {
    case Roles.Admin:
      return Object.values(Permissions);
    case Roles.FinanceManager:
      return [Permissions.ExpenseFinanceApprove, Permissions.ExpenseFinance, Permissions.ReportRead, Permissions.DocumentRead];
    case Roles.Auditor:
      return [Permissions.ExpenseAudit, Permissions.ReportRead, Permissions.DocumentRead];
    case Roles.AssetManager:
      return [Permissions.AssetManage, Permissions.DocumentRead, Permissions.ReportRead];
    case Roles.HRManager:
      return [Permissions.ReportRead, Permissions.DocumentRead];
    case Roles.Employee:
    default:
      return [Permissions.ExpenseCreate, Permissions.DocumentRead];
  }
}

function navigationFor(permissions: readonly string[], roles: readonly string[]): SessionNavigationItem[] {
  const permissionSet = new Set(permissions);
  const items: SessionNavigationItem[] = [
    { key: "dashboard", label: "Dashboard", path: "/dashboard", permission: null },
    { key: "my-expenses", label: "My Expenses", path: "/expenses", permission: Permissions.ExpenseCreate },
    { key: "documents", label: "Documents", path: "/documents", permission: Permissions.DocumentRead }
  ];
  if (permissionSet.has(Permissions.ExpenseManagerVerify)) {
    items.push({ key: "manager-expenses", label: "Manager Verification", path: "/expenses/review", permission: Permissions.ExpenseManagerVerify });
  }
  if (permissionSet.has(Permissions.ExpenseFinance)) {
    items.push({ key: "finance", label: "Finance", path: "/expenses/finance", permission: Permissions.ExpenseFinance });
  }
  if (permissionSet.has(Permissions.AssetManage)) {
    items.push({ key: "assets", label: "Assets", path: "/assets", permission: Permissions.AssetManage });
  }
  if (permissionSet.has(Permissions.ReportRead)) {
    items.push({ key: "reports", label: "Reports", path: "/reports", permission: Permissions.ReportRead });
  }
  if (roles.includes(Roles.Admin) || permissionSet.has(Permissions.Admin)) {
    items.push({ key: "admin-settings", label: "Admin Settings", path: "/admin-settings", permission: Permissions.Admin });
  }
  return items.filter((item) => item.permission === null || permissionSet.has(item.permission));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function readTimezone(user: AuthUser): string | null {
  return "timezone" in user && typeof user.timezone === "string" ? user.timezone : null;
}
