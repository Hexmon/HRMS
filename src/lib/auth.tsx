import * as React from "react";
import { USERS, type User } from "./mock/users";
import { ROLES, ROLE_MAP, ROLE_LABELS, type Role } from "./mock/roles";

interface AuthState {
  user: User | null;
  activeRole: Role | null;
  login: (email: string) => boolean;
  logout: () => void;
  setActiveRole: (role: Role) => void;
  canAccess: (path: string) => boolean;
}

const AuthCtx = React.createContext<AuthState | null>(null);
const STORAGE_KEY = "hawkaii_session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [activeRole, setActiveRoleState] = React.useState<Role | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { userId: string; role: Role };
        const u = USERS.find((m) => m.id === parsed.userId);
        if (u) {
          setUser(u);
          setActiveRoleState(parsed.role);
        }
      }
    } catch {
      /* noop */
    }
  }, []);

  const persist = (u: User | null, role: Role | null) => {
    if (typeof window === "undefined") return;
    if (u && role) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId: u.id, role }));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  const login = (email: string) => {
    const u = USERS.find((m) => m.email.toLowerCase() === email.toLowerCase());
    if (!u) return false;
    setUser(u);
    setActiveRoleState(u.roles[0]);
    persist(u, u.roles[0]);
    return true;
  };

  const logout = () => {
    setUser(null);
    setActiveRoleState(null);
    persist(null, null);
  };

  // Prototype: allow switching to ANY role (regardless of assigned roles)
  const setActiveRole = (role: Role) => {
    setActiveRoleState(role);
    if (user) persist(user, role);
  };

  const canAccess = React.useCallback(
    (path: string) => {
      if (!activeRole) return false;
      return ROLE_MAP[activeRole].modules.includes(path);
    },
    [activeRole],
  );

  return (
    <AuthCtx.Provider value={{ user, activeRole, login, logout, setActiveRole, canAccess }}>
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
