import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { assetRecoveryTickets, assetRequests, attendancePunchEvents } from "../schema.js";
import { swaggerTransform } from "../../platform/openapi.js";

describe("asset command schema and OpenAPI boundary", () => {
  it("binds recovery tickets to the exact assignment", () => {
    const config = getTableConfig(assetRecoveryTickets);
    const assignment = config.columns.find((column) => column.name === "assignment_id");
    const foreignKey = config.foreignKeys.find((candidate) =>
      candidate.reference().columns.some((column) => column.name === "assignment_id"),
    );

    expect(assignment).toBeDefined();
    expect(foreignKey?.reference().foreignColumns[0]?.name).toBe("id");
  });

  it("declares historical employee identity only on recovery tickets", () => {
    const recoveryColumns = getTableConfig(assetRecoveryTickets).columns.map((column) => column.name);
    const attendanceColumns = getTableConfig(attendancePunchEvents).columns.map((column) => column.name);

    expect(recoveryColumns).toEqual(expect.arrayContaining([
      "employee_full_name_snapshot",
      "employee_code_snapshot",
    ]));
    expect(attendanceColumns).not.toContain("employee_full_name_snapshot");
    expect(attendanceColumns).not.toContain("employee_code_snapshot");
  });

  it("indexes tenant-local numeric request-code allocation", () => {
    const config = getTableConfig(assetRequests);
    const allocationIndex = config.indexes.find(
      (candidate) => candidate.config.name === "asset_requests_company_numeric_code_idx",
    );

    expect(allocationIndex).toBeDefined();
    expect(allocationIndex?.config.columns).toHaveLength(2);
    expect(allocationIndex?.config.where).toBeDefined();
  });

  it("documents idempotency only for private asset mutations", () => {
    const transform = (method: string | string[], url: string) => swaggerTransform({
      schema: {},
      url,
      route: { method, url, handler: async () => undefined },
      openapiObject: {},
    });

    expect(transform("POST", "/api/v1/assets/").schema.headers).toMatchObject({
      required: ["idempotency-key"],
    });
    expect(transform(["POST", "OPTIONS"], "/api/v1/assets/").schema.headers).toBeDefined();
    expect(transform(["OPTIONS", "POST"], "/api/v1/assets/").schema.headers).toBeDefined();
    expect(transform("PATCH", "/api/v1/assets/vendors/:id").schema.headers).toBeDefined();
    expect(transform("GET", "/api/v1/assets/").schema.headers).toBeUndefined();
    expect(transform("POST", "/api/v1/assets/scan/token").schema.headers).toBeUndefined();
    expect(transform("POST", "/api/v1/assets/licenses/validate").schema.headers).toBeUndefined();
    expect(transform("POST", "/api/v1/auth/login").schema.headers).toBeUndefined();
    expect(transform([], "/api/v1/assets/").schema.headers).toBeUndefined();
  });

  it("documents an explicit employee-safe asset response without procurement fields", () => {
    const transform = (url: string) => swaggerTransform({
      schema: {},
      url,
      route: { method: "GET", url, handler: async () => undefined },
      openapiObject: {},
    });
    const mineSchema = transform("/api/v1/assets/my").schema as { response?: Record<number, unknown> };
    const mineResponse = mineSchema.response?.[200] as {
      content?: { "application/json"?: { schema?: {
        properties?: { items?: { items?: { properties?: Record<string, unknown>; additionalProperties?: boolean } } };
      } } };
    };
    const employeeAsset = mineResponse.content?.["application/json"]?.schema?.properties?.items?.items;
    expect(employeeAsset?.additionalProperties).toBe(false);
    expect(Object.keys(employeeAsset?.properties ?? {})).toEqual(expect.arrayContaining([
      "id", "asset_code", "asset_type", "name", "status", "version",
      "assigned_on", "is_assigned_to_current_user", "assignment_acknowledged",
    ]));
    for (const protectedField of [
      "qr_hash", "metadata", "purchase_date", "vendor", "invoice_no", "cost", "maintenance",
      "assigned_to_user_id", "active_assignment_id", "latest_acknowledgement",
    ]) {
      expect(employeeAsset?.properties).not.toHaveProperty(protectedField);
    }

    const detailSchema = transform("/api/v1/assets/:id").schema as { response?: Record<number, unknown> };
    const detailResponse = detailSchema.response?.[200] as {
      content?: { "application/json"?: { schema?: { anyOf?: unknown[] } } };
    };
    const detail = detailResponse.content?.["application/json"]?.schema;
    expect(detail?.anyOf).toHaveLength(2);
  });
});
