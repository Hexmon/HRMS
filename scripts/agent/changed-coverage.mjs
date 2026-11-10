#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = process.env.HRMS_COVERAGE_REPO_ROOT ? resolve(process.env.HRMS_COVERAGE_REPO_ROOT) : toolRoot;
const requireFromBackend = createRequire(join(toolRoot, "hrms_backend/package.json"));
const ts = requireFromBackend("typescript");
const packages = {
  backend: { root: "hrms_backend", report: "hrms_backend/coverage/coverage-final.json" },
  frontend: { root: "hrms-client", report: "hrms-client/coverage/coverage-final.json" },
};

export function outsideExecutableOrConfig(path) {
  const name = path.split("/").at(-1) ?? "";
  return /\.(?:[cm]?[jt]sx?|sh|py|sql)$/.test(path) ||
    /^\.github\/(?:workflows|actions)\/.*\.ya?ml$/.test(path) ||
    /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|vercel\.json|render\.ya?ml|Procfile|Makefile|justfile|\.npmrc)$/.test(name) ||
    /^(?:Dockerfile(?:\..+)?|.+\.Dockerfile|(?:docker-)?compose(?:[.-].+)?\.ya?ml)$/.test(name) ||
    /^(?:wrangler\.(?:jsonc?|toml)|tsconfig(?:\..+)?\.json|.+\.config\.(?:jsonc?|ya?ml|toml))$/.test(name) ||
    /^infra\/.*\.(?:jsonc?|ya?ml|toml)$/.test(path) ||
    /^(?:hrms_backend|hrms-client)\/src\/.*\.json$/.test(path);
}

function isTestOrGenerated(path) {
  return /(?:\.test\.[cm]?[jt]sx?$|\/tests\/test_[^/]+\.py$|\/src\/test\/|\.d\.ts$|\/routeTree\.gen\.ts$)/.test(path);
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
}

