import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, test } from "node:test";
import {
  assessChangedFile,
  addUniqueRawCoverageEntry,
  addEvaluatedModuleStatements,
  assertExternalArtifact,
  assertExternalArtifactDestination,
  assertCleanRepository,
  assertRegularRepositoryFile,
  buildExternalCoverage,
  changedLines,
  coverageArtifactPath,
  instrumentableExternal,
  outsideExecutableOrConfig,
  removeExactCommitCheckout,
  runFullCoverageGate,
  runFullCoverageWorker,
  runFullSuiteCommand,
  resolveCoveragePython,
  resolveTrustedExecutable,
  sanitizedCoverageEnvironment,
  selectFinalizerDependencies,
  selectFullSuiteTools,
  stampExternalReport,
  stampReport,
  validateTrustedExecutable,
  verify,
} from "./changed-coverage.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "Coverage Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Coverage Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" },
  }).trim();
}

function write(root, path, content) {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function writeCoverage(root, packageName, content, name = "coverage-final.json") {
  const fullPath = coverageArtifactPath(root, packageName, name);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  return fullPath;
}

function writeArtifact(root, name, content) {
  const fullPath = join(dirname(coverageArtifactPath(root, "external")), "inputs", name);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  return fullPath;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "hrms-coverage-gate-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "hrms_backend/src/existing.ts", "export const unchanged = true;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  write(root, "hrms_backend/src/decision.ts", "export function access(role: string) {\n  if (role === 'admin') return 'allow';\n  return 'deny';\n}\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "decision");
  return { root, base, head: git(root, "rev-parse", "HEAD") };
}

const fixtureTools = { node: realpathSync(process.execPath), pnpm: "/trusted/pnpm", python: "/trusted/python3", bash: "/trusted/bash" };
const fixtureCheckout = {
  prepareCheckout: async (root) => root,
  cleanupCheckout: () => {},
  tools: fixtureTools,
};

function report(root, rejectCount) {
  const file = join(root, "hrms_backend/src/decision.ts");
  const coverage = {
    path: file,
    statementMap: {
      0: { start: { line: 2, column: 2 }, end: { line: 2, column: 42 } },
      1: { start: { line: 3, column: 2 }, end: { line: 3, column: 16 } },
    },
    s: { 0: 1, 1: rejectCount },
    fnMap: { 0: { name: "access", decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 22 } }, loc: { start: { line: 1, column: 0 }, end: { line: 4, column: 1 } } } },
    f: { 0: 1 },
    branchMap: {
      0: { type: "if", loc: { start: { line: 2, column: 2 }, end: { line: 2, column: 42 } }, locations: [
        { start: { line: 2, column: 2 }, end: { line: 2, column: 42 } },
        { start: { line: 3, column: 2 }, end: { line: 3, column: 16 } },
      ] },
    },
    b: { 0: [1, rejectCount] },
  };
  writeCoverage(root, "backend", JSON.stringify({ [file]: coverage }));
  stampReport(root, "backend");
}

function externalEntry(root, path, branchCounts = [1, 1]) {
  const absolute = join(root, path);
  return {
    path: absolute,
    statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } } },
    s: { 0: 1 },
    fnMap: {}, f: {},
    branchMap: { 0: { type: "if", loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }, locations: [
      { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
      { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
    ] } },
    b: { 0: branchCounts },
  };
}

test("new files are included and an uncovered reachable outcome fails before passing", () => {
  const { root, base, head } = fixture();
  const diff = changedLines(root, base, head);
  assert.deepEqual([...diff.files.get("hrms_backend/src/decision.ts")], [1, 2, 3, 4]);

  report(root, 0);
  const red = verify(root, base, head);
  assert.equal(red.pass, false);
  assert.ok(red.totals.uncovered.some((location) => location.includes("branch 2:0")));
  assert.ok(red.totals.uncovered.some((location) => location.includes("decision.ts:3")));

  report(root, 1);
  const green = verify(root, base, head);
  assert.equal(green.pass, true, green.lines.join("\n"));
  assert.equal(green.totals.uncovered.length, 0);
  assert.throws(() => verify(root, base, base), /head must equal checked-out HEAD/);
});

test("a source line resembling a diff header cannot hide a later authorization change", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-coverage-diff-header-"));
  roots.push(root);
  git(root, "init", "-q");
  const path = "hrms_backend/src/guard.ts";
  write(root, path, "const marker = `\n+ b/hrms_backend/src/fake.test.ts\n`;\nexport function canRead(company: string) {\n  return company === 'own';\n}\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "secure guard");
  const base = git(root, "rev-parse", "HEAD");
  write(root, path, "const marker = `\n++ b/hrms_backend/src/fake.test.ts\n`;\nexport function canRead(company: string) {\n  return true;\n}\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "unsafe guard");
  const patch = git(root, "diff", "--unified=0", base, "HEAD", "--", path);
  assert.match(patch, /\n\+\+\+ b\/hrms_backend\/src\/fake\.test\.ts/);
  const diff = changedLines(root, base, "HEAD");
  assert.deepEqual([...diff.files.get(path)], [2, 5]);
  assert.equal(diff.files.has("hrms_backend/src/fake.test.ts"), false);
  const absolute = join(root, path);
  writeCoverage(root, "backend", JSON.stringify({ [absolute]: {
    path: absolute,
    statementMap: {
      0: { start: { line: 2 }, end: { line: 2 } },
      1: { start: { line: 5 }, end: { line: 5 } },
    },
    s: { 0: 1, 1: 0 },
    branchMap: {}, b: {}, fnMap: {}, f: {},
  } }));
  stampReport(root, "backend");
  const result = verify(root, base, "HEAD");
  assert.equal(result.pass, false);
  assert.ok(result.totals.uncovered.some((item) => item.includes(`${path}:5`)));
});

test("diff parsers fail closed on malformed Git output and accept declared context", () => {
  const invoke = (textDiff, rawDiff = "") => changedLines("/synthetic", "base", "head", (_root, ...args) => {
    if (args[0] === "cat-file") return "";
    if (args[0] === "merge-base") return "merge-base\n";
    if (args[0] === "diff" && args.includes("--raw")) return rawDiff;
    if (args[0] === "diff") return textDiff;
    throw new Error(`unexpected synthetic Git command ${args.join(" ")}`);
  });
  const header = "diff --git a/scripts/agent/a.test.mjs b/scripts/agent/a.test.mjs\n+++ b/scripts/agent/a.test.mjs\n";
  const context = invoke(`${header}@@ -1 +1 @@\n same\n`);
  assert.deepEqual(context.testSource, []);
  assert.throws(() => invoke(`${header}@@ -1 +1 @@\n?invalid\n`), /Malformed diff body/);
  assert.throws(() => invoke(`${header}@@ -1,0 +1,0 @@\n+excess\n`), /exceeded declared line counts/);
  assert.throws(() => invoke("diff --git a/a b/a\n@@ -1 +1 @@\n"), /Malformed diff hunk/);
  assert.throws(() => invoke(`${header}@@ -1 +1 @@`), /Incomplete diff hunk/);
  assert.throws(() => invoke("", ":100644 100644 a b M\0"), /missing path/);
  assert.throws(() => invoke("", "invalid status\0scripts/agent/a.mjs\0"), /Unsupported git raw diff status/);
  assert.throws(() => changedLines("/synthetic", "base", "head", (_root, ...args) =>
    args[0] === "merge-base" ? "" : ""), /No merge base/);
});

test("a modified source line passes only with mapped coverage", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-coverage-modified-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "hrms_backend/src/existing.ts", "export const result = 'old';\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base source");
  const base = git(root, "rev-parse", "HEAD");
  write(root, "hrms_backend/src/existing.ts", "export const result = 'new';\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "modify source");
  let path = "hrms_backend/src/existing.ts";
  let absolute = join(root, path);
  writeCoverage(root, "backend", JSON.stringify({ [absolute]: {
    path: absolute, statementMap: { 0: { start: { line: 1 }, end: { line: 1 } } }, s: { 0: 1 },
    branchMap: {}, b: {}, fnMap: {}, f: {},
  } }));
  stampReport(root, "backend");
  assert.deepEqual([...changedLines(root, base, "HEAD").files.get(path)], [1]);
  assert.equal(verify(root, base, "HEAD").pass, true);
});

test("a source rename remains a deletion plus new file and fails pending regression disposition", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-coverage-rename-"));
  roots.push(root);
  git(root, "init", "-q");
  const oldPath = "hrms_backend/src/old.ts";
  const newPath = "hrms_backend/src/renamed.ts";
  write(root, oldPath, "export const result = 'same';\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base source");
  const base = git(root, "rev-parse", "HEAD");
  git(root, "mv", oldPath, newPath);
  git(root, "commit", "-qm", "rename source");
  const diff = changedLines(root, base, "HEAD");
  assert.ok(diff.deletionOnly.includes(`${oldPath}:deleted source file`));
  assert.deepEqual([...diff.files.get(newPath)], [1]);
  const absolute = join(root, newPath);
  writeCoverage(root, "backend", JSON.stringify({ [absolute]: {
    path: absolute, statementMap: { 0: { start: { line: 1 }, end: { line: 1 } } }, s: { 0: 1 },
    branchMap: {}, b: {}, fnMap: {}, f: {},
  } }));
  stampReport(root, "backend");
  const result = verify(root, base, "HEAD");
  assert.equal(result.pass, false);
  assert.ok(result.totals.uncovered.some((item) => item.includes("deleted source file")));
});

