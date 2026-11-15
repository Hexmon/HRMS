import { describe, expect, it, vi } from "vitest";

type ProbeMain = (...arguments_: unknown[]) => Promise<void>;
type ProbeRun = (...arguments_: unknown[]) => Promise<Record<string, unknown>>;
interface MultiInstanceProbeDependencies {
  requireEnvironment: (...arguments_: unknown[]) => void;
  buildPrimary: (...arguments_: unknown[]) => Promise<unknown>;
  buildSecondary: (...arguments_: unknown[]) => Promise<unknown>;
  login: (...arguments_: unknown[]) => Promise<unknown>;
  header: (...arguments_: unknown[]) => Record<string, string>;
  employeeId: string;
}

const adminProbe = await import(new URL("../../../qa-artifacts/hrms/discovery-2026-11-09/admin-settings-cross-company-probe.ts", import.meta.url).href) as {
  main: ProbeMain;
  requireAdminProbeFixture: <T>(value: T | undefined, message?: string) => T;
  requireProbeHttpSuccess: (label: string, statusCode: number) => void;
  requireSharedSettingsReproduction: (reproduced: boolean) => void;
  runAdminSettingsCrossCompanyProbe: ProbeRun;
};
const multiInstanceProbe = await import(new URL("../../../qa-artifacts/hrms/discovery-2026-11-09/multi-instance-asset-probe.ts", import.meta.url).href) as {
  main: ProbeMain;
  runMultiInstanceAssetProbe: ProbeRun;
};
const tenantProbe = await import(new URL("../../../qa-artifacts/hrms/discovery-2026-11-09/tenant-boundary-probe.ts", import.meta.url).href) as {
  main: ProbeMain;
  requireTenantProbeFixture: <T>(value: T | undefined, message: string) => T;
  runTenantBoundaryProbe: ProbeRun;
};
const { main: adminMain, requireAdminProbeFixture, requireProbeHttpSuccess,
  requireSharedSettingsReproduction, runAdminSettingsCrossCompanyProbe } = adminProbe;
const { main: multiInstanceMain, runMultiInstanceAssetProbe } = multiInstanceProbe;
const { main: tenantMain, requireTenantProbeFixture, runTenantBoundaryProbe } = tenantProbe;

