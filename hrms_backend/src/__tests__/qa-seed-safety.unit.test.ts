import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ensureQaAdminCompanyContext,
  requireQaPersonaIdentity,
  requireQaSeedTarget,
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
    const query = vi.fn().mockResolvedValue({ rows: [{ company_id: "company-existing" }] });

    await expect(ensureQaAdminCompanyContext({ query }, {
      adminUserId: "admin-id",
      companyId: "company-default",
      preferenceId: "preference-id",
    })).resolves.toBe("company-existing");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("idempotently bootstraps a fresh QA company and release Admin preference", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "company-default" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(ensureQaAdminCompanyContext({ query }, {
      adminUserId: "admin-id",
      companyId: "company-default",
      preferenceId: "preference-id",
    })).resolves.toBe("company-default");
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1]?.[0]).toContain("ON CONFLICT (company_slug) DO UPDATE");
    expect(query.mock.calls[1]?.[1]).toEqual(["company-default"]);
    expect(query.mock.calls[2]?.[0]).toContain("ON CONFLICT (user_id) DO UPDATE");
    expect(query.mock.calls[2]?.[1]).toEqual(["preference-id", "admin-id", "company-default"]);
  });

  it("fails before creating a preference when the company upsert returns no identity", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(ensureQaAdminCompanyContext({ query }, {
      adminUserId: "admin-id",
      companyId: "company-default",
      preferenceId: "preference-id",
    })).rejects.toThrow(/could not create or recover its default company/);
    expect(query).toHaveBeenCalledTimes(2);
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

describe("Docker QA seed entrypoint", () => {
  const compose = readFileSync(
    new URL("../../infra/docker/docker-compose.qa.yml", import.meta.url),
    "utf8",
  );
  const migrateService = compose.match(
    /  hawkaii-hrms-migrate:\n(?<body>[\s\S]*?)(?=\n  hawkaii-hrms-api:)/u,
  )?.groups?.body;

  it("guards the composite seed before either seed phase can mutate QA data", () => {
    expect(migrateService).toBeDefined();
    expect(migrateService).toContain('HRMS_QA_SEED_ALLOW: "true"');
    expect(migrateService).toContain("HRMS_QA_SEED_CONFIRM_DATABASE: hrms_platform_qa");
    expect(migrateService).toContain(
      'command: ["sh", "-lc", "pnpm db:migrate && pnpm qa:seed"]',
    );
    expect(migrateService).not.toContain("pnpm release:seed");
    expect(migrateService).not.toContain("pnpm qa:seed:extras");
  });

  it("does not expose the seed mutation opt-in to long-running QA services", () => {
    expect(compose).toContain("  APP_ENV: qa");
    expect(compose.match(/HRMS_QA_SEED_ALLOW/gu)).toHaveLength(1);
    expect(compose.match(/HRMS_QA_SEED_CONFIRM_DATABASE/gu)).toHaveLength(1);
  });
});
