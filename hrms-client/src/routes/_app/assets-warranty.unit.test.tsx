import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  assets: [
    {
      id: "asset-a",
      type: "Laptop",
      brand: "Dell",
      model: "Latitude",
      vendor: "Vendor A",
      warrantyExpiry: "expired",
      assignedTo: "Employee A",
      maintenance: [
        {
          id: "m-1",
          date: "2026-11-01",
          type: "service",
          vendor: "Vendor A",
          cost: 50,
          notes: "Cleaned",
        },
      ],
    },
    {
      id: "asset-b",
      type: "Monitor",
      brand: "LG",
      model: "Ultra",
      vendor: "Vendor A",
      warrantyExpiry: "soon",
      assignedTo: undefined,
      maintenance: [],
    },
    {
      id: "asset-c",
      type: "Mouse",
      brand: "Logitech",
      model: "MX",
      vendor: "Vendor B",
      warrantyExpiry: undefined,
      assignedTo: undefined,
      maintenance: [],
    },
  ],
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children }: { children: ReactNode }) => <a href="#asset">{children}</a>,
}));
vi.mock("@/lib/assets-store", () => ({
  useAssets: () => ({ assets: state.assets }),
  warrantyDaysLeft: (value?: string) => (value === "expired" ? -5 : value === "soon" ? 30 : 100),
  fmtMoney: (value: number) => `$${value}`,
}));
vi.mock("@/shared/api", () => ({ useApiRouteEnabled: () => false }));
vi.mock("@/domains/assets", () => ({
  useAssetVendors: () => ({ data: undefined, isLoading: false, error: null }),
  useAssetWarrantyAlerts: () => ({ data: undefined, isLoading: false, error: null }),
  useAssetVendorMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
    actions,
    children,
  }: {
    title: string;
    actions?: ReactNode;
    children: ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {actions}
      {children}
    </section>
  ),
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  PhoneInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { WarrantyScreen } from "./assets.warranty";

describe("local warranty projection", () => {
  afterEach(cleanup);

  it("derives warranty, maintenance and vendor summaries from complete local assets", () => {
    render(<WarrantyScreen />);
    expect(screen.getByText("Expiring (60d): 1")).toBeInTheDocument();
    expect(screen.getByText("Expired: 1")).toBeInTheDocument();
    expect(screen.getByText("Active warranties: 2")).toBeInTheDocument();
    expect(screen.getByText("Maintenance logs: 1")).toBeInTheDocument();
    expect(screen.getAllByText("Dell Latitude")).toHaveLength(2);
    expect(screen.getByText("LG Ultra")).toBeInTheDocument();
    expect(screen.getByText("5d expired")).toBeInTheDocument();
    expect(screen.getByText("30d left")).toBeInTheDocument();
    expect(screen.getByText("Cleaned")).toBeInTheDocument();
    expect(screen.getByText("2 assets · 1 active warranties")).toBeInTheDocument();
    expect(screen.getByText("1 assets · 0 active warranties")).toBeInTheDocument();
    expect(screen.getByLabelText("Vendor name")).toBeInTheDocument();
    expect(screen.getByLabelText("Contact email")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Vendor name"), { target: { value: "Vendor C" } });
    fireEvent.change(screen.getByLabelText("Contact email"), {
      target: { value: "it@example.com" },
    });
    expect(screen.getByLabelText("Vendor name")).toHaveValue("Vendor C");
    expect(screen.getByLabelText("Contact email")).toHaveValue("it@example.com");
  });
});
