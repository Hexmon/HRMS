import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ activeRole: "employee" as string | null }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Outlet: () => <div>Asset child route</div>,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => state }));
vi.mock("@/components/ui-kit", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  ModuleTabs: ({ tabs }: { tabs: Array<{ label: string }> }) => (
    <nav>
      {tabs.map((tab) => (
        <span key={tab.label}>{tab.label}</span>
      ))}
    </nav>
  ),
}));

import { AssetsLayout } from "./assets";

describe("asset module role navigation", () => {
  afterEach(cleanup);

  it("shows employees only the shared asset journeys", () => {
    state.activeRole = "employee";
    render(<AssetsLayout />);
    expect(screen.getByRole("heading", { name: "Asset Management" })).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("My Assets")).toBeInTheDocument();
    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.queryByText("Inventory")).not.toBeInTheDocument();
    expect(screen.queryByText("Returns")).not.toBeInTheDocument();
    expect(screen.queryByText("Warranty & Maintenance")).not.toBeInTheDocument();
    expect(screen.getByText("Asset child route")).toBeInTheDocument();
  });

  it("adds recovery navigation for HR without exposing asset administration", () => {
    state.activeRole = "hr_admin";
    render(<AssetsLayout />);
    expect(screen.getByText("Returns")).toBeInTheDocument();
    expect(screen.queryByText("Inventory")).not.toBeInTheDocument();
    expect(screen.queryByText("Warranty & Maintenance")).not.toBeInTheDocument();
  });

  it("shows the full module to Asset Admin and fails closed with no role", () => {
    state.activeRole = "asset_admin";
    const { rerender } = render(<AssetsLayout />);
    expect(screen.getByText("Inventory")).toBeInTheDocument();
    expect(screen.getByText("Returns")).toBeInTheDocument();
    expect(screen.getByText("Warranty & Maintenance")).toBeInTheDocument();

    state.activeRole = null;
    rerender(<AssetsLayout />);
    expect(screen.queryByText("Inventory")).not.toBeInTheDocument();
    expect(screen.queryByText("Returns")).not.toBeInTheDocument();
  });
});
