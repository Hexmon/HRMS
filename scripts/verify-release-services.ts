import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Redis as Valkey } from "iovalkey";
import { Client as MinioClient } from "minio";
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
  const endpoint = new URL(requireEnv("OBJECT_STORAGE_ENDPOINT"));
  const minio = new MinioClient({
    endPoint: endpoint.hostname,
    port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === "https:" ? 443 : 80,
    useSSL: endpoint.protocol === "https:",
    accessKey: requireEnv("OBJECT_STORAGE_ACCESS_KEY"),
    secretKey: requireEnv("OBJECT_STORAGE_SECRET_KEY"),
    region: process.env.OBJECT_STORAGE_REGION
  });
  const bucket = requireEnv("OBJECT_STORAGE_BUCKET");
  const exists = await minio.bucketExists(bucket).catch(() => false);
  if (!exists) {
    await minio.makeBucket(bucket, process.env.OBJECT_STORAGE_REGION ?? "us-east-1");
  }
  const key = `release-acceptance/smoke-${Date.now()}.txt`;
  const payload = Buffer.from("hrms release acceptance object storage smoke test\n", "utf8");
  await minio.putObject(bucket, key, payload, payload.length, {
    "content-type": "text/plain"
  });
  const objectStream = await minio.getObject(bucket, key);
  await new Promise<void>((resolve, reject) => {
    objectStream.on("data", () => undefined);
    objectStream.on("end", resolve);
    objectStream.on("error", reject);
  });
  await minio.removeObject(bucket, key);
  notes.push(`MinIO bucket ${bucket} put/get/delete passed`);
} catch (error) {
  failures.push(`Object storage verification failed: ${error instanceof Error ? error.message : String(error)}`);
}

const result = {
  timestamp: new Date().toISOString(),
  status: failures.length === 0 ? "pass" : "fail",
  failures,
  notes
};

writeFileSync(join(releaseDir, "service-verification.json"), `${JSON.stringify(result, null, 2)}\n`);

if (failures.length > 0) {
  fail(`Valkey/MinIO verification failed:\n${failures.join("\n")}`);
}

console.log("Valkey and MinIO release verification passed.");
