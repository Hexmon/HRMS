import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  write(root, "hrms_backend/coverage/coverage-final.json", JSON.stringify({ [absolute]: {
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
  write(root, "hrms_backend/coverage/coverage-final.json", JSON.stringify({ [absolute]: {
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
  write(root, "hrms_backend/coverage/coverage-final.json", JSON.stringify({ [absolute]: {
    path: absolute, statementMap: { 0: { start: { line: 1 }, end: { line: 1 } } }, s: { 0: 1 },
    branchMap: {}, b: {}, fnMap: {}, f: {},
  } }));
  stampReport(root, "backend");
  const result = verify(root, base, "HEAD");
  assert.equal(result.pass, false);
  assert.ok(result.totals.uncovered.some((item) => item.includes("deleted source file")));
});

test("source type changes, new symlinks, mode-only and binary changes fail without reading symlink targets", () => {
  for (const scenario of ["type change", "added symlink", "mode only", "binary change"]) {
    const root = mkdtempSync(join(tmpdir(), "hrms-coverage-modes-"));
    roots.push(root);
    git(root, "init", "-q");
    const path = scenario === "added symlink" ? "hrms_backend/src/guard:tenant.ts" : "hrms_backend/src/guard.ts";
    write(root, "README.md", "base\n");
    if (scenario !== "added symlink") write(root, path, "export const guard = true;\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "base");
    const base = git(root, "rev-parse", "HEAD");
    if (scenario === "type change") {
      rmSync(join(root, path));
      symlinkSync("missing-target.ts", join(root, path));
    } else if (scenario === "added symlink") {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      symlinkSync("missing-target.ts", join(root, path));
    } else if (scenario === "binary change") {
      write(root, path, Buffer.from("export const guard = false;\0\n"));
    } else {
      chmodSync(join(root, path), 0o755);
    }
    git(root, "add", "-A");
    git(root, "commit", "-qm", scenario);
    const diff = changedLines(root, base, "HEAD");
    assert.equal(diff.modeTransitions.length, 1, `${scenario}: ${JSON.stringify(diff)}`);
    assert.deepEqual(diff.modeTransitions[0].path, path);
    assert.equal(diff.modeTransitions[0].status, scenario === "type change" ? "T" : scenario === "added symlink" ? "A" : "M");
    if (scenario === "binary change") assert.equal(diff.modeTransitions[0].noTextHunk, true);
    const result = verify(root, base, "HEAD");
    assert.equal(result.pass, false, scenario);
    assert.ok(result.totals.uncovered.some((item) => item.includes(`unmeasured source mode/type ${path}`)));
  }
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
  write(root, "hrms-client/coverage/coverage-final.json", JSON.stringify({ [absolute]: entry }));
  stampReport(root, "frontend");
  const uncovered = verify(root, base, "HEAD");
  assert.equal(uncovered.pass, false);
  assert.equal(uncovered.totals.executable, 1);
  assert.ok(uncovered.totals.uncovered.some((item) => item.includes(`${path}:1`)));
  assert.equal(uncovered.totals.uncovered.some((item) => item.includes("unmeasured executable/config")), false);
  assert.ok(uncovered.lines.some((line) => line.includes("Changed executable lines: 0/1")));
  entry.s[0] = 1;
  write(root, "hrms-client/coverage/coverage-final.json", JSON.stringify({ [absolute]: entry }));
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
  const runCoverage = () => spawnSync(vitest, ["run", "--coverage", "--coverage.reporter=json"], { cwd: packageRoot, encoding: "utf8", timeout: 30000 });
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
  const run = spawnSync(vitest, ["run", "--coverage", "--coverage.reporter=json"], { cwd: packageRoot, encoding: "utf8", timeout: 30000 });
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
