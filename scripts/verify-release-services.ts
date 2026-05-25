import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Redis as Valkey } from "iovalkey";
import { CloudinaryObjectStorage, MinioObjectStorage } from "../src/platform/object-storage.js";
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
  notes.push(`${storage.kind} bucket ${storage.bucket} put/stat/delete passed`);
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
  fail(`Valkey/object-storage verification failed:\n${failures.join("\n")}`);
}

console.log("Valkey and object-storage release verification passed.");

function objectStorage(): CloudinaryObjectStorage | MinioObjectStorage {
  if ((process.env.OBJECT_STORAGE_PROVIDER ?? "minio") === "minio") {
    return new MinioObjectStorage({
      endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:19000",
      publicEndpoint: process.env.MINIO_PUBLIC_ENDPOINT,
      accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
      bucket: process.env.MINIO_BUCKET ?? "hawkaii-hrms-dev",
      region: process.env.MINIO_REGION ?? "us-east-1"
    });
  }

  return new CloudinaryObjectStorage({
    cloudName: requireEnv("CLOUDINARY_CLOUD_NAME"),
    apiKey: requireEnv("CLOUDINARY_API_KEY"),
    apiSecret: requireEnv("CLOUDINARY_API_SECRET"),
    folder: process.env.CLOUDINARY_FOLDER ?? "hawkaii-hrms",
    resourceType: (process.env.CLOUDINARY_RESOURCE_TYPE as "auto" | "image" | "raw" | "video" | undefined) ?? "auto",
    uploadTransformation: process.env.CLOUDINARY_UPLOAD_TRANSFORMATION ?? "q_auto:eco,f_auto",
    mockUploads: process.env.CLOUDINARY_MOCK_UPLOADS === "true"
  });
}
