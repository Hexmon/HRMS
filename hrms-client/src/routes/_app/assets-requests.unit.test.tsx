import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  selectChange: null as null | ((value: string) => void),
  auth: { activeRole: "employee", user: { name: "Employee A" } },
  requests: [] as Array<Record<string, unknown>>,
  addRequest: vi.fn(),
  decideRequest: vi.fn(),
  cancelRequest: vi.fn(),
  toastApiError: vi.fn(),
  requestError: null as Error | null,
  requestsLoading: false,
  submitAction: null as null | (() => void),
}));

vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/lib/auth", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/assets-store", () => ({
  useAssets: () => ({
    requests: state.requests,
    addRequest: state.addRequest,
    decideRequest: state.decideRequest,
    cancelRequest: state.cancelRequest,
    requestError: state.requestError,
    requestsLoading: state.requestsLoading,
  }),
  nextRequestId: () => "REQ-NEXT",
  ASSET_ADMIN_ROLES: ["main_admin", "asset_admin"],
}));
vi.mock("@/shared/api", () => ({ toastApiError: state.toastApiError }));
vi.mock("@/components/ui-kit", () => ({
  DataTable: ({
    columns,
    rows,
  }: {
    columns: Array<{ key: string; render?: (row: Record<string, unknown>) => ReactNode }>;
    rows: Array<Record<string, unknown>>;
  }) => (
    <div>
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
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
  }) => {
    state.selectChange = onValueChange;
    return (
      <div>
        <button type="button" onClick={() => onValueChange("repair")}>
          Choose repair
        </button>
        {children}
      </div>
    );
  },
  SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
    if (typeof children !== "string" && onClick) {
      const text = Array.isArray(children)
        ? children.find((child) => child === "Submit request")
        : null;
      if (text) state.submitAction = onClick as () => void;
    }
    return (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    );
  },
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("sonner", () => ({ toast: state.toast }));

import { AdminQueue, RaiseForm, RequestsScreen } from "./assets.requests";

const request = {
  id: "REQ-1",
  type: "new" as const,
  assetType: "Laptop",
  assetId: undefined,
  raisedBy: "Employee A",
  raisedAt: "2026-11-14T00:00:00.000Z",
  reason: "New starter",
  priority: "normal" as const,
  status: "pending" as const,
};

describe("asset request controls", () => {
  beforeEach(() => {
    state.toast.success.mockReset();
    state.toast.error.mockReset();
    state.selectChange = null;
    state.auth.activeRole = "employee";
    state.requests = [];
    state.addRequest.mockReset().mockResolvedValue(undefined);
    state.decideRequest.mockReset().mockResolvedValue(undefined);
    state.cancelRequest.mockReset().mockResolvedValue(undefined);
    state.toastApiError.mockReset();
    state.requestError = null;
    state.requestsLoading = false;
    state.submitAction = null;
  });
  afterEach(cleanup);

  it("renders queue decisions and keeps fulfillment disabled until assignment is atomic", () => {
    const onDecide = vi.fn();
    render(
      <AdminQueue
        rows={[request, { ...request, id: "REQ-2", status: "approved", assetId: "AST-2" }]}
        onDecide={onDecide}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve request REQ-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject request REQ-1" }));
    expect(onDecide).toHaveBeenNthCalledWith(1, "REQ-1", "approved", "");
    expect(onDecide).toHaveBeenNthCalledWith(2, "REQ-1", "rejected", "Rejected from queue");
    expect(screen.getByRole("button", { name: /Fulfillment unavailable/ })).toBeDisabled();
    expect(screen.getByText(/Laptop · AST-2/)).toBeInTheDocument();
  });

  it("validates a reason and exposes accessible request controls", () => {
    const onSubmit = vi.fn();
    render(<RaiseForm onSubmit={onSubmit} />);
    for (const label of ["Request type", "Asset type", "Reason", "Priority"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(
      screen.getByText("Attachments are not available for asset requests yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Click to attach")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    expect(state.toast.error).toHaveBeenCalledWith("Please add a reason.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits repair details once, clears on success and preserves draft on failure", async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    render(<RaiseForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Choose repair" })[0]!);
    fireEvent.change(screen.getByLabelText("Asset ID (optional)"), { target: { value: "AST-1" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Broken screen" } });
    const submit = screen.getByRole("button", { name: "Submit request" });
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    state.submitAction?.();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "repair",
        assetId: "AST-1",
        reason: "Broken screen",
      }),
    );
    resolveSubmit();
    await waitFor(() => expect(submit).toBeEnabled());
    expect(screen.getByLabelText("Reason")).toHaveValue("");
    expect(screen.getByLabelText("Asset ID (optional)")).toHaveValue("");
    cleanup();

    const failed = vi.fn().mockRejectedValue(new Error("offline"));
    render(<RaiseForm onSubmit={failed} />);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Submit request" })).toBeEnabled(),
    );
    expect(screen.getByLabelText("Reason")).toHaveValue("Keep this draft");
  });

  it("submits and cancels an employee request through the screen handlers", async () => {
    state.requests = [request];
    render(<RequestsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(state.cancelRequest).toHaveBeenCalledWith("REQ-1"));
    expect(state.toast.success).toHaveBeenCalledWith("Request cancelled");

    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Need a device" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() =>
      expect(state.addRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "REQ-NEXT",
          raisedBy: "Employee A",
          reason: "Need a device",
          status: "pending",
        }),
      ),
    );
    expect(state.toast.success).toHaveBeenCalledWith("REQ-NEXT submitted");
  });

  it("distinguishes a loading queue from a backend failure", () => {
    state.requestsLoading = true;
    render(<RequestsScreen />);
    expect(screen.getByText("Loading request queues...")).toBeInTheDocument();
    cleanup();
    state.requestsLoading = false;
    state.requestError = new Error("queue denied");
    render(<RequestsScreen />);
    expect(screen.getByText("queue denied")).toBeInTheDocument();
  });

  it("reports request submission failure and preserves the form draft", async () => {
    state.addRequest.mockRejectedValueOnce(new Error("submission offline"));
    render(<RequestsScreen />);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Keep request draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() =>
      expect(state.toastApiError).toHaveBeenCalledWith(
        expect.any(Error),
        "Asset request could not be submitted.",
      ),
    );
    expect(screen.getByLabelText("Reason")).toHaveValue("Keep request draft");
  });

  it("reports employee request and Admin decision failures without false success", async () => {
    state.requests = [request];
    state.cancelRequest.mockRejectedValueOnce(new Error("cancel conflict"));
    render(<RequestsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(state.toastApiError).toHaveBeenCalledWith(
        expect.any(Error),
        "Request could not be cancelled.",
      ),
    );
    cleanup();

    state.auth.activeRole = "asset_admin";
    state.decideRequest.mockRejectedValueOnce(new Error("decision conflict"));
    render(<RequestsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Approve request REQ-1" }));
    await waitFor(() =>
      expect(state.toastApiError).toHaveBeenCalledWith(
        expect.any(Error),
        "Request decision could not be saved.",
      ),
    );
  });
});