test("source status, mode and missing-hunk variants fail before excluded paths or symlink reads", () => {
  const added = new Set(["added symlink", "extensionless symlink", "added binary", "generated binary", "test binary", "empty source"]);
  const existingSymlink = new Set(["extensionless retarget", "extensionless deletion"]);
  for (const scenario of ["type change", "added symlink", "extensionless symlink", "extensionless retarget", "extensionless deletion", "mode only", "binary change", "added binary", "generated binary", "test binary", "empty source", "attribute hidden text"]) {
    const root = mkdtempSync(join(tmpdir(), "hrms-coverage-modes-"));
    roots.push(root);
    git(root, "init", "-q");
    const path = scenario === "added symlink" ? "hrms_backend/src/guard:tenant.ts" :
      (scenario === "extensionless symlink" || existingSymlink.has(scenario)) ? "hrms_backend/src/modules/foreign" :
      scenario === "generated binary" ? "hrms-client/src/routeTree.gen.ts" :
      scenario === "test binary" ? "hrms_backend/src/test/fake.test.ts" : "hrms_backend/src/guard.ts";
    write(root, "README.md", "base\n");
    if (scenario === "attribute hidden text") write(root, ".gitattributes", `${path} -diff\n`);
    if (existingSymlink.has(scenario)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      symlinkSync("missing-target.ts", join(root, path));
    } else if (!added.has(scenario)) write(root, path, "export const guard = true;\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "base");
    const base = git(root, "rev-parse", "HEAD");
    if (scenario === "type change") {
      rmSync(join(root, path));
      symlinkSync("missing-target.ts", join(root, path));
    } else if (scenario === "added symlink" || scenario === "extensionless symlink") {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      symlinkSync("missing-target.ts", join(root, path));
    } else if (["binary change", "added binary", "generated binary", "test binary"].includes(scenario)) {
      write(root, path, Buffer.from("export const guard = false;\0\n"));
    } else if (scenario === "empty source") {
      write(root, path, "");
    } else if (scenario === "attribute hidden text") {
      write(root, path, "export const guard = false;\n");
    } else if (scenario === "extensionless retarget") {
      rmSync(join(root, path));
      symlinkSync("other-missing-target.ts", join(root, path));
    } else if (scenario === "extensionless deletion") {
      rmSync(join(root, path));
    } else {
      chmodSync(join(root, path), 0o755);
    }
    git(root, "add", "-A");
    git(root, "commit", "-qm", scenario);
    const diff = changedLines(root, base, "HEAD");
    assert.equal(diff.modeTransitions.length, 1, `${scenario}: ${JSON.stringify(diff)}`);
    assert.deepEqual(diff.modeTransitions[0].path, path);
    assert.equal(diff.modeTransitions[0].status, scenario === "type change" ? "T" : scenario === "extensionless deletion" ? "D" : added.has(scenario) ? "A" : "M");
    if (["binary change", "added binary", "generated binary", "test binary", "empty source", "attribute hidden text"].includes(scenario)) {
      assert.equal(diff.modeTransitions[0].noTextHunk, true, scenario);
    }
    const result = verify(root, base, "HEAD");
    assert.equal(result.pass, false, scenario);
    assert.ok(result.totals.uncovered.some((item) => item.includes(`unmeasured source mode/type ${path}`)));
  }
});

test("unknown regular source-tree assets and Git attribute configuration remain unmeasured", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-coverage-unknown-src-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "README.md", "base\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  write(root, "hrms_backend/src/modules/foreign", "#!/bin/sh\nexit 0\n");
  write(root, "hrms-client/src/asset.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n");
  write(root, ".gitattributes", "*.ts -diff\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "add unknown source assets");
  const diff = changedLines(root, base, "HEAD");
  assert.equal(diff.modeTransitions.length, 0);
  assert.deepEqual(diff.outside.sort(), [".gitattributes", "hrms-client/src/asset.svg", "hrms_backend/src/modules/foreign"].sort());
  const result = verify(root, base, "HEAD");
  assert.equal(result.pass, false);
  assert.equal(result.totals.executable, 0);
  assert.equal(result.totals.uncovered.length, 3);
});

test("missing and stale reports fail closed", () => {
  const { root, base, head } = fixture();
  assert.throws(() => stampReport(root, "unknown"), /Unknown package/);
  assert.throws(() => verify(root, base, head), /missing fresh coverage report/);
  report(root, 1);
  writeCoverage(root, "backend", "{invalid");
  assert.throws(() => stampReport(root, "backend"), SyntaxError);
  report(root, 1);
  writeCoverage(root, "backend", "[]");
  stampReport(root, "backend");
  assert.throws(() => verify(root, base, head), /malformed coverage report/);
  report(root, 1);
  writeCoverage(root, "backend", "{}");
  assert.throws(() => verify(root, base, head), /stale or modified coverage report/);
  report(root, 1);
  write(root, "hrms_backend/src/decision.ts", "export function access(role: string) {\n  if (role === 'admin') return 'allow';\n  return 'other';\n}\n");
  assert.throws(() => verify(root, base, head), /worktree and index must be completely clean/);
  assert.throws(() => stampReport(root, "backend"), /worktree and index must be completely clean/);
  assert.throws(() => changedLines(root, "missing-base", head), /Command failed/);
});

test("a changed frontend source without its frontend report fails closed", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-coverage-frontend-missing-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "README.md", "base\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  write(root, "hrms-client/src/view.tsx", "export const View = () => <span>Ready</span>;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "frontend source");
  assert.throws(() => verify(root, base, "HEAD"), /frontend: missing fresh coverage report/);
  const path = "hrms-client/src/view.tsx";
  const absolute = join(root, path);
  const entry = {
    path: absolute,
    statementMap: { 0: { start: { line: 1 }, end: { line: 1 } } },
    s: { 0: 0 }, branchMap: {}, b: {}, fnMap: {}, f: {},
  };
  writeCoverage(root, "frontend", JSON.stringify({ [absolute]: entry }));
  stampReport(root, "frontend");
  const uncovered = verify(root, base, "HEAD");
  assert.equal(uncovered.pass, false);
  assert.equal(uncovered.totals.executable, 1);
  assert.ok(uncovered.totals.uncovered.some((item) => item.includes(`${path}:1`)));
  assert.equal(uncovered.totals.uncovered.some((item) => item.includes("unmeasured executable/config")), false);
  assert.ok(uncovered.lines.some((line) => line.includes("Changed executable lines: 0/1")));
  entry.s[0] = 1;
  writeCoverage(root, "frontend", JSON.stringify({ [absolute]: entry }));
  stampReport(root, "frontend");
  assert.equal(verify(root, base, "HEAD").pass, true);
});

test("deleted frontend source is classified as source deletion, not outside code", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-coverage-frontend-delete-"));
  roots.push(root);
  git(root, "init", "-q");
  const path = "hrms-client/src/old.ts";
  write(root, path, "export const old = true;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "old frontend source");
  const base = git(root, "rev-parse", "HEAD");
  rmSync(join(root, path));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "delete frontend source");
  const diff = changedLines(root, base, "HEAD");
  assert.ok(diff.deletionOnly.includes(`${path}:deleted source file`));
  assert.equal(diff.outside.includes(path), false);
  assert.equal(outsideExecutableOrConfig("hrms-client/src/runtime.json"), true);
});

test("a report stamped at an earlier head is rejected after a later commit", () => {
  const { root, base } = fixture();
  report(root, 1);
  write(root, "README.md", "later commit\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "later documentation");
  assert.throws(() => verify(root, base, "HEAD"), /stale or modified coverage report/);
});

test("real Vitest behavior changes the full PR gate and CLI from red to green", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-coverage-real-behavior-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, ".gitignore", "node_modules/\ncoverage/\n");
  write(root, "hrms-client/package.json", "{\"type\":\"module\"}\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "fixture package");
  const base = git(root, "rev-parse", "HEAD");
  symlinkSync(new URL("../../hrms-client/node_modules", import.meta.url).pathname, join(root, "hrms-client/node_modules"), "dir");
  const source = "export function decide(requester: string, approver: string) {\n  if (requester === approver) return 'deny';\n  return 'allow';\n}\n";
  write(root, "hrms-client/src/decision.ts", source);
  const allowedTest = "import { expect, it } from 'vitest';\nimport { decide } from './decision';\nit('allows an independent approver', () => { expect(decide('employee', 'manager')).toBe('allow'); });\n";
  write(root, "hrms-client/src/decision.unit.test.ts", allowedTest);
  git(root, "add", ".");
  git(root, "commit", "-qm", "new decision with allowed test");
  const packageRoot = join(root, "hrms-client");
  const vitest = join(packageRoot, "node_modules/.bin/vitest");
  const output = dirname(coverageArtifactPath(root, "frontend"));
  const runCoverage = () => spawnSync(vitest, ["run", "--coverage", "--coverage.reporter=json", `--coverage.reportsDirectory=${output}`], { cwd: packageRoot, encoding: "utf8", timeout: 30000 });
  const redTest = runCoverage();
  assert.equal(redTest.status, 0, redTest.stderr || redTest.stdout);
  stampReport(root, "frontend");
  const red = verify(root, base, "HEAD");
  assert.equal(red.pass, false);
  assert.ok(red.totals.uncovered.some((item) => item.includes("decision.ts:branch")));
  const executable = new URL("./changed-coverage.mjs", import.meta.url).pathname;
  const env = { ...process.env, HRMS_COVERAGE_REPO_ROOT: root };
  const redCli = spawnSync(process.execPath, [executable, "--base", base], { cwd: root, env, encoding: "utf8" });
  assert.equal(redCli.status, 1);
  assert.match(redCli.stdout, /UNCOVERED/);

  write(root, "hrms-client/src/decision.unit.test.ts", `${allowedTest}it('denies self approval', () => { expect(decide('employee', 'employee')).toBe('deny'); });\n`);
  git(root, "add", ".");
  git(root, "commit", "-qm", "assert rejected behavior");
  const greenTest = runCoverage();
  assert.equal(greenTest.status, 0, greenTest.stderr || greenTest.stdout);
  stampReport(root, "frontend");
  const green = verify(root, base, "HEAD");
  assert.equal(green.pass, true, green.lines.join("\n"));
  const greenCli = spawnSync(process.execPath, [executable, "--base", base], { cwd: root, env, encoding: "utf8" });
  assert.equal(greenCli.status, 0, greenCli.stderr || greenCli.stdout);
});

test("real Vitest coverage passes the full gate for modified source with both decision outcomes", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-coverage-real-modified-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, ".gitignore", "node_modules/\ncoverage/\n");
  write(root, "hrms-client/package.json", "{\"type\":\"module\"}\n");
  write(root, "hrms-client/src/decision.ts", "export function label(name: string) {\n  return name.toUpperCase();\n}\n");
  write(root, "hrms-client/src/decision.unit.test.ts", "import { expect, it } from 'vitest';\nimport { label } from './decision';\nit('labels a name', () => { expect(label('employee')).toBe('EMPLOYEE'); });\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base implementation");
  const base = git(root, "rev-parse", "HEAD");
  symlinkSync(new URL("../../hrms-client/node_modules", import.meta.url).pathname, join(root, "hrms-client/node_modules"), "dir");
  write(root, "hrms-client/src/decision.ts", "export function label(name: string) {\n  if (name.trim()) return name.trim().toUpperCase();\n  return 'ANONYMOUS';\n}\n");
  write(root, "hrms-client/src/decision.unit.test.ts", "import { expect, it } from 'vitest';\nimport { label } from './decision';\nit('trims and labels a name', () => { expect(label(' employee ')).toBe('EMPLOYEE'); });\nit('labels a blank name', () => { expect(label('  ')).toBe('ANONYMOUS'); });\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "handle blank names");
  const path = "hrms-client/src/decision.ts";
  assert.deepEqual([...changedLines(root, base, "HEAD").files.get(path)], [2, 3]);
  const packageRoot = join(root, "hrms-client");
  const vitest = join(packageRoot, "node_modules/.bin/vitest");
  const output = dirname(coverageArtifactPath(root, "frontend"));
  const run = spawnSync(vitest, ["run", "--coverage", "--coverage.reporter=json", `--coverage.reportsDirectory=${output}`], { cwd: packageRoot, encoding: "utf8", timeout: 30000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  stampReport(root, "frontend");
  const result = verify(root, base, "HEAD");
  assert.equal(result.pass, true, result.lines.join("\n"));
  assert.ok(result.totals.executable > 0);
  assert.ok(result.totals.branches > 0);
  const executable = new URL("./changed-coverage.mjs", import.meta.url).pathname;
  const cli = spawnSync(process.execPath, [executable, "--base", base], {
    cwd: root, env: { ...process.env, HRMS_COVERAGE_REPO_ROOT: root }, encoding: "utf8",
  });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
});

test("documentation-only changes are explicitly N/A without package reports", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-coverage-docs-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "README.md", "base\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  write(root, "README.md", "changed\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "docs");
  const result = verify(root, base, "HEAD");
  assert.equal(result.pass, true);
  assert.equal(result.totals.executable, 0);
  assert.equal(result.totals.uncovered.length, 0);
});