export function sourceDigest(root, packageName) {
  const prefix = `${packages[packageName].root}/src`;
  const paths = git(root, "ls-files", "-c", "-o", "--exclude-standard", "--", prefix)
    .split("\n")
    .filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"))
    .sort();
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(path);
    hash.update("\0");
    hash.update(readFileSync(join(root, path)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function assertCleanSource(root, packageName) {
  const prefix = `${packages[packageName].root}/src`;
  const changed = git(root, "status", "--porcelain", "--untracked-files=all", "--", prefix).trim();
  if (changed) throw new Error(`${packageName}: uncommitted source exists; commit the tested source before stamping or verifying PR coverage`);
}

export function stampReport(root, packageName) {
  const packageInfo = packages[packageName];
  if (!packageInfo) throw new Error(`Unknown package: ${packageName}`);
  assertCleanSource(root, packageName);
  const reportPath = join(root, packageInfo.report);
  JSON.parse(readFileSync(reportPath, "utf8"));
  const stamp = {
    head: git(root, "rev-parse", "HEAD").trim(),
    sourceDigest: sourceDigest(root, packageName),
    reportDigest: createHash("sha256").update(readFileSync(reportPath)).digest("hex"),
  };
  writeFileSync(join(dirname(reportPath), "coverage-stamp.json"), `${JSON.stringify(stamp, null, 2)}\n`);
  return stamp;
}

function readReport(root, packageName, head) {
  assertCleanSource(root, packageName);
  const { report } = packages[packageName];
  const reportPath = join(root, report);
  const stampPath = join(dirname(reportPath), "coverage-stamp.json");
  if (!existsSync(reportPath) || !existsSync(stampPath)) {
    throw new Error(`${packageName}: missing fresh coverage report or stamp; run pnpm test:unit:coverage`);
  }
  const raw = readFileSync(reportPath);
  const stamp = JSON.parse(readFileSync(stampPath, "utf8"));
  if (stamp.head !== head || stamp.sourceDigest !== sourceDigest(root, packageName) ||
      stamp.reportDigest !== createHash("sha256").update(raw).digest("hex")) {
    throw new Error(`${packageName}: stale or modified coverage report; rerun pnpm test:unit:coverage at this head`);
  }
  const data = JSON.parse(raw.toString("utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${packageName}: malformed coverage report`);
  }
  const entries = new Map();
  for (const [key, value] of Object.entries(data)) {
    const path = isAbsolute(key) ? relative(root, key) : key;
    entries.set(path.replaceAll("\\", "/"), value);
  }
  return entries;
}

export function changedLines(root, base, head) {
  git(root, "cat-file", "-e", `${base}^{commit}`);
  git(root, "cat-file", "-e", `${head}^{commit}`);
  const mergeBase = git(root, "merge-base", base, head).trim();
  if (!mergeBase) throw new Error(`No merge base for ${base} and ${head}`);
  const diff = git(root, "diff", "--no-ext-diff", "--no-renames", "--unified=0", "--diff-filter=AM", mergeBase, head, "--", "hrms_backend/src", "hrms-client/src");
  const files = new Map();
  const deletionOnly = [];
  const replacementHunks = [];
  let current;
  let state = "outside";
  let oldRemaining = 0;
  let newRemaining = 0;
  for (const line of diff.split("\n")) {
    if (state === "hunk") {
      if (line.startsWith("\\ No newline at end of file")) continue;
      if (line.startsWith("+")) newRemaining--;
      else if (line.startsWith("-")) oldRemaining--;
      else if (line.startsWith(" ")) { oldRemaining--; newRemaining--; }
      else throw new Error(`Malformed diff body in ${current}: ${line}`);
      if (oldRemaining < 0 || newRemaining < 0) throw new Error(`Diff hunk exceeded declared line counts in ${current}`);
      if (oldRemaining === 0 && newRemaining === 0) state = "between-hunks";
      continue;
    }
    if (line.startsWith("diff --git ")) {
      state = "header";
      current = undefined;
    } else if (state === "header" && line.startsWith("+++ b/")) {
      current = line.slice(6);
      files.set(current, files.get(current) ?? new Set());
    } else if ((state === "header" || state === "between-hunks") && line.startsWith("@@ ")) {
      const match = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!match || !current) throw new Error(`Malformed diff hunk: ${line}`);
      const oldStart = Number(match[1]);
      const oldCount = match[2] === undefined ? 1 : Number(match[2]);
      const start = Number(match[3]);
      const count = match[4] === undefined ? 1 : Number(match[4]);
      oldRemaining = oldCount;
      newRemaining = count;
      state = "hunk";
      if (count === 0 && !isTestOrGenerated(current)) deletionOnly.push(`${current}:${line}`);
      if (oldCount > 0 && count > 0 && !isTestOrGenerated(current)) replacementHunks.push({ path: current, oldStart, oldCount, start, count });
      for (let index = 0; index < count; index++) files.get(current).add(start + index);
    }
  }
  if (state === "hunk") throw new Error(`Incomplete diff hunk in ${current}`);
  const raw = git(root, "diff", "--no-ext-diff", "--no-renames", "--raw", "-z", mergeBase, head, "--")
    .split("\0").filter(Boolean);
  if (raw.length % 2 !== 0) throw new Error("Malformed git raw diff: missing path");
  const statuses = [];
  for (let index = 0; index < raw.length; index += 2) {
    const match = /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z])$/.exec(raw[index]);
    if (!match) throw new Error(`Unsupported git raw diff status: ${raw[index]}`);
    statuses.push({ oldMode: match[1], newMode: match[2], status: match[3], path: raw[index + 1] });
  }
  const outside = [];
  const testSource = [];
  const modeTransitions = [];
  for (const { status, path, oldMode, newMode } of statuses) {
    if (!path) continue;
    const instrumentedSource = /^(?:hrms_backend|hrms-client)\/src\/.*\.tsx?$/.test(path);
    const monitored = instrumentedSource || outsideExecutableOrConfig(path);
    if (monitored && (!/^[AMD]$/.test(status) ||
        (status === "A" && newMode !== "100644") ||
        (status === "M" && (oldMode !== "100644" || newMode !== "100644")) ||
        (status === "D" && oldMode !== "100644") ||
        (status === "M" && instrumentedSource && !files.has(path)))) {
      modeTransitions.push({ path, status, oldMode, newMode, noTextHunk: status === "M" && !files.has(path) });
      continue;
    }
    if (/(?:\.test\.[cm]?[jt]sx?$|\/tests\/test_[^/]+\.py$|\/src\/test\/)/.test(path)) {
      testSource.push(path);
      continue;
    }
    if (isTestOrGenerated(path)) continue;
    if (status === "D" && /^(?:hrms_backend|hrms-client)\/src\/.*\.tsx?$/.test(path)) {
      deletionOnly.push(`${path}:deleted source file`);
    } else if (outsideExecutableOrConfig(path) &&
               !/^(?:hrms_backend|hrms-client)\/src\/.*\.tsx?$/.test(path)) {
      outside.push(path);
    }
  }
  const unsafePaths = new Set(modeTransitions.map((item) => item.path));
  const removedRuntime = [];
  for (const hunk of replacementHunks) {
    if (unsafePaths.has(hunk.path)) continue;
    const oldContent = git(root, "show", `${mergeBase}:${hunk.path}`);
    const newContent = readFileSync(join(root, hunk.path), "utf8");
    const oldLines = new Set(Array.from({ length: hunk.oldCount }, (_, index) => hunk.oldStart + index));
    const newLines = new Set(Array.from({ length: hunk.count }, (_, index) => hunk.start + index));
    const oldRuntime = assessChangedFile(hunk.path, oldLines, oldContent, undefined).executable.length;
    const newRuntime = assessChangedFile(hunk.path, newLines, newContent, undefined).executable.length;
    if (oldRuntime > 0 && newRuntime === 0) {
      removedRuntime.push(`${hunk.path}:${hunk.oldStart}-${hunk.oldStart + hunk.oldCount - 1} replaced by non-executable lines`);
    }
  }
  return { mergeBase, files, deletionOnly, removedRuntime, outside, testSource, modeTransitions };
}

function nonExecutableLines(path, content) {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const excluded = new Set();
  const mark = (node) => {
    const first = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const last = source.getLineAndCharacterOfPosition(node.end - 1).line + 1;
    for (let line = first; line <= last; line++) excluded.add(line);
  };
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) ||
        ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
        (ts.isExportDeclaration(node) && node.isTypeOnly) || node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword)) {
      mark(node);
      return;
    }
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) && node.body) {
      const first = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const beforeBody = source.getLineAndCharacterOfPosition(node.body.getStart(source)).line + 1;
      for (let line = first; line < beforeBody; line++) excluded.add(line);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const tokens = new Set();
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false,
    path.endsWith(".tsx") ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, content);
  let kind;
  while ((kind = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (kind >= ts.SyntaxKind.FirstTriviaToken && kind <= ts.SyntaxKind.LastTriviaToken) continue;
    const first = source.getLineAndCharacterOfPosition(scanner.getTokenPos()).line + 1;
    const last = source.getLineAndCharacterOfPosition(Math.max(scanner.getTokenPos(), scanner.getTextPos() - 1)).line + 1;
    for (let line = first; line <= last; line++) tokens.add(line);
  }
  return { excluded, tokens };
}

