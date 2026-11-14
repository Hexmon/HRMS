import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetFormDrawer } from "./asset-form-drawer";

const addAsset = vi.hoisted(() => vi.fn());
const toastApiError = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const assetState = vi.hoisted(() => ({
  isApiBacked: true,
  assets: [] as Array<Record<string, unknown>>,
}));
const controls = vi.hoisted(() => ({
  submit: null as null | (() => void),
  drawerOpenChange: null as null | ((open: boolean) => void),
}));
vi.mock("@/lib/assets-store", () => ({
  useAssets: () => ({ assets: assetState.assets, addAsset, isApiBacked: assetState.isApiBacked }),
  nextAssetId: () => "MOCK-001",
}));
vi.mock("@/shared/api", () => ({ toastApiError }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
    if (children === "Add asset") controls.submit = onClick as () => void;
    return (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    );
  },
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
  }) => (
    <div>
      <button
        type="button"
        aria-label={`Change ${value}`}
        onClick={() =>
          onValueChange(
            value === "Hardware"
              ? "Software"
              : value === "new"
                ? "fair"
                : value === "available"
                  ? "repair"
                  : value,
          )
        }
      >
        Change
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui-kit", () => ({
  DrawerForm: ({
    open,
    children,
    footer,
    onOpenChange,
    description,
  }: {
    open: boolean;
    children: React.ReactNode;
    footer: React.ReactNode;
    onOpenChange: (open: boolean) => void;
    description: string;
  }) => {
    controls.drawerOpenChange = onOpenChange;
    return open ? (
      <div>
        <p>{description}</p>
        <button onClick={() => onOpenChange(false)}>Close drawer</button>
        {children}
        {footer}
      </div>
    ) : null;
  },
}));
vi.mock("sonner", () => ({ toast }));

function field(label: string): HTMLInputElement {
  const input = screen.getByText(label).parentElement?.querySelector("input");
  if (!input) throw new Error(`Input missing for ${label}`);
  return input;
}

describe("API-backed Add Asset form", () => {
  beforeEach(() => {
    assetState.isApiBacked = true;
    assetState.assets = [];
    addAsset.mockReset();
    toastApiError.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    controls.submit = null;
    controls.drawerOpenChange = null;
  });
  afterEach(cleanup);

  it("shows only fields that the create API persists", () => {
    const onOpenChange = vi.fn();
    render(<AssetFormDrawer open onOpenChange={onOpenChange} />);
    for (const label of ["Asset Code", "Asset Type", "Asset Name", "Serial Number"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText("Brand")).not.toBeInTheDocument();
    expect(screen.queryByText("Model")).not.toBeInTheDocument();
    for (const label of [
      "Purchase Date",
      "Warranty Expiry",
      "Vendor",
      "Invoice Number",
      "Cost (USD)",
      "Location",
      "Condition",
      "Status",
      "Notes",
      "Invoice upload",
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Close drawer" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the form open and prevents duplicate submits until the API confirms", async () => {
    let rejectFirst: (error: Error) => void = () => undefined;
    addAsset.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );
    const onOpenChange = vi.fn();
    render(<AssetFormDrawer open onOpenChange={onOpenChange} />);
    fireEvent.change(field("Asset Code"), { target: { value: "INV-S25-001" } });
    fireEvent.change(field("Asset Name"), { target: { value: "Lenovo ThinkPad T14" } });
    fireEvent.change(field("Serial Number"), { target: { value: "SERIAL-001" } });
    const button = screen.getByRole("button", { name: "Add asset" });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    controls.submit?.();
    controls.drawerOpenChange?.(false);
    expect(addAsset).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    rejectFirst(new Error("offline"));
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toastApiError).toHaveBeenCalledTimes(1);
    addAsset.mockResolvedValueOnce(undefined);
    fireEvent.click(button);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(addAsset).toHaveBeenCalledTimes(2);
  });

  it("rejects missing API fields without submitting and closes through explicit cancel", () => {
    const onOpenChange = vi.fn();
    render(<AssetFormDrawer open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Add asset" }));
    expect(toast.error).toHaveBeenLastCalledWith("Asset code is required.");
    fireEvent.change(field("Asset Code"), { target: { value: "INV-S25-002" } });
    fireEvent.click(screen.getByRole("button", { name: "Add asset" }));
    expect(toast.error).toHaveBeenLastCalledWith("Asset name and serial number are required.");
    expect(addAsset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders and submits the local fallback fields with its generated asset ID", async () => {
    assetState.isApiBacked = false;
    addAsset.mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<AssetFormDrawer open onOpenChange={onOpenChange} />);
    expect(screen.getByText(/Asset ID: MOCK-001/)).toBeInTheDocument();
    expect(screen.queryByText("Asset Code")).not.toBeInTheDocument();
    for (const label of [
      "Brand",
      "Model",
      "Purchase Date",
      "Warranty Expiry",
      "Vendor",
      "Invoice Number",
      "Cost (USD)",
      "Location",
      "Condition",
      "Status",
      "Notes",
      "Invoice upload",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Add asset" }));
    expect(toast.error).toHaveBeenLastCalledWith("Brand, model and serial number are required.");
    fireEvent.change(field("Brand"), { target: { value: "Dell" } });
    fireEvent.change(field("Model"), { target: { value: "Latitude" } });
    fireEvent.change(field("Serial Number"), { target: { value: "LOCAL-SERIAL" } });
    fireEvent.change(field("Purchase Date"), { target: { value: "2026-01-01" } });
    fireEvent.change(field("Warranty Expiry"), { target: { value: "2028-01-01" } });
    fireEvent.change(field("Vendor"), { target: { value: "Vendor A" } });
    fireEvent.change(field("Invoice Number"), { target: { value: "INV-1" } });
    fireEvent.change(field("Cost (USD)"), { target: { value: "2500" } });
    fireEvent.change(field("Location"), { target: { value: "Hyderabad" } });
    fireEvent.click(screen.getByRole("button", { name: "Change Hardware" }));
    fireEvent.click(screen.getByRole("button", { name: "Change new" }));
    fireEvent.click(screen.getByRole("button", { name: "Change available" }));
    fireEvent.click(screen.getByRole("button", { name: "Add asset" }));
    await waitFor(() => expect(addAsset).toHaveBeenCalledTimes(1));
    expect(addAsset.mock.calls[0]?.[0]).toMatchObject({
      id: "MOCK-001",
      brand: "Dell",
      model: "Latitude",
      serial: "LOCAL-SERIAL",
      purchaseDate: "2026-01-01",
      warrantyExpiry: "2028-01-01",
      vendor: "Vendor A",
      invoiceNumber: "INV-1",
      cost: 2500,
      location: "Hyderabad",
      category: "Software",
      condition: "fair",
      status: "repair",
    });
    expect(toast.success).toHaveBeenCalledWith("MOCK-001 added to inventory");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
