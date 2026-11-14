import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: { activeRole: "asset_admin", user: { id: "admin-a", name: "Admin A" } },
  assets: {
    assets: [] as Array<Record<string, unknown>>,
    requests: [] as Array<Record<string, unknown>>,
    requestError: null as Error | null,
    requestsLoading: false,
    addRequest: vi.fn(),
    decideRequest: vi.fn(),
    cancelRequest: vi.fn(),
    returnAsset: vi.fn(),
  },
  employees: [] as Array<Record<string, unknown>>,
  recovery: {
    data: { items: [] as Array<Record<string, unknown>> },
    isLoading: false,
    error: null as Error | null,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children }: { children: ReactNode }) => <a href="#asset">{children}</a>,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/assets-store", () => ({
  useAssets: () => state.assets,
  nextRequestId: () => "REQ-TEST",
  ASSET_ADMIN_ROLES: ["main_admin", "asset_admin"],
}));
vi.mock("@/lib/employees-store", () => ({ useEmployees: () => ({ employees: state.employees }) }));
vi.mock("@/shared/api", () => ({
  useApiRouteEnabled: () => true,
  toastApiError: vi.fn(),
}));
vi.mock("@/domains/assets", () => ({
  useAssetRecoveryQueue: () => state.recovery,
  useAssetRecoverySettlementMutation: () => ({ mutateAsync: vi.fn() }),
  recoveryTicketDateLabel: () => "Nov 14, 2026",
}));
vi.mock("@/components/assets/recovery-settlement-control", () => ({
  RecoverySettlementControl: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RequestsScreen } from "./assets.requests";
import { ReturnsScreen } from "./assets.returns";

describe("asset route role and failure boundaries", () => {
  beforeEach(() => {
    state.auth.activeRole = "asset_admin";
    state.auth.user = { id: "admin-a", name: "Admin A" };
    state.assets.assets = [];
    state.assets.requests = [];
    state.assets.requestError = null;
    state.assets.requestsLoading = false;
    state.assets.addRequest.mockReset();
    state.assets.decideRequest.mockReset();
    state.assets.cancelRequest.mockReset();
    state.assets.returnAsset.mockReset();
    state.employees = [];
    state.recovery.data = { items: [] };
    state.recovery.isLoading = false;
    state.recovery.error = null;
  });
  afterEach(cleanup);

  it("renders only the failure state when an Admin request feed is unavailable", () => {
    state.assets.requestError = new Error("Admin queue unavailable");
    state.assets.requests = [{ id: "cached-request", status: "pending" }];

    render(<RequestsScreen />);

    expect(screen.getByText("Admin queue unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/Admin Queue/)).not.toBeInTheDocument();
    expect(screen.queryByText("My Requests")).not.toBeInTheDocument();
    expect(screen.queryByText("Raise Request")).not.toBeInTheDocument();
  });

  it("keeps HR recovery read-only and hides direct return controls", () => {
    state.auth.activeRole = "hr_admin";
    state.auth.user = { id: "hr-a", name: "HR A" };
    state.assets.assets = [
      {
        id: "asset-a",
        brand: "Hawkaii",
        model: "Laptop",
        assignedTo: "HR A",
        assignedToId: "hr-a",
        assignedOn: "2026-11-01",
        history: [],
      },
    ];
    state.recovery.data = {
      items: [
        {
          id: "ticket-a",
          assetId: "asset-a",
          assetName: "Hawkaii Laptop",
          assetCode: "AST-1",
          employeeName: "Employee A",
          status: "open",
          version: 1,
        },
      ],
    };

    render(<ReturnsScreen />);

    expect(screen.getByText("Hawkaii Laptop")).toBeInTheDocument();
    expect(screen.queryByText("All assigned (return ready)")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark returned/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
