import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  prepareCloudflareConfig,
  runPrepareCloudflareConfig,
} from "./cloudflare-deploy-config.js";

const source = () => JSON.parse(readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8"));
const valid = {
  environment: "dev" as const,
  state: "active" as const,
  hyperdriveId: "12345678-1234-1234-1234-123456789abc",
  bucketName: "hawkaii-hrms-media-development",
};

describe("Cloudflare deployment configuration", () => {
  it("injects only the selected environment Hyperdrive and private media bucket", () => {
    for (const environment of ["dev", "qa", "production"] as const) {
      const original = source();
      const otherBuckets = Object.fromEntries(
        Object.entries(original.env)
          .filter(([name]) => name !== environment)
          .map(([name, target]: [string, any]) => [name, target.r2_buckets[0].bucket_name]),
      );
      const config: any = prepareCloudflareConfig(original, {
        ...valid,
        environment,
        bucketName: `hawkaii-hrms-media-${environment}`,
      });

      expect(config.env[environment].hyperdrive[0].id).toBe(valid.hyperdriveId);
      expect(config.env[environment].r2_buckets[0].bucket_name).toBe(`hawkaii-hrms-media-${environment}`);
      expect(config.env[environment].vars.WORKER_ACTIVE).toBe("true");
      for (const [name, bucketName] of Object.entries(otherBuckets)) {
        expect(config.env[name].r2_buckets[0].bucket_name).toBe(bucketName);
      }
    }
  });

  it("keeps inactive deployment fail closed and writes the generated config", () => {
    const root = mkdtempSync(join(tmpdir(), "hrms-cf-config-"));
    writeFileSync(join(root, "wrangler.jsonc"), JSON.stringify(source()));

    const output = runPrepareCloudflareConfig(
      ["dev", "inactive"],
      { HRMS_HYPERDRIVE_ID: valid.hyperdriveId, R2_BUCKET_NAME: valid.bucketName },
      root,
    );
    const config: any = JSON.parse(readFileSync(output, "utf8"));
    expect(config.env.dev.vars.WORKER_ACTIVE).toBe("false");
    expect(config.env.dev.r2_buckets[0].bucket_name).toBe(valid.bucketName);
    expect(config.main).toBe("../src/workers/cloudflare-worker.ts");
    expect(config.$schema).toBe("../node_modules/wrangler/config-schema.json");
  });

  it("enforces the exact 3-63 character bucket-name boundary", () => {
    for (const bucketName of [undefined, "replace-with-private-development-bucket", "Invalid_Bucket", "a", "ab", "a".repeat(64)]) {
      expect(() => prepareCloudflareConfig(source(), { ...valid, bucketName })).toThrow(
        /R2_BUCKET_NAME must be the real/,
      );
    }
    for (const bucketName of ["abc", "a".repeat(63)]) {
      expect((prepareCloudflareConfig(source(), { ...valid, bucketName }) as any)
        .env.dev.r2_buckets[0].bucket_name).toBe(bucketName);
    }
  });

  it("rejects invalid command input and Hyperdrive identifiers", () => {
    expect(() => runPrepareCloudflareConfig([], {}, "/tmp/not-used")).toThrow(
      "Usage: tsx src/workers/cloudflare-deploy-config-cli.ts <dev|qa|production> <inactive|active>",
    );
    expect(() => prepareCloudflareConfig(source(), { ...valid, state: "paused" as "active" })).toThrow(
      /Environment and state/,
    );
    expect(() => prepareCloudflareConfig(source(), { ...valid, hyperdriveId: undefined })).toThrow(
      /HRMS_HYPERDRIVE_ID/,
    );
    expect(() => prepareCloudflareConfig(source(), { ...valid, hyperdriveId: "00000000-0000-0000-0000-000000000000" })).toThrow(
      /HRMS_HYPERDRIVE_ID/,
    );
  });

  it("requires exact named Hyperdrive and MEDIA_BUCKET bindings", () => {
    const incomplete = source();
    delete incomplete.env.dev.vars;
    expect(() => prepareCloudflareConfig(incomplete, valid)).toThrow(/Missing Wrangler configuration/);

    const missingHyperdrive = source();
    missingHyperdrive.env.dev.hyperdrive = [];
    expect(() => prepareCloudflareConfig(missingHyperdrive, valid)).toThrow(/exactly one HYPERDRIVE/);

    const absentHyperdrive = source();
    delete absentHyperdrive.env.dev.hyperdrive;
    expect(() => prepareCloudflareConfig(absentHyperdrive, valid)).toThrow(/exactly one HYPERDRIVE/);

    const misnamedHyperdrive = source();
    misnamedHyperdrive.env.dev.hyperdrive[0].binding = "OTHER";
    expect(() => prepareCloudflareConfig(misnamedHyperdrive, valid)).toThrow(/exactly one HYPERDRIVE/);

    const duplicateHyperdrive = source();
    duplicateHyperdrive.env.dev.hyperdrive.push({ ...duplicateHyperdrive.env.dev.hyperdrive[0] });
    expect(() => prepareCloudflareConfig(duplicateHyperdrive, valid)).toThrow(/exactly one HYPERDRIVE/);

    const reorderedHyperdrive = source();
    reorderedHyperdrive.env.dev.hyperdrive.unshift({ binding: "OTHER", id: "preserve-me" });
    const reorderedResult: any = prepareCloudflareConfig(reorderedHyperdrive, valid);
    expect(reorderedResult.env.dev.hyperdrive).toEqual([
      { binding: "OTHER", id: "preserve-me" },
      { binding: "HYPERDRIVE", id: valid.hyperdriveId },
    ]);

    const missing = source();
    missing.env.dev.r2_buckets = [];
    expect(() => prepareCloudflareConfig(missing, valid)).toThrow(/exactly one MEDIA_BUCKET/);

    const absent = source();
    delete absent.env.dev.r2_buckets;
    expect(() => prepareCloudflareConfig(absent, valid)).toThrow(/exactly one MEDIA_BUCKET/);

    const duplicate = source();
    duplicate.env.dev.r2_buckets.push({ ...duplicate.env.dev.r2_buckets[0] });
    expect(() => prepareCloudflareConfig(duplicate, valid)).toThrow(/exactly one MEDIA_BUCKET/);
  });
});
