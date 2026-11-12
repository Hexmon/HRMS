import { afterEach, describe, expect, it, vi } from "vitest";

const runPrepareCloudflareConfig = vi.fn(() => "/tmp/deploy-config.json");

vi.mock("./cloudflare-deploy-config.js", () => ({ runPrepareCloudflareConfig }));

describe("Cloudflare deployment configuration CLI", () => {
  const originalArgv = [...process.argv];

  afterEach(() => {
    process.argv = [...originalArgv];
    vi.restoreAllMocks();
  });

  it("passes the selected environment and process configuration to the validated generator", async () => {
    process.argv = [originalArgv[0]!, originalArgv[1]!, "qa", "inactive"];
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("./cloudflare-deploy-config-cli.js");

    expect(runPrepareCloudflareConfig).toHaveBeenCalledOnce();
    expect(runPrepareCloudflareConfig).toHaveBeenCalledWith(
      ["qa", "inactive"],
      process.env,
      expect.stringMatching(/hrms_backend$/u),
    );
    expect(log).toHaveBeenCalledWith("Prepared qa Worker deployment in inactive state.");
  });
});
