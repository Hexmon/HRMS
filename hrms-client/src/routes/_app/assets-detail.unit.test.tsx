import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  id: "asset-a",
  auth: { activeRole: "asset_admin", user: { id: "admin-a" } },
  assets: [] as Array<Record<string, unknown>>,
  employees: [] as Array<Record<string, unknown>>,
  loading: false,
  error: null as Error | null,
  isApiBacked: true,
  detail: {
    data: undefined as Record<string, unknown> | undefined,
    isError: false,
    isLoading: false,
    error: null as Error | null,
  },
  assignees: { data: { items: [{ id: "employee-a", full_name: "Employee A" }], has_more: false } },
  assignAsset: vi.fn(),
  returnAsset: vi.fn(),
  setStatus: vi.fn(),
  addMaintenance: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  toastApiError: vi.fn(),
  executeQueries: false,
  getAsset: vi.fn(),
  getAssignees: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useParams: () => ({ id: state.id }),
  Link: ({ children }: { children: ReactNode }) => <a href="#asset">{children}</a>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, queryFn }: { queryKey: unknown; queryFn: () => Promise<unknown> }) => {
    if (state.executeQueries) void queryFn();
    return JSON.stringify(queryKey).includes("assignees") ? state.assignees : state.detail;
  },
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/employees-store", () => ({ useEmployees: () => ({ employees: state.employees }) }));
vi.mock("@/lib/assets-store", () => ({
  useAssets: () => ({
    assets: state.assets,
    assignAsset: state.assignAsset,
    returnAsset: state.returnAsset,
    setStatus: state.setStatus,
    addMaintenance: state.addMaintenance,
    loading: state.loading,
    error: state.error,
    isApiBacked: state.isApiBacked,
  }),
  warrantyDaysLeft: () => -5,
  fmtMoney: (value: number) => `$${value}`,
  ASSET_ADMIN_ROLES: ["main_admin", "asset_admin"],
}));
vi.mock("@/domains/assets", () => ({
  assetOverviewMetadata: (asset: Record<string, unknown>) => ({
    purchaseDate: asset.purchaseDate || "—",
    warranty: asset.warrantyExpiry || "—",
    cost: asset.cost ?? null,
    condition: asset.condition ?? null,
  }),
  assetsApi: { get: state.getAsset, assignees: state.getAssignees },
  mapApiAsset: (value: unknown) => value,
}));
vi.mock("@/shared/api", () => ({
  isUuid: () => true,
  toastApiError: state.toastApiError,
  userFacingErrorMessage: (error: Error | null, fallback: string) => error?.message ?? fallback,
}));
vi.mock("@/shared/query", () => ({
  queryKeys: {
    detail: (...parts: unknown[]) => parts,
    list: (...parts: unknown[]) => parts,
  },
  queryTimings: { detailStaleMs: 1, referenceStaleMs: 1 },
}));
vi.mock("@/components/ui-kit", () => ({
  DataCard: ({
    title,
    actions,
    children,
  }: {
    title: string;
    actions?: ReactNode;
    children: ReactNode;
  }) => (
    <section>
      <h3>{title}</h3>
      {actions}
      {children}
    </section>
  ),
  StatusBadge: ({ label, status }: { label?: string; status: string }) => (
    <span>{label ?? status}</span>
  ),
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h4>{children}</h4>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? children : <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("sonner", () => ({ toast: state.toast }));

import { AssetDetail, AssignDialog, MaintenanceDialog, ReturnDialog } from "./assets.$id";

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset-a",
    type: "Laptop",
    category: "Hardware",
    brand: "Dell",
    model: "Latitude",
    serial: "SERIAL-A",
    purchaseDate: "2026-01-01",
    vendor: "Vendor A",
    invoiceNumber: "INV-A",
    warrantyExpiry: "2026-01-02",
    cost: 1000,
    location: "Hyderabad",
    condition: "good",
    status: "available",
    assignedTo: undefined,
    assignedOn: undefined,
    expectedReturn: undefined,
    history: [],
    maintenance: [],
    documents: [],
    audit: [],
    ...overrides,
  };
}

describe("asset detail boundaries", () => {
  beforeEach(() => {
    state.id = "asset-a";
    state.auth.activeRole = "asset_admin";
    state.assets = [];
    state.employees = [];
    state.loading = false;
    state.error = null;
    state.isApiBacked = true;
    state.detail = { data: undefined, isError: false, isLoading: false, error: null };
    state.assignees = {
      data: { items: [{ id: "employee-a", full_name: "Employee A" }], has_more: false },
    };
    state.assignAsset.mockReset().mockResolvedValue(undefined);
    state.returnAsset.mockReset().mockResolvedValue(undefined);
    state.setStatus.mockReset();
    state.addMaintenance.mockReset().mockResolvedValue(undefined);
    state.toast.success.mockReset();
    state.toast.error.mockReset();
    state.toastApiError.mockReset();
    state.executeQueries = false;
    state.getAsset.mockReset().mockResolvedValue(asset());
    state.getAssignees.mockReset().mockResolvedValue({ items: [] });
  });
  afterEach(cleanup);

  it("renders backend loading and failure states without stale asset details", () => {
    state.loading = true;
    state.error = new Error("inventory unavailable");
    render(<AssetDetail />);
    expect(screen.getByText("Loading asset")).toBeInTheDocument();
    expect(screen.getByText("inventory unavailable")).toBeInTheDocument();
    cleanup();

    state.loading = false;
    state.error = null;
    state.detail = {
      data: undefined,
      isError: true,
      isLoading: false,
      error: new Error("detail denied"),
    };
    render(<AssetDetail />);
    expect(screen.getByText("Asset not found")).toBeInTheDocument();
    expect(screen.getByText("detail denied")).toBeInTheDocument();
  });

  it("renders API-backed Admin actions and fails repair closed to maintenance", () => {
    state.detail = { data: asset(), isError: false, isLoading: false, error: null };
    render(<AssetDetail />);
    expect(screen.getByText("Warranty expired 5 days ago.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Send to repair/ }));
    expect(state.toast.error).toHaveBeenCalledWith(
      "Create a maintenance record to move this asset into repair.",
    );
    expect(state.setStatus).not.toHaveBeenCalled();
    expect(screen.getByText("Asset documents are not available in this view.")).toBeInTheDocument();
    expect(
      screen.getByText("Asset audit history is not available in this view."),
    ).toBeInTheDocument();
  });

  it("executes API detail and assignee query functions with the current search", async () => {
    state.executeQueries = true;
    state.detail = { data: asset(), isError: false, isLoading: false, error: null };
    render(<AssetDetail />);
    await waitFor(() => expect(state.getAsset).toHaveBeenCalledWith("asset-a"));
    expect(state.getAssignees).toHaveBeenCalledWith("");
  });

  it("reports assignment and return outcomes only after the store boundary resolves", async () => {
    state.detail = { data: asset(), isError: false, isLoading: false, error: null };
    render(<AssetDetail />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
    await waitFor(() => expect(state.assignAsset).toHaveBeenCalled());
    expect(state.toast.success).toHaveBeenCalledWith("Assigned to Employee A");
    cleanup();

    state.detail = {
      data: asset({ status: "assigned" }),
      isError: false,
      isLoading: false,
      error: null,
    };
    state.returnAsset.mockRejectedValueOnce(new Error("return conflict"));
    render(<AssetDetail />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(state.toastApiError).toHaveBeenCalledWith(
        expect.any(Error),
        "Asset could not be returned.",
      ),
    );
    expect(state.toast.success).not.toHaveBeenCalledWith("Asset returned to inventory");
  });

  it("renders assigned and local history, maintenance, documents and audit evidence", () => {
    state.isApiBacked = false;
    state.detail = { data: undefined, isError: false, isLoading: false, error: null };
    state.assets = [
      asset({
        status: "assigned",
        assignedTo: "Employee A",
        assignedOn: "2026-11-01",
        expectedReturn: "2027-01-01",
        history: [
          {
            id: "assignment-a",
            employee: "Employee A",
            employeeId: "employee-a",
            assignedOn: "2026-11-01",
            returnedOn: "2026-11-10",
            conditionAtHandover: "good",
            conditionAtReturn: "fair",
            acknowledged: true,
          },
        ],
        maintenance: [
          {
            id: "m-a",
            date: "2026-11-05",
            type: "repair",
            vendor: "Vendor A",
            cost: 25,
            notes: "Fixed",
          },
        ],
        documents: [{ id: "d-a", name: "Invoice.pdf", kind: "invoice" }],
        audit: [
          {
            id: "a-a",
            at: "2026-11-01T00:00:00Z",
            actor: "Admin A",
            action: "Assigned",
            remarks: "Issued",
          },
        ],
      }),
    ];
    render(<AssetDetail />);
    expect(screen.getByText("Expected return: 2027-01-01")).toBeInTheDocument();
    expect(screen.getByText(/good → fair/)).toBeInTheDocument();
    expect(screen.getByText("Fixed")).toBeInTheDocument();
    expect(screen.getByText("Invoice.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Admin A/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Send to repair/ }));
    expect(state.setStatus).toHaveBeenCalledWith(
      "asset-a",
      "repair",
      "Marco Rossi",
      "Sent for service",
    );
  });
});

describe("asset detail dialogs", () => {
  afterEach(cleanup);

  it("submits an assignment only when an employee is available", async () => {
    const onAssign = vi.fn().mockResolvedValue(undefined);
    const onSearch = vi.fn();
    render(
      <AssignDialog
        employees={[{ id: "employee-a", name: "Employee A" }]}
        search=""
        onSearch={onSearch}
        hasMore
        showDetails={false}
        onAssign={onAssign}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Search by name"), { target: { value: "Emp" } });
    expect(onSearch).toHaveBeenCalledWith("Emp");
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
    await waitFor(() =>
      expect(onAssign).toHaveBeenCalledWith(
        "Employee A",
        "employee-a",
        expect.any(String),
        "",
        "good",
        "",
      ),
    );
    expect(screen.getByText(/More employees match/)).toBeInTheDocument();
    cleanup();

    render(
      <AssignDialog
        employees={[]}
        search=""
        onSearch={vi.fn()}
        hasMore={false}
        showDetails={false}
        onAssign={onAssign}
      />,
    );
    expect(screen.getByRole("button", { name: "Confirm assignment" })).toBeDisabled();
  });

  it("submits local assignment details and blocks close while pending", async () => {
    let resolveAssign!: () => void;
    const onAssign = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAssign = resolve;
        }),
    );
    render(
      <AssignDialog
        employees={[{ id: "employee-a", name: "Employee A" }]}
        search=""
        onSearch={vi.fn()}
        hasMore={false}
        showDetails
        onAssign={onAssign}
      />,
    );
    fireEvent.change(screen.getByLabelText("Assignment date"), { target: { value: "2026-12-01" } });
    fireEvent.change(screen.getByLabelText("Expected return"), { target: { value: "2027-01-01" } });
    fireEvent.change(screen.getByLabelText("Remarks"), { target: { value: "Issued by IT" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
    expect(screen.getByRole("button", { name: "Confirm assignment" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
    expect(onAssign).toHaveBeenCalledTimes(1);
    resolveAssign();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirm assignment" })).toBeEnabled(),
    );
    expect(onAssign).toHaveBeenCalledWith(
      "Employee A",
      "employee-a",
      "2026-12-01",
      "2027-01-01",
      "good",
      "Issued by IT",
    );
  });

  it("submits return and maintenance values", async () => {
    const onReturn = vi.fn().mockResolvedValue(undefined);
    render(<ReturnDialog showDetails={false} onReturn={onReturn} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onReturn).toHaveBeenCalledWith(expect.any(String), "good", ""));
    cleanup();

    const onAdd = vi.fn();
    render(<MaintenanceDialog onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText("Vendor"), { target: { value: "Vendor B" } });
    fireEvent.change(screen.getByLabelText("Cost (USD)"), { target: { value: "99" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Inspected" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "service",
        vendor: "Vendor B",
        cost: 99,
        notes: "Inspected",
      }),
    );
  });
});
