import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetsProvider, useAssets } from "./assets-store";

const auth = vi.hoisted(() => ({ current: { id: "employee-a", name: "Employee A" } }));
const myAssets = vi.hoisted(() => vi.fn());
const myRequests = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: auth.current, activeRole: "employee" }) }));
vi.mock("@/shared/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/api")>()),
  useApiRouteEnabled: () => true,
}));
vi.mock("@/domains/assets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domains/assets")>();
  return { ...actual, assetsApi: { ...actual.assetsApi, myAssets, myRequests } };
});

function Snapshot() {
  const { assets, error, loading } = useAssets();
  return (
    <>
      <output data-testid="assets">{assets.map((asset) => asset.id).join(",")}</output>
      <output data-testid="error">{error?.message ?? ""}</output>
      <output data-testid="loading">{String(loading)}</output>
    </>
  );
}

function mount(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AssetsProvider>
        <Snapshot />
      </AssetsProvider>
    </QueryClientProvider>,
  );
}

describe("API-backed employee asset visibility", () => {
  beforeEach(() => {
    auth.current = { id: "employee-a", name: "Employee A" };
    myAssets.mockReset();
    myRequests.mockReset().mockResolvedValue({ items: [] });
    localStorage.clear();
    localStorage.setItem(
      "hawkaii_assets_v1",
      JSON.stringify([{ id: "foreign-local-asset", assignedTo: "Employee A" }]),
    );
  });
  afterEach(cleanup);

  it.each(["offline", "forbidden"])(
    "shows an explicit %s error without local or seeded assets",
    async (message) => {
      myAssets.mockRejectedValue(new Error(message));
      mount();
      await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent(message));
      expect(screen.getByTestId("assets")).toHaveTextContent("");
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    },
  );

  it("does not show a previous account's cached assignment after account switch", async () => {
    myAssets.mockImplementation(() =>
      auth.current.id === "employee-a"
        ? Promise.resolve({
            items: [
              {
                id: "employee-a-asset",
                asset_type: "Laptop",
                name: "Device",
                status: "Assigned",
                assigned_to_user_id: "employee-a",
              },
            ],
          })
        : Promise.resolve({ items: [] }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = mount(queryClient);
    await waitFor(() => expect(screen.getByTestId("assets")).toHaveTextContent("employee-a-asset"));
    auth.current = { id: "employee-b", name: "Employee B" };
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <AssetsProvider>
          <Snapshot />
        </AssetsProvider>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("assets")).not.toHaveTextContent("employee-a-asset"),
    );
    expect(screen.getByTestId("assets")).toHaveTextContent("");
  });
});
