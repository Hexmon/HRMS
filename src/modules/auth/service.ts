import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createJwt, hashPasswordSync, verifyPasswordSync } from "#auth";
import { EmploymentStatuses, Permissions, Roles, type AuthUser, type CoreUser, type RoleKey, type UUID } from "#shared";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../../platform/errors.js";
import type { AuthTokenRecord, CompanyProfileRecord, MemoryDataStore, UserCredentialRecord, UserSessionPreferenceRecord } from "../../platform/data-store.js";
import { nowIso, seedIds } from "../../platform/data-store.js";
import { AuthRepository } from "./repository.js";
import type {
  CompanyBootstrapInput,
  LoginInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  ResendEmailVerificationInput,
  SessionPreferenceInput,
  SetPasswordInput,
  SignupInput,
  VerifyEmailInput
} from "./schemas.js";

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

interface GeneratedToken {
  raw: string;
  record: AuthTokenRecord;
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

  signup(input: SignupInput) {
    const email = normalizeEmail(input.email);
    const companySlug = slugify(input.company_slug ?? input.company_name);
    const existingCompany = this.repository.findCompanyBySlug(companySlug);
    if (existingCompany?.status === "active" && existingCompany.bootstrap_completed_at) {
      throw conflict("Company workspace has already been bootstrapped.", { company_slug: companySlug });
    }
    const existingUser = this.repository.findUserByEmail(email);
    if (existingUser && existingUser.employment_status === EmploymentStatuses.Active && this.repository.findActiveCredential(existingUser.id)) {
      throw conflict("Signup email is already verified.", { email: maskEmail(email) });
    }

    const now = nowIso();
    const company = existingCompany ?? this.createCompanyProfile(input.company_name, companySlug, input.timezone, input.locale, now);
    const user = existingUser ?? this.createPendingUser({
      email,
      fullName: input.full_name,
      timezone: input.timezone,
      now
    });
    if (existingUser) {
      existingUser.full_name = input.full_name;
      existingUser.timezone = input.timezone;
      existingUser.version += 1;
    }

    this.revokeActiveTokensForUser(user.id, "email_verification");
    const verification = this.createToken({
      type: "email_verification",
      userId: user.id,
      email,
      companyId: company.id,
      ttlSeconds: 24 * 60 * 60,
      metadata: {
        password_hash: input.password ? hashPasswordSync(input.password) : null,
        company_slug: company.company_slug,
        timezone: input.timezone,
        locale: input.locale
      }
    });

    return {
      signup_id: user.id,
      verification_required: true,
      masked_email: maskEmail(email),
      next_step: "verify_email",
      retry_after_seconds: 60,
      ...devOnly({ email_verification_token: verification.raw })
    };
  }

  verifyEmail(input: VerifyEmailInput) {
    const token = this.requireActiveToken(input.token, "email_verification");
    if (input.email && token.email && normalizeEmail(input.email) !== normalizeEmail(token.email)) {
      throw badRequest("Verification token does not match the supplied email.");
    }
    const user = this.requireTokenUser(token);
    const now = nowIso();
    token.status = "used";
    token.used_at = now;
    const passwordHash = typeof token.metadata.password_hash === "string" ? token.metadata.password_hash : null;
    let passwordSetupToken: GeneratedToken | null = null;
    if (passwordHash) {
      user.employment_status = EmploymentStatuses.Active;
      this.setCredential(user.id, passwordHash, now);
    } else {
      user.employment_status = EmploymentStatuses.Inactive;
      this.revokeActiveTokensForUser(user.id, "password_setup");
      passwordSetupToken = this.createToken({
        type: "password_setup",
        userId: user.id,
        email: token.email,
        companyId: token.company_id,
        ttlSeconds: 60 * 60,
        metadata: { reason: "email_verified_no_password" }
      });
    }
    user.version += 1;

    this.revokeActiveTokensForUser(user.id, "company_bootstrap");
    const bootstrap = this.createToken({
      type: "company_bootstrap",
      userId: user.id,
      email: token.email,
      companyId: token.company_id,
      ttlSeconds: 24 * 60 * 60,
      metadata: { reason: "email_verified" }
    });

    return {
      verified: true,
      user_id: user.id,
      company_id: token.company_id,
      login_allowed: Boolean(passwordHash),
      next_step: passwordHash ? "company_bootstrap" : "set_password",
      ...devOnly({
        company_bootstrap_token: bootstrap.raw,
        password_setup_token: passwordSetupToken?.raw ?? null
      })
    };
  }

