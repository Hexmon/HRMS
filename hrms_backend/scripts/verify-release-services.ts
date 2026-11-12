import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Redis as Valkey } from "iovalkey";
import { R2ObjectStorage } from "../src/platform/object-storage.js";
import { loadRuntimeEnv, requireEnv } from "./env.js";
import { fail } from "./lib.js";

loadRuntimeEnv();

const releaseDir = process.env.HRMS_REPORT_DIR ?? "docs/qa/runs/release-acceptance";
mkdirSync(releaseDir, { recursive: true });

const failures: string[] = [];
const notes: string[] = [];

const valkey = new Valkey(requireEnv("VALKEY_URL"), {
  lazyConnect: true,
  maxRetriesPerRequest: 1
});

try {
  await valkey.connect();
  const pong = await valkey.ping();
  if (pong !== "PONG") failures.push(`Valkey ping returned ${pong}`);
  const stream = "hrms.release_acceptance";
  const id = await valkey.xadd(stream, "*", "event", "release-smoke", "timestamp", new Date().toISOString());
  if (!id) {
    throw new Error("Valkey XADD returned null");
  }
  const records = await valkey.xrange(stream, id, id);
  if (records.length !== 1) failures.push("Valkey stream write/read smoke check failed");
  await valkey.del(stream);
  notes.push("Valkey ping and stream write/read passed");
} catch (error) {
  failures.push(`Valkey verification failed: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  valkey.disconnect();
}

try {
  const storage = objectStorage();
  await storage.ensureReady();
  const key = `release-acceptance/smoke-${Date.now()}.txt`;
  const payload = Buffer.from("hrms release acceptance object storage smoke test\n", "utf8");
  await storage.putObject(key, payload, {
    "content-type": "text/plain"
  });
  const stat = await storage.statObject(key);
  if (!stat) failures.push("Object-storage smoke object was not readable after upload");
  await storage.removeObject(key);
  notes.push("Private object storage put/stat/delete passed");
} catch {
  failures.push("Private object storage verification failed");
}

const result = {
  timestamp: new Date().toISOString(),
  status: failures.length === 0 ? "pass" : "fail",
  failures,
  notes
};

writeFileSync(join(releaseDir, "service-verification.json"), `${JSON.stringify(result, null, 2)}\n`);

if (failures.length > 0) {
  fail(`Valkey/object-storage verification failed:\n${failures.join("\n")}`);
}

console.log("Valkey and object-storage release verification passed.");

function objectStorage(): R2ObjectStorage {
  return new R2ObjectStorage({
    accountId: requireEnv("R2_ACCOUNT_ID"),
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    bucket: requireEnv("R2_BUCKET_NAME"),
    endpoint: process.env.R2_ENDPOINT,
    requestTimeoutMs: Number(process.env.R2_REQUEST_TIMEOUT_MS ?? 10_000),
    forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
  });
}
