import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { holidays } from "../schema.js";

describe("holiday Drizzle schema", () => {
  it("keeps company ownership required and exposes the active-row uniqueness index", () => {
    const config = getTableConfig(holidays);
    const companyId = config.columns.find((column) => column.name === "company_id");
    const uniqueIndex = config.indexes.find(
      (candidate) => candidate.config.name === "holidays_company_region_date_name_uq",
    );

    expect(companyId?.notNull).toBe(true);
    expect(uniqueIndex?.config.unique).toBe(true);
    expect(uniqueIndex?.config.columns).toHaveLength(4);
    expect(uniqueIndex?.config.where).toBeDefined();
  });
});