  resendEmailVerification(input: ResendEmailVerificationInput) {
    const email = normalizeEmail(input.email);
    const user = this.repository.findUserByEmail(email);
    let generated: GeneratedToken | null = null;
    if (user && user.employment_status !== EmploymentStatuses.Active) {
      const company = input.company_slug ? this.repository.findCompanyBySlug(input.company_slug) : this.store.companyProfiles.at(-1) ?? null;
      this.revokeActiveTokensForUser(user.id, "email_verification");
      generated = this.createToken({
        type: "email_verification",
        userId: user.id,
        email,
        companyId: company?.id ?? null,
        ttlSeconds: 24 * 60 * 60,
        metadata: { resend: true }
      });
    }
    return {
      accepted: true,
      sent: Boolean(generated),
      masked_email: maskEmail(email),
      retry_after_seconds: 60,
      ...devOnly({ email_verification_token: generated?.raw ?? null })
    };
  }

  setPassword(input: SetPasswordInput) {
    const token = this.requireActiveToken(input.token, "password_setup");
    const user = this.requireTokenUser(token);
    const now = nowIso();
    this.setCredential(user.id, hashPasswordSync(input.password), now);
    user.employment_status = EmploymentStatuses.Active;
    user.version += 1;
    token.status = "used";
    token.used_at = now;
    return {
      password_set: true,
      login_allowed: true,
      user_id: user.id,
      next_step: "login"
    };
  }

  requestPasswordReset(input: PasswordResetRequestInput) {
    const email = normalizeEmail(input.email);
    const user = this.repository.findUserByEmail(email);
    let generated: GeneratedToken | null = null;
    if (user && user.employment_status === EmploymentStatuses.Active && this.repository.findActiveCredential(user.id)) {
      this.revokeActiveTokensForUser(user.id, "password_reset");
      generated = this.createToken({
        type: "password_reset",
        userId: user.id,
        email,
        companyId: input.company_slug ? this.repository.findCompanyBySlug(input.company_slug)?.id ?? null : this.store.companyProfiles.at(-1)?.id ?? null,
        ttlSeconds: 60 * 60,
        metadata: { requested: true }
      });
    }
    return {
      accepted: true,
      masked_email: maskEmail(email),
      retry_after_seconds: 60,
      ...devOnly({ password_reset_token: generated?.raw ?? null })
    };
  }

  async confirmPasswordReset(input: PasswordResetConfirmInput) {
    const token = this.requireActiveToken(input.token, "password_reset");
    const user = this.requireTokenUser(token);
    if (user.employment_status !== EmploymentStatuses.Active) {
      throw forbidden("User account is inactive or blocked");
    }
    const now = nowIso();
    this.setCredential(user.id, hashPasswordSync(input.password), now);
    token.status = "used";
    token.used_at = now;
    const revoked = await this.store.sessionStore.revokeUser?.(user.id, "password_reset") ?? 0;
    return {
      password_reset: true,
      session_revoked_count: revoked,
      next_step: "login"
    };
  }

  bootstrapCompany(input: CompanyBootstrapInput) {
    const token = this.requireActiveToken(input.bootstrap_token, "company_bootstrap");
    const user = this.requireTokenUser(token);
    const company = token.company_id ? this.repository.findCompanyById(token.company_id) : null;
    if (!company) {
      throw notFound("Company bootstrap context not found");
    }
    if (company.bootstrap_completed_at || company.status === "active") {
      throw conflict("Company bootstrap has already been completed.", { company_id: company.id });
    }
    const now = nowIso();
    company.company_name = input.company_profile.company_name ?? company.company_name;
    company.timezone = input.company_profile.timezone ?? company.timezone;
    company.locale = input.company_profile.locale ?? company.locale;
    company.fiscal_year_start_month = input.company_profile.fiscal_year_start_month ?? company.fiscal_year_start_month;
    company.status = "active";
    company.bootstrap_completed_at = now;
    company.updated_at = now;
    company.version += 1;

    if (!user.roles.includes(Roles.Admin)) {
      user.roles = uniqueRoles([...user.roles, Roles.Admin]);
    }
    user.full_name = input.first_admin_profile.full_name ?? user.full_name;
    user.employment_status = this.repository.findActiveCredential(user.id) ? EmploymentStatuses.Active : user.employment_status;
    user.version += 1;
    token.status = "used";
    token.used_at = now;

    const preference = this.savePreference(user, {
      active_role_id: Roles.Admin,
      company_id: company.id,
      landing_page: input.first_admin_profile.landing_page ?? "/dashboard",
      locale: company.locale,
      timezone: company.timezone
    });

    return {
      company: presentCompany(company),
      admin_user: presentUser(user),
      setup_progress: {
        company_profile: "completed",
        first_admin: "completed",
        finance_governance: this.store.financeGovernanceConfig ? "configured" : "pending"
      },
      next_steps: ["login", "configure_core_master_data"],
      preferences: preference
    };
  }

