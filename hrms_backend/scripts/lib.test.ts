import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { walkFiles } from "./lib.js";

test("walkFiles skips generated root coverage but discovers nested source coverage", () => {
  const packageRoot = mkdtempSync(join(tmpdir(), "hrms-walk-files-"));
  try {
    const generated = join(packageRoot, "coverage", "coverage-final.json");
    const source = join(packageRoot, "src", "modules", "coverage", "policy.ts");
    mkdirSync(join(packageRoot, "coverage"), { recursive: true });
    mkdirSync(join(packageRoot, "src", "modules", "coverage"), { recursive: true });
    writeFileSync(generated, "{}\n");
    writeFileSync(source, "export const allowed = true;\n");

    const files = walkFiles(packageRoot, () => true, packageRoot)
      .map((path) => relative(packageRoot, path));
    assert.deepEqual(files, [join("src", "modules", "coverage", "policy.ts")]);
    assert.deepEqual(walkFiles(join(packageRoot, "src"), () => true, packageRoot), [source]);
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
  }
});
