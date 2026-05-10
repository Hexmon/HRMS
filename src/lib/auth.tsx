import * as React from "react";
import { USERS as SEED_USERS, type User } from "./mock/users";
import { ROLES, ROLE_MAP, ROLE_LABELS, type Role } from "./mock/roles";

// -------- Types --------
export interface PendingSignup {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  companyName: string;
  contact: string;
  token: string;
  isFirstAdmin: boolean;
  verified: boolean;
  passwordSet: boolean;
  createdAt: number;
  expiresAt: number;
}

interface AuthState {
  user: User | null;
  activeRole: Role | null;
  // session
  login: (email: string, password?: string) => { ok: boolean; error?: string };
  logout: () => void;
  setActiveRole: (role: Role) => void;
  canAccess: (path: string) => boolean;
  // signup flow
  signup: (input: Omit<PendingSignup, "id" | "token" | "isFirstAdmin" | "verified" | "passwordSet" | "createdAt" | "expiresAt">) => PendingSignup;
  resendVerification: (email: string) => PendingSignup | null;
  verifyToken: (token: string) => { status: "ok" | "expired" | "invalid"; pending?: PendingSignup };
  setPasswordForToken: (token: string, password: string) => { ok: boolean; user?: User; isFirstAdmin?: boolean; error?: string };
  // password reset
  requestPasswordReset: (email: string) => { ok: boolean; token?: string };
  resetPasswordWithToken: (token: string, password: string) => { ok: boolean; error?: string };
  // wizard
  isCompanySetupComplete: boolean;
  completeCompanySetup: () => void;
}

const AuthCtx = React.createContext<AuthState | null>(null);
const SESSION_KEY = "hawkaii_session";
const USERS_KEY = "hawkaii_users";
const PENDING_KEY = "hawkaii_pending_signups";
const PASSWORDS_KEY = "hawkaii_passwords";
const RESET_KEY = "hawkaii_resets";
const SETUP_KEY = "hawkaii_company_setup";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24h

// helpers (browser-safe)
const ls = {
  get<T>(k: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(k: string, v: unknown) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(k, JSON.stringify(v));
  },
  del(k: string) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(k);
  },
};

const randomToken = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);