function coverageAtLine(entry, line) {
  const statements = Object.entries(entry.statementMap ?? {})
    .filter(([, location]) => location.start.line <= line && line <= location.end.line);
  const functions = Object.entries(entry.fnMap ?? {})
    .filter(([, location]) => location.decl?.start.line === line);
  if (statements.length === 0 && functions.length === 0) return null;
  return statements.every(([id]) => Number(entry.s?.[id]) > 0) &&
    functions.every(([id]) => Number(entry.f?.[id]) > 0);
}

function branchAtLine(entry, line) {
  const spansLine = (location) => location &&
    location.start?.line <= line && line <= location.end?.line;
  return Object.entries(entry.branchMap ?? {}).filter(([, branch]) =>
    spansLine(branch.loc) || branch.locations?.some(spansLine));
}

export function assessChangedFile(path, lines, content, entry) {
  const { excluded, tokens } = nonExecutableLines(path, content);
  const result = { executable: [], nonExecutable: [], uncovered: [], branches: [], uncoveredBranches: [] };
  const seenBranches = new Set();
  const contentLines = content.split("\n");
  for (const line of [...lines].sort((a, b) => a - b)) {
    const raw = contentLines[line - 1] ?? "";
    const covered = entry ? coverageAtLine(entry, line) : null;
    const lineBranches = entry ? branchAtLine(entry, line) : [];
    if ((!tokens.has(line) && covered === null && lineBranches.length === 0) ||
        ((excluded.has(line) || /^[\s{}()[\];,]*$/.test(raw)) && covered === null && lineBranches.length === 0)) {
      result.nonExecutable.push(line);
      continue;
    }
    result.executable.push(line);
    if (covered !== true) result.uncovered.push(`${line}${covered === null ? " (not instrumented)" : ""}`);
    for (const [id] of lineBranches) {
      if (seenBranches.has(id)) continue;
      seenBranches.add(id);
      const outcomes = entry.b?.[id];
      result.branches.push(`${line}:${id}`);
      if (!Array.isArray(outcomes) || outcomes.length === 0 || outcomes.some((count) => Number(count) === 0)) {
        result.uncoveredBranches.push(`${line}:${id}`);
      }
    }
  }
  return result;
}

