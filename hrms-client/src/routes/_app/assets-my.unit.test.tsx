import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "employee-a", name: "Employee A" },
  assets: [] as Array<Record<string, unknown>>,
  loading: false,
  error: null as Error | null,
  acknowledge: vi.fn(),
  warrantyDays: vi.fn(() => 100),
  toast: { success: vi.fn() },
  toastApiError: vi.fn(),
  isApiBacked: false,
  myQuery: {
    data: undefined as Array<Record<string, unknown>> | undefined,
    isLoading: false,
    error: null as Error | null,
  },
  queryConfig: null as null | { queryKey: unknown; queryFn: () => Promise<unknown> },
  myAssetsApi: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children }: { children: ReactNode }) => <a href="#asset">{children}</a>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: { queryKey: unknown; queryFn: () => Promise<unknown> }) => {
    state.queryConfig = config;
    return state.myQuery;
  },
}));
vi.mock("@/domains/assets", () => ({
  assetsApi: { myAssets: state.myAssetsApi },
  mapApiAssets: (items: Array<Record<string, unknown>>) => items,
}));
vi.mock("@/shared/query", () => ({
  queryKeys: { list: (...parts: unknown[]) => parts },
  queryTimings: { listStaleMs: 1 },
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/lib/assets-store", () => ({
  useAssets: () => ({
    assets: state.assets,
    acknowledgeAssignment: state.acknowledge,
    loading: state.loading,
    error: state.error,
    isApiBacked: state.isApiBacked,
  }),
  warrantyDaysLeft: state.warrantyDays,
  fmtMoney: (value: number) => `$${value}`,
}));
vi.mock("@/shared/api", () => ({
  toastApiError: state.toastApiError,
  userFacingErrorMessage: (error: Error | null, fallback: string) => error?.message ?? fallback,
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
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <article>{children}</article>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? children : <button {...props}>{children}</button>,
}));
vi.mock("sonner", () => ({ toast: state.toast }));

import { MyAssets } from "./assets.my";

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset-a",
    type: "Laptop",
    brand: "Dell",
    model: "Latitude",
    serial: "SERIAL-A",
    status: "assigned",
    assignedToId: "employee-a",
    assignedOn: "2026-11-01",
    expectedReturn: "2027-01-01",
    condition: "good",
    cost: 1000,
    warrantyExpiry: "2027-01-01",
    location: "Hyderabad",
    history: [{ acknowledged: false }],
    ...overrides,
  };
}

describe("employee asset journey", () => {
  beforeEach(() => {
    state.assets = [];
    state.loading = false;
    state.error = null;
    state.acknowledge.mockReset().mockResolvedValue(undefined);
    state.warrantyDays.mockReset().mockReturnValue(100);
    state.toast.success.mockReset();
    state.toastApiError.mockReset();
    state.isApiBacked = false;
    state.myQuery = { data: undefined, isLoading: false, error: null };
    state.queryConfig = null;
    state.myAssetsApi.mockReset().mockResolvedValue({ items: [] });
  });
  afterEach(cleanup);

  it("distinguishes loading, backend failure and a genuine empty assignment", () => {
    state.loading = true;
    render(<MyAssets />);
    expect(screen.getByText("Loading assigned assets")).toBeInTheDocument();
    cleanup();

    state.loading = false;
    state.error = new Error("assignment denied");
    render(<MyAssets />);
    expect(screen.getByText("Assigned assets unavailable")).toBeInTheDocument();
    expect(screen.getByText("assignment denied")).toBeInTheDocument();
    cleanup();

    state.error = null;
    render(<MyAssets />);
    expect(screen.getByText("Nothing assigned yet")).toBeInTheDocument();
    expect(screen.getByText(/When IT hands you/)).toBeInTheDocument();
  });

  it("shows only the signed-in employee's assets and acknowledges after backend success", async () => {
    state.assets = [asset(), asset({ id: "foreign", assignedToId: "employee-b" })];
    render(<MyAssets />);
    expect(screen.getByText("Dell Latitude")).toBeInTheDocument();
    expect(screen.queryByText("foreign")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge receipt" }));
    await waitFor(() => expect(state.acknowledge).toHaveBeenCalledWith("asset-a", "Employee A"));
    expect(state.toast.success).toHaveBeenCalledWith("Receipt acknowledged");
  });

  it("reports acknowledgement failure without showing success", async () => {
    state.assets = [asset()];
    state.acknowledge.mockRejectedValueOnce(new Error("stale assignment"));
    render(<MyAssets />);
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge receipt" }));
    await waitFor(() =>
      expect(state.toastApiError).toHaveBeenCalledWith(
        expect.any(Error),
        "Receipt could not be acknowledged.",
      ),
    );
    expect(state.toast.success).not.toHaveBeenCalled();
  });

  it("renders acknowledgement, unavailable metadata and expired warranty truthfully", () => {
    state.warrantyDays.mockReturnValue(-5);
    state.assets = [
      asset({
        brand: "—",
        assignedOn: undefined,
        expectedReturn: undefined,
        warrantyExpiry: "2026-01-01",
        apiMissing: { condition: true, cost: true },
        history: [{ acknowledged: true }],
      }),
    ];
    render(<MyAssets />);
    expect(screen.getByText("Latitude")).toBeInTheDocument();
    expect(screen.getByText("Acknowledged")).toBeInTheDocument();
    expect(screen.getByText("Expired 5d ago")).toBeInTheDocument();
    expect(screen.getByText(/Warranty expired/)).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("Cost")).not.toBeInTheDocument();
  });

  it("uses the server-scoped my-assets query even when the shared Admin inventory contains other assets", async () => {
    state.isApiBacked = true;
    state.assets = [asset({ id: "foreign-admin-inventory", assignedToId: "employee-b" })];
    state.myQuery = { data: [asset({ assignedToId: "" })], isLoading: false, error: null };
    render(<MyAssets />);
    expect(screen.getByText("Dell Latitude")).toBeInTheDocument();
    expect(screen.queryByText("foreign-admin-inventory")).not.toBeInTheDocument();
    expect(screen.queryByText("Cost")).not.toBeInTheDocument();
    expect(JSON.stringify(state.queryConfig?.queryKey)).toContain('"my"');
    await state.queryConfig?.queryFn();
    expect(state.myAssetsApi).toHaveBeenCalledWith({ page_size: 100 });
  });

  it("does not fall back to shared inventory while the server-scoped list is unresolved", () => {
    state.isApiBacked = true;
    state.assets = [asset({ id: "shared-inventory" })];
    state.myQuery = { data: undefined, isLoading: true, error: null };
    render(<MyAssets />);
    expect(screen.getByText("Loading assigned assets")).toBeInTheDocument();
    expect(screen.queryByText("shared-inventory")).not.toBeInTheDocument();
  });

  it("renders expiring and absent warranty states", () => {
    state.warrantyDays.mockReturnValue(30);
    state.assets = [asset(), asset({ id: "asset-b", warrantyExpiry: undefined, history: [] })];
    render(<MyAssets />);
    expect(screen.getByText("30d left")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
