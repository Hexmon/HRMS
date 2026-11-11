import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetFormDrawer } from "./asset-form-drawer";

const addAsset = vi.hoisted(() => vi.fn());
const toastApiError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/assets-store", () => ({
  useAssets: () => ({ assets: [], addAsset, isApiBacked: true }),
  nextAssetId: () => "MOCK-001",
}));
vi.mock("@/shared/api", () => ({ toastApiError }));
vi.mock("@/components/ui-kit", () => ({
  DrawerForm: ({
    open,
    children,
    footer,
  }: {
    open: boolean;
    children: React.ReactNode;
    footer: React.ReactNode;
  }) =>
    open ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function field(label: string): HTMLInputElement {
  const input = screen.getByText(label).parentElement?.querySelector("input");
  if (!input) throw new Error(`Input missing for ${label}`);
  return input;
}

describe("API-backed Add Asset form", () => {
  beforeEach(() => {
    addAsset.mockReset();
    toastApiError.mockReset();
  });
  afterEach(cleanup);

  it("shows only fields that the create API persists", () => {
    render(<AssetFormDrawer open onOpenChange={vi.fn()} />);
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
    fireEvent.click(button);
    expect(addAsset).toHaveBeenCalledTimes(1);
    rejectFirst(new Error("offline"));
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toastApiError).toHaveBeenCalledTimes(1);
    addAsset.mockResolvedValueOnce(undefined);
    fireEvent.click(button);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(addAsset).toHaveBeenCalledTimes(2);
  });
});