export function verify(root, base, head) {
  const actualHead = git(root, "rev-parse", "HEAD").trim();
  const resolvedHead = git(root, "rev-parse", head).trim();
  if (actualHead !== resolvedHead) throw new Error("Coverage gate head must equal checked-out HEAD");
  assertCleanSource(root, "backend");
  assertCleanSource(root, "frontend");
  const { mergeBase, files, deletionOnly, removedRuntime, outside, testSource, modeTransitions } = changedLines(root, base, head);
  const reports = {};
  const totals = { executable: 0, nonExecutable: 0, branches: 0, uncovered: [] };
  const lines = [`Coverage diff ${mergeBase}..${resolvedHead}`];
  for (const path of testSource) lines.push(`TEST SOURCE ${path}: excluded from product line denominator; independent assertion-quality review required`);
  for (const item of deletionOnly) {
    const message = `deletion-only ${item}: behavior requires explicit regression evidence`;
    totals.uncovered.push(message);
  }
  for (const item of removedRuntime) totals.uncovered.push(`removed runtime ${item}: replacement has no executable coverage target`);
  for (const path of outside) {
    const message = `unmeasured executable/config ${path}: no package coverage mapping`;
    totals.uncovered.push(message);
  }
  for (const item of modeTransitions) {
    totals.uncovered.push(`unmeasured source mode/type ${item.path}: git status ${item.status}, mode ${item.oldMode}->${item.newMode}${item.noTextHunk ? ", no text hunk" : ""}; explicit regression disposition required`);
  }
  const unsafePaths = new Set(modeTransitions.map((item) => item.path));
  for (const [path, changed] of files) {
    if (unsafePaths.has(path)) continue;
    if (changed.size === 0) continue;
    if (!/\.tsx?$/.test(path) || /(?:\.d\.ts$|\.test\.tsx?$|\/routeTree\.gen\.ts$|\/src\/test\/)/.test(path)) {
      lines.push(`${path}: excluded test/type/generated source (${changed.size} changed lines)`);
      continue;
    }
    const packageName = path.startsWith("hrms_backend/") ? "backend" : "frontend";
    reports[packageName] ??= readReport(root, packageName, resolvedHead);
    const entry = reports[packageName].get(path);
    const result = assessChangedFile(path, changed, readFileSync(join(root, path), "utf8"), entry);
    totals.executable += result.executable.length;
    totals.nonExecutable += result.nonExecutable.length;
    totals.branches += result.branches.length;
    for (const line of result.uncovered) totals.uncovered.push(`${path}:${line}`);
    for (const branch of result.uncoveredBranches) totals.uncovered.push(`${path}:branch ${branch}`);
    lines.push(`${path}: executable ${result.executable.length}, non-executable ${result.nonExecutable.length}, decision branches ${result.branches.length}`);
  }
  const uncoveredLines = totals.uncovered.filter((item) => /^(?:hrms_backend|hrms-client)\/src\/.*:\d+/.test(item) && !item.includes(":branch ")).length;
  const uncoveredBranches = totals.uncovered.filter((item) => item.includes(":branch ")).length;
  lines.push(`Changed executable lines: ${totals.executable - uncoveredLines}/${totals.executable}; changed decision branches: ${totals.branches - uncoveredBranches}/${totals.branches}; unmeasured paths/deletions/modes: ${deletionOnly.length + removedRuntime.length + outside.length + modeTransitions.length}`);
  lines.push(...totals.uncovered.map((item) => `UNCOVERED ${item}`));
  return { pass: totals.uncovered.length === 0, mergeBase, files, totals, lines };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (argument("--stamp")) {
      const packageName = argument("--stamp");
      stampReport(repoRoot, packageName);
      console.log(`Stamped fresh ${packageName} coverage at HEAD.`);
    } else {
      const base = argument("--base");
      const head = argument("--head") ?? "HEAD";
      if (!base) throw new Error("Usage: changed-coverage.mjs --base REF [--head REF]");
      if (process.argv.includes("--manual-evidence")) throw new Error("PR-authored manual evidence cannot override this gate; review outside CI is required");
      const result = verify(repoRoot, base, head);
      console.log(result.lines.join("\n"));
      if (!result.pass) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Changed coverage gate failed: ${error.message}`);
    process.exitCode = 1;
  }
}
