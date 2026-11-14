import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: { activeRole: "asset_admin" as string | null },
  apiEnabled: true,
  assets: [] as Array<Record<string, unknown>>,
  employees: [] as Array<Record<string, unknown>>,
  returnAsset: vi.fn(),
  recovery: {
    data: undefined as { items: Array<Record<string, unknown>> } | undefined,
    isLoading: false,
    error: null as Error | null,
  },
  settle: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  toastApiError: vi.fn(),
  dialogOpenChange: null as null | ((open: boolean) => void),
  selectCondition: null as null | ((value: string) => void),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children }: { children: ReactNode }) => <a href="#asset">{children}</a>,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/assets-store", () => ({
  useAssets: () => ({ assets: state.assets, returnAsset: state.returnAsset }),
  ASSET_ADMIN_ROLES: ["main_admin", "asset_admin"],
}));
vi.mock("@/lib/employees-store", () => ({
  useEmployees: () => ({ employees: state.employees }),
}));
vi.mock("@/shared/api", () => ({
  useApiRouteEnabled: () => state.apiEnabled,
  toastApiError: state.toastApiError,
}));
vi.mock("@/domains/assets", () => ({
  useAssetRecoveryQueue: () => state.recovery,
  useAssetRecoverySettlementMutation: () => ({ mutateAsync: state.settle }),
  recoveryTicketDateLabel: () => "Nov 14, 2026",
}));
vi.mock("@/components/assets/recovery-settlement-control", () => ({
  RecoverySettlementControl: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ui-kit", () => ({
  DataCard: ({
    title,
    description,
    children,
  }: {
    title: string;
    description?: string;
    children: ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children}
    </section>
  ),
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <p>{title}</p>
      {description && <p>{description}</p>}
    </div>
  ),
  StatusBadge: ({ label, status }: { label?: string; status: string }) => (
    <span>{label ?? status}</span>
  ),
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    onOpenChange,
  }: {
    children: ReactNode;
    onOpenChange: (open: boolean) => void;
  }) => {
    state.dialogOpenChange = onOpenChange;
    return <div>{children}</div>;
  },
  DialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
  }) => {
    state.selectCondition = onValueChange;
    return (
      <div>
        <button
          type="button"
          aria-label="Choose poor condition"
          onClick={() => onValueChange("poor")}
        >
          Choose poor
        </button>
        {children}
      </div>
    );
  },
  SelectTrigger: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("sonner", () => ({ toast: state.toast }));

import { ReturnInline, ReturnsScreen } from "./assets.returns";

function assignedAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset-a",
    brand: "Dell",
    model: "Latitude",
    assignedTo: "Employee A",
    assignedToId: "employee-a",
    assignedOn: "2026-11-01",
    status: "assigned",
    history: [{ acknowledged: false }],
    ...overrides,
  };
}

function recoveryTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: "ticket-a",
    assetId: "asset-a",
    assetName: "Dell Latitude",
    assetCode: "AST-1",
    employeeName: "Employee A",
    status: "open",
    version: 3,
    ...overrides,
  };
}

