import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: { activeRole: "employee", user: { id: "employee-a", name: "Employee A" } },
  assets: [] as Array<Record<string, unknown>>,
  requests: [] as Array<Record<string, unknown>>,
  loading: false,
  error: null as Error | null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children }: { children: ReactNode }) => <a href="#asset">{children}</a>,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/assets-store", () => ({
  useAssets: () => state,
  warrantyDaysLeft: (value?: string) =>
    value === "expired" ? -10 : value === "critical" ? 7 : value === "soon" ? 45 : 100,
  fmtMoney: (value: number) => `$${value}`,
}));
vi.mock("@/shared/api", () => ({
  userFacingErrorMessage: (error: Error | null, fallback: string) => error?.message ?? fallback,
}));
vi.mock("@/components/ui-kit", () => ({
  StatCard: ({ label, value, hint }: { label: string; value: number; hint?: string }) => (
    <div>
      <span>
        {label}: {value}
      </span>
      {hint && <span>{hint}</span>}
    </div>
  ),
  DataCard: ({
    title,
    description,
    actions,
    children,
  }: {
    title: string;
    description?: string;
    actions?: ReactNode;
    children: ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {actions}
      {children}
    </section>
  ),
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <p>{title}</p>
      {description && <p>{description}</p>}
    </div>
  ),
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? children : <button {...props}>{children}</button>,
}));

import { AssetsDashboard } from "./assets.index";

function asset(id: string, status: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "Laptop",
    brand: "Dell",
    model: id,
    serial: `SER-${id}`,
    status,
    cost: 100,
    warrantyExpiry: "healthy",
    history: [],
    ...overrides,
  };
}

describe("asset dashboard", () => {
  beforeEach(() => {
    state.auth.activeRole = "employee";
    state.assets = [];
    state.requests = [];
    state.loading = false;
    state.error = null;
  });
  afterEach(cleanup);

  it("distinguishes loading from a backend error", () => {
    state.loading = true;
    render(<AssetsDashboard />);
    expect(screen.getByText("Loading asset data")).toBeInTheDocument();
    cleanup();
    state.loading = false;
    state.error = new Error("asset feed denied");
    render(<AssetsDashboard />);
    expect(screen.getByText("asset feed denied")).toBeInTheDocument();
  });

  it("shows only an employee's own assignments and requests", () => {
    state.assets = [
      asset("mine", "assigned", { assignedToId: "employee-a", history: [{ acknowledged: false }] }),
      asset("foreign", "assigned", { assignedToId: "employee-b" }),
    ];
    state.requests = [
      {
        id: "REQ-1",
        raisedBy: "Employee A",
        assetType: "Laptop",
        type: "new",
        priority: "high",
        status: "pending",
      },
      {
        id: "REQ-2",
        raisedBy: "Employee A",
        assetType: "Mouse",
        type: "new",
        priority: "low",
        status: "approved",
      },
      {
        id: "REQ-X",
        raisedBy: "Employee B",
        assetType: "Phone",
        type: "new",
        priority: "low",
        status: "pending",
      },
    ];
    render(<AssetsDashboard />);
    expect(screen.getByText("My assets: 1")).toBeInTheDocument();
    expect(screen.getByText("Open requests: 1")).toBeInTheDocument();
    expect(screen.getByText("To acknowledge: 1")).toBeInTheDocument();
    expect(screen.getByText("Approved requests: 1")).toBeInTheDocument();
    expect(screen.getByText(/Dell mine/)).toBeInTheDocument();
    expect(screen.queryByText(/foreign/)).not.toBeInTheDocument();
    expect(screen.queryByText(/REQ-X/)).not.toBeInTheDocument();
  });

  it("renders genuine employee empty states", () => {
    render(<AssetsDashboard />);
    expect(screen.getByText("No assets assigned")).toBeInTheDocument();
    expect(screen.getByText("No requests yet")).toBeInTheDocument();
  });

  it("summarizes Admin inventory, requests, missing cost and warranty boundaries", () => {
    state.auth.activeRole = "asset_admin";
    state.assets = [
      asset("assigned", "assigned", {
        assignedTo: "Employee A",
        warrantyExpiry: "critical",
        apiMissing: { cost: true },
      }),
      asset("available", "available", { warrantyExpiry: "soon" }),
      asset("repair", "repair", { warrantyExpiry: "expired" }),
      asset("retired", "retired"),
      asset("lost", "lost"),
      asset("damaged", "damaged"),
    ];
    state.requests = [
      {
        id: "REQ-1",
        raisedBy: "Employee A",
        assetType: "Laptop",
        type: "new",
        priority: "high",
        status: "pending",
      },
      {
        id: "REQ-2",
        raisedBy: "Employee B",
        assetType: "Laptop",
        type: "return",
        priority: "low",
        status: "pending",
      },
    ];
    render(<AssetsDashboard />);
    expect(screen.getByText("Total assets: 6")).toBeInTheDocument();
    expect(screen.getByText("Some asset costs are unavailable")).toBeInTheDocument();
    expect(screen.getByText("Assigned: 1")).toBeInTheDocument();
    expect(screen.getByText("Available: 1")).toBeInTheDocument();
    expect(screen.getByText("Under repair: 1")).toBeInTheDocument();
    expect(screen.getByText("Retired: 1")).toBeInTheDocument();
    expect(screen.getByText("Asset requests: 2")).toBeInTheDocument();
    expect(screen.getByText("Return pending: 1")).toBeInTheDocument();
    expect(screen.getByText(/assets are out of warranty/)).toBeInTheDocument();
    expect(screen.getByText("10d expired")).toBeInTheDocument();
    expect(screen.getByText("7d left")).toBeInTheDocument();
    expect(screen.getByText("45d left")).toBeInTheDocument();
  });

  it("shows Admin empty cards and total value when metadata is complete", () => {
    state.auth.activeRole = "main_admin";
    state.assets = [asset("healthy", "available")];
    render(<AssetsDashboard />);
    expect(screen.getByText("$100 value")).toBeInTheDocument();
    expect(screen.getByText("No requests pending")).toBeInTheDocument();
    expect(screen.getByText("Nothing expiring soon")).toBeInTheDocument();
  });
});