export function dashboardPathForRole(_role: Role | null): string {
  // Single dashboard route adapts to active role, satisfying role-based redirect.
  return "/dashboard";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [activeRole, setActiveRoleState] = React.useState<Role | null>(null);
  const [users, setUsers] = React.useState<User[]>(SEED_USERS);
  const [setupDone, setSetupDone] = React.useState(true);

  // hydrate
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = ls.get<User[] | null>(USERS_KEY, null);
    const merged = stored && stored.length ? stored : SEED_USERS;
    setUsers(merged);
    if (!stored) ls.set(USERS_KEY, SEED_USERS);

    setSetupDone(ls.get<boolean>(SETUP_KEY, true));

    const session = ls.get<{ userId: string; role: Role } | null>(SESSION_KEY, null);
    if (session) {
      const u = merged.find((m) => m.id === session.userId);
      if (u) {
        setUser(u);
        setActiveRoleState(session.role);
      }
    }
  }, []);

  const persistSession = (u: User | null, role: Role | null) => {
    if (u && role) ls.set(SESSION_KEY, { userId: u.id, role });
    else ls.del(SESSION_KEY);
  };

  const persistUsers = (next: User[]) => {
    setUsers(next);
    ls.set(USERS_KEY, next);
  };

  // -------- Sessions --------
  const login: AuthState["login"] = (email, password) => {
    const normalized = email.trim().toLowerCase();
    const u = users.find((m) => m.email.toLowerCase() === normalized);
    if (!u) return { ok: false, error: "No account found for this email." };
    // Mock password rule: any password works for seeded demo users; for new users check store.
    const passwords = ls.get<Record<string, string>>(PASSWORDS_KEY, {});
    const stored = passwords[u.id];
    if (stored && password && stored !== password) {
      return { ok: false, error: "Incorrect password." };
    }
    setUser(u);
    setActiveRoleState(u.roles[0]);
    persistSession(u, u.roles[0]);
    return { ok: true };
  };

  const logout = () => {
    setUser(null);
    setActiveRoleState(null);
    persistSession(null, null);
  };

  const setActiveRole = (role: Role) => {
    setActiveRoleState(role);
    if (user) persistSession(user, role);
  };

  const canAccess = React.useCallback(
    (path: string) => {
      if (!activeRole) return false;
      return ROLE_MAP[activeRole].modules.includes(path);
    },
    [activeRole],
  );

  // -------- Signup / Verification --------
  const signup: AuthState["signup"] = (input) => {
    const pending = ls.get<PendingSignup[]>(PENDING_KEY, []);
    const email = input.email.trim().toLowerCase();
    // First verified user of a company becomes Main Admin: check existing users for the same domain
    const domain = email.split("@")[1] ?? "";
    const isFirstAdmin = !users.some((u) => u.email.toLowerCase().endsWith("@" + domain));

    const now = Date.now();
    const record: PendingSignup = {
      ...input,
      email,
      id: "p_" + randomToken().slice(0, 10),
      token: randomToken(),
      isFirstAdmin,
      verified: false,
      passwordSet: false,
      createdAt: now,
      expiresAt: now + TOKEN_TTL_MS,
    };
    // remove any prior pending for this email
    const next = [...pending.filter((p) => p.email !== email), record];
    ls.set(PENDING_KEY, next);
    return record;
  };

  const resendVerification: AuthState["resendVerification"] = (email) => {
    const normalized = email.trim().toLowerCase();
    const pending = ls.get<PendingSignup[]>(PENDING_KEY, []);
    const idx = pending.findIndex((p) => p.email === normalized);
    if (idx === -1) return null;
    const updated: PendingSignup = {
      ...pending[idx],
      token: randomToken(),
      createdAt: Date.now(),
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };
    pending[idx] = updated;
    ls.set(PENDING_KEY, pending);
    return updated;
  };

  const verifyToken: AuthState["verifyToken"] = (token) => {
    const pending = ls.get<PendingSignup[]>(PENDING_KEY, []);
    const rec = pending.find((p) => p.token === token);
    if (!rec) return { status: "invalid" };
    if (Date.now() > rec.expiresAt) return { status: "expired", pending: rec };
    if (!rec.verified) {
      rec.verified = true;
      ls.set(PENDING_KEY, pending);
    }
    return { status: "ok", pending: rec };
  };

  const setPasswordForToken: AuthState["setPasswordForToken"] = (token, password) => {
    const pending = ls.get<PendingSignup[]>(PENDING_KEY, []);
    const idx = pending.findIndex((p) => p.token === token);
    if (idx === -1) return { ok: false, error: "Invalid or expired link." };
    const rec = pending[idx];
    if (Date.now() > rec.expiresAt) return { ok: false, error: "Verification link has expired." };

    // create a real user
    const role: Role = rec.isFirstAdmin ? "main_admin" : "employee";
    const fullName = [rec.firstName, rec.middleName, rec.lastName].filter(Boolean).join(" ");
    const newUser: User = {
      id: "u_" + randomToken().slice(0, 8),
      name: fullName,
      email: rec.email,
      roles: [role],
      department: rec.isFirstAdmin ? "Executive" : "General",
      designation: rec.isFirstAdmin ? "Founder & Admin" : "Employee",
      avatarColor: "primary",
    };
    const nextUsers = [...users, newUser];
    persistUsers(nextUsers);

    // store password
    const passwords = ls.get<Record<string, string>>(PASSWORDS_KEY, {});
    passwords[newUser.id] = password;
    ls.set(PASSWORDS_KEY, passwords);

    // remove pending
    pending.splice(idx, 1);
    ls.set(PENDING_KEY, pending);

    // auto sign-in
    setUser(newUser);
    setActiveRoleState(role);
    persistSession(newUser, role);

    if (rec.isFirstAdmin) {
      setSetupDone(false);
      ls.set(SETUP_KEY, false);
    }

    return { ok: true, user: newUser, isFirstAdmin: rec.isFirstAdmin };
  };

  // -------- Password reset --------
  const requestPasswordReset: AuthState["requestPasswordReset"] = (email) => {
    const normalized = email.trim().toLowerCase();
    const u = users.find((m) => m.email.toLowerCase() === normalized);
    if (!u) return { ok: false };
    const resets = ls.get<Record<string, { userId: string; expiresAt: number }>>(RESET_KEY, {});
    const token = randomToken();
    resets[token] = { userId: u.id, expiresAt: Date.now() + TOKEN_TTL_MS };
    ls.set(RESET_KEY, resets);
    return { ok: true, token };
  };

  const resetPasswordWithToken: AuthState["resetPasswordWithToken"] = (token, password) => {
    const resets = ls.get<Record<string, { userId: string; expiresAt: number }>>(RESET_KEY, {});
    const entry = resets[token];
    if (!entry) return { ok: false, error: "Invalid or expired link." };
    if (Date.now() > entry.expiresAt) return { ok: false, error: "This reset link has expired." };
    const passwords = ls.get<Record<string, string>>(PASSWORDS_KEY, {});
    passwords[entry.userId] = password;
    ls.set(PASSWORDS_KEY, passwords);
    delete resets[token];
    ls.set(RESET_KEY, resets);
    return { ok: true };
  };

  const completeCompanySetup = () => {
    setSetupDone(true);
    ls.set(SETUP_KEY, true);
  };

  return (
    <AuthCtx.Provider
      value={{
        user,
        activeRole,
        login,
        logout,
        setActiveRole,
        canAccess,
        signup,
        resendVerification,
        verifyToken,
        setPasswordForToken,
        requestPasswordReset,
        resetPasswordWithToken,
        isCompanySetupComplete: setupDone,
        completeCompanySetup,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export { ROLES, ROLE_MAP, ROLE_LABELS };
export type { Role, User };
