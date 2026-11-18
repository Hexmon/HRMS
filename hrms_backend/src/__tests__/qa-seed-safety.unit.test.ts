import { describe, expect, it, vi } from "vitest";
import { Roles } from "#shared";
import {
  ensureQaAdminCompanyContext,
  ensureQaPersonaCompanyContexts,
  preflightQaAdminCompanyContext,
  requireQaPersonaIdentity,
  requireQaSeedTarget,
  requireQaTenantAdminIdentity,
  rethrowAfterQaSeedRollback,
  runGuardedQaSeed,
  verifyQaSeedDatabaseIdentity,
} from "../../scripts/qa-seed-safety.js";
import {
  ensureReleaseBuiltinRoles,
  verifyReleasePersonaIdentity,
} from "../../scripts/release-seed-support.js";

const safe = {
  APP_ENV: "local",
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://qa:sample@127.0.0.1:55434/hrms_holiday_qa",
  HRMS_QA_SEED_ALLOW: "true",
  HRMS_QA_SEED_CONFIRM_DATABASE: "hrms_holiday_qa",
};

const personaIdentity = {
  employeeCode: "ADM",
  email: "admin@example.test",
};

describe("QA seed target guard", () => {
  it("accepts an explicitly confirmed isolated local database", () => {
    expect(requireQaSeedTarget(safe).pathname).toBe("/hrms_holiday_qa");
    expect(
      requireQaSeedTarget({ ...safe, APP_ENV: "development" }).pathname,
    ).toBe("/hrms_holiday_qa");
  });

  it.each([
    [{ ...safe, APP_ENV: "production" }, /only isolated local or QA/],
    [{ ...safe, HRMS_QA_SEED_ALLOW: undefined }, /explicit mutation opt-in/],
    [{ ...safe, HRMS_QA_SEED_CONFIRM_DATABASE: "another_database" }, /exactly match/],
    [{ ...safe, DATABASE_URL: "postgresql://qa:sample@db.example/hrms_holiday_qa" }, /refused remote database/],
    [{
      ...safe,
      APP_ENV: "development",
      DATABASE_URL: "postgresql://qa:sample@dev-db.example/hrms_holiday_qa",
    }, /refused remote database/],
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

  it("requires a database-resident identity marker before seeding remote QA", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ database_name: "hrms_qa", database_marker: "hawkaii-qa:qa-project-42" }],
    });
    await expect(verifyQaSeedDatabaseIdentity({ query }, {
      ...safe,
      APP_ENV: "qa",
      HRMS_QA_SEED_CONFIRM_DATABASE: "hrms_qa",
      HRMS_QA_SEED_DATABASE_FINGERPRINT: "qa-project-42",
    })).resolves.toBeUndefined();
    await expect(verifyQaSeedDatabaseIdentity({ query }, {
      ...safe,
      APP_ENV: "qa",
      HRMS_QA_SEED_CONFIRM_DATABASE: "hrms_qa",
    })).rejects.toThrow(/requires HRMS_QA_SEED_DATABASE_FINGERPRINT/);
  });

  it("rejects remote QA when the database marker or database name differs", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ database_name: "production", database_marker: "hawkaii-qa:another-project" }],
    });
    await expect(verifyQaSeedDatabaseIdentity({ query }, {
      ...safe,
      APP_ENV: "qa",
      HRMS_QA_SEED_CONFIRM_DATABASE: "hrms_qa",
      HRMS_QA_SEED_DATABASE_FINGERPRINT: "qa-project-42",
    })).rejects.toThrow(/independently provisioned QA marker/);
  });

  it("does not require a hosted marker for an isolated local database", async () => {
    const query = vi.fn();
    await expect(verifyQaSeedDatabaseIdentity({ query }, safe)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
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

  it("accepts only an unused or exact deterministic tenant Admin identity", () => {
    const expected = {
      userId: "tenant-admin",
      companyId: "tenant-b",
      employeeCode: "QBADM",
      email: "admin.tenant-b@example.test",
    };
    expect(() => requireQaTenantAdminIdentity([], expected)).not.toThrow();
    expect(() => requireQaTenantAdminIdentity([{
      id: expected.userId,
      employee_code: expected.employeeCode,
      email: expected.email.toUpperCase(),
      company_id: null,
      active_role: null,
    }], expected)).not.toThrow();
    expect(() => requireQaTenantAdminIdentity([{
      id: expected.userId,
      employee_code: expected.employeeCode,
      email: expected.email,
      company_id: expected.companyId,
      active_role: Roles.Admin,
    }], expected)).not.toThrow();
  });

  it("seeds every builtin role idempotently", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) =>
      sql.includes("SELECT role_key, status, builtin, deleted_at")
        ? {
            rows: [
              {
                role_key: values?.[0],
                status: "active",
                builtin: true,
                deleted_at: null,
              },
            ],
          }
        : { rows: [] },
    );
    await ensureReleaseBuiltinRoles({ query: query as never });
    expect(query).toHaveBeenCalledTimes(Object.values(Roles).length * 2);
    expect(query.mock.calls[0]?.[0]).toContain(
      "ON CONFLICT (role_key) DO NOTHING",
    );
    expect(query.mock.calls[1]?.[0]).toContain("FOR UPDATE");
  });

  it.each([
    ["inactive", { status: "inactive", builtin: true, deleted_at: null }],
    ["deleted", { status: "active", builtin: true, deleted_at: "deleted" }],
    ["custom", { status: "active", builtin: false, deleted_at: null }],
  ])("refuses an existing %s builtin-role collision", async (_label, state) => {
    const query = vi.fn(async (sql: string, values?: unknown[]) =>
      sql.includes("SELECT role_key, status, builtin, deleted_at")
        ? { rows: [{ role_key: values?.[0], ...state }] }
        : { rows: [] },
    );
    await expect(
      ensureReleaseBuiltinRoles({ query: query as never }),
    ).rejects.toThrow(
      /inactive, deleted, or non-builtin role collision/,
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "employee code",
      [{ id: "foreign", employee_code: "ADM", email: "admin@example.test" }],
    ],
    [
      "user ID",
      [{ id: "user-a", employee_code: "FOREIGN", email: "foreign@example.test" }],
    ],
    [
      "email",
      [{ id: "foreign", employee_code: "FOREIGN", email: "admin@example.test" }],
    ],
  ])("refuses a release persona %s collision", async (_label, rows) => {
    const query = vi.fn().mockResolvedValue({ rows });
    await expect(
      verifyReleasePersonaIdentity({ query }, {
        userId: "user-a",
        employeeCode: personaIdentity.employeeCode,
        email: personaIdentity.email,
      }),
    ).rejects.toThrow(/identity collision for ADM/);
  });

  it("accepts one exact release persona identity without mutation", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "user-a",
          employee_code: personaIdentity.employeeCode,
          email: personaIdentity.email.toUpperCase(),
        },
      ],
    });
    await expect(
      verifyReleasePersonaIdentity({ query }, {
        userId: "user-a",
        employeeCode: personaIdentity.employeeCode,
        email: personaIdentity.email,
      }),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("does no persona-context work for an empty seed set", async () => {
    const query = vi.fn();
    await expect(
      ensureQaPersonaCompanyContexts({ query }, "company-a", []),
    ).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    [
      "user IDs",
      [
        {
          ...personaIdentity,
          userId: "user-a",
          preferenceId: "preference-a",
          activeRole: Roles.Admin,
        },
        {
          ...personaIdentity,
          userId: "user-a",
          preferenceId: "preference-b",
          activeRole: Roles.Employee,
        },
      ],
    ],
    [
      "preference IDs",
      [
        {
          ...personaIdentity,
          userId: "user-a",
          preferenceId: "preference-a",
          activeRole: Roles.Admin,
        },
        {
          ...personaIdentity,
          userId: "user-b",
          preferenceId: "preference-a",
          activeRole: Roles.Employee,
        },
      ],
    ],
  ])(
    "rejects duplicate persona %s before querying",
    async (_label, contexts) => {
      const query = vi.fn();
      await expect(
        ensureQaPersonaCompanyContexts({ query }, "company-a", contexts),
      ).rejects.toThrow(/require unique users and preference IDs/);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it("rejects a persona without the expected active registered role", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "company-a" }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      ensureQaPersonaCompanyContexts({ query }, "company-a", [
        {
          ...personaIdentity,
          userId: "user-a",
          preferenceId: "preference-a",
          activeRole: Roles.Admin,
        },
      ]),
    ).rejects.toThrow(/without the expected active identity and role assignment/);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each(["missing", "inactive"])(
    "refuses a %s persona company before any user or preference query",
    async () => {
      const query = vi.fn().mockResolvedValueOnce({ rows: [] });
      await expect(
        ensureQaPersonaCompanyContexts({ query }, "company-a", [
          {
            ...personaIdentity,
            userId: "user-a",
            preferenceId: "preference-a",
            activeRole: Roles.Admin,
          },
        ]),
      ).rejects.toThrow(/missing or inactive persona company context/);
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0]?.[0]).toContain("FOR SHARE");
    },
  );

  it("inserts a missing exact persona context and verifies the durable row", async () => {
    const context = {
      ...personaIdentity,
      userId: "user-a",
      preferenceId: "preference-a",
      activeRole: Roles.Admin,
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "company-a" }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: context.userId,
          employee_code: context.employeeCode,
          email: context.email,
          role_key: context.activeRole,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: context.preferenceId,
            user_id: context.userId,
            company_id: "company-a",
            active_role: context.activeRole,
          },
        ],
      });

    await expect(
      ensureQaPersonaCompanyContexts({ query }, "company-a", [context]),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[3]?.[0]).toContain(
      "ON CONFLICT (user_id) DO NOTHING",
    );
  });

  it.each([
    [
      "identity",
      {
        id: "foreign-preference",
        company_id: "company-a",
        active_role: Roles.Admin,
      },
    ],
    [
      "company",
      { id: "preference-a", company_id: "company-b", active_role: Roles.Admin },
    ],
    [
      "role",
      {
        id: "preference-a",
        company_id: "company-a",
        active_role: Roles.Employee,
      },
    ],
  ])(
    "rejects an existing persona preference %s collision",
    async (_label, conflicting) => {
      const context = {
        ...personaIdentity,
        userId: "user-a",
        preferenceId: "preference-a",
        activeRole: Roles.Admin,
      };
      const query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: "company-a" }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: context.userId,
            employee_code: context.employeeCode,
            email: context.email,
            role_key: context.activeRole,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ user_id: context.userId, ...conflicting }],
        });

      await expect(
        ensureQaPersonaCompanyContexts({ query }, "company-a", [context]),
      ).rejects.toThrow(/preference identity, company, or role collision/);
      expect(query).toHaveBeenCalledTimes(3);
    },
  );

  it.each([
    ["missing", []],
    [
      "identity",
      [
        {
          id: "foreign-preference",
          user_id: "user-a",
          company_id: "company-a",
          active_role: Roles.Admin,
        },
      ],
    ],
    [
      "company",
      [
        {
          id: "preference-a",
          user_id: "user-a",
          company_id: "company-b",
          active_role: Roles.Admin,
        },
      ],
    ],
    [
      "role",
      [
        {
          id: "preference-a",
          user_id: "user-a",
          company_id: "company-a",
          active_role: Roles.Employee,
        },
      ],
    ],
  ])(
    "fails closed when the inserted persona preference is %s",
    async (_label, verifiedRows) => {
      const context = {
        ...personaIdentity,
        userId: "user-a",
        preferenceId: "preference-a",
        activeRole: Roles.Admin,
      };
      const query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: "company-a" }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: context.userId,
            employee_code: context.employeeCode,
            email: context.email,
            role_key: context.activeRole,
          }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: verifiedRows });

      await expect(
        ensureQaPersonaCompanyContexts({ query }, "company-a", [context]),
      ).rejects.toThrow(
        /could not establish the exact deterministic persona company context/,
      );
      expect(query).toHaveBeenCalledTimes(5);
    },
  );

  it("reuses an exact persona preference without rewriting it", async () => {
    const context = {
      ...personaIdentity,
      userId: "user-a",
      preferenceId: "preference-a",
      activeRole: Roles.Admin,
    };
    const row = {
      id: context.preferenceId,
      user_id: context.userId,
      company_id: "company-a",
      active_role: context.activeRole,
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "company-a" }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: context.userId,
          employee_code: context.employeeCode,
          email: context.email,
          role_key: context.activeRole,
        }],
      })
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [row] });

    await expect(
      ensureQaPersonaCompanyContexts({ query }, "company-a", [context]),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(4);
    expect(
      query.mock.calls.some((call) => String(call[0]).includes("INSERT INTO")),
    ).toBe(false);
  });

  it.each([
    ["foreign identity", { id: "foreign", employee_code: "QBADM", email: "admin.tenant-b@example.test", company_id: null, active_role: null }],
    ["foreign company", { id: "tenant-admin", employee_code: "QBADM", email: "admin.tenant-b@example.test", company_id: "tenant-a", active_role: Roles.Admin }],
    ["wrong role", { id: "tenant-admin", employee_code: "QBADM", email: "admin.tenant-b@example.test", company_id: "tenant-b", active_role: Roles.Employee }],
  ])("rejects a %s collision for the deterministic tenant Admin", (_label, row) => {
    expect(() => requireQaTenantAdminIdentity([row], {
      userId: "tenant-admin",
      companyId: "tenant-b",
      employeeCode: "QBADM",
      email: "admin.tenant-b@example.test",
    })).toThrow(/tenant Admin identity or company-context collision/);
  });

  it("reuses an existing active Admin company context without rewriting seed state", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        company_id: "company-default",
        company_slug: "hawkaii-hrms",
        company_status: "active",
        active_role: Roles.Admin,
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
    expect(query.mock.calls[3]?.[1]).toEqual([
      "preference-id",
      "admin-id",
      "company-default",
      Roles.Admin,
    ]);
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

  it("runs deterministic preflight before release and extras phases", async () => {
    const calls: string[] = [];
    await runGuardedQaSeed(safe, {
      preflight: async () => calls.push("preflight"),
      releaseSeed: async () => calls.push("release"),
      extrasSeed: async () => calls.push("extras"),
    });
    expect(calls).toEqual(["preflight", "release", "extras"]);
  });

  it("prevents both mutation phases when remote QA marker preflight fails", async () => {
    const calls: string[] = [];
    const remoteQa = {
      ...safe,
      APP_ENV: "qa",
      DATABASE_URL: "postgresql://qa:sample@qa-db.example/hrms_qa",
      HRMS_QA_SEED_CONFIRM_DATABASE: "hrms_qa",
      HRMS_QA_SEED_DATABASE_FINGERPRINT: "qa-project-42",
    };
    const query = vi.fn().mockResolvedValue({
      rows: [{ database_name: "hrms_qa", database_marker: "hawkaii-qa:wrong-project" }],
    });

    await expect(
      runGuardedQaSeed(remoteQa, {
        preflight: async () => {
          calls.push("preflight");
          await verifyQaSeedDatabaseIdentity({ query }, remoteQa);
        },
        releaseSeed: async () => calls.push("release"),
        extrasSeed: async () => calls.push("extras"),
      }),
    ).rejects.toThrow(/independently provisioned QA marker/);

    expect(calls).toEqual(["preflight"]);
  });

  it("rejects an inactive or non-admin preflight context", async () => {
    const inactive = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ employment_status: "inactive", deleted_at: null, company_id: null, active_role: null }] });
    await expect(preflightQaAdminCompanyContext({ query: inactive }, {
      adminUserId: "admin-id", companyId: "company-default", preferenceId: "preference-id",
    })).rejects.toThrow(/inactive or deleted/);

    const nonAdmin = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ employment_status: "active", deleted_at: null, company_id: "company-default", active_role: "employee" }] });
    await expect(preflightQaAdminCompanyContext({ query: nonAdmin }, {
      adminUserId: "admin-id", companyId: "company-default", preferenceId: "preference-id",
    })).rejects.toThrow(/non-admin or foreign/);
  });
});