  updateSessionPreference(actor: AuthUser, input: SessionPreferenceInput) {
    const user = this.store.users.find((candidate) => candidate.id === actor.id && !candidate.deleted_at);
    if (!user) {
      throw unauthorized("User no longer exists");
    }
    this.savePreference(user, input);
    return this.sessionContext(user);
  }

  sessionContext(user: AuthUser): SessionContext {
    const availableRoles = user.roles.map((role) => ({
      key: role,
      label: role,
      is_active: true,
      permissions: permissionsForRole(role)
    }));
    const preference = this.repository.sessionPreferenceFor(user.id);
    const preferredRole = preference && user.roles.includes(preference.active_role as RoleKey) ? preference.active_role : null;
    const activeRole = availableRoles.find((role) => role.key === preferredRole) ?? availableRoles[0] ?? {
      key: Roles.Employee,
      label: Roles.Employee,
      is_active: true,
      permissions: permissionsForRole(Roles.Employee)
    };
    const permissions = unique(permissionsForRole(activeRole.key));
    const company = preference?.company_id
      ? this.repository.findCompanyById(preference.company_id) ?? defaultCompany(user)
      : this.store.companyProfiles.find((candidate) => candidate.status === "active") ?? defaultCompany(user);
    const timezone = preference?.timezone ?? readTimezone(user) ?? company.timezone;
    const locale = preference?.locale ?? company.locale;

    return {
      user,
      active_role: activeRole,
      available_roles: availableRoles,
      permissions,
      navigation: navigationFor(permissions, [activeRole.key]),
      company: {
        id: company.id,
        name: company.company_name,
        timezone
      },
      preferences: {
        active_role: activeRole.key,
        landing_page: preference?.landing_page ?? "/dashboard",
        locale,
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

  private createPendingUser(input: { email: string; fullName: string; timezone: string; now: string }): CoreUser {
    const employeeCode = nextSignupEmployeeCode(this.store);
    const user: CoreUser = {
      id: randomUUID(),
      employee_code: employeeCode,
      email: input.email,
      full_name: input.fullName,
      department_id: seedIds.departmentSales,
      designation_id: seedIds.designationEmployee,
      roles: [Roles.Employee],
      employment_status: EmploymentStatuses.Inactive,
      hierarchy_path: `ONBOARDING.${employeeCode}`,
      manager_user_id: null,
      timezone: input.timezone,
      joined_on: input.now.slice(0, 10),
      terminated_on: null,
      deleted_at: null,
      version: 1
    };
    this.store.users.push(user);
    return user;
  }

  private createCompanyProfile(companyName: string, companySlug: string, timezone: string, locale: string, now: string): CompanyProfileRecord {
    const company: CompanyProfileRecord = {
      id: randomUUID(),
      company_name: companyName,
      company_slug: companySlug,
      website: null,
      industry: null,
      address: null,
      timezone,
      locale,
      currency: "INR",
      fiscal_year_start_month: 4,
      working_week: "Mon-Fri",
      work_hours_per_day: 8,
      logo_label: companyName.slice(0, 2).toUpperCase(),
      status: "pending",
      bootstrap_completed_at: null,
      created_at: now,
      updated_at: now,
      version: 1
    };
    this.store.companyProfiles.push(company);
    return company;
  }

  private createToken(input: {
    type: AuthTokenRecord["token_type"];
    userId: UUID | null;
    email: string | null;
    companyId: UUID | null;
    ttlSeconds: number;
    metadata: Record<string, unknown>;
  }): GeneratedToken {
    const raw = randomBytes(32).toString("base64url");
    const now = nowIso();
    const record: AuthTokenRecord = {
      id: randomUUID(),
      token_hash: tokenHash(raw),
      token_type: input.type,
      user_id: input.userId,
      email: input.email,
      company_id: input.companyId,
      status: "active",
      expires_at: new Date(Date.now() + input.ttlSeconds * 1000).toISOString(),
      used_at: null,
      created_at: now,
      metadata: input.metadata
    };
    this.store.authTokens.push(record);
    return { raw, record };
  }

  private requireActiveToken(rawToken: string, type: AuthTokenRecord["token_type"]): AuthTokenRecord {
    const token = this.repository.findTokenByHash(tokenHash(rawToken), type);
    if (!token) {
      throw badRequest("Invalid or expired token.");
    }
    if (token.status === "used") {
      throw conflict("Token has already been used.", { token_type: type });
    }
    if (token.status !== "active" || Date.parse(token.expires_at) <= Date.now()) {
      token.status = token.status === "active" ? "expired" : token.status;
      throw badRequest("Invalid or expired token.");
    }
    return token;
  }

  private requireTokenUser(token: AuthTokenRecord): CoreUser {
    const user = token.user_id ? this.store.users.find((candidate) => candidate.id === token.user_id && !candidate.deleted_at) : null;
    if (!user) {
      throw notFound("Token user context not found");
    }
    return user;
  }

  private revokeActiveTokensForUser(userId: UUID, tokenType: AuthTokenRecord["token_type"]): void {
    for (const token of this.repository.activeTokensForUser(userId, tokenType)) {
      token.status = "revoked";
    }
  }

  private setCredential(userId: UUID, passwordHash: string, now: string): UserCredentialRecord {
    const existing = this.store.userCredentials.find((credential) => credential.user_id === userId && !credential.deleted_at);
    if (existing) {
      existing.password_hash = passwordHash;
      existing.status = "active";
      existing.updated_at = now;
      return existing;
    }
    const credential: UserCredentialRecord = {
      id: randomUUID(),
      user_id: userId,
      password_hash: passwordHash,
      status: "active",
      created_at: now,
      updated_at: now,
      deleted_at: null
    };
    this.store.userCredentials.push(credential);
    return credential;
  }

  private savePreference(user: CoreUser, input: SessionPreferenceInput): UserSessionPreferenceRecord {
    const current = this.repository.sessionPreferenceFor(user.id);
    const activeRole = (input.active_role_id ?? input.active_role ?? current?.active_role ?? user.roles[0] ?? Roles.Employee) as RoleKey;
    if (!user.roles.includes(activeRole)) {
      throw forbidden("Selected role is not assigned to this user.", { active_role: activeRole });
    }
    if (input.company_id && !this.repository.findCompanyById(input.company_id)) {
      throw notFound("Company not found", { company_id: input.company_id });
    }
    const now = nowIso();
    const preference: UserSessionPreferenceRecord = {
      id: current?.id ?? randomUUID(),
      user_id: user.id,
      active_role: activeRole,
      company_id: input.company_id === undefined ? current?.company_id ?? null : input.company_id,
      landing_page: input.landing_page ?? current?.landing_page ?? "/dashboard",
      locale: input.locale ?? current?.locale ?? "en-IN",
      timezone: input.timezone ?? current?.timezone ?? readTimezone(user) ?? "Asia/Kolkata",
      created_at: current?.created_at ?? now,
      updated_at: now,
      version: (current?.version ?? 0) + 1
    };
    return this.repository.upsertSessionPreference(preference);
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

function uniqueRoles(values: readonly RoleKey[]): RoleKey[] {
  return [...new Set(values)];
}

function readTimezone(user: AuthUser): string | null {
  return "timezone" in user && typeof user.timezone === "string" ? user.timezone : null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const prefix = local.slice(0, 2) || "**";
  return `${prefix}${"*".repeat(Math.max(2, local.length - 2))}@${domain}`;
}

function slugify(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  return slug || "hrms";
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function nextSignupEmployeeCode(store: MemoryDataStore): string {
  let index = store.users.length + 1;
  let code = `ONB${String(index).padStart(4, "0")}`;
  while (store.users.some((user) => user.employee_code === code)) {
    index += 1;
    code = `ONB${String(index).padStart(4, "0")}`;
  }
  return code;
}

function devOnly(value: Record<string, unknown>): Record<string, unknown> {
  return process.env.NODE_ENV === "production" ? {} : { dev_only: value };
}

function presentCompany(company: CompanyProfileRecord) {
  return {
    id: company.id,
    company_name: company.company_name,
    company_slug: company.company_slug,
    website: company.website,
    industry: company.industry,
    address: company.address,
    timezone: company.timezone,
    locale: company.locale,
    currency: company.currency,
    fiscal_year_start_month: company.fiscal_year_start_month,
    working_week: company.working_week,
    work_hours_per_day: company.work_hours_per_day,
    logo_label: company.logo_label,
    status: company.status,
    bootstrap_completed_at: company.bootstrap_completed_at,
    version: company.version
  };
}

function presentUser(user: CoreUser) {
  return {
    id: user.id,
    employee_code: user.employee_code,
    email: user.email,
    full_name: user.full_name,
    roles: user.roles,
    employment_status: user.employment_status,
    version: user.version
  };
}

function defaultCompany(user: AuthUser): CompanyProfileRecord {
  return {
    id: "local-hawkaii-hrms",
    company_name: "Hawkaii HRMS",
    company_slug: "hawkaii-hrms",
    website: null,
    industry: null,
    address: null,
    timezone: readTimezone(user) ?? "Asia/Kolkata",
    locale: "en-IN",
    currency: "INR",
    fiscal_year_start_month: 4,
    working_week: "Mon-Fri",
    work_hours_per_day: 8,
    logo_label: "HK",
    status: "active",
    bootstrap_completed_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    version: 1
  };
}
