import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/errors";
import { ReportError, reportErrorCopy } from "./report-error";

afterEach(cleanup);

describe("report denial copy", () => {
  it("distinguishes denied permission from unavailable ownership and connectivity", () => {
    const denied = reportErrorCopy(new ApiError({ status: 403, code: "FORBIDDEN", message: "No" }));
    const unavailable = reportErrorCopy(
      new ApiError({ status: 409, code: "CONFLICT", message: "No" }),
    );
    const company = reportErrorCopy(
      new ApiError({ status: 400, code: "COMPANY_CONTEXT_REQUIRED", message: "No" }),
    );
    const session = reportErrorCopy(
      new ApiError({ status: 401, code: "UNAUTHORIZED", message: "No" }),
    );
    const offline = reportErrorCopy(new Error("network"));
    expect(denied.title).toBe("Report access denied");
    expect(unavailable.title).toBe("Report unavailable");
    expect(company.title).toBe("Company access required");
    expect(session.title).toBe("Sign in required");
    expect(offline.title).toBe("Report could not load");
  });

  it("renders an access denial without cached report rows or download controls and offers retry", () => {
    const retry = vi.fn();
    render(
      <ReportError
        error={new ApiError({ status: 403, code: "FORBIDDEN", message: "No" })}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Report access denied");
    expect(screen.queryByText("Export CSV")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry report" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