describe("isolated historical discovery probes", () => {
  function multiInstanceFixture(options: { assignStatus?: number; createStatus?: number; mismatched?: boolean; missingCount?: boolean } = {}) {
    const employeeId = "employee-1";
    const assetA = { id: "asset-1", version: 1 };
    const assetB = { id: "asset-1", version: options.mismatched ? 2 : 1 };
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("count(*)")
      ? (options.missingCount ? [] : [{ count: "1" }])
      : [{ status: "ASSIGNED", version: 2, current_assigned_user_id: employeeId }] }));
    const primary = {
      ready: vi.fn(async () => undefined), close: vi.fn(async () => undefined),
      inject: vi.fn(async () => ({ statusCode: options.assignStatus ?? 200 })),
      store: { assets: [assetA], pgPool: { query } },
    };
    const secondary = {
      ready: vi.fn(async () => undefined), close: vi.fn(async () => undefined),
      inject: vi.fn(async () => ({ statusCode: options.createStatus ?? 200 })),
      store: { assets: [assetB] },
    };
    const dependencies = {
      requireEnvironment: vi.fn(),
      buildPrimary: vi.fn(async () => primary),
      buildSecondary: vi.fn(async () => secondary),
      login: vi.fn(async () => ({ token: "synthetic" })),
      header: vi.fn(() => ({ authorization: "Bearer synthetic" })),
      employeeId,
    } as unknown as MultiInstanceProbeDependencies;
    return { dependencies, primary, secondary };
  }

  it("reproduces the admin setting boundary only through in-memory injection", async () => {
    const result = await runAdminSettingsCrossCompanyProbe();
    expect(result).toMatchObject({
      environment: expect.stringContaining("in-memory Fastify inject"),
      company_b_update_status: 200,
      company_a_read_status: 200,
      company_a_observed_b_change: true,
    });
  });

  it("reports every admin probe precondition and observation failure explicitly", () => {
    expect(requireAdminProbeFixture({ id: "company" })).toEqual({ id: "company" });
    expect(() => requireAdminProbeFixture(undefined)).toThrow("Synthetic Admin/company fixture missing");
    expect(() => requireAdminProbeFixture(undefined, "custom fixture missing")).toThrow("custom fixture missing");
    expect(() => requireProbeHttpSuccess("B read", 200)).not.toThrow();
    expect(() => requireProbeHttpSuccess("B update", 409)).toThrow("B update failed: 409");
    expect(() => requireSharedSettingsReproduction(true)).not.toThrow();
    expect(() => requireSharedSettingsReproduction(false)).toThrow("Global settings sharing was not reproduced");
  });

  it("reports remediated asset fencing while preserving other tenant-boundary observations", async () => {
    const result = await runTenantBoundaryProbe();
    expect(result).toMatchObject({
      environment: expect.stringContaining("no external services"),
      company_b_asset_list_status: 200,
      company_b_list_contains_company_a_asset: false,
      company_b_company_a_helpdesk_detail_status: 200,
      company_b_company_a_project_detail_status: 200,
      company_b_shared_security_settings_status: 200,
    });
  });

  it("reports tenant fixture failures before a probe app can start", () => {
    expect(requireTenantProbeFixture({ id: "fixture" }, "missing")).toEqual({ id: "fixture" });
    expect(() => requireTenantProbeFixture(undefined, "Synthetic role preference missing"))
      .toThrow("Synthetic role preference missing");
  });

  it("refuses the multi-instance probe before opening any service", async () => {
    const fixture = multiInstanceFixture();
    fixture.dependencies.requireEnvironment = () => { throw new Error("Refusing invalid local probe URL"); };
    await expect(runMultiInstanceAssetProbe({}, fixture.dependencies)).rejects.toThrow("Refusing invalid local probe URL");
    expect(fixture.dependencies.buildPrimary).not.toHaveBeenCalled();
  });

  it("models two instances with injected stores and no database or network", async () => {
    const fixture = multiInstanceFixture();
    const result = await runMultiInstanceAssetProbe({}, fixture.dependencies);
    expect(result).toMatchObject({
      first_http_status: 200,
      after_first_status: "ASSIGNED",
      after_first_version: 2,
      after_first_assignee_matches: true,
      second_http_status: 200,
      after_second_assignee_matches: true,
      assignment_rows_after_second: 1,
    });
    expect(fixture.primary.close).toHaveBeenCalledOnce();
    expect(fixture.secondary.close).toHaveBeenCalledOnce();
    const output: string[] = [];
    const formatted = multiInstanceFixture();
    await multiInstanceMain({}, formatted.dependencies, {
      write: (value: unknown) => { output.push(String(value)); return true; }
    });
    expect(JSON.parse(output.join(""))).toMatchObject({ assignment_rows_after_second: 1 });

    const missingCount = multiInstanceFixture({ missingCount: true });
    await expect(runMultiInstanceAssetProbe({}, missingCount.dependencies)).resolves.toMatchObject({
      assignment_rows_after_second: 0,
    });
  });

  it("fails closed on mismatched versions and mutation failures while closing created apps", async () => {
    const mismatched = multiInstanceFixture({ mismatched: true });
    await expect(runMultiInstanceAssetProbe({}, mismatched.dependencies)).rejects.toThrow("same synthetic asset version");
    expect(mismatched.primary.close).toHaveBeenCalledOnce();
    expect(mismatched.secondary.close).toHaveBeenCalledOnce();

    const assignFailure = multiInstanceFixture({ assignStatus: 409 });
    await expect(runMultiInstanceAssetProbe({}, assignFailure.dependencies)).rejects.toThrow("First mutation failed: HTTP 409");
    const createFailure = multiInstanceFixture({ createStatus: 503 });
    await expect(runMultiInstanceAssetProbe({}, createFailure.dependencies)).rejects.toThrow("Second mutation failed: HTTP 503");
  });

  it("formats the safe in-memory probes for their CLI boundary", async () => {
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await adminMain();
      await tenantMain();
      expect(output).toHaveBeenCalledTimes(2);
      expect(output.mock.calls.map(([value]) => String(value)).join("\n")).toContain("company_a_observed_b_change");
    } finally {
      output.mockRestore();
    }
  });
});