test("product imports from test-looking and generated runtime paths cannot hide changed behavior", () => {
  for (const path of ["hrms_backend/src/test/policy.ts", "hrms_backend/src/policy.test.ts", "hrms-client/src/routeTree.gen.ts"]) {
    const root = mkdtempSync(join(tmpdir(), "hrms-coverage-imported-exclusion-"));
    roots.push(root);
    git(root, "init", "-q");
    const route = path.startsWith("hrms-client/") ? "hrms-client/src/router.tsx" : "hrms_backend/src/route.ts";
    const importPath = path.includes("/src/test/") ? "./test/policy" : path.includes("routeTree") ? "./routeTree.gen" : "./policy.test";
    write(root, route, `import { allow } from '${importPath}';\nexport const route = () => allow();\n`);
    write(root, path, "export const allow = () => false;\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "deny by default");
    const base = git(root, "rev-parse", "HEAD");
    write(root, path, "export const allow = () => true;\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "weaken imported policy");
    const diff = changedLines(root, base, "HEAD");
    assert.ok(diff.outside.includes(path), path);
    if (!path.includes("routeTree")) assert.ok(diff.importRisks.some((risk) => risk.includes("imports test source")), path);
    const result = verify(root, base, "HEAD");
    assert.equal(result.pass, false, path);
    assert.ok(result.totals.uncovered.some((item) => item.includes(`unmeasured executable/config ${path}`)));
  }
});

test("in-source test additions pass only when production module loads cannot reach them", () => {
  const cases = [
    { name: "alias", route: "import { allow } from '@/test/policy';\nexport const route = allow;\n", config: { "#bad*tail": ["src/missing/*"], "*tail": ["src/missing/*"], "@/*": ["src/*"] } },
    { name: "exact alias", route: "import { allow } from '#policy';\nexport const route = allow;\n", config: { "#policy": ["src/test/policy.ts"] } },
    { name: "unresolved exact alias", route: "import 'policy-alias';\nexport const route = true;\n", config: { "policy-alias": ["src/missing.ts"] } },
    { name: "unresolved wildcard alias", route: "import 'policy-value-tail';\nexport const route = true;\n", config: { "policy-*tail": ["src/missing/*"] } },
    { name: "require", route: "export const route = () => require('./test/policy').allow();\n" },
    { name: "module require", route: "export const route = () => module.require('./test/policy').allow();\n" },
    { name: "dynamic literal", route: "export const route = () => import('./test/policy');\n" },
    { name: "re-export", route: "export { allow as route } from './test/policy';\n" },
    { name: "import equals", route: "import policy = require('./test/policy');\nexport const route = policy.allow;\n" },
    { name: "unresolved local", route: "import './test/missing';\nexport const route = true;\n" },
    { name: "non-literal dynamic", route: "const target = './test/policy';\nexport const route = () => import(target);\n" },
    { name: "glob", route: "export const route = import.meta.glob('./test/*.ts');\n" },
    { name: "createRequire", route: "import { createRequire } from 'node:module';\nexport const route = createRequire(import.meta.url);\n" },
    { name: "safe type import", route: "import type { Policy } from './test/policy';\nexport const route = true;\n", safe: true },
    { name: "safe production import", route: "import { value } from './safe';\nexport const route = value;\n", safe: true, emptyConfig: true },
    { name: "safe unresolved package without aliases", route: "import 'missing-package';\nexport const route = true;\n", safe: true, emptyConfig: true },
    { name: "safe asset import", route: "import './styles.css?url';\nexport const route = true;\n", safe: true },
  ];
  for (const scenario of cases) {
    const root = mkdtempSync(join(tmpdir(), "hrms-coverage-import-graph-"));
    roots.push(root);
    git(root, "init", "-q");
    const testPath = "hrms-client/src/test/policy.ts";
    write(root, "hrms-client/src/route.ts", scenario.route);
    write(root, testPath, "export type Policy = boolean;\nexport const allow = () => false;\n");
    if (scenario.name === "safe production import") write(root, "hrms-client/src/safe.ts", "export const value = true;\n");
    if (scenario.config || scenario.emptyConfig) write(root, "hrms-client/tsconfig.json", JSON.stringify({ compilerOptions: { moduleResolution: "Bundler", baseUrl: ".", ...(scenario.config ? { paths: scenario.config } : {}) } }));
    git(root, "add", ".");
    git(root, "commit", "-qm", "base import graph");
    const base = git(root, "rev-parse", "HEAD");
    write(root, testPath, "export type Policy = boolean;\nexport const allow = () => true;\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "change test-looking module");
    const diff = changedLines(root, base, "HEAD");
    const result = verify(root, base, "HEAD");
    assert.equal(result.pass, Boolean(scenario.safe), `${scenario.name}: ${result.lines.join("\n")}`);
    assert.equal(diff.outside.includes(testPath), !scenario.safe, scenario.name);
    assert.equal(diff.testSource.includes(testPath), Boolean(scenario.safe), scenario.name);
    if (!scenario.safe) assert.ok(diff.importRisks.length > 0, scenario.name);
  }
});

test("invalid TypeScript import resolution configuration fails closed", () => {
  for (const config of ["{invalid", '{"compilerOptions":{"moduleResolution":"InvalidValue"}}']) {
    const root = mkdtempSync(join(tmpdir(), "hrms-coverage-bad-tsconfig-"));
    roots.push(root);
    git(root, "init", "-q");
    write(root, "hrms-client/tsconfig.json", config);
    write(root, "hrms-client/src/route.ts", "export const route = true;\n");
    write(root, "hrms-client/src/test/policy.ts", "export const allow = false;\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "bad config base");
    const base = git(root, "rev-parse", "HEAD");
    write(root, "hrms-client/src/test/policy.ts", "export const allow = true;\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "change test module");
    assert.throws(() => verify(root, base, "HEAD"), /TypeScript configuration/);
  }
});

test("declaration-only source changes are explicitly classified for typecheck evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-coverage-declaration-"));
  roots.push(root);
  git(root, "init", "-q");
  const path = "hrms_backend/src/types.d.ts";
  write(root, path, "export type EmployeeId = string;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base declaration");
  const base = git(root, "rev-parse", "HEAD");
  rmSync(join(root, path));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "remove declaration");
  const diff = changedLines(root, base, "HEAD");
  assert.deepEqual(diff.excludedGenerated, [path]);
  const result = verify(root, base, "HEAD");
  assert.equal(result.pass, true);
  assert.ok(result.lines.some((line) => line.includes(`EXCLUDED TYPE/GENERATED ${path}`)));
});

test("deletion-only behavior and scripts outside instrumented source fail closed", () => {
  const { root, head } = fixture();
  write(root, "hrms_backend/src/decision.ts", "export function access(role: string) {\n  if (role === 'admin') return 'allow';\n}\n");
  write(root, "scripts/agent/probe.py", "print('runtime')\n");
  write(root, "scripts/agent/tests/test_probe.py", "def test_probe():\n    assert 1 == 1\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "delete branch and add script");
  const diff = changedLines(root, head, "HEAD");
  assert.ok(diff.deletionOnly.some((item) => item.startsWith("hrms_backend/src/decision.ts:")));
  assert.deepEqual(diff.external, ["scripts/agent/probe.py"]);
  assert.deepEqual(diff.testSource, ["scripts/agent/tests/test_probe.py"]);
  report(root, 1);
  const probe = join(root, "scripts/agent/probe.py");
  writeCoverage(root, "external", JSON.stringify({ [probe]: {
    path: probe, statementMap: { 0: { start: { line: 1 }, end: { line: 1 } } }, s: { 0: 1 },
    branchMap: {}, b: {}, fnMap: {}, f: {},
  } }));
  stampExternalReport(root);
  const result = verify(root, head, "HEAD");
  assert.equal(result.pass, false);
  assert.ok(result.totals.uncovered.some((item) => item.includes("deletion-only")));
  assert.equal(result.totals.uncovered.some((item) => item.includes("scripts/agent/probe.py")), false);
  assert.ok(result.lines.some((line) => line.startsWith("TEST SOURCE scripts/agent/tests/test_probe.py")));
});

test("a partial external runtime deletion is explicit regression work", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-coverage-external-deletion-"));
  roots.push(root);
  git(root, "init", "-q");
  const path = "scripts/agent/live.mjs";
  write(root, path, "export const retained = true;\nexport const removed = true;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "two runtime decisions");
  const base = git(root, "rev-parse", "HEAD");
  write(root, path, "export const retained = true;\n");
  git(root, "add", path);
  git(root, "commit", "-qm", "remove one external decision");
  const diff = changedLines(root, base, "HEAD");
  assert.ok(diff.deletionOnly.some((item) => item.startsWith(`${path}:@@`)), diff.deletionOnly.join("\n"));
});

test("a deleted source file is never treated as zero changed behavior", () => {
  const { root, head } = fixture();
  rmSync(join(root, "hrms_backend/src/decision.ts"));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "delete source");
  const diff = changedLines(root, head, "HEAD");
  assert.ok(diff.deletionOnly.includes("hrms_backend/src/decision.ts:deleted source file"));
  assert.equal(verify(root, head, "HEAD").pass, false);
});

test("replacing runtime with a comment fails, while spacing-only runtime edits are not deletion-only", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-coverage-replacement-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "hrms_backend/src/example.ts", "export const payroll = true;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base runtime");
  const base = git(root, "rev-parse", "HEAD");
  write(root, "hrms_backend/src/example.ts", "// payroll removed\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "erase runtime");
  const erased = changedLines(root, base, "HEAD");
  assert.equal(erased.removedRuntime.length, 1);
  writeCoverage(root, "backend", "{}");
  stampReport(root, "backend");
  assert.equal(verify(root, base, "HEAD").pass, false);

  write(root, "hrms_backend/src/example.ts", "export const payroll = true;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "restore runtime");
  const spacingBase = git(root, "rev-parse", "HEAD");
  write(root, "hrms_backend/src/example.ts", "export const payroll=true;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "spacing only");
  assert.deepEqual(changedLines(root, spacingBase, "HEAD").removedRuntime, []);
});

test("package and deployment config changes fail instead of passing a zero-line gate", () => {
  const { root, head } = fixture();
  const paths = [
    "hrms_backend/package.json",
    "hrms-client/package.json",
    "hrms_backend/pnpm-lock.yaml",
    "hrms_backend/wrangler.jsonc",
    "hrms-client/vercel.json",
    "render.yaml",
    "hrms_backend/infra/docker/Dockerfile",
    "hrms_backend/infra/docker/docker-compose.qa.yml",
    ".github/workflows/deploy.yml",
    "hrms_backend/tsconfig.build.json",
  ];
  for (const path of paths) {
    assert.equal(outsideExecutableOrConfig(path), true, path);
    write(root, path, "synthetic config\n");
  }
  write(root, "README.md", "documentation only\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "config change");
  const diff = changedLines(root, head, "HEAD");
  assert.deepEqual(new Set(diff.outside), new Set(paths));
  const result = verify(root, head, "HEAD");
  assert.equal(result.pass, false);
  assert.equal(result.totals.executable, 0);
  for (const path of paths) assert.ok(result.totals.uncovered.some((item) => item.includes(path)), path);
  assert.equal(outsideExecutableOrConfig("docs/architecture/design.md"), false);
});

test("workflow disablement and an untraced dangerous shell branch remain red", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-untrusted-nonnumeric-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, ".github/workflows/branch-ci-cd.yml", "jobs:\n  changed-coverage:\n    runs-on: ubuntu-latest\n    steps: []\n");
  write(root, "scripts/agent/verify-change.sh", "#!/usr/bin/env bash\nprintf 'safe\\n'\n");
  chmodSync(join(root, "scripts/agent/verify-change.sh"), 0o755);
  git(root, "add", ".");
  git(root, "commit", "-qm", "trusted-looking base");
  const base = git(root, "rev-parse", "HEAD");

  write(root, ".github/workflows/branch-ci-cd.yml", "jobs:\n  changed-coverage:\n    if: false\n    runs-on: ubuntu-latest\n    steps: []\n");
  write(root, "scripts/agent/verify-change.sh", [
    "#!/usr/bin/env bash",
    "if [[ \"${ALLOW_DANGEROUS:-false}\" == \"true\" ]]; then",
    "  git push --force origin HEAD:main",
    "fi",
    "printf 'safe\\n'",
    "",
  ].join("\n"));
  chmodSync(join(root, "scripts/agent/verify-change.sh"), 0o755);
  git(root, "add", ".");
  git(root, "commit", "-qm", "disable gate and add dangerous branch");

  const result = verify(root, base, "HEAD");
  assert.equal(result.pass, false);
  assert.equal(result.totals.uncovered.length, 2);
  assert.ok(result.totals.uncovered.some((item) => item.includes(".github/workflows/branch-ci-cd.yml")));
  assert.ok(result.totals.uncovered.some((item) => item.includes("scripts/agent/verify-change.sh")));
});

test("a PR-authored approval JSON cannot clear unmeasured paths", () => {
  const { root, base, head } = fixture();
  write(root, "hrms_backend/package.json", "{\"scripts\":{\"start\":\"node unsafe.js\"}}\n");
  write(root, "qa-artifacts/hrms/coverage-manual-evidence.json", JSON.stringify({ owner: "Owner", reviewer: "Reviewer", reviewUrl: "https://github.com/Hexmon/HRMS/pull/1" }));
  git(root, "add", ".");
  git(root, "commit", "-qm", "self-attested exception");
  report(root, 1);
  const result = verify(root, base, "HEAD");
  assert.equal(result.pass, false);
  assert.ok(result.totals.uncovered.some((item) => item.includes("hrms_backend/package.json")));
  const executable = new URL("./changed-coverage.mjs", import.meta.url).pathname;
  const attempted = spawnSync(process.execPath, [executable, "--base", base, "--manual-evidence", "qa-artifacts/hrms/coverage-manual-evidence.json"], {
    cwd: root,
    env: { ...process.env, HRMS_COVERAGE_REPO_ROOT: root },
    encoding: "utf8",
  });
  assert.equal(attempted.status, 1);
  assert.match(attempted.stderr, /cannot override this gate/);
});

test("a changed continuation line overlapping a V8 branch span requires both outcomes", () => {
  const content = "const mode = `prefix\n${role ===\n  'admin' ? 'allow' : 'deny'}\n`;\n";
  const entry = {
    statementMap: { 0: { start: { line: 3 }, end: { line: 3 } } }, s: { 0: 1 },
    branchMap: { 0: { loc: { start: { line: 2 }, end: { line: 3 } }, locations: [
      { start: { line: 2 }, end: { line: 3 } }, { start: { line: 3 }, end: { line: 3 } },
    ] } }, b: { 0: [1, 0] },
  };
  const result = assessChangedFile("hrms_backend/src/decision.ts", new Set([3]), content, entry);
  assert.deepEqual(result.executable, [3]);
  assert.deepEqual(result.uncoveredBranches, ["3:0"]);
  entry.b[0] = [1, 1];
  assert.deepEqual(assessChangedFile("hrms_backend/src/decision.ts", new Set([3]), content, entry).uncoveredBranches, []);

  const locationOnly = {
    statementMap: {}, s: {}, fnMap: {}, f: {},
    branchMap: { 0: { loc: null, locations: [{ start: { line: 2 }, end: { line: 2 } }] } }, b: { 0: [1] },
  };
  assert.deepEqual(assessChangedFile("hrms_backend/src/decision.ts", new Set([2]), "if (value) allow();\n", locationOnly).branches, ["2:0"]);
  assert.deepEqual(assessChangedFile("scripts/agent/check.py", new Set([2]), "# comment\n\n", {}).nonExecutable, [2]);
  assert.deepEqual(assessChangedFile("hrms_backend/src/missing.ts", new Set([3]), "const value = 1;\n", {}).nonExecutable, [3]);
});

test("CLI stamps, passes, and fails on synthetic source and usage errors", () => {
  const { root, base } = fixture();
  const executable = new URL("./changed-coverage.mjs", import.meta.url).pathname;
  const env = { ...process.env, HRMS_COVERAGE_REPO_ROOT: root };
  report(root, 0);
  const red = spawnSync(process.execPath, [executable, "--base", base, "--head", "HEAD"], { cwd: root, env, encoding: "utf8" });
  assert.equal(red.status, 1);
  assert.match(red.stdout, /UNCOVERED/);
  report(root, 1);
  const stamped = spawnSync(process.execPath, [executable, "--stamp", "backend"], { cwd: root, env, encoding: "utf8" });
  assert.equal(stamped.status, 0, stamped.stderr);
  const green = spawnSync(process.execPath, [executable, "--base", base], { cwd: root, env, encoding: "utf8" });
  assert.equal(green.status, 0, green.stderr);
  const usage = spawnSync(process.execPath, [executable], { cwd: root, env, encoding: "utf8" });
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /Usage:/);
  write(root, "dirty.txt", "dirty\n");
  const dirtyFullSuite = spawnSync(process.execPath, [executable, "--run-full-suite", "--base", base], { cwd: root, env, encoding: "utf8" });
  assert.equal(dirtyFullSuite.status, 1);
  assert.match(dirtyFullSuite.stderr, /worktree and index must be completely clean/);
  rmSync(join(root, "dirty.txt"));
  const invalidWorker = spawnSync(process.execPath, [executable, "--full-suite-worker", "--coverage-output", "relative"], { cwd: root, env, encoding: "utf8" });
  assert.equal(invalidWorker.status, 1);
  assert.match(invalidWorker.stderr, /absolute canonical/);
});

