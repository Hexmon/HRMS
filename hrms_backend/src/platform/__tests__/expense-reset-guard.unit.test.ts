import { describe, expect, it } from "vitest";
import { resetPostgresDatabase } from "../postgres-data-store.js";

describe("direct PostgreSQL test reset guard", () => {
  it("rejects remote, production-named and URI-override targets before connecting", async () => {
    for (const url of [
      "postgresql://user:pass@neon.example/hrms_expense_test",
      "postgresql://user:pass@127.0.0.1:55432/hrms_production",
      "postgresql://user:pass@127.0.0.1:55432/hrms_expense_test?host=neon.example",
      "postgresql://user:pass@127.0.0.1:55432/hrms_expense_test#override",
    ]) {
      await expect(resetPostgresDatabase(url)).rejects.toThrow("Refusing to reset");
    }
  });
});
