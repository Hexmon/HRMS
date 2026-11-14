import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { assetRecoveryTickets } from "../schema.js";
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

  it("documents idempotency only for private asset mutations", () => {
    const transform = (method: string, url: string) => swaggerTransform({
      schema: {},
      url,
      route: { method, url, handler: async () => undefined },
      openapiObject: {},
    });

    expect(transform("POST", "/api/v1/assets/").schema.headers).toMatchObject({
      required: ["idempotency-key"],
    });
    expect(transform("PATCH", "/api/v1/assets/vendors/:id").schema.headers).toBeDefined();
    expect(transform("GET", "/api/v1/assets/").schema.headers).toBeUndefined();
    expect(transform("POST", "/api/v1/assets/scan/token").schema.headers).toBeUndefined();
    expect(transform("POST", "/api/v1/assets/licenses/validate").schema.headers).toBeUndefined();
    expect(transform("POST", "/api/v1/auth/login").schema.headers).toBeUndefined();
  });
});
