import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, test } from "node:test";
import { assessChangedFile, changedLines, outsideExecutableOrConfig, stampReport, verify } from "./changed-coverage.mjs";

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
  write(root, "hrms_backend/coverage/coverage-final.json", JSON.stringify({ [file]: coverage }));
  stampReport(root, "backend");
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
});

test("missing and stale reports fail closed", () => {
  const { root, base, head } = fixture();
  assert.throws(() => verify(root, base, head), /missing fresh coverage report/);
  report(root, 1);
  write(root, "hrms_backend/coverage/coverage-final.json", "{invalid");
  assert.throws(() => stampReport(root, "backend"), SyntaxError);
  report(root, 1);
  write(root, "hrms_backend/coverage/coverage-final.json", "[]");
  stampReport(root, "backend");
  assert.throws(() => verify(root, base, head), /malformed coverage report/);
  report(root, 1);
  write(root, "hrms_backend/coverage/coverage-final.json", "{}");
  assert.throws(() => verify(root, base, head), /stale or modified coverage report/);
  report(root, 1);
  write(root, "hrms_backend/src/decision.ts", "export function access(role: string) {\n  if (role === 'admin') return 'allow';\n  return 'other';\n}\n");
  assert.throws(() => verify(root, base, head), /uncommitted source exists/);
  assert.throws(() => stampReport(root, "backend"), /uncommitted source exists/);
  assert.throws(() => changedLines(root, "missing-base", head), /Command failed/);
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
  write(root, "hrms_backend/src/example.unit.test.ts", "// independent test source\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "docs");
  const result = verify(root, base, "HEAD");
  assert.equal(result.pass, true);
  assert.equal(result.totals.executable, 0);
  assert.ok(result.lines.some((line) => line.includes("excluded test/type/generated source")));
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
  assert.deepEqual(diff.outside, ["scripts/agent/probe.py"]);
  assert.deepEqual(diff.testSource, ["scripts/agent/tests/test_probe.py"]);
  report(root, 1);
  const result = verify(root, head, "HEAD");
  assert.equal(result.pass, false);
  assert.ok(result.totals.uncovered.some((item) => item.includes("deletion-only")));
  assert.ok(result.totals.uncovered.some((item) => item.includes("unmeasured executable/config")));
  assert.ok(result.lines.some((line) => line.startsWith("TEST SOURCE scripts/agent/tests/test_probe.py")));
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
  write(root, "hrms_backend/coverage/coverage-final.json", "{}");
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
});

test("type, imports and comments are non-executable but uninstrumented runtime lines fail", () => {
  const content = "import type { X } from 'x';\n// a comment\ntype Id = string;\nexport const value = 1;\n";
  const result = assessChangedFile("hrms_backend/src/extra.ts", new Set([1, 2, 3, 4]), content, undefined);
  assert.deepEqual(result.nonExecutable, [1, 2, 3]);
  assert.deepEqual(result.executable, [4]);
  assert.deepEqual(result.uncovered, ["4 (not instrumented)"]);

  const sideEffect = assessChangedFile("hrms_backend/src/side-effect.ts", new Set([1]), "import './register.js';\n", undefined);
  assert.deepEqual(sideEffect.executable, [1]);
  assert.deepEqual(sideEffect.uncovered, ["1 (not instrumented)"]);
  const valueImport = assessChangedFile("hrms_backend/src/import.ts", new Set([1]), "import { safe } from './unsafe.js';\n", undefined);
  assert.deepEqual(valueImport.executable, [1]);
  assert.deepEqual(valueImport.uncovered, ["1 (not instrumented)"]);
});
