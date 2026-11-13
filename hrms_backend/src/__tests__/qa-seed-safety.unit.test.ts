import { describe, expect, it, vi } from "vitest";
import {
  ensureQaAdminCompanyContext,
  requireQaPersonaIdentity,
  requireQaSeedTarget,
  rethrowAfterQaSeedRollback,
  runGuardedQaSeed,
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

  it("reuses an existing active Admin company context without rewriting seed state", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        company_id: "company-default",
        company_slug: "hawkaii-hrms",
        company_status: "active",
      }],
    });

    await expect(ensureQaAdminCompanyContext({ query }, {
      adminUserId: "admin-id",
      companyId: "company-default",
      preferenceId: "preference-id",
    })).resolves.toBe("company-default");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("refuses to adopt a foreign active Admin company preference", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        company_id: "foreign-company",
        company_slug: "foreign-company",
        company_status: "active",
      }],
    });

    await expect(ensureQaAdminCompanyContext({ query }, {
      adminUserId: "admin-id",
      companyId: "company-default",
      preferenceId: "preference-id",
    })).rejects.toThrow(/does not exactly match the deterministic QA company/);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("idempotently bootstraps a fresh QA company and release Admin preference", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ company_id: "company-default" }] });

    await expect(ensureQaAdminCompanyContext({ query }, {
      adminUserId: "admin-id",
      companyId: "company-default",
      preferenceId: "preference-id",
    })).resolves.toBe("company-default");
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[1]?.[0]).toContain("FOR UPDATE");
    expect(query.mock.calls[1]?.[1]).toEqual(["hawkaii-hrms"]);
    expect(query.mock.calls[2]?.[0]).toContain("INSERT INTO platform.company_profiles");
    expect(query.mock.calls[2]?.[1]).toEqual(["company-default", "hawkaii-hrms"]);
    expect(query.mock.calls[3]?.[0]).toContain("ON CONFLICT (user_id) DO NOTHING");
    expect(query.mock.calls[3]?.[1]).toEqual(["preference-id", "admin-id", "company-default"]);
  });

  it.each(["active", "inactive"])(
    "refuses to adopt or reactivate a %s same-slug foreign company",
    async (status) => {
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "foreign-company", status }] });

      await expect(ensureQaAdminCompanyContext({ query }, {
        adminUserId: "admin-id",
        companyId: "company-default",
        preferenceId: "preference-id",
      })).rejects.toThrow(/company slug that does not exactly match/);
      expect(query).toHaveBeenCalledTimes(2);
    },
  );

  it("fails closed if the deterministic preference cannot be verified", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "company-default", status: "active" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(ensureQaAdminCompanyContext({ query }, {
      adminUserId: "admin-id",
      companyId: "company-default",
      preferenceId: "preference-id",
    })).rejects.toThrow(/could not establish the exact deterministic Admin company context/);
    expect(query).toHaveBeenCalledTimes(4);
  });

  it("preserves a forced seed mutation error even when rollback also fails", async () => {
    const primary = new Error("forced seed mutation failure");
    const rollback = new Error("rollback connection failure");
    const query = vi.fn().mockRejectedValue(rollback);

    await expect(rethrowAfterQaSeedRollback({ query }, primary)).rejects.toBe(primary);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("guards the composite QA seed before either mutation phase starts", async () => {
    const calls: string[] = [];
    await expect(
      runGuardedQaSeed(
        { ...safe, APP_ENV: "production" },
        {
          releaseSeed: async () => calls.push("release"),
          extrasSeed: async () => calls.push("extras"),
        },
      ),
    ).rejects.toThrow(/only isolated local or QA/);
    expect(calls).toEqual([]);
  });

  it("runs the guarded release seed before QA extras on an approved target", async () => {
    const calls: string[] = [];
    await runGuardedQaSeed(safe, {
      releaseSeed: async () => calls.push("release"),
      extrasSeed: async () => calls.push("extras"),
    });
    expect(calls).toEqual(["release", "extras"]);
  });
});