describe("asset returns route", () => {
  beforeEach(() => {
    state.auth.activeRole = "asset_admin";
    state.apiEnabled = true;
    state.assets = [];
    state.employees = [];
    state.returnAsset.mockReset().mockResolvedValue(undefined);
    state.recovery = { data: undefined, isLoading: false, error: null };
    state.settle.mockReset().mockResolvedValue(undefined);
    state.toast.success.mockReset();
    state.toast.error.mockReset();
    state.toastApiError.mockReset();
    state.dialogOpenChange = null;
    state.selectCondition = null;
  });
  afterEach(cleanup);

  it("renders API loading, error and empty recovery states without inventing rows", () => {
    state.recovery.isLoading = true;
    render(<ReturnsScreen />);
    expect(screen.getByText("Loading recovery queue...")).toBeInTheDocument();
    cleanup();

    state.recovery.isLoading = false;
    state.recovery.error = new Error("recovery denied");
    render(<ReturnsScreen />);
    expect(screen.getByText("recovery denied")).toBeInTheDocument();
    cleanup();

    state.recovery.error = null;
    state.recovery.data = { items: [] };
    render(<ReturnsScreen />);
    expect(screen.getByText("No active recovery cases")).toBeInTheDocument();
    expect(screen.getByText("No assigned assets")).toBeInTheDocument();
  });

  it("settles a linked recovery ticket and reports backend success", async () => {
    state.recovery.data = { items: [recoveryTicket()] };
    render(<ReturnsScreen />);
    expect(screen.getByText("Dell Latitude")).toBeInTheDocument();
    expect(screen.getByText(/AST-1 · Employee A · Nov 14, 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(state.settle).toHaveBeenCalledWith({
        id: "ticket-a",
        input: {
          settlement_status: "recovered",
          remarks: expect.stringContaining("Condition: good"),
          expected_version: 3,
        },
      }),
    );
    expect(state.toast.success).toHaveBeenCalledWith("AST-1 recovered");
  });

  it("keeps a failed recovery settlement visible for retry", async () => {
    state.recovery.data = { items: [recoveryTicket()] };
    state.settle.mockRejectedValueOnce(new Error("stale recovery"));
    render(<ReturnsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(state.toast.error).toHaveBeenCalledWith("stale recovery"));
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
  });

  it("renders local offboarding and returns the selected asset through the local boundary", async () => {
    state.apiEnabled = false;
    state.assets = [
      assignedAsset(),
      assignedAsset({
        id: "asset-b",
        assignedTo: "Employee B",
        assignedToId: "employee-b",
        history: [{ acknowledged: true }],
      }),
    ];
    state.employees = [
      { id: "employee-a", name: "Employee A", status: "notice_period" },
      { id: "employee-b", name: "Employee B", status: "active" },
    ];
    render(<ReturnsScreen />);
    expect(screen.getByText(/clearance pending/)).toBeInTheDocument();
    expect(screen.getByText("Ack'd")).toBeInTheDocument();
    expect(screen.getByText("Pending Ack")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Confirm" })[0]!);
    await waitFor(() =>
      expect(state.returnAsset).toHaveBeenCalledWith("asset-a", expect.any(String), "good", ""),
    );
    expect(state.toast.success).toHaveBeenCalledWith("asset-a returned");
  });

  it("reports local return errors without false success", async () => {
    state.apiEnabled = false;
    state.assets = [assignedAsset()];
    state.employees = [{ id: "employee-a", name: "Employee A", status: "exited" }];
    state.returnAsset.mockRejectedValueOnce(new Error("return failed"));
    render(<ReturnsScreen />);
    fireEvent.click(screen.getAllByRole("button", { name: "Confirm" })[0]!);
    await waitFor(() =>
      expect(state.toastApiError).toHaveBeenCalledWith(
        expect.any(Error),
        "Asset could not be returned.",
      ),
    );
    expect(state.toast.success).not.toHaveBeenCalled();
  });
});

describe("inline return dialog", () => {
  beforeEach(() => {
    state.dialogOpenChange = null;
    state.selectCondition = null;
  });
  afterEach(cleanup);

  it("associates detail labels and submits edited return evidence", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ReturnInline detailsSupported onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText("Return date"), { target: { value: "2026-12-01" } });
    fireEvent.change(screen.getByLabelText("Remarks"), { target: { value: "Checked by IT" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose poor condition" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith("2026-12-01", "poor", "Checked by IT"),
    );
  });

  it("blocks close and duplicate submit while a return is pending", async () => {
    let resolveReturn!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReturn = resolve;
        }),
    );
    render(<ReturnInline detailsSupported={false} onConfirm={onConfirm} />);
    const confirm = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    state.dialogOpenChange?.(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    resolveReturn();
    await waitFor(() => expect(confirm).toBeEnabled());
  });
});
