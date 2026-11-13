import { describe, expect, it } from "vitest";
import {
  requireQaPersonaIdentity,
  requireQaSeedTarget,
} from "../../scripts/qa-seed-safety.js";

const safe = {
  APP_ENV: "local",
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://qa:sample@127.0.0.1:55434/hrms_holiday_qa",
  HRMS_QA_SEED_ALLOW: "true",
  HRMS_QA_SEED_CONFIRM_DATABASE: "hrms_holiday_qa",
};

describe("QA seed target guard", () => {
  it("accepts an explicitly confirmed isolated local database", () => {
    expect(requireQaSeedTarget(safe).pathname).toBe("/hrms_holiday_qa");
  });

  it.each([
    [{ ...safe, APP_ENV: "production" }, /only isolated local or QA/],
    [{ ...safe, HRMS_QA_SEED_ALLOW: undefined }, /explicit mutation opt-in/],
    [{ ...safe, HRMS_QA_SEED_CONFIRM_DATABASE: "another_database" }, /exactly match/],
    [{ ...safe, DATABASE_URL: "postgresql://qa:sample@db.example/hrms_holiday_qa" }, /refused remote database/],
  ])("rejects an unsafe target %#", (env, message) => {
    expect(() => requireQaSeedTarget(env)).toThrow(message);
  });

  it("allows an explicitly confirmed remote QA database but never production", () => {
    expect(
      requireQaSeedTarget({
        ...safe,
        APP_ENV: "qa",
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://qa:sample@qa-db.example/hrms_qa",
        HRMS_QA_SEED_CONFIRM_DATABASE: "hrms_qa",
      }).hostname,
    ).toBe("qa-db.example");
  });

  it("accepts the deterministic persona identity returned by the database", () => {
    expect(() => requireQaPersonaIdentity("persona-id", "persona-id", "HRM")).not.toThrow();
  });

  it("rejects an employee-code collision before dependent records are written", () => {
    expect(() => requireQaPersonaIdentity("persona-id", "existing-id", "HRM")).toThrow(
      /employee-code collision for HRM/,
    );
    expect(() => requireQaPersonaIdentity(null, undefined, "HRM")).toThrow(
      /employee-code collision for HRM/,
    );
  });
});
