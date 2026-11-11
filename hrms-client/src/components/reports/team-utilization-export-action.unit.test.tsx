import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamUtilizationExportAction } from "./team-utilization-export-action";

afterEach(cleanup);

describe("team utilization download availability", () => {
  it("removes the download action for API-backed data and explains why", () => {
    const exportRows = vi.fn();
    render(<TeamUtilizationExportAction apiMode onExport={exportRows} />);
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("temporarily unavailable");
    expect(exportRows).not.toHaveBeenCalled();
  });

  it("keeps the local demo download action", () => {
    const exportRows = vi.fn();
    render(<TeamUtilizationExportAction apiMode={false} onExport={exportRows} />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(exportRows).toHaveBeenCalledOnce();
  });
});