test("type, imports and comments are non-executable but uninstrumented runtime lines fail", () => {
  const content = "import type { X } from 'x';\n// a comment\ntype Id = string;\nlet pending: string;\ninterface Shape { value: string }\nexport type { X };\ndeclare const external: string;\nexport const value = 1;\n";
  const result = assessChangedFile("hrms_backend/src/extra.ts", new Set([1, 2, 3, 4, 5, 6, 7, 8]), content, undefined);
  assert.deepEqual(result.nonExecutable, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(result.executable, [8]);
  assert.deepEqual(result.uncovered, ["8 (not instrumented)"]);

  const sideEffect = assessChangedFile("hrms_backend/src/side-effect.ts", new Set([1]), "import './register.js';\n", undefined);
  assert.deepEqual(sideEffect.executable, [1]);
  assert.deepEqual(sideEffect.uncovered, ["1 (not instrumented)"]);
  const valueImport = assessChangedFile("hrms_backend/src/import.ts", new Set([1]), "import { safe } from './unsafe.js';\n", undefined);
  assert.deepEqual(valueImport.executable, [1]);
  assert.deepEqual(valueImport.uncovered, ["1 (not instrumented)"]);
  assert.equal(instrumentableExternal("node_modules/unsafe.js"), false);
  assert.equal(instrumentableExternal("tools/node_modules/unsafe.js"), false);
});

test("full-suite launcher finalizes only after worker success and restores and removes temporary state", async () => {
  const { root, base } = fixture();
  const trustedRoot = mkdtempSync(join(tmpdir(), "hrms-trusted-validator-"));
  roots.push(trustedRoot);
  const trustedValidator = join(trustedRoot, "changed-coverage.mjs");
  writeFileSync(trustedValidator, "// immutable trusted validator fixture\n");
  write(root, ".gitignore", ".env.test\n");
  git(root, "add", ".gitignore");
  git(root, "commit", "-qm", "ignore local test environment");
  write(root, ".env.test", "UNTRUSTED_IGNORED_VALUE=must-not-load\nTEST_DATABASE_URL=postgresql://remote.invalid/prod\n");
  const original = process.env.HRMS_COVERAGE_OUTPUT_DIR;
  process.env.HRMS_COVERAGE_OUTPUT_DIR = "/tmp/original-coverage-output";
  let workerFinished = false;
  let temporaryOutput;
  const finalized = [];
  try {
    const result = await runFullCoverageGate(root, base, "HEAD", {
      ...fixtureCheckout,
      validatorScript: trustedValidator,
      execFile: (command, args, options) => {
        temporaryOutput = options.env.HRMS_COVERAGE_OUTPUT_DIR;
        assert.equal(command, realpathSync(process.execPath));
        assert.ok(args.includes("--full-suite-worker"));
        assert.equal(args[0], trustedValidator);
        assert.equal(options.env.HRMS_COVERAGE_REPO_ROOT, root);
        assert.equal(options.env.UNTRUSTED_IGNORED_VALUE, undefined);
        assert.equal(options.env.TEST_DATABASE_URL, "postgresql://unused:unused@127.0.0.1:5432/hrms_coverage_unit_only");
        assert.equal(options.env.HRMS_ENV_FILE, join(temporaryOutput, "no-env-file"));
        assert.equal(existsSync(options.env.HRMS_ENV_FILE), false);
        workerFinished = true;
      },
      buildExternal: async () => { assert.equal(workerFinished, true); finalized.push("build"); },
      stampExternal: () => finalized.push("external"),
      stampPackage: (_root, packageName) => finalized.push(packageName),
      verifyGate: () => ({ pass: true, lines: ["synthetic lifecycle"] }),
    });
    assert.equal(result.pass, true);
    assert.deepEqual(finalized, ["build", "external", "backend", "frontend"]);
    assert.equal(process.env.HRMS_COVERAGE_OUTPUT_DIR, "/tmp/original-coverage-output");
    assert.equal(existsSync(temporaryOutput), false);
  } finally {
    if (original === undefined) delete process.env.HRMS_COVERAGE_OUTPUT_DIR;
    else process.env.HRMS_COVERAGE_OUTPUT_DIR = original;
  }
});

test("full-suite launcher cleans temporary output and restores environment when the worker fails", async () => {
  const { root, base } = fixture();
  const original = process.env.HRMS_COVERAGE_OUTPUT_DIR;
  delete process.env.HRMS_COVERAGE_OUTPUT_DIR;
  let temporaryOutput;
  try {
    await assert.rejects(runFullCoverageGate(root, base, "HEAD", {
      ...fixtureCheckout,
      launchWorker: ({ outputRoot }) => {
        temporaryOutput = outputRoot;
        writeFileSync(join(outputRoot, "partial-worker-output"), "partial\n");
        throw new Error("worker failed");
      },
      finalize: () => assert.fail("finalization must not run after worker failure"),
    }), /worker failed/);
    assert.equal(process.env.HRMS_COVERAGE_OUTPUT_DIR, undefined);
    assert.equal(existsSync(temporaryOutput), false);
  } finally {
    if (original === undefined) delete process.env.HRMS_COVERAGE_OUTPUT_DIR;
    else process.env.HRMS_COVERAGE_OUTPUT_DIR = original;
  }
});

test("full-suite explicit output is preserved and worker command failure stops later commands", async () => {
  const { root, base } = fixture();
  await assert.rejects(runFullCoverageGate(root, base, "HEAD", { ...fixtureCheckout, outputRoot: "relative-output" }), /absolute and canonical/);
  await assert.rejects(runFullCoverageGate(root, base, "HEAD", { ...fixtureCheckout, outputRoot: join(root, "in-repository-output") }), /outside the repository/);
  const explicitOutput = mkdtempSync(join(tmpdir(), "hrms-explicit-coverage-"));
  roots.push(explicitOutput);
  await runFullCoverageGate(root, base, "HEAD", {
    ...fixtureCheckout,
    outputRoot: explicitOutput,
    launchWorker: ({ outputRoot }) => writeFileSync(join(outputRoot, "kept"), "yes\n"),
    finalize: () => ({ pass: true, lines: [] }),
  });
  assert.equal(readFileSync(join(explicitOutput, "kept"), "utf8"), "yes\n");
  await assert.rejects(runFullCoverageGate(root, base, "HEAD", { ...fixtureCheckout, outputRoot: explicitOutput }), /must be empty/);

  const previous = process.env.HRMS_COVERAGE_OUTPUT_DIR;
  process.env.HRMS_COVERAGE_OUTPUT_DIR = explicitOutput;
  const commands = [];
  try {
    const expectedHead = git(root, "rev-parse", "HEAD");
    const tools = { node: "/trusted/node", pnpm: "/trusted/pnpm", python: "/trusted/python3", bash: "/trusted/bash" };
    assert.throws(() => runFullCoverageWorker(root, explicitOutput, expectedHead, tools, (command, args, options) => {
      commands.push({ command, args, options });
      if (commands.length === 2) throw new Error("second command failed");
    }), /second command failed/);
    assert.equal(commands.length, 2);
    assert.equal(commands[0].options.env.HRMS_COVERAGE_OUTPUT_DIR, explicitOutput);
    assert.equal(commands[1].options.env.HRMS_COVERAGE_OUTPUT_DIR, undefined);
  } finally {
    if (previous === undefined) delete process.env.HRMS_COVERAGE_OUTPUT_DIR;
    else process.env.HRMS_COVERAGE_OUTPUT_DIR = previous;
  }
});

test("sanitized coverage environment excludes ambient and ignored configuration", () => {
  const outputRoot = join(tmpdir(), "hrms-sanitized-output");
  const previousEnvFile = process.env.HRMS_ENV_FILE;
  const previousV8 = process.env.NODE_V8_COVERAGE;
  process.env.HRMS_UNAPPROVED_SECRET = "must-not-propagate";
  process.env.HRMS_ENV_FILE = ".env.test";
  process.env.NODE_V8_COVERAGE = join(outputRoot, "orchestrator-v8");
  try {
    const environment = sanitizedCoverageEnvironment(outputRoot);
    assert.equal(environment.HRMS_UNAPPROVED_SECRET, undefined);
    assert.equal(environment.HRMS_ENV_FILE, join(outputRoot, "no-env-file"));
    assert.equal(environment.NODE_ENV, "test");
    assert.equal(environment.APP_ENV, "local");
    assert.equal(environment.HOME, join(outputRoot, "home"));
    assert.equal(environment.NPM_CONFIG_USERCONFIG, join(outputRoot, "no-user-npmrc"));
    assert.equal(environment.PYTHONNOUSERSITE, "1");
    assert.equal(environment.NODE_V8_COVERAGE, join(outputRoot, "orchestrator-v8"));
  } finally {
    delete process.env.HRMS_UNAPPROVED_SECRET;
    if (previousEnvFile === undefined) delete process.env.HRMS_ENV_FILE;
    else process.env.HRMS_ENV_FILE = previousEnvFile;
    if (previousV8 === undefined) delete process.env.NODE_V8_COVERAGE;
    else process.env.NODE_V8_COVERAGE = previousV8;
  }
});

test("full-suite dependency selection uses either exact injections or every trusted default", () => {
  const provided = { node: "/provided/node", pnpm: "/provided/pnpm", python: "/provided/python", bash: "/provided/bash" };
  assert.equal(selectFullSuiteTools(provided, {}), provided);
  const calls = [];
  const defaults = selectFullSuiteTools(undefined, { PATH: "/trusted" }, {
    executable: (name, environment) => { calls.push([name, environment.PATH]); return `/resolved/${name.split("/").at(-1)}`; },
    python: (environment) => { calls.push(["python", environment.PATH]); return "/resolved/python"; },
  });
  assert.equal(defaults.node, `/resolved/${process.execPath.split("/").at(-1)}`);
  assert.equal(defaults.pnpm, "/resolved/pnpm");
  assert.equal(defaults.python, "/resolved/python");
  assert.equal(defaults.bash, "/resolved/bash");
  assert.equal(calls.length, 4);

  const trustedBin = mkdtempSync(join(tmpdir(), "hrms-coverage-tools-"));
  roots.push(trustedBin);
  for (const name of ["pnpm", "python3", "bash"]) {
    write(trustedBin, name, "#!/bin/sh\nexit 0\n");
    chmodSync(join(trustedBin, name), 0o755);
  }
  const trustedDefaults = selectFullSuiteTools(undefined, { PATH: trustedBin });
  assert.equal(trustedDefaults.node, realpathSync(process.execPath));
  assert.equal(trustedDefaults.pnpm, join(trustedBin, "pnpm"));
  assert.equal(trustedDefaults.python, join(trustedBin, "python3"));
  assert.equal(trustedDefaults.bash, join(trustedBin, "bash"));

  const overrides = {
    buildExternal: () => "build", stampExternal: () => "external", stampPackage: () => "package",
    verifyGate: () => "verify",
  };
  const selectedOverrides = selectFinalizerDependencies(overrides);
  assert.equal(selectedOverrides.build, overrides.buildExternal);
  assert.equal(selectedOverrides.stampExternal, overrides.stampExternal);
  assert.equal(selectedOverrides.stampPackage, overrides.stampPackage);
  assert.equal(selectedOverrides.verifyGate, overrides.verifyGate);
  const defaultsSelected = selectFinalizerDependencies({});
  assert.equal(defaultsSelected.build, buildExternalCoverage);
  assert.equal(defaultsSelected.stampExternal, stampExternalReport);
  assert.equal(defaultsSelected.stampPackage, stampReport);
  assert.equal(defaultsSelected.verifyGate, verify);
});

test("trusted tool resolution binds an executable realpath and rejects missing tools", () => {
  const directory = mkdtempSync(join(tmpdir(), "hrms-tools-"));
  roots.push(directory);
  const executable = join(directory, "python3");
  writeFileSync(executable, "#!/bin/sh\nexit 0\n");
  chmodSync(executable, 0o755);
  assert.equal(resolveTrustedExecutable("python3", { PATH: directory }), realpathSync(executable));
  assert.equal(resolveTrustedExecutable(executable, { PATH: "" }), realpathSync(executable));
  assert.equal(resolveCoveragePython({ PATH: directory }), executable);
  assert.throws(() => resolveTrustedExecutable("missing", { PATH: directory }), /unavailable/);
  assert.throws(() => resolveTrustedExecutable("missing", {}), /unavailable/);
  assert.throws(() => resolveCoveragePython({ PATH: join(directory, "missing") }), /coverage module is required/);
  assert.throws(() => resolveCoveragePython({}), /coverage module is required/);
  const regular = join(directory, "regular.txt");
  writeFileSync(regular, "not executable\n");
  assert.throws(() => validateTrustedExecutable("relative"), /absolute and canonical/);
  assert.throws(() => validateTrustedExecutable(regular), /EACCES|not a regular/);
  const linked = join(directory, "linked-python");
  symlinkSync(executable, linked);
  assert.throws(() => validateTrustedExecutable(linked), /symbolic link/);
  assert.throws(() => validateTrustedExecutable(directory), /not a regular file/);
});

test("full-suite worker isolates orchestrator V8 output from every coverage child", () => {
  const { root } = fixture();
  const output = mkdtempSync(join(tmpdir(), "hrms-worker-env-"));
  roots.push(output);
  const originalOutput = process.env.HRMS_COVERAGE_OUTPUT_DIR;
  const originalV8 = process.env.NODE_V8_COVERAGE;
  const originalXdgConfig = process.env.XDG_CONFIG_HOME;
  process.env.HRMS_COVERAGE_OUTPUT_DIR = output;
  process.env.NODE_V8_COVERAGE = join(output, "orchestrator-v8");
  delete process.env.XDG_CONFIG_HOME;
  const commands = [];
  try {
    runFullCoverageWorker(root, output, git(root, "rev-parse", "HEAD"),
      { node: "/trusted/node", pnpm: "/trusted/pnpm", python: "/trusted/python3", bash: "/trusted/bash" },
      (command, args, options) => commands.push({ command, args, env: options.env }));
    assert.equal(commands.length, 8);
    assert.match(commands[0].env.NODE_V8_COVERAGE, /node-resolver$/);
    assert.match(commands[1].env.NODE_V8_COVERAGE, /node-gate$/);
    assert.equal(commands[1].env.HRMS_COVERAGE_OUTPUT_DIR, undefined);
    for (const command of commands.slice(2)) assert.equal(command.env.NODE_V8_COVERAGE, undefined);
    assert.equal(commands[2].env.BASH_ENV, undefined);
    assert.equal(commands[2].env.HRMS_SHELL_TRACE_FILE, undefined);
  } finally {
    if (originalOutput === undefined) delete process.env.HRMS_COVERAGE_OUTPUT_DIR;
    else process.env.HRMS_COVERAGE_OUTPUT_DIR = originalOutput;
    if (originalV8 === undefined) delete process.env.NODE_V8_COVERAGE;
    else process.env.NODE_V8_COVERAGE = originalV8;
    if (originalXdgConfig === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdgConfig;
  }
});

test("full-suite command reports pass, fail and explicit artifact preservation", async () => {
  const logs = [];
  const calls = [];
  const pass = await runFullSuiteCommand("/synthetic/repo", ["--run-full-suite", "--base", "base", "--head", "head"], {
    runGate: async (...args) => { calls.push(args); return { pass: true, lines: ["green"], coverageOutputRoot: "/temporary/removed" }; },
    log: (message) => logs.push(message),
  });
  assert.equal(pass, 0);
  assert.equal(calls[0][1], "base");
  assert.equal(calls[0][2], "head");
  assert.equal(calls[0][3].preserveOutput, false);
  assert.equal(calls[0][3].validatorScript, undefined);
  assert.deepEqual(logs, ["green"]);

  const output = join(tmpdir(), "explicit-command-output");
  const fail = await runFullSuiteCommand("/synthetic/repo", ["--run-full-suite", "--base", "base", "--coverage-output", output,
    "--trusted-validator", "/trusted/changed-coverage.mjs"], {
    runGate: async (...args) => { calls.push(args); return { pass: false, lines: ["red"], coverageOutputRoot: output }; },
    log: (message) => logs.push(message),
  });
  assert.equal(fail, 1);
  assert.equal(calls[1][3].outputRoot, output);
  assert.equal(calls[1][3].preserveOutput, true);
  assert.equal(calls[1][3].validatorScript, "/trusted/changed-coverage.mjs");
  assert.equal(logs.at(-2), "red");
  assert.match(logs.at(-1), /Coverage artifacts preserved at:/);
  assert.match(logs.at(-1), new RegExp(output));
});

test("full-suite pins exact head and detects a mid-run clean commit swap", async () => {
  const { root, base } = fixture();
  await assert.rejects(runFullCoverageGate(root, undefined, "HEAD", fixtureCheckout), /requires a validated --base/);
  await assert.rejects(runFullCoverageGate(root, base, base, {
    ...fixtureCheckout,
    launchWorker: () => {},
    finalize: () => ({ pass: true, lines: [] }),
  }), /does not equal checked-out commit/);

  await assert.rejects(runFullCoverageGate(root, base, "HEAD", {
    ...fixtureCheckout,
    launchWorker: () => git(root, "commit", "--allow-empty", "-qm", "launcher mid-run swap"),
    finalize: () => assert.fail("collector must not run after launcher head swap"),
  }), /checked-out HEAD changed from expected commit/);

  const output = mkdtempSync(join(tmpdir(), "hrms-head-swap-"));
  roots.push(output);
  process.env.HRMS_COVERAGE_OUTPUT_DIR = output;
  const expectedHead = git(root, "rev-parse", "HEAD");
  try {
    assert.throws(() => runFullCoverageWorker(root, output, expectedHead,
      { node: "/trusted/node", pnpm: "/trusted/pnpm", python: "/trusted/python3", bash: "/trusted/bash" }, () => {
        git(root, "commit", "--allow-empty", "-qm", "mid-run clean commit swap");
      }), /checked-out HEAD changed from expected commit/);
  } finally {
    delete process.env.HRMS_COVERAGE_OUTPUT_DIR;
  }
});

test("read-only exact-commit checkout rejects an ordinary transient write and is removed after failure", async () => {
  const { root, base } = fixture();
  write(root, ".gitignore", "node_modules\n");
  write(root, "hrms-client/package.json", "{}\n");
  git(root, "add", ".gitignore", "hrms-client/package.json");
  git(root, "commit", "-qm", "ignore fixture dependencies");
  mkdirSync(join(root, "hrms_backend/node_modules"), { recursive: true });
  mkdirSync(join(root, "hrms-client/node_modules"), { recursive: true });
  let checkout;
  await assert.rejects(runFullCoverageGate(root, base, "HEAD", {
    tools: fixtureTools,
    launchWorker: ({ root: sourceRoot }) => {
      checkout = sourceRoot;
      const tracked = join(sourceRoot, "hrms_backend/src/decision.ts");
      const original = readFileSync(tracked, "utf8");
      try {
        writeFileSync(tracked, `${original}// transient mutation\n`);
        writeFileSync(tracked, original);
      } catch (error) {
        throw new Error(`transient mutation blocked: ${error.code}`);
      }
    },
    finalize: () => assert.fail("collector must not run after mutation attempt"),
  }), /transient mutation blocked: EACCES|transient mutation blocked: EPERM/);
  assert.equal(existsSync(checkout), false);
  assert.equal(git(root, "worktree", "list", "--porcelain").includes("exact-commit-checkout"), false);
});

test("exact-commit checkout cleans up when installed package dependencies are absent", async () => {
  const { root, base } = fixture();
  write(root, "hrms-client/package.json", "{}\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "add package without installed dependencies");
  let outputRoot;
  await assert.rejects(runFullCoverageGate(root, base, "HEAD", {
    tools: fixtureTools,
    launchWorker: () => assert.fail("worker must not launch without installed dependencies"),
    finalize: () => assert.fail("collector must not run without installed dependencies"),
  }).catch((error) => {
    outputRoot = process.env.HRMS_COVERAGE_OUTPUT_DIR;
    throw error;
  }), /requires installed hrms_backend\/node_modules/);
  assert.equal(outputRoot, undefined);
  assert.equal(git(root, "worktree", "list", "--porcelain").includes("exact-commit-checkout"), false);
});

test("exact-commit checkout rejects tracked nonregular entries and cleanup is idempotent", async () => {
  const { root, base } = fixture();
  write(root, ".gitignore", "node_modules\n");
  write(root, "hrms-client/package.json", "{}\n");
  symlinkSync("hrms_backend/src/decision.ts", join(root, "linked-source.ts"));
  git(root, "add", ".");
  git(root, "commit", "-qm", "tracked symlink");
  mkdirSync(join(root, "hrms_backend/node_modules"), { recursive: true });
  mkdirSync(join(root, "hrms-client/node_modules"), { recursive: true });
  await assert.rejects(runFullCoverageGate(root, base, "HEAD", {
    tools: fixtureTools,
    launchWorker: () => assert.fail("worker must not run with a tracked symlink"),
  }), /unsupported tracked entry/);
  removeExactCommitCheckout(root, undefined);
  removeExactCommitCheckout(root, join(root, "missing-checkout"));
  assert.equal(git(root, "worktree", "list", "--porcelain").includes("exact-commit-checkout"), false);
});

test("exact-commit checkout applies read-only regular and executable modes before cleanup", async () => {
  const { root, base } = fixture();
  write(root, ".gitignore", "node_modules\n");
  write(root, "hrms-client/package.json", "{}\n");
  write(root, "scripts/agent/tool.sh", "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(join(root, "scripts/agent/tool.sh"), 0o755);
  git(root, "add", ".");
  git(root, "commit", "-qm", "regular mode fixtures");
  mkdirSync(join(root, "hrms_backend/node_modules"), { recursive: true });
  mkdirSync(join(root, "hrms-client/node_modules"), { recursive: true });
  let checked = false;
  const result = await runFullCoverageGate(root, base, "HEAD", {
    tools: fixtureTools,
    launchWorker: ({ root: checkout }) => {
      assert.equal((lstatSync(join(checkout, "scripts/agent/tool.sh")).mode & 0o777), 0o555);
      assert.equal((lstatSync(join(checkout, "hrms-client/package.json")).mode & 0o777), 0o444);
      assert.equal((lstatSync(checkout).mode & 0o777), 0o555);
      assert.equal((lstatSync(join(checkout, "scripts")).mode & 0o777), 0o555);
      checked = true;
    },
    finalize: () => ({ pass: true, lines: [] }),
  });
  assert.equal(result.pass, true);
  assert.equal(checked, true);
});

test("external program coverage is stamped and config-style TypeScript remains unmeasured", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-external-coverage-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "README.md", "base\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  const path = "scripts/agent/guard.mjs";
  write(root, path, "export function guard(value) {\n  if (value) return 'allow';\n  return 'deny';\n}\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "add guard");
  assert.equal(instrumentableExternal(path), true);
  assert.equal(instrumentableExternal("hrms-client/vitest.config.ts"), false);
  assert.throws(() => verify(root, base, "HEAD"), /missing fresh coverage report/);

  const absolute = join(root, path);
  writeCoverage(root, "external", JSON.stringify({ [absolute]: {
    path: absolute,
    statementMap: {
      0: { start: { line: 2 }, end: { line: 2 } },
      1: { start: { line: 3 }, end: { line: 3 } },
    },
    s: { 0: 1, 1: 1 },
    fnMap: { 0: { name: "guard", decl: { start: { line: 1 }, end: { line: 1 } }, loc: { start: { line: 1 }, end: { line: 4 } } } },
    f: { 0: 2 },
    branchMap: { 0: { type: "if", loc: { start: { line: 2 }, end: { line: 3 } }, locations: [
      { start: { line: 2 }, end: { line: 2 } }, { start: { line: 3 }, end: { line: 3 } },
    ] } },
    b: { 0: [1, 1] },
  } }));
  stampExternalReport(root);
  assert.equal(verify(root, base, "HEAD").pass, true);
  const stampPath = join(dirname(coverageArtifactPath(root, "external")), "coverage-stamp.json");
  const malformedStamp = JSON.parse(readFileSync(stampPath, "utf8"));
  malformedStamp.sources = null;
  writeFileSync(stampPath, JSON.stringify(malformedStamp));
  assert.throws(() => verify(root, base, "HEAD"), /stale, modified or source-mismatched/);
  stampExternalReport(root);
  writeCoverage(root, "external", "{}\n");
  assert.throws(() => verify(root, base, "HEAD"), /no source entries|stale/);

  writeCoverage(root, "external", JSON.stringify({ [absolute]: {
    path: absolute, statementMap: {}, s: {}, fnMap: {}, f: {}, branchMap: {}, b: {},
  } }));
  stampExternalReport(root);
  write(root, "hrms-client/vitest.config.ts", "export default {};\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "config remains nonnumeric");
  stampExternalReport(root);
  const red = verify(root, base, "HEAD");
  assert.equal(red.pass, false);
  assert.ok(red.totals.uncovered.some((item) => item.includes("hrms-client/vitest.config.ts")));
});

test("external report validation rejects malformed, unsupported and deleted sources", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-external-invalid-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "scripts/agent/live.mjs", "export const live = true;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "live script");
  const base = git(root, "rev-parse", "HEAD");
  writeCoverage(root, "external", "[]\n");
  assert.throws(() => stampExternalReport(root), /malformed coverage report/);
  writeCoverage(root, "external", JSON.stringify({
    [join(root, "missing.config.ts")]: {},
  }));
  assert.throws(() => stampExternalReport(root), /missing path/);
  execFileSync("git", ["rm", "-q", "scripts/agent/live.mjs"], { cwd: root });
  git(root, "commit", "-qm", "delete script");
  const diff = changedLines(root, base, "HEAD");
  assert.ok(diff.deletionOnly.includes("scripts/agent/live.mjs:deleted external executable file"));
});

test("external reports reject aliases, embedded mismatches, malformed maps and invalid counts", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-external-adversarial-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "README.md", "base\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  const path = "scripts/agent/live.mjs";
  const other = "scripts/agent/other.mjs";
  write(root, path, "export const live = true;\n");
  write(root, other, "export const other = true;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "coverage sources");
  const absolute = join(root, path);
  const valid = externalEntry(root, path);

  writeCoverage(root, "external", JSON.stringify({}));
  assert.throws(() => stampExternalReport(root), /no source entries/);

  writeCoverage(root, "external", JSON.stringify({ [absolute]: null }));
  assert.throws(() => stampExternalReport(root), /malformed coverage entry/);

  writeCoverage(root, "external", JSON.stringify({
    [absolute]: valid,
    [path]: valid,
  }));
  assert.throws(() => stampExternalReport(root), /duplicate normalized coverage source/);

  writeCoverage(root, "external", JSON.stringify({
    [absolute]: { ...valid, path: join(root, other) },
  }));
  assert.throws(() => stampExternalReport(root), /embedded path does not match/);

  writeCoverage(root, "external", JSON.stringify({
    "scripts/agent/../agent/live.mjs": valid,
  }));
  assert.throws(() => stampExternalReport(root), /non-canonical coverage source path/);

  writeCoverage(root, "external", JSON.stringify({
    [absolute]: { ...valid, path: "scripts/agent/../agent/live.mjs" },
  }));
  assert.throws(() => stampExternalReport(root), /non-canonical coverage source path/);

  for (const key of ["", "../outside.mjs", "bad\0path.mjs"]) {
    writeCoverage(root, "external", JSON.stringify({ [key]: valid }));
    assert.throws(() => stampExternalReport(root), /non-empty string|outside the repository/);
  }

  write(root, "scripts/agent/existing.config.ts", "export default {};\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "unsupported config source");
  const configAbsolute = join(root, "scripts/agent/existing.config.ts");
  writeCoverage(root, "external", JSON.stringify({
    [configAbsolute]: { ...valid, path: configAbsolute },
  }));
  assert.throws(() => stampExternalReport(root), /unsupported coverage source/);

  for (const [label, mutate] of [
    ["missing statement count", (entry) => { entry.s = {}; }],
    ["malformed statement map", (entry) => { entry.statementMap = []; }],
    ["malformed statement location", (entry) => { entry.statementMap[0] = null; }],
    ["invalid statement line", (entry) => { entry.statementMap[0].start.line = 0; }],
    ["invalid statement column", (entry) => { entry.statementMap[0].start.column = "zero"; }],
    ["malformed function entry", (entry) => { entry.fnMap = { 0: null }; entry.f = { 0: 1 }; }],
    ["malformed branch map", (entry) => { entry.branchMap[0].locations = []; }],
    ["malformed branch counts", (entry) => { entry.b = { 0: [] }; }],
    ["branch length mismatch", (entry) => { entry.b = { 0: [1] }; }],
    ["negative branch count", (entry) => { entry.b = { 0: [1, -1] }; }],
    ["nonfinite branch count", (entry) => { entry.b = { 0: [1, null] }; }],
  ]) {
    const entry = structuredClone(valid);
    mutate(entry);
    writeCoverage(root, "external", JSON.stringify({ [absolute]: entry }));
    assert.throws(() => stampExternalReport(root), /coverage map|coverage location|coverage column|function map|branch map|branch count|coverage count/, label);
  }

  for (const count of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const entry = externalEntry(root, path, [1, count]);
    assert.throws(() => assessChangedFile(path, new Set([1]), "if (live) allow();\n", entry), /coverage count/);
  }
  const zero = assessChangedFile(path, new Set([1]), "if (live) allow();\n", externalEntry(root, path, [1, 0]));
  assert.deepEqual(zero.uncoveredBranches, ["1:0"]);
  const malformed = externalEntry(root, path);
  malformed.b[0] = null;
  assert.throws(() => assessChangedFile(path, new Set([1]), "if (live) allow();\n", malformed), /malformed branch counts/);
});

test("whole-repository clean-tree checks reject every dirty or staged input class and later commits", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-external-dependencies-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "README.md", "base\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  const path = "scripts/agent/live.mjs";
  write(root, path, "export const live = true;\n");
  write(root, "docs/readme.md", "tracked docs\n");
  write(root, "scripts/helpers/python_helper.py", "VALUE = True\n");
  write(root, "hrms_backend/src/mock-helper.ts", "export const helper = true;\n");
  write(root, "hrms_backend/vitest.config.ts", "export default { setupFiles: ['./setup.ts'] };\n");
  write(root, "hrms_backend/setup.ts", "export {};\n");
  write(root, "hrms_backend/tsconfig.json", "{\"extends\":\"../configs/base.json\"}\n");
  write(root, "configs/base.json", "{}\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "covered source and dependencies");
  const absolute = join(root, path);
  writeCoverage(root, "external", JSON.stringify({ [absolute]: externalEntry(root, path) }));
  const stamp = stampExternalReport(root);
  assert.equal(stamp.head, git(root, "rev-parse", "HEAD"));

  write(root, "bounded-diagnostic.txt", "untracked\n");
  for (let index = 0; index < 20; index += 1) {
    write(root, `diagnostic-${String(index).padStart(2, "0")}.txt`, "untracked\n");
  }
  assert.throws(
    () => assertCleanRepository(root, "diagnostic fixture"),
    /diagnostic fixture:.*status entries: "\?\? bounded-diagnostic\.txt".*\.\.\. 1 more/,
  );
  rmSync(join(root, "bounded-diagnostic.txt"));
  for (let index = 0; index < 20; index += 1) {
    rmSync(join(root, `diagnostic-${String(index).padStart(2, "0")}.txt`));
  }

  for (const [dirtyPath, content] of [
    ["docs/readme.md", "dirty docs\n"],
    ["scripts/helpers/python_helper.py", "VALUE = False\n"],
    ["hrms_backend/src/mock-helper.ts", "vi.mock('./other');\n"],
    ["hrms_backend/vitest.config.ts", "export default { setupFiles: ['./other.ts'] };\n"],
    ["hrms_backend/setup.ts", "throw new Error('changed');\n"],
    ["hrms_backend/tsconfig.json", "{\"extends\":\"../other.json\"}\n"],
    ["configs/base.json", "{\"compilerOptions\":{\"strict\":true}}\n"],
  ]) {
    write(root, dirtyPath, content);
    assert.throws(() => stampExternalReport(root), /worktree and index must be completely clean/, dirtyPath);
    assert.throws(() => verify(root, base, "HEAD"), /worktree and index must be completely clean/, dirtyPath);
    git(root, "checkout", "--", dirtyPath);
  }

  write(root, "docs/readme.md", "staged docs\n");
  git(root, "add", "docs/readme.md");
  assert.throws(() => stampExternalReport(root), /worktree and index must be completely clean/);
  git(root, "reset", "-q", "HEAD", "--", "docs/readme.md");
  git(root, "checkout", "--", "docs/readme.md");

  for (const dirtyPath of ["scripts/untracked-helper.py", "hrms_backend/untracked.config.ts", "scripts/untracked-helper.mjs"]) {
    write(root, dirtyPath, "untracked\n");
    assert.throws(() => stampExternalReport(root), /worktree and index must be completely clean/, dirtyPath);
    rmSync(join(root, dirtyPath));
  }

  rmSync(join(root, "scripts/helpers/python_helper.py"));
  assert.throws(() => stampExternalReport(root), /worktree and index must be completely clean/);
  git(root, "checkout", "--", "scripts/helpers/python_helper.py");

  git(root, "mv", "docs/readme.md", "docs/renamed.md");
  assert.throws(() => stampExternalReport(root), /worktree and index must be completely clean/);
  git(root, "reset", "-q", "HEAD", "--", "docs/readme.md", "docs/renamed.md");
  rmSync(join(root, "docs/renamed.md"));
  git(root, "checkout", "--", "docs/readme.md");

  write(root, "docs/readme.md", "committed after stamp\n");
  git(root, "add", "docs/readme.md");
  git(root, "commit", "-qm", "later commit");
  assert.throws(() => verify(root, base, "HEAD"), /stale, modified|stale or modified/);
});

test("whole-commit cleanliness covers loader-form inputs without brittle source parsing", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-external-dependency-loaders-"));
  roots.push(root);
  git(root, "init", "-q");
  const path = "scripts/agent/live.mjs";
  const setupPath = "hrms_backend/scripts/test-setup.ts";
  write(root, path, "export const live = true;\n");
  write(root, setupPath, "import './missing.js';\n");
  write(root, "hrms_backend/tsconfig.json", "{}\n");
  write(root, "hrms_backend/package.json", JSON.stringify({ dependencies: { "manifest-bound-package": "1.0.0" } }));
  git(root, "add", ".");
  git(root, "commit", "-qm", "unresolved setup dependency");
  const absolute = join(root, path);
  writeCoverage(root, "external", JSON.stringify({ [absolute]: externalEntry(root, path) }));
  assert.doesNotThrow(() => stampExternalReport(root));

  write(root, setupPath, "const target = './missing.js';\nvoid import(target);\n");
  git(root, "add", setupPath);
  git(root, "commit", "-qm", "nonliteral setup dependency");
  assert.doesNotThrow(() => stampExternalReport(root));

  write(root, setupPath, "import.meta.glob('./fixtures/*.ts');\n");
  git(root, "add", setupPath);
  git(root, "commit", "-qm", "opaque setup dependency");
  assert.doesNotThrow(() => stampExternalReport(root));

  write(root, "hrms_backend/scripts/dependency.ts", "export const dependency = true;\n");
  write(root, setupPath, "export { dependency } from './dependency.js';\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "static export dependency");
  assert.doesNotThrow(() => stampExternalReport(root));

  write(root, setupPath, "import dependency = require('./dependency.js');\nvoid dependency;\n");
  git(root, "add", setupPath);
  git(root, "commit", "-qm", "import equals dependency");
  assert.doesNotThrow(() => stampExternalReport(root));

  write(root, setupPath, "void require('./dependency.js');\n");
  git(root, "add", setupPath);
  git(root, "commit", "-qm", "literal require dependency");
  assert.doesNotThrow(() => stampExternalReport(root));

  write(root, setupPath, "import { createRequire as makeRequire } from 'node:module';\nconst loader = makeRequire(import.meta.url);\nvoid loader('./dependency.js');\n");
  git(root, "add", setupPath);
  git(root, "commit", "-qm", "local createRequire alias");
  assert.doesNotThrow(() => stampExternalReport(root));

  write(root, setupPath, "import { createRequire } from 'node:module';\nconst loader = createRequire(import.meta.url);\nconst target = 'package';\nvoid loader(target);\n");
  git(root, "add", setupPath);
  git(root, "commit", "-qm", "nonliteral createRequire alias");
  assert.doesNotThrow(() => stampExternalReport(root));

  write(root, setupPath, "import { createRequire } from 'node:module';\nconst loader = createRequire(import.meta.url);\nvoid loader('manifest-bound-package');\n");
  git(root, "add", setupPath);
  git(root, "commit", "-qm", "package createRequire alias");
  assert.doesNotThrow(() => stampExternalReport(root));

  write(root, setupPath, "import 'manifest-bound-package';\n");
  git(root, "add", setupPath);
  git(root, "commit", "-qm", "manifest-bound unresolved package import");
  assert.doesNotThrow(() => stampExternalReport(root));

  write(root, setupPath, "void import(new URL('./dependency.ts', import.meta.url).href);\n");
  git(root, "add", setupPath);
  git(root, "commit", "-qm", "static file URL dependency");
  assert.doesNotThrow(() => stampExternalReport(root));

  write(root, "hrms_backend/tsconfig.json", JSON.stringify({ compilerOptions: {
    baseUrl: ".", paths: { "@helpers/*": ["scripts/*"] },
  } }));
  write(root, setupPath, "import '@helpers/dependency';\n");
  git(root, "add", setupPath, "hrms_backend/tsconfig.json");
  git(root, "commit", "-qm", "TypeScript path alias dependency");
  assert.doesNotThrow(() => stampExternalReport(root));
  write(root, "hrms_backend/scripts/dependency.ts", "export const dependency = false;\n");
  assert.throws(() => stampExternalReport(root), /worktree and index must be completely clean/);
  git(root, "checkout", "--", "hrms_backend/scripts/dependency.ts");
  write(root, setupPath, "import '@helpers/missing';\n");
  assert.throws(() => stampExternalReport(root), /worktree and index must be completely clean/);
  git(root, "checkout", "--", setupPath);

  write(root, "scripts/agent/changed-coverage.mjs", "void import(pathToFileURL(coverageRequire.resolve('vite')).href);\n");
  git(root, "add", "scripts/agent/changed-coverage.mjs");
  git(root, "commit", "-qm", "package resolved report dependency");
  assert.doesNotThrow(() => stampExternalReport(root));

  write(root, "hrms_backend/scripts/untracked.ts", "export const untracked = true;\n");
  write(root, setupPath, "import './untracked.js';\n");
  assert.throws(() => stampExternalReport(root), /worktree and index must be completely clean/);
  rmSync(join(root, "hrms_backend/scripts/untracked.ts"));
  git(root, "checkout", "--", setupPath);

  const outsideRoot = mkdtempSync(join(tmpdir(), "hrms-external-outside-"));
  roots.push(outsideRoot);
  const outsidePath = join(outsideRoot, "outside.ts");
  writeFileSync(outsidePath, "export const outside = true;\n");
  write(root, setupPath, `import '${outsidePath}';\n`);
  assert.throws(() => stampExternalReport(root), /worktree and index must be completely clean/);
  git(root, "checkout", "--", setupPath);

  rmSync(join(root, setupPath));
  assert.throws(() => stampExternalReport(root), /worktree and index must be completely clean/);
});

test("external report and source paths reject symlinks and intermediate symlinks before reads", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-external-file-modes-"));
  const outsideRoot = mkdtempSync(join(tmpdir(), "hrms-external-target-"));
  roots.push(root, outsideRoot);
  git(root, "init", "-q");
  assert.throws(() => assertRegularRepositoryFile(root, "../outside.mjs", "fixture"), /outside the repository or non-canonical/);
  const path = "scripts/agent/live.mjs";
  const fullPath = join(root, path);
  const outsidePath = join(outsideRoot, "outside.mjs");
  writeFileSync(outsidePath, "throw new Error('outside source must not execute');\n");
  mkdirSync(dirname(fullPath), { recursive: true });
  symlinkSync(outsidePath, fullPath);
  git(root, "add", path);
  git(root, "commit", "-qm", "tracked source symlink");
  writeCoverage(root, "external", JSON.stringify({ [fullPath]: externalEntry(root, path) }));
  assert.throws(() => stampExternalReport(root), /coverage source: path contains a symbolic-link component/);

  rmSync(fullPath);
  write(root, path, "export const live = true;\n");
  git(root, "add", path);
  git(root, "commit", "-qm", "restore regular source");

  const untrackedTest = join(root, "scripts/agent/untracked.test.mjs");
  symlinkSync(outsidePath, untrackedTest);
  assert.throws(() => stampExternalReport(root), /worktree and index must be completely clean/);
  rmSync(untrackedTest);

  const intermediateTarget = join(root, "scripts/real");
  write(root, "scripts/real/live.mjs", "export const value = true;\n");
  symlinkSync(intermediateTarget, join(root, "scripts/link"), "dir");
  assert.throws(() => assertRegularRepositoryFile(root, "scripts/link/live.mjs", "intermediate"), /symbolic-link component/);
  rmSync(join(root, "scripts/link"));
  rmSync(intermediateTarget, { recursive: true });

  const reportPath = coverageArtifactPath(root, "external");
  const reportContents = readFileSync(reportPath);
  const outsideReport = join(outsideRoot, "coverage-final.json");
  writeFileSync(outsideReport, reportContents);
  rmSync(reportPath);
  symlinkSync(outsideReport, reportPath);
  assert.throws(() => stampExternalReport(root), /coverage artifact path contains a symbolic link/);
  rmSync(reportPath);
  writeFileSync(reportPath, reportContents);
  const stampPath = join(dirname(reportPath), "coverage-stamp.json");
  const outsideStamp = join(outsideRoot, "coverage-stamp.json");
  writeFileSync(outsideStamp, "{}\n");
  symlinkSync(outsideStamp, stampPath);
  assert.throws(() => stampExternalReport(root), /coverage artifact path contains a symbolic link/);
  rmSync(stampPath);

  const gitlinkPath = join(root, "scripts/agent/linked.mjs");
  mkdirSync(gitlinkPath, { recursive: true });
  git(gitlinkPath, "init", "-q");
  write(gitlinkPath, "README.md", "nested repository\n");
  git(gitlinkPath, "add", ".");
  git(gitlinkPath, "commit", "-qm", "nested");
  git(root, "-c", "advice.addEmbeddedRepo=false", "add", "scripts/agent/linked.mjs");
  git(root, "commit", "-qm", "tracked gitlink source");
  writeCoverage(root, "external", JSON.stringify({ [gitlinkPath]: externalEntry(root, "scripts/agent/linked.mjs") }));
  assert.throws(() => stampExternalReport(root), /not a regular Git file \(160000\)/);
});

test("coverage artifact validators reject in-repo, relative, missing and nonregular paths", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-artifact-validation-"));
  const outside = mkdtempSync(join(tmpdir(), "hrms-artifact-outside-"));
  roots.push(root, outside);
  git(root, "init", "-q");
  write(root, "tracked.mjs", "export const tracked = true;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "tracked source");

  assert.throws(() => coverageArtifactPath(root, "unknown"), /Unknown package/);
  const previous = process.env.HRMS_COVERAGE_OUTPUT_DIR;
  process.env.HRMS_COVERAGE_OUTPUT_DIR = join(root, "coverage");
  try {
    assert.throws(() => coverageArtifactPath(root, "external"), /outside the repository/);
  } finally {
    if (previous === undefined) delete process.env.HRMS_COVERAGE_OUTPUT_DIR;
    else process.env.HRMS_COVERAGE_OUTPUT_DIR = previous;
  }

  write(root, "untracked.mjs", "export const value = true;\n");
  assert.throws(() => assertRegularRepositoryFile(root, "untracked.mjs", "source", true), /not tracked/);
  assert.throws(() => assertRegularRepositoryFile(root, "missing.mjs", "source"), /missing path/);
  mkdirSync(join(root, "directory.mjs"));
  assert.throws(() => assertRegularRepositoryFile(root, "directory.mjs", "source"), /not a regular filesystem file/);

  const regular = join(outside, "report.json");
  writeFileSync(regular, "{}\n");
  assert.throws(() => assertExternalArtifact(root, "relative.json", "report"), /absolute and canonical/);
  assert.throws(() => assertExternalArtifact(root, join(root, "tracked.mjs"), "report"), /outside the repository/);
  assert.throws(() => assertExternalArtifact(root, join(outside, "missing.json"), "report"), /missing coverage artifact/);
  assert.throws(() => assertExternalArtifact(root, outside, "report"), /not a regular file/);
  assert.equal(assertExternalArtifact(root, outside, "report directory", true), outside);
  assert.throws(() => assertExternalArtifact(root, regular, "report directory", true), /not a regular directory/);
  assert.throws(() => assertExternalArtifactDestination(root, "relative-output.json", "report"), /absolute and canonical/);
  assert.throws(() => assertExternalArtifactDestination(root, join(root, "output.json"), "report"), /outside the repository/);
  assert.throws(() => assertExternalArtifactDestination(root, outside, "report"), /destination is not a regular file/);
  assert.equal(assertExternalArtifact(root, regular, "report"), regular);

  const blob = git(root, "hash-object", "tracked.mjs");
  execFileSync("git", ["update-index", "--force-remove", "tracked.mjs"], { cwd: root });
  execFileSync("git", ["update-index", "--index-info"], {
    cwd: root,
    input: `100644 ${blob} 1\ttracked.mjs\n100644 ${blob} 2\ttracked.mjs\n`,
  });
  assert.throws(() => assertRegularRepositoryFile(root, "tracked.mjs", "source"), /unresolved index stages/);
});

test("raw Node V8 coverage is converted with real source and branch locations", async () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-node-v8-external-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "README.md", "base\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  const path = "scripts/agent/probe.mjs";
  write(root, path, "import assert from 'node:assert/strict';\nexport function decide(value) {\n  if (value) return 'yes';\n  return 'no';\n}\nassert.equal(decide(true), 'yes');\nassert.equal(decide(false), 'no');\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "covered probe");
  const rawDirectory = join(dirname(coverageArtifactPath(root, "external")), "raw-node");
  mkdirSync(rawDirectory, { recursive: true });
  await assert.rejects(buildExternalCoverage(root, { nodeV8: [rawDirectory] }), /No raw Node V8 coverage files found/);
  writeFileSync(join(rawDirectory, "irrelevant.json"), JSON.stringify({ result: [
    { scriptId: "1", url: "node:internal/test", functions: [] },
    { scriptId: "2", url: new URL("file:///outside/not-in-repo.mjs").href, functions: [] },
  ] }));
  await assert.rejects(buildExternalCoverage(root, { nodeV8: [rawDirectory] }), /produced no instrumentable sources/);
  rmSync(join(rawDirectory, "irrelevant.json"));
  const execution = spawnSync(process.execPath, [join(root, path)], {
    cwd: root, env: { ...process.env, NODE_V8_COVERAGE: rawDirectory }, encoding: "utf8",
  });
  assert.equal(execution.status, 0, execution.stderr);
  const combined = await buildExternalCoverage(root, { nodeV8: [rawDirectory] });
  const entry = combined[join(root, path)];
  assert.ok(entry);
  assert.ok(Object.values(entry.s).every((count) => count > 0));
  assert.ok(Object.values(entry.b).flat().every((count) => count > 0));
  const imported = Object.entries(entry.statementMap).find(([, location]) => location.start.line === 1);
  assert.ok(imported, "executed static import receives explicit module-evaluation coverage");
  assert.ok(entry.s[imported[0]] > 0);
  stampExternalReport(root);
  assert.equal(verify(root, base, "HEAD").pass, true);

  const unique = {};
  addUniqueRawCoverageEntry(unique, "covered", { path });
  assert.deepEqual(unique.covered, { path });
  assert.throws(() => addUniqueRawCoverageEntry(unique, "covered", { path }), /Duplicate raw V8 coverage source/);
});

test("module-evaluation attribution covers value modules without inventing type-only execution", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-module-evaluation-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "scripts/agent/dependency.ts", "export const dependency = 1;\n");
  const source = [
    "import type { TypeOnly } from './types.js';",
    "export type { OtherType } from './types.js';",
    "import { dependency } from './dependency.js';",
    "export { dependency } from './dependency.js';",
    "dependency + 1;",
    "export const local = dependency;",
    "",
  ].join("\n");
  write(root, "scripts/agent/module.ts", source);
  write(root, "scripts/agent/module.tsx", "export const view = <div />;\n");
  write(root, "scripts/agent/module.js", "export const js = true;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "module sources");
  const baseEntry = {
    path: join(root, "scripts/agent/module.ts"),
    statementMap: { 0: { start: { line: 6, column: 0 }, end: { line: 6, column: 32 } } },
    s: { 0: 1 }, fnMap: {}, f: {}, branchMap: {}, b: {},
  };
  const attributed = addEvaluatedModuleStatements(root, "scripts/agent/module.ts", baseEntry);
  const attributedLines = Object.values(attributed.statementMap).map((location) => location.start.line).sort((a, b) => a - b);
  assert.deepEqual(attributedLines, [3, 4, 5, 6]);
  assert.ok(Object.values(attributed.s).every((count) => count > 0));
  assert.equal(addEvaluatedModuleStatements(root, "scripts/agent/module.ts", { statementMap: {}, s: {}, fnMap: {}, f: {}, branchMap: {}, b: {} }).statementMap[0], undefined);
  assert.equal(addEvaluatedModuleStatements(root, "scripts/agent/module.ts", { statementMap: {} }).statementMap[0], undefined);
  assert.equal(addEvaluatedModuleStatements(root, "scripts/agent/check.py", baseEntry), baseEntry);
  for (const path of ["scripts/agent/module.tsx", "scripts/agent/module.js"]) {
    const value = addEvaluatedModuleStatements(root, path, { ...baseEntry, path: join(root, path) });
    assert.equal(value.s[0], 1);
  }
});

test("Python line and arc coverage is converted without inventing executable lines", async () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-python-external-"));
  roots.push(root);
  git(root, "init", "-q");
  const path = "scripts/agent/check.py";
  write(root, path, "def check(value):\n    if value:\n        return True\n    return False\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "python source");
  const pythonReport = writeArtifact(root, "python.json", JSON.stringify({ files: { [path]: {
    executed_lines: [1, 2, 3, 4], missing_lines: [],
    executed_branches: [[2, 3], [2, 4]], missing_branches: [],
  } } }));
  const combined = await buildExternalCoverage(root, { python: [pythonReport] });
  const entry = combined[join(root, path)];
  assert.deepEqual(Object.values(entry.s), [1, 1, 1, 1]);
  assert.deepEqual(Object.values(entry.b), [[1, 1]]);
  assert.equal(assessChangedFile(path, new Set([1, 2, 3, 4]), readFileSync(join(root, path), "utf8"), entry).uncovered.length, 0);

  const partialPython = writeArtifact(root, "partial-python.json", JSON.stringify({ files: { [path]: {
    executed_lines: [1, 2], missing_lines: [3, 4],
    executed_branches: [[2, 3], [-1, 0]], missing_branches: [[2, 4]],
  } } }));
  const partial = await buildExternalCoverage(root, { python: [partialPython] });
  assert.deepEqual(Object.values(partial[join(root, path)].s), [1, 1, 0, 0]);
  assert.deepEqual(Object.values(partial[join(root, path)].b), [[1, 0]]);

  const badPython = writeArtifact(root, "bad-python.json", "{}\n");
  await assert.rejects(buildExternalCoverage(root, { python: [badPython] }), /Malformed Python coverage JSON/);
  writeFileSync(badPython, JSON.stringify({ files: { [path]: {
    executed_lines: [0], missing_lines: [], executed_branches: [], missing_branches: [],
  } } }));
  await assert.rejects(buildExternalCoverage(root, { python: [badPython] }), /Malformed Python line coverage/);
  writeFileSync(badPython, JSON.stringify({ files: { [path]: {
    executed_lines: [1], missing_lines: [], executed_branches: [[1]], missing_branches: [],
  } } }));
  await assert.rejects(buildExternalCoverage(root, { python: [badPython] }), /Malformed Python branch coverage/);

  write(root, "node_modules/check.py", "value = True\n");
  git(root, "add", "-f", "node_modules/check.py");
  git(root, "commit", "-qm", "tracked unsupported coverage source");
  writeFileSync(badPython, JSON.stringify({ files: { "node_modules/check.py": {
    executed_lines: [1], missing_lines: [], executed_branches: [], missing_branches: [],
  } } }));
  await assert.rejects(buildExternalCoverage(root, { python: [badPython] }), /unsupported or missing coverage source/);

  writeFileSync(badPython, JSON.stringify({ files: { [path]: null } }));
  await assert.rejects(buildExternalCoverage(root, { python: [badPython] }), /Malformed Python coverage data/);

  writeFileSync(badPython, JSON.stringify({ files: { [path]: {
    executed_lines: [1], missing_lines: [1], executed_branches: [], missing_branches: [],
  } } }));
  await assert.rejects(buildExternalCoverage(root, { python: [badPython] }), /Conflicting Python line coverage/);

  const validPython = {
    executed_lines: [1], missing_lines: [], executed_branches: [], missing_branches: [],
  };
  writeFileSync(badPython, JSON.stringify({ files: { [path]: validPython, [join(root, path)]: validPython } }));
  await assert.rejects(buildExternalCoverage(root, { python: [badPython] }), /duplicate normalized coverage source/);

  const istanbul = writeArtifact(root, "istanbul.json", JSON.stringify({ [join(root, path)]: entry }));
  await assert.rejects(buildExternalCoverage(root, { istanbul: [istanbul], python: [pythonReport] }), /Duplicate external coverage source/);
});

test("CLI builds and stamps an external Istanbul report", () => {
  const root = mkdtempSync(join(tmpdir(), "hrms-external-cli-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "README.md", "base\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  const path = "scripts/agent/covered.mjs";
  write(root, path, "export const covered = true;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "covered external script");
  const absolute = join(root, path);
  const input = writeArtifact(root, "input-coverage.json", JSON.stringify({ [absolute]: {
    path: absolute, statementMap: { 0: { start: { line: 1 }, end: { line: 1 } } }, s: { 0: 1 },
    branchMap: {}, b: {}, fnMap: {}, f: {},
  } }));
  const executable = new URL("./changed-coverage.mjs", import.meta.url).pathname;
  const built = spawnSync(process.execPath, [executable, "--build-external-report", "--istanbul", input], {
    cwd: root, env: { ...process.env, HRMS_COVERAGE_REPO_ROOT: root }, encoding: "utf8",
  });
  assert.equal(built.status, 0, built.stderr);
  assert.match(built.stdout, /Built and stamped fresh external coverage/);
  const stamped = spawnSync(process.execPath, [executable, "--stamp", "external"], {
    cwd: root, env: { ...process.env, HRMS_COVERAGE_REPO_ROOT: root }, encoding: "utf8",
  });
  assert.equal(stamped.status, 0, stamped.stderr);
  assert.equal(verify(root, base, "HEAD").pass, true);

  const workerOutput = mkdtempSync(join(tmpdir(), "hrms-invalid-worker-"));
  roots.push(workerOutput);
  const missingTools = spawnSync(process.execPath, [executable, "--full-suite-worker", "--coverage-output", workerOutput,
    "--expected-head", git(root, "rev-parse", "HEAD")], {
    cwd: root, env: { ...process.env, HRMS_COVERAGE_REPO_ROOT: root }, encoding: "utf8",
  });
  assert.equal(missingTools.status, 1);
  assert.match(missingTools.stderr, /requires exact head and absolute trusted tool paths/);
  const invalidTools = spawnSync(process.execPath, [executable, "--full-suite-worker", "--coverage-output", workerOutput,
    "--expected-head", git(root, "rev-parse", "HEAD"), "--node", "/missing/node", "--pnpm", "/missing/pnpm",
    "--python", "/missing/python", "--bash", "/missing/bash"], {
    cwd: root, env: { ...process.env, HRMS_COVERAGE_REPO_ROOT: root }, encoding: "utf8",
  });
  assert.equal(invalidTools.status, 1);
  assert.match(invalidTools.stderr, /received invalid node executable/);

  const noOpExecutable = resolveTrustedExecutable("true");
  const workerHead = git(root, "rev-parse", "HEAD");
  const successfulWorker = spawnSync(process.execPath, [executable, "--full-suite-worker", "--coverage-output", workerOutput,
    "--expected-head", workerHead, "--node", noOpExecutable, "--pnpm", noOpExecutable,
    "--python", noOpExecutable, "--bash", noOpExecutable], {
    cwd: root, env: { ...process.env, HRMS_COVERAGE_REPO_ROOT: root }, encoding: "utf8",
  });
  assert.equal(successfulWorker.status, 0, successfulWorker.stderr);
  assert.equal(git(root, "rev-parse", "HEAD"), workerHead);
  assert.equal(git(root, "status", "--porcelain=v1", "--untracked-files=all"), "");
  for (const directory of ["external-input/node-resolver", "external-input/node-gate", "external-input/typescript",
    "home", "xdg-config", "xdg-cache"]) {
    assert.equal(lstatSync(join(workerOutput, directory)).isDirectory(), true, `${directory} worker boundary`);
  }
});
