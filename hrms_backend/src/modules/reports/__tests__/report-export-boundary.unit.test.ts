import { describe, expect, it } from "vitest";
import { parseReportExportRequest } from "../export-boundary.js";

const request = (date_from: string, date_to: string, page_size?: number) => ({
  format: "csv",
  report_type: "expenses/register",
  filters: { date_from, date_to, ...(page_size === undefined ? {} : { page_size }) },
});

describe("report export request boundary", () => {
  it("accepts an inclusive twelve-month range and 10,000 row request", () => {
    expect(parseReportExportRequest(request("2025-04-01", "2026-03-31", 10_000)).report_type).toBe("expenses/register");
    expect(parseReportExportRequest(request("2024-02-29", "2025-02-28")).format).toBe("csv");
    expect(parseReportExportRequest(request("2024-01-31", "2025-01-30")).format).toBe("csv");
  });

  it.each([
    request("2025-04-01", "2026-04-01"),
    request("2024-02-29", "2025-03-01"),
    request("2024-01-31", "2025-01-31"),
    request("2026-05-02", "2026-05-01"),
    request("2026-02-30", "2026-03-01"),
    request("2025-04-01", "2026-03-31", 10_001),
    { format: "csv", report_type: "expenses/register", filters: {} },
    { format: "json", report_type: "expenses/register", filters: { date_from: "2025-04-01", date_to: "2026-03-31" } },
    { format: "csv", report_type: "unknown", filters: { date_from: "2025-04-01", date_to: "2026-03-31" } },
  ])("rejects unbounded, reversed, invalid or unsupported requests", (body) => {
    expect(() => parseReportExportRequest(body)).toThrow();
  });
});
