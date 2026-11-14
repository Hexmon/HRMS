import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: {
    data: undefined as Record<string, unknown> | undefined,
    error: null as Error | null,
    isPending: false,
  },
  clearQueryClient: vi.fn(),
  setActorScope: vi.fn(),
  clearActorScope: vi.fn(),
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
  login: vi.fn(),
  getSession: vi.fn(),
  logout: vi.fn(),
  updateSessionPreference: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ clear: state.clearQueryClient }),
  useQuery: () => state.query,
}));

vi.mock("@/domains/auth", () => ({
  authApi: {
    login: state.login,
    getSession: state.getSession,
    logout: state.logout,
    updateSessionPreference: state.updateSessionPreference,
  },
}));

vi.mock("@/shared/api", () => {
  class MockApiError extends Error {
    status: number;
    constructor(input: { status: number; message: string }) {
      super(input.message);
      this.status = input.status;
    }
  }
  return {
    ApiError: MockApiError,
    clearApiActorScope: state.clearActorScope,
    clearApiAccessToken: state.clearAccessToken,
    isApiEnabled: () => true,
    isMockFallbackEnabled: () => false,
    onApiUnauthorized: () => () => undefined,
    setApiActorScope: state.setActorScope,
    setApiAccessToken: state.setAccessToken,
    shouldUseMockFallback: () => false,
    userFacingErrorMessage: (error: Error, fallback: string) => error?.message ?? fallback,
  };
});

vi.mock("@/shared/query", () => ({
  queryKeys: { detail: (...parts: unknown[]) => parts },
  queryTimings: { realtimeStaleMs: 1 },
}));

import { AuthProvider, useAuth } from "./auth";

function Harness() {
  const auth = useAuth();
  return (
    <div>
      <span>{auth.user?.id ?? "signed-out"}</span>
      <button type="button" onClick={() => void auth.login("employee@example.com", "secret")}>
        Login
      </button>
      <button type="button" onClick={auth.logout}>
        Logout
      </button>
    </div>
  );
}

function renderProvider(children: ReactNode = <Harness />) {
  return render(<AuthProvider>{children}</AuthProvider>);
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: "user-a",
      full_name: "Employee A",
      email: "employee@example.com",
      roles: ["Employee"],
    },
    active_role: { key: "employee", label: "Employee" },
    available_roles: [{ key: "employee", label: "Employee" }],
    ...overrides,
  };
}

describe("API authentication actor scope", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    state.query = { data: undefined, error: null, isPending: false };
    state.clearQueryClient.mockReset();
    state.setActorScope.mockReset();
    state.clearActorScope.mockReset();
    state.setAccessToken.mockReset();
    state.clearAccessToken.mockReset();
    state.login.mockReset();
    state.getSession.mockReset();
    state.logout.mockReset().mockResolvedValue(undefined);
    state.updateSessionPreference.mockReset();
  });

  afterEach(cleanup);

  it.each([
    ["top-level company", session({ company_id: "company-a" }), "company-a"],
    ["nested company", session({ company: { id: "company-b" } }), "company-b"],
  ])("binds the authenticated actor to the %s id", async (_label, apiSession, companyId) => {
    state.query = { data: apiSession, error: null, isPending: false };
    renderProvider();
    await waitFor(() => expect(state.setActorScope).toHaveBeenCalledWith("user-a", companyId));
    expect(screen.getByText("user-a")).toBeInTheDocument();
  });

  it("clears actor scope when the authenticated session has no company", async () => {
    state.query = { data: session(), error: null, isPending: false };
    renderProvider();
    await waitFor(() => expect(state.clearActorScope).toHaveBeenCalled());
    expect(state.setActorScope).not.toHaveBeenCalled();
  });

  it("uses the login response company when session refresh fails", async () => {
    state.login.mockResolvedValue({
      user: session().user,
      access_token: "token-a",
      expires_at: "2026-11-15T00:00:00Z",
      company_id: "company-login",
    });
    state.getSession.mockRejectedValue(new Error("session unavailable"));
    renderProvider();
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    await waitFor(() =>
      expect(state.setActorScope).toHaveBeenCalledWith("user-a", "company-login"),
    );
    expect(state.setAccessToken).toHaveBeenCalledWith("token-a");
  });

  it("clears company scope on logout and on fallback login without a company", async () => {
    state.login.mockResolvedValue({
      user: session().user,
      access_token: "token-without-company",
      expires_at: "2026-11-15T00:00:00Z",
    });
    state.getSession.mockRejectedValue(new Error("session unavailable"));
    renderProvider();
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    await waitFor(() => expect(state.clearActorScope).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(state.clearActorScope).toHaveBeenCalledTimes(2);
    expect(state.clearAccessToken).toHaveBeenCalled();
  });
});
