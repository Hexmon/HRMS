import { describe, expect, it, vi } from "vitest";
import { pathToFileURL } from "node:url";
import { requireLocalTestEnvironment, runProbeCli } from "../../../qa-artifacts/hrms/discovery-2026-11-09/disposable-probe-guard.js";

const local = {
  TEST_DATABASE_URL: "postgresql://local:sample@127.0.0.1:55432/hrms_platform_test",
  VALKEY_URL: "redis://127.0.0.1:56379",
  APP_ENV: "local",
  EMAIL_DELIVERY_MODE: "log",
  CLOUDINARY_MOCK_UPLOADS: "true"
};

describe("disposable asset probe guard", () => {
  it("accepts only the configured disposable local services", () => {
    expect(() => requireLocalTestEnvironment(local)).not.toThrow();
  });

  it.each([
    "?host=remote.example",
    "?port=5432",
    "#host=remote.example"
  ])("rejects database URL suffix %s before any reset", (suffix) => {
    expect(() => requireLocalTestEnvironment({
      ...local,
      TEST_DATABASE_URL: `${local.TEST_DATABASE_URL}${suffix}`
    })).toThrow(/Refusing non-disposable TEST_DATABASE_URL/);
  });

  it("rejects a Valkey URL override and unsafe delivery mode", () => {
    expect(() => requireLocalTestEnvironment({
      ...local,
      VALKEY_URL: `${local.VALKEY_URL}?host=remote.example`
    })).toThrow(/Refusing non-local VALKEY_URL/);
    expect(() => requireLocalTestEnvironment({
      ...local,
      EMAIL_DELIVERY_MODE: "send"
    })).toThrow(/Refusing non-local application delivery configuration/);
  });

  it("rejects malformed URLs before evaluating any target", () => {
    expect(() => requireLocalTestEnvironment({
      ...local,
      TEST_DATABASE_URL: "postgresql://local:sample@[::1/hrms_platform_test"
    })).toThrow(/Refusing invalid local probe URL/);
    expect(() => requireLocalTestEnvironment({ ...local, TEST_DATABASE_URL: undefined }))
      .toThrow(/Refusing invalid local probe URL/);
    expect(() => requireLocalTestEnvironment({ ...local, VALKEY_URL: undefined }))
      .toThrow(/Refusing invalid local probe URL/);
  });

  it("runs only a matching CLI module and reports success or failure", async () => {
    const executable = "/tmp/synthetic-probe.ts";
    expect(await runProbeCli("file:///different.ts", executable, async () => undefined)).toBe(false);
    expect(await runProbeCli(pathToFileURL(executable).href, undefined, async () => undefined)).toBe(false);
    expect(await runProbeCli(pathToFileURL(executable).href, executable, async () => undefined)).toBe(true);
    const messages: string[] = [];
    const exitCodes: number[] = [];
    expect(await runProbeCli(pathToFileURL(executable).href, executable, async () => {
      throw "synthetic failure";
    }, {
      stderr: { write: (value) => { messages.push(String(value)); return true; } },
      setExitCode: (code) => { exitCodes.push(code); }
    })).toBe(false);
    expect(messages).toEqual(["synthetic failure\n"]);
    expect(exitCodes).toEqual([1]);
    await runProbeCli(pathToFileURL(executable).href, executable, async () => {
      throw new Error("error object");
    }, {
      stderr: { write: (value) => { messages.push(String(value)); return true; } },
      setExitCode: (code) => { exitCodes.push(code); }
    });
    expect(messages.at(-1)).toBe("error object\n");
    const priorExitCode = process.exitCode;
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await runProbeCli(pathToFileURL(executable).href, executable, async () => {
        throw new Error("default output");
      });
      expect(process.exitCode).toBe(1);
      expect(stderr).toHaveBeenCalledWith("default output\n");
    } finally {
      process.exitCode = priorExitCode;
      stderr.mockRestore();
    }
  });
});
