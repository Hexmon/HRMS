import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { Redis as Valkey } from "iovalkey";
import type { AuthUser, ISODateTime, RoleKey, UUID } from "#shared";
import { Permissions, Roles, type PermissionKey } from "#shared";

export interface SessionRecord {
  jti: string;
  user_id: UUID;
  expires_at: ISODateTime;
  revoked_at: ISODateTime | null;
}

export interface SessionStore {
  create(session: SessionRecord): Promise<void>;
  get(jti: string): Promise<SessionRecord | null>;
  revoke(jti: string, reason: string): Promise<void>;
}

export const LOCAL_DEMO_PASSWORD = "LocalDev@123";

const passwordHashPrefix = "scrypt$v1";
const passwordKeyLength = 64;

export function hashPasswordSync(password: string, salt = randomBytes(16).toString("base64url")): string {
  const key = scryptSync(password, salt, passwordKeyLength);
  return `${passwordHashPrefix}$${salt}$${key.toString("base64url")}`;
}

export function verifyPasswordSync(password: string, storedHash: string): boolean {
  const [algorithm, version, salt, expectedHash] = storedHash.split("$");
  if (`${algorithm}$${version}` !== passwordHashPrefix || !salt || !expectedHash) {
    return false;
  }
  const actual = scryptSync(password, salt, passwordKeyLength);
  const expected = Buffer.from(expectedHash, "base64url");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  async create(session: SessionRecord): Promise<void> {
    this.sessions.set(session.jti, { ...session });
  }

  async get(jti: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(jti);
    return session ? { ...session } : null;
  }

  async revoke(jti: string, _reason: string): Promise<void> {
    const session = this.sessions.get(jti);
    if (session) {
      this.sessions.set(jti, { ...session, revoked_at: new Date().toISOString() });
    }
  }
}

export class ValkeySessionStore implements SessionStore {
  private readonly valkey: Valkey;

  constructor(valkeyUrl: string, private readonly keyPrefix = "hrms:session") {
    this.valkey = new Valkey(valkeyUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2
    });
  }

  async create(session: SessionRecord): Promise<void> {
    await this.valkey.connect().catch((error: unknown) => {
      if (error instanceof Error && /already connecting|already connected/iu.test(error.message)) {
        return;
      }
      throw error;
    });
    const ttlSeconds = Math.max(1, Math.floor((Date.parse(session.expires_at) - Date.now()) / 1000));
    await this.valkey.set(this.key(session.jti), JSON.stringify(session), "EX", ttlSeconds);
  }

  async get(jti: string): Promise<SessionRecord | null> {
    await this.valkey.connect().catch((error: unknown) => {
      if (error instanceof Error && /already connecting|already connected/iu.test(error.message)) {
        return;
      }
      throw error;
    });
    const value = await this.valkey.get(this.key(jti));
    return value ? (JSON.parse(value) as SessionRecord) : null;
  }

  async revoke(jti: string, reason: string): Promise<void> {
    const session = await this.get(jti);
    if (!session) {
      return;
    }
    await this.valkey.set(
      this.key(jti),
      JSON.stringify({ ...session, revoked_at: new Date().toISOString(), revoked_reason: reason }),
      "KEEPTTL"
    );
  }

  async close(): Promise<void> {
    this.valkey.disconnect();
  }

  private key(jti: string): string {
    return `${this.keyPrefix}:${jti}`;
  }
}

export interface JwtClaims {
  sub: UUID;
  jti: string;
  roles: RoleKey[];
  employee_code: string;
  exp: number;
  iat: number;
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createJwt(user: AuthUser, secret: string, ttlSeconds = 3600): {
  token: string;
  jti: string;
  expiresAt: string;
} {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const jti = randomUUID();
  const claims: JwtClaims = {
    sub: user.id,
    jti,
    roles: user.roles,
    employee_code: user.employee_code,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds
  };
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(claims));
  const signature = sign(`${header}.${payload}`, secret);
  return {
    token: `${header}.${payload}.${signature}`,
    jti,
    expiresAt: new Date((nowSeconds + ttlSeconds) * 1000).toISOString()
  };
}

export function verifyJwt(token: string, secret: string): JwtClaims {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) {
    throw new Error("Malformed token");
  }
  const expected = sign(`${header}.${payload}`, secret);
  if (
    !timingSafeEqual(
      Buffer.from(signature, "base64url"),
      Buffer.from(expected, "base64url")
    )
  ) {
    throw new Error("Invalid token signature");
  }
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as JwtClaims;
  if (claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }
  return claims;
}

const rolePermissions: Record<RoleKey, readonly PermissionKey[]> = {
  [Roles.Employee]: [Permissions.ExpenseCreate, Permissions.DocumentRead],
  [Roles.Reviewer]: [Permissions.ExpenseCreate, Permissions.DocumentRead],
  [Roles.Director]: [
    Permissions.ExpenseCreate,
    Permissions.ReportRead,
    Permissions.DocumentRead
  ],
  [Roles.FinanceManager]: [
    Permissions.ExpenseCreate,
    Permissions.ExpenseFinanceApprove,
    Permissions.ExpenseFinance,
    Permissions.ReportRead,
    Permissions.DocumentRead,
    Permissions.DocumentVerify
  ],
  [Roles.Admin]: [Permissions.Admin],
  [Roles.Auditor]: [Permissions.ExpenseAudit, Permissions.ReportRead, Permissions.DocumentRead],
  [Roles.AssetManager]: [Permissions.AssetManage, Permissions.DocumentRead],
  [Roles.HRManager]: [Permissions.DocumentRead, Permissions.DocumentWrite, Permissions.ReportRead]
};

export function hasRole(user: Pick<AuthUser, "roles">, role: RoleKey): boolean {
  return user.roles.includes(role) || user.roles.includes(Roles.Admin);
}

export function hasPermission(user: Pick<AuthUser, "roles">, permission: PermissionKey): boolean {
  if (user.roles.includes(Roles.Admin)) {
    return true;
  }
  return user.roles.some((role) => rolePermissions[role]?.includes(permission));
}

export function roleSnapshot(user: AuthUser): string {
  return `${user.employee_code}:${user.roles.join(",")}`;
}

export function assertRole(user: AuthUser, role: RoleKey): void {
  if (!hasRole(user, role)) {
    throw new Error(`Missing role ${role}`);
  }
}
