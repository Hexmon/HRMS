import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  assets: [] as Array<Record<string, unknown>>,
  loading: false,
  error: null as Error | null,
  isApiBacked: true,
  exportPending: false,
  createExport: vi.fn(),
  download: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  drawerOpen: false,
  selectHandlers: [] as Array<(value: string) => void>,
  triggerIndex: 0,
  activeRole: "asset_admin" as string | null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children }: { children: ReactNode }) => <a href="#asset">{children}</a>,
}));
vi.mock("@/lib/assets-store", () => ({
  useAssets: () => state,
  ASSET_ADMIN_ROLES: ["main_admin", "asset_admin"],
  warrantyDaysLeft: (value?: string) => (value === "expired" ? -5 : value === "soon" ? 30 : 100),
  fmtMoney: (value: number) => `$${value}`,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ activeRole: state.activeRole }) }));
vi.mock("@/domains/reports", () => ({
  useCreateReportExportMutation: () => ({
    mutateAsync: state.createExport,
    isPending: state.exportPending,
  }),
}));
vi.mock("@/domains/documents", () => ({ documentsApi: { createDownloadUrl: state.download } }));
vi.mock("@/components/assets/asset-form-drawer", () => ({
  AssetFormDrawer: ({ open }: { open: boolean }) => {
    state.drawerOpen = open;
    return open ? <div>Add Asset drawer</div> : null;
  },
}));
vi.mock("@/components/ui-kit", () => ({
  DataTable: ({
    columns,
    rows,
    emptyDescription,
    loading,
  }: {
    columns: Array<{ key: string; render?: (row: Record<string, unknown>) => ReactNode }>;
    rows: Array<Record<string, unknown>>;
    emptyDescription: string;
    loading: boolean;
  }) => (
    <div>
      {loading && <p>Loading table</p>}
      {rows.length === 0 && <p>{emptyDescription}</p>}
      {rows.map((row) => (
        <div key={String(row.id)}>
          {columns.map((column) => (
            <span key={column.key}>{column.render?.(row)}</span>
          ))}
        </div>
      ))}
    </div>
  ),
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  DataCard: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
  }) => {
    state.selectHandlers.push(onValueChange);
    return <div>{children}</div>;
  },
  SelectTrigger: ({ children, id, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
    const handler = state.selectHandlers[state.triggerIndex++];
    const value =
      id === "asset-filter-type"
        ? "Laptop"
        : id === "asset-filter-status"
          ? "assigned"
          : id === "asset-filter-assigned"
            ? "assigned"
            : "expired";
    return (
      <button type="button" id={id} onClick={() => handler?.(value)} {...props}>
        {children}
      </button>
    );
  },
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("sonner", () => ({ toast: state.toast }));

import { Inventory } from "./assets.inventory";

function asset(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "Laptop",
    brand: "Dell",
    model: "Latitude",
    serial: `SER-${id}`,
    status: "available",
    assignedTo: undefined,
    location: "Hyderabad",
    warrantyExpiry: "healthy",
    condition: "good",
    cost: 100,
    ...overrides,
  };
}

describe("asset inventory", () => {
  beforeEach(() => {
    state.assets = [];
    state.loading = false;
    state.error = null;
    state.isApiBacked = true;
    state.exportPending = false;
    state.createExport.mockReset();
    state.download.mockReset();
    state.toast.success.mockReset();
    state.toast.error.mockReset();
    state.drawerOpen = false;
    state.selectHandlers = [];
    state.triggerIndex = 0;
    state.activeRole = "asset_admin";
    vi.spyOn(window, "open").mockImplementation(() => null);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders persisted and unavailable inventory values and opens Add Asset", () => {
    state.assets = [
      asset("asset-a", { warrantyExpiry: "expired" }),
      asset("asset-b", {
        brand: "—",
        warrantyExpiry: undefined,
        apiMissing: { condition: true, cost: true },
      }),
    ];
    render(<Inventory />);
    for (const label of ["Type", "Status", "Assigned", "Warranty"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Expired 5d ago")).toBeInTheDocument();
    expect(screen.getByText("Latitude")).toBeInTheDocument();
    expect(screen.getByText("Dell Latitude")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByRole("button", { name: "Add Asset" }));
    expect(screen.getByText("Add Asset drawer")).toBeInTheDocument();
  });

  it("fails closed when a non-Asset-Admin opens the inventory URL directly", () => {
    state.activeRole = "employee";
    render(<Inventory />);
    expect(
      screen.getByText("Asset Admin access is required to view inventory and exports."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Asset" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument();
  });

  it("passes API filters to a queued backend export", async () => {
    state.assets = [asset("asset-a", { warrantyExpiry: "expired" })];
    state.createExport.mockResolvedValue({ job_id: "job-123456789" });
    render(<Inventory />);
    fireEvent.click(screen.getByLabelText("Type"));
    fireEvent.click(screen.getByLabelText("Status"));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() =>
      expect(state.createExport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "csv",
          report_type: "assets/summary",
          filters: expect.objectContaining({ status: "assigned", type: "Laptop" }),
        }),
      ),
    );
    expect(state.toast.success).toHaveBeenCalledWith("Export queued", expect.any(Object));
  });

  it("removes assets without warranty metadata when a warranty filter is selected", () => {
    state.assets = [
      asset("expired-asset", { warrantyExpiry: "expired" }),
      asset("unknown-warranty", { warrantyExpiry: undefined }),
    ];
    render(<Inventory />);
    fireEvent.click(screen.getByLabelText("Warranty"));
    expect(screen.getByText("expired-asset")).toBeInTheDocument();
    expect(screen.queryByText("unknown-warranty")).not.toBeInTheDocument();
  });

  it("opens a completed backend export and reports provider failure", async () => {
    state.createExport.mockResolvedValueOnce({
      export_id: "export-a",
      download_document_id: "document-a",
    });
    state.download.mockResolvedValueOnce({ url: "https://download.example/export.csv" });
    render(<Inventory />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith(
        "https://download.example/export.csv",
        "_blank",
        "noopener,noreferrer",
      ),
    );
    expect(state.toast.success).toHaveBeenCalledWith("Export ready", expect.any(Object));
    cleanup();

    state.createExport.mockRejectedValueOnce(new Error("renderer unavailable"));
    render(<Inventory />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() =>
      expect(state.toast.error).toHaveBeenCalledWith(
        "Export failed",
        expect.objectContaining({ description: "renderer unavailable" }),
      ),
    );
  });

  it("creates a local CSV only when the API fallback is active", async () => {
    state.isApiBacked = false;
    state.assets = [asset("asset-a")];
    const createObjectURL = vi.fn(() => "blob:asset-export");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<Inventory />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:asset-export");
    expect(state.createExport).not.toHaveBeenCalled();
  });

  it("shows pending export and backend inventory failure states", () => {
    state.exportPending = true;
    state.error = new Error("inventory denied");
    state.loading = true;
    render(<Inventory />);
    expect(screen.getByRole("button", { name: "Exporting..." })).toBeDisabled();
    expect(
      screen.getByText("Asset inventory could not be loaded from the backend."),
    ).toBeInTheDocument();
    expect(screen.getByText("Loading table")).toBeInTheDocument();
  });
});
