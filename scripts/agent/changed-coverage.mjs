#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { accessSync, chmodSync, constants as fsConstants, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = process.env.HRMS_COVERAGE_REPO_ROOT ? resolve(process.env.HRMS_COVERAGE_REPO_ROOT) : toolRoot;
const requireFromBackend = createRequire(join(toolRoot, "hrms_backend/package.json"));
const ts = requireFromBackend("typescript");
const packages = {
  backend: { root: "hrms_backend", output: "backend" },
  frontend: { root: "hrms-client", output: "frontend" },
  external: { root: ".", output: "external" },
};
const expectedCoverageVersion = "7.11.0";

export function coverageOutputRoot(root) {
  return resolve(process.env.HRMS_COVERAGE_OUTPUT_DIR ?? join(dirname(resolve(root)), `${basename(resolve(root))}-coverage-output`));
}

export function coverageArtifactPath(root, packageName, name = "coverage-final.json") {
  const packageInfo = packages[packageName];
  if (!packageInfo) throw new Error(`Unknown package: ${packageName}`);
  const outputRoot = coverageOutputRoot(root);
  const repositoryRoot = realpathSync(root);
  const relativeOutput = relative(repositoryRoot, outputRoot);
  if (!relativeOutput || (!relativeOutput.startsWith(`..${sep}`) && relativeOutput !== "..")) {
    throw new Error("Coverage output directory must be outside the repository worktree");
  }
  return join(outputRoot, packageInfo.output, name);
}

export function instrumentableExternal(path) {
  return !isAbsolute(path) && !path.startsWith("../") && !/(?:^|\/)node_modules\//.test(path) &&
    !/^(?:hrms_backend|hrms-client)\/src\//.test(path) &&
    /\.(?:[cm]?js|ts|py)$/.test(path) &&
    !/(?:^|\/)(?:[^/]+\.)?config\.[cm]?[jt]s$/.test(path) &&
    !/(?:\.test\.[cm]?[jt]s$|\/tests\/test_[^/]+\.py$)/.test(path);
}

export function outsideExecutableOrConfig(path) {
  const name = path.split("/").at(-1);
  return /\.(?:[cm]?[jt]sx?|sh|py|sql)$/.test(path) ||
    /^\.github\/(?:workflows|actions)\/.*\.ya?ml$/.test(path) ||
    /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|vercel\.json|render\.ya?ml|Procfile|Makefile|justfile|\.npmrc|\.gitignore|\.gitattributes|\.gitmodules)$/.test(name) ||
    /^(?:Dockerfile(?:\..+)?|.+\.Dockerfile|(?:docker-)?compose(?:[.-].+)?\.ya?ml)$/.test(name) ||
    /^(?:wrangler\.(?:jsonc?|toml)|tsconfig(?:\..+)?\.json|.+\.config\.(?:jsonc?|ya?ml|toml))$/.test(name) ||
    /^infra\/.*\.(?:jsonc?|ya?ml|toml)$/.test(path) ||
    /^(?:hrms_backend|hrms-client)\/src\/.*\.json$/.test(path);
}

function isTestOrGenerated(path) {
  return /(?:\.test\.[cm]?[jt]sx?$|\/tests\/test_[^/]+\.py$|\/src\/test\/|\.d\.ts$|\/routeTree\.gen\.ts$)/.test(path);
}

function isProductTestPath(path) {
  return /^(?:hrms_backend|hrms-client)\/src\//.test(path) &&
    /(?:\.test\.[cm]?[jt]sx?$|\/src\/test\/)/.test(path);
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
}

export function productionImportRisks(root) {
  const tracked = git(root, "ls-files", "-z", "--", "hrms_backend/src", "hrms-client/src").split("\0").filter(Boolean);
  const risks = new Set();
  const optionsByPackage = new Map();
  const optionsFor = (path) => {
    const packageName = path.split("/")[0];
    if (!optionsByPackage.has(packageName)) {
      const packageRoot = join(root, packageName);
      const configPath = join(packageRoot, "tsconfig.json");
      let options = { moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: packageRoot, paths: { "@/*": ["src/*"] } };
      if (existsSync(configPath)) {
        const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
        if (loaded.error) throw new Error(`${packageName}: unreadable TypeScript configuration`);
        const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, packageRoot);
        if (parsed.errors.length) throw new Error(`${packageName}: invalid TypeScript configuration`);
        options = parsed.options;
      }
      optionsByPackage.set(packageName, { ...options, allowJs: true });
    }
    return optionsByPackage.get(packageName);
  };
  for (const path of tracked) {
    if (!/\.[cm]?[jt]sx?$/.test(path) || path.endsWith(".d.ts") || isProductTestPath(path)) continue;
    const fullPath = join(root, path);
    const source = ts.createSourceFile(fullPath, git(root, "show", `HEAD:${path}`), ts.ScriptTarget.Latest, true);
    const options = optionsFor(path);
    const localAlias = (specifier) => Object.keys(options.paths ?? {}).some((pattern) => {
      const star = pattern.indexOf("*");
      return star < 0 ? pattern === specifier : specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1));
    });
    const inspect = (rawSpecifier) => {
      const specifier = rawSpecifier.split("?")[0];
      const resolved = ts.resolveModuleName(specifier, fullPath, options, ts.sys).resolvedModule?.resolvedFileName;
      if (resolved) {
        const target = relative(root, resolved).replaceAll("\\", "/");
        if (isProductTestPath(target)) risks.add(`${path} imports test source ${target}`);
      } else if ((specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("#") || specifier.startsWith("@/") || localAlias(specifier)) &&
                 !/\.(?:css|scss|sass|svg|png|jpe?g|gif|webp|woff2?|ico)$/.test(specifier)) {
        risks.add(`${path} has unresolved local import ${rawSpecifier}`);
      }
    };
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteralLike(node.moduleSpecifier)) inspect(node.moduleSpecifier.text);
      if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) inspect(node.moduleSpecifier.text);
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) inspect(node.moduleReference.expression.text);
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(source);
        if (/^(?:import\.meta\.glob(?:Eager)?|require\.context|createRequire)$/.test(callee)) risks.add(`${path} has opaque module loader ${callee}`);
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword || /^(?:require|[\w$.]+\.require)$/.test(callee)) {
          const argument = node.arguments[0];
          if (argument && ts.isStringLiteralLike(argument)) inspect(argument.text);
          else risks.add(`${path} has non-literal module load ${callee}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...risks];
}

export function sourceDigest(root, packageName) {
  const prefix = `${packages[packageName].root}/src`;
  const paths = git(root, "ls-files", "-c", "-o", "--exclude-standard", "--", prefix)
    .split("\n")
    .filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"))
    .sort();
  const hash = createHash("sha256");
  for (const path of paths) {
    const sourcePath = assertRegularRepositoryFile(root, path, `${packageName}: coverage source`, true);
    hash.update(path);
    hash.update("\0");
    hash.update(readFileSync(sourcePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function digestFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function assertRegularRepositoryFile(root, path, label, requireTracked = false) {
  const repositoryRoot = realpathSync(root);
  const fullPath = resolve(repositoryRoot, path);
  const repositoryPath = relative(repositoryRoot, fullPath).replaceAll("\\", "/");
  if (!repositoryPath || repositoryPath.startsWith("../") || isAbsolute(repositoryPath) || repositoryPath !== path) {
    throw new Error(`${label}: path is outside the repository or non-canonical: ${path}`);
  }
  const components = path.split("/");
  let componentPath = repositoryRoot;
  for (const component of components) {
    componentPath = join(componentPath, component);
    let componentDetails;
    try {
      componentDetails = lstatSync(componentPath);
    } catch {
      throw new Error(`${label}: missing path ${path}`);
    }
    if (componentDetails.isSymbolicLink()) {
      throw new Error(`${label}: path contains a symbolic-link component: ${path}`);
    }
  }
  const actualPath = realpathSync(fullPath);
  const index = git(root, "ls-files", "--stage", "-z", "--", path).split("\0").filter(Boolean);
  if (index.length > 1) throw new Error(`${label}: path has unresolved index stages: ${path}`);
  if (index.length === 1) {
    const mode = index[0].slice(0, 6);
    if (mode !== "100644" && mode !== "100755") {
      throw new Error(`${label}: path is not a regular Git file (${mode}): ${path}`);
    }
  } else if (requireTracked) {
    throw new Error(`${label}: path is not tracked: ${path}`);
  }
  const details = lstatSync(fullPath);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`${label}: path is not a regular filesystem file: ${path}`);
  }
  return actualPath;
}

export function assertExternalArtifact(root, path, label, directory = false) {
  const repositoryRoot = realpathSync(root);
  const absolute = resolve(path);
  if (!isAbsolute(path) || path !== absolute) {
    throw new Error(`${label}: coverage artifact path must be absolute and canonical`);
  }
  const relativePath = relative(repositoryRoot, absolute);
  if (!relativePath || (!relativePath.startsWith(`..${sep}`) && relativePath !== "..")) {
    throw new Error(`${label}: coverage artifact must be outside the repository worktree`);
  }
  let cursor = absolute;
  const chain = [];
  while (cursor !== dirname(cursor)) {
    chain.push(cursor);
    cursor = dirname(cursor);
  }
  chain.reverse();
  for (const component of chain) {
    if (!existsSync(component)) continue;
    const details = lstatSync(component);
    if (details.isSymbolicLink()) throw new Error(`${label}: coverage artifact path contains a symbolic link`);
  }
  let details;
  try {
    details = lstatSync(absolute);
  } catch {
    throw new Error(`${label}: missing coverage artifact ${absolute}`);
  }
  if (details.isSymbolicLink() || (directory ? !details.isDirectory() : !details.isFile())) {
    throw new Error(`${label}: coverage artifact is not a regular ${directory ? "directory" : "file"}`);
  }
  return realpathSync(absolute);
}

export function assertExternalArtifactDestination(root, path, label) {
  const repositoryRoot = realpathSync(root);
  const absolute = resolve(path);
  if (!isAbsolute(path) || path !== absolute) throw new Error(`${label}: coverage artifact path must be absolute and canonical`);
  const relativePath = relative(repositoryRoot, absolute);
  if (!relativePath || (!relativePath.startsWith(`..${sep}`) && relativePath !== "..")) {
    throw new Error(`${label}: coverage artifact must be outside the repository worktree`);
  }
  let cursor = absolute;
  const chain = [];
  while (cursor !== dirname(cursor)) {
    chain.push(cursor);
    cursor = dirname(cursor);
  }
  for (const component of chain.reverse()) {
    if (!existsSync(component)) continue;
    const details = lstatSync(component);
    if (details.isSymbolicLink()) throw new Error(`${label}: coverage artifact path contains a symbolic link`);
  }
  if (existsSync(absolute) && !lstatSync(absolute).isFile()) throw new Error(`${label}: coverage artifact destination is not a regular file`);
  return absolute;
}

export function assertCleanRepository(root, label = "coverage input") {
  const status = git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all");
  if (status.length > 0) {
    const entries = status.split("\0").filter(Boolean);
    const summary = entries.slice(0, 20).map((entry) => JSON.stringify(entry)).join(", ");
    const remainder = entries.length > 20 ? `, ... ${entries.length - 20} more` : "";
    throw new Error(`${label}: repository worktree and index must be completely clean; commit the exact tested tree before stamping or verifying coverage; status entries: ${summary}${remainder}`);
  }
  return git(root, "rev-parse", "HEAD").trim();
}

export function assertExactCleanCommit(root, expectedHead, label) {
  const actual = git(root, "rev-parse", "HEAD").trim();
  if (!/^[0-9a-f]{40}$/.test(expectedHead) || actual !== expectedHead) {
    throw new Error(`${label}: checked-out HEAD changed from expected commit ${expectedHead} to ${actual}`);
  }
  assertCleanRepository(root, label);
  return actual;
}

export function resolveTrustedExecutable(name, environment = process.env) {
  const candidates = isAbsolute(name)
    ? [name]
    : (environment.PATH ?? "").split(delimiter).filter(Boolean).map((directory) => join(directory, name));
  for (const candidate of candidates) {
    try {
      const canonical = realpathSync(candidate);
      const details = lstatSync(canonical);
      accessSync(canonical, fsConstants.X_OK);
      if (details.isFile() && !details.isSymbolicLink()) return canonical;
    } catch {
      // Try the next PATH entry without executing an unvalidated candidate.
    }
  }
  throw new Error(`Required executable is unavailable or not a regular executable file: ${name}`);
}

export function validateTrustedExecutable(path) {
  if (!isAbsolute(path) || resolve(path) !== path) throw new Error(`Executable path must be absolute and canonical: ${path}`);
  const target = realpathSync(path);
  if (target !== path) throw new Error(`Executable path must not be a symbolic link: ${path}`);
  const details = lstatSync(target);
  accessSync(target, fsConstants.X_OK);
  if (!details.isFile()) throw new Error(`Executable target is not a regular file: ${path}`);
  return path;
}

export function resolveCoveragePython(environment = process.env) {
  const validateCoveragePython = (executable) => {
    validateTrustedExecutable(executable);
    const version = execFileSync(executable,
      ["-c", "import coverage; print(coverage.__version__)"],
      { env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (version !== expectedCoverageVersion) {
      throw new Error(`coverage ${expectedCoverageVersion} is required, found ${version || "no version"}`);
    }
    return executable;
  };
  if (environment.HRMS_COVERAGE_PYTHON !== undefined) {
    try {
      return validateCoveragePython(environment.HRMS_COVERAGE_PYTHON);
    } catch (error) {
      throw new Error(`Pinned Python coverage runner is invalid (${error.message})`);
    }
  }
  const failures = [];
  for (const name of ["python3", "python"]) {
    try {
      const executable = (environment.PATH ?? "").split(delimiter).filter(Boolean)
        .map((directory) => resolve(directory, name))
        .find((candidate) => {
          try { validateTrustedExecutable(candidate); return true; } catch { return false; }
        });
      if (!executable) throw new Error("not found on sanitized PATH");
      return validateCoveragePython(executable);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  }
  throw new Error(`Python with the coverage module is required (${failures.join("; ")})`);
}

function plainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalCoveragePath(root, value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`${label}: coverage source path must be a non-empty string`);
  }
  const absolute = isAbsolute(value) ? resolve(value) : resolve(root, value);
  const path = relative(root, absolute).replaceAll("\\", "/");
  if (!path || path === "." || path.startsWith("../") || isAbsolute(path)) {
    throw new Error(`${label}: coverage source is outside the repository: ${value}`);
  }
  const canonicalAbsolute = resolve(root, path);
  if (value !== path && value !== canonicalAbsolute) {
    throw new Error(`${label}: non-canonical coverage source path ${value}`);
  }
  return path;
}

function validateLocation(location, label, allowEmpty = false) {
  if (!plainRecord(location) || !plainRecord(location.start) || !plainRecord(location.end)) {
    throw new Error(`${label}: malformed coverage location ${JSON.stringify(location)}`);
  }
  if (allowEmpty && location.start.line === undefined && location.end.line === undefined &&
      location.start.column === undefined && location.end.column === undefined) return;
  if (
      !Number.isSafeInteger(location.start.line) || location.start.line <= 0 ||
      !Number.isSafeInteger(location.end.line) || location.end.line <= 0) {
    throw new Error(`${label}: malformed coverage location ${JSON.stringify(location)}`);
  }
  for (const point of [location.start, location.end]) {
    if (point.column !== undefined && point.column !== null && typeof point.column !== "number") {
      throw new Error(`${label}: malformed coverage column ${JSON.stringify(location)}`);
    }
  }
}

function validateCount(count, label) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label}: coverage count must be a finite non-negative integer`);
  }
  return count;
}

function validateMapPair(map, counts, label, validateMapValue, validateCountValue = validateCount) {
  if (!plainRecord(map) || !plainRecord(counts)) throw new Error(`${label}: malformed coverage map`);
  const mapIds = Object.keys(map).sort();
  const countIds = Object.keys(counts).sort();
  if (JSON.stringify(mapIds) !== JSON.stringify(countIds)) throw new Error(`${label}: coverage map/count keys differ`);
  for (const id of mapIds) {
    validateMapValue(map[id], `${label}.${id}`, id);
    validateCountValue(counts[id], `${label}.${id}`, id, map[id]);
  }
}

function validateIstanbulEntry(root, key, entry, label, requireInstrumentable) {
  const path = canonicalCoveragePath(root, key, label);
  assertRegularRepositoryFile(root, path, `${label}: coverage source`);
  if (requireInstrumentable && !instrumentableExternal(path)) {
    throw new Error(`${label}: unsupported coverage source ${path}`);
  }
  if (!plainRecord(entry)) throw new Error(`${label}: malformed coverage entry for ${path}`);
  const embedded = canonicalCoveragePath(root, entry.path, `${label}:${path}`);
  if (embedded !== path) throw new Error(`${label}: embedded path does not match coverage source ${path}`);
  validateMapPair(entry.statementMap, entry.s, `${label}:${path}:statements`, validateLocation);
  validateMapPair(entry.fnMap, entry.f, `${label}:${path}:functions`, (fn, fnLabel) => {
    if (!plainRecord(fn)) throw new Error(`${fnLabel}: malformed function map entry`);
    validateLocation(fn.decl, `${fnLabel}.decl`);
    validateLocation(fn.loc, `${fnLabel}.loc`);
  });
  validateMapPair(entry.branchMap, entry.b, `${label}:${path}:branches`, (branch, branchLabel) => {
    if (!plainRecord(branch) || !Array.isArray(branch.locations) || branch.locations.length === 0) {
      throw new Error(`${branchLabel}: malformed branch map entry`);
    }
    validateLocation(branch.loc, `${branchLabel}.loc`);
    for (const [index, location] of branch.locations.entries()) validateLocation(location, `${branchLabel}.locations.${index}`, true);
  }, (counts, branchLabel, _id, branch) => {
    if (!Array.isArray(counts) || counts.length === 0) throw new Error(`${branchLabel}: malformed branch counts`);
    if (counts.length !== branch.locations.length) throw new Error(`${branchLabel}: branch count/location lengths differ`);
    for (const [index, count] of counts.entries()) validateCount(count, `${branchLabel}.${index}`);
  });
  return { path, entry };
}

function validatedCoverageEntries(root, data, label, requireInstrumentable = false) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${label}: malformed coverage report`);
  }
  const entries = new Map();
  for (const [key, entry] of Object.entries(data)) {
    const validated = validateIstanbulEntry(root, key, entry, label, requireInstrumentable);
    if (entries.has(validated.path)) throw new Error(`${label}: duplicate normalized coverage source ${validated.path}`);
    entries.set(validated.path, validated.entry);
  }
  return entries;
}

export function addEvaluatedModuleStatements(root, path, entry) {
  const positiveCounts = [
    ...Object.values(entry.s ?? {}),
    ...Object.values(entry.f ?? {}),
    ...Object.values(entry.b ?? {}).flat(),
  ].filter((count) => Number.isSafeInteger(count) && count > 0);
  if (positiveCounts.length === 0 || path.endsWith(".py")) return entry;
  const code = readFileSync(assertRegularRepositoryFile(root, path, "module evaluation source", true), "utf8");
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : path.endsWith(".js") || path.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const statementMap = { ...entry.statementMap };
  const counts = { ...entry.s };
  const coveredLine = (line) => Object.values(statementMap).some((location) =>
    location.start.line <= line && line <= location.end.line);
  let nextId = Object.keys(statementMap).reduce((maximum, id) => Math.max(maximum, Number(id) + 1), 0);
  for (const node of source.statements) {
    const staticModule = ts.isImportDeclaration(node) ||
      (ts.isExportDeclaration(node) && Boolean(node.moduleSpecifier));
    const typeOnly = ts.isImportDeclaration(node)
      ? node.importClause?.isTypeOnly === true
      : ts.isExportDeclaration(node) && node.isTypeOnly;
    if ((!staticModule || typeOnly) && !ts.isExpressionStatement(node)) continue;
    const start = source.getLineAndCharacterOfPosition(node.getStart(source));
    const end = source.getLineAndCharacterOfPosition(node.end);
    const line = start.line + 1;
    if (coveredLine(line)) continue;
    statementMap[nextId] = {
      start: { line, column: start.character },
      end: { line: end.line + 1, column: end.character },
    };
    counts[nextId] = Math.max(...positiveCounts);
    nextId += 1;
  }
  return { ...entry, statementMap, s: counts };
}

function externalReportPaths(root, data) {
  return [...validatedCoverageEntries(root, data, "external", true).keys()].sort();
}

export function stampExternalReport(root) {
  const head = assertCleanRepository(root, "external");
  const reportPath = assertExternalArtifact(root, coverageArtifactPath(root, "external"), "external report");
  const raw = readFileSync(reportPath);
  const data = JSON.parse(raw.toString("utf8"));
  const paths = externalReportPaths(root, data);
  if (paths.length === 0) throw new Error("external: coverage report has no source entries");
  const stamp = {
    head,
    sources: Object.fromEntries(paths.map((path) => [path, digestFile(assertRegularRepositoryFile(root, path, "external coverage source", true))])),
    reportDigest: createHash("sha256").update(raw).digest("hex"),
  };
  const stampPath = assertExternalArtifactDestination(root, join(dirname(reportPath), "coverage-stamp.json"), "external stamp");
  writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);
  return stamp;
}

export function stampReport(root, packageName) {
  const packageInfo = packages[packageName];
  if (!packageInfo) throw new Error(`Unknown package: ${packageName}`);
  const head = assertCleanRepository(root, packageName);
  const reportPath = assertExternalArtifact(root, coverageArtifactPath(root, packageName), `${packageName} report`);
  JSON.parse(readFileSync(reportPath, "utf8"));
  const stamp = {
    head,
    sourceDigest: sourceDigest(root, packageName),
    reportDigest: createHash("sha256").update(readFileSync(reportPath)).digest("hex"),
  };
  const stampPath = assertExternalArtifactDestination(root, join(dirname(reportPath), "coverage-stamp.json"), `${packageName} stamp`);
  writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);
  return stamp;
}

function readReport(root, packageName, head) {
  assertCleanRepository(root, packageName);
  if (packageName === "external") {
    const reportPath = coverageArtifactPath(root, "external");
    const stampPath = join(dirname(reportPath), "coverage-stamp.json");
    if (!existsSync(reportPath) || !existsSync(stampPath)) {
      throw new Error("external: missing fresh coverage report or stamp; run the isolated external coverage suite");
    }
    assertExternalArtifact(root, reportPath, "external report");
    assertExternalArtifact(root, stampPath, "external stamp");
    const raw = readFileSync(reportPath);
    const data = JSON.parse(raw.toString("utf8"));
    const paths = externalReportPaths(root, data);
    const stamp = JSON.parse(readFileSync(stampPath, "utf8"));
    const stampedPaths = stamp.sources && typeof stamp.sources === "object" ? Object.keys(stamp.sources).sort() : [];
    if (stamp.head !== head || JSON.stringify(stampedPaths) !== JSON.stringify(paths) ||
        stamp.reportDigest !== createHash("sha256").update(raw).digest("hex") ||
        paths.some((path) => stamp.sources[path] !== digestFile(assertRegularRepositoryFile(root, path, "external coverage source", true)))) {
      throw new Error("external: stale, modified or source-mismatched coverage report; rerun the isolated external coverage suite at this head");
    }
    return validatedCoverageEntries(root, data, "external", true);
  }
  const reportPath = coverageArtifactPath(root, packageName);
  const stampPath = join(dirname(reportPath), "coverage-stamp.json");
  if (!existsSync(reportPath) || !existsSync(stampPath)) {
    throw new Error(`${packageName}: missing fresh coverage report or stamp; run pnpm test:unit:coverage`);
  }
  assertExternalArtifact(root, reportPath, `${packageName} report`);
  assertExternalArtifact(root, stampPath, `${packageName} stamp`);
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
  const entries = validatedCoverageEntries(root, data, packageName);
  return entries;
}

function pythonCoverageToIstanbul(root, data) {
  if (!plainRecord(data) || !plainRecord(data.files)) {
    throw new Error("Malformed Python coverage JSON");
  }
  const converted = {};
  for (const [key, file] of Object.entries(data.files)) {
    const path = canonicalCoveragePath(root, key, "Python coverage");
    if (!instrumentableExternal(path) || !existsSync(join(root, path))) {
      throw new Error(`Python coverage: unsupported or missing coverage source ${path}`);
    }
    if (Object.keys(converted).some((existing) => canonicalCoveragePath(root, existing, "Python coverage") === path)) {
      throw new Error(`Python coverage: duplicate normalized coverage source ${path}`);
    }
    if (!plainRecord(file) || !Array.isArray(file.executed_lines) || !Array.isArray(file.missing_lines) ||
        !Array.isArray(file.executed_branches) || !Array.isArray(file.missing_branches)) {
      throw new Error(`Malformed Python coverage data for ${path}`);
    }
    const executed = file.executed_lines;
    const missing = file.missing_lines;
    if (executed.some((line) => missing.includes(line))) throw new Error(`Conflicting Python line coverage for ${path}`);
    const statementMap = {};
    const statementCounts = {};
    for (const [index, line] of [...new Set([...executed, ...missing])].sort((a, b) => a - b).entries()) {
      if (!Number.isSafeInteger(line) || line <= 0) throw new Error(`Malformed Python line coverage for ${path}`);
      statementMap[index] = { start: { line, column: 0 }, end: { line, column: 1 } };
      statementCounts[index] = executed.includes(line) ? 1 : 0;
    }
    const arcs = [
      ...file.executed_branches.map((arc) => [arc, 1]),
      ...file.missing_branches.map((arc) => [arc, 0]),
    ];
    const grouped = new Map();
    for (const [arc, count] of arcs) {
      if (!Array.isArray(arc) || arc.length !== 2 || !arc.every(Number.isSafeInteger)) {
        throw new Error(`Malformed Python branch coverage for ${path}`);
      }
      const [from] = arc;
      if (from <= 0) continue;
      const group = grouped.get(from) ?? [];
      group.push({ count, location: { start: { line: from, column: 0 }, end: { line: from, column: 1 } } });
      grouped.set(from, group);
    }
    const branchMap = {};
    const branchCounts = {};
    for (const [index, [line, outcomes]] of [...grouped.entries()].entries()) {
      branchMap[index] = { type: "branch", line, loc: { start: { line, column: 0 }, end: { line, column: 1 } }, locations: outcomes.map((item) => item.location) };
      branchCounts[index] = outcomes.map((item) => item.count);
    }
    const absolute = resolve(root, path);
    converted[absolute] = {
      path: absolute, statementMap, s: statementCounts,
      branchMap, b: branchCounts, fnMap: {}, f: {},
    };
  }
  return converted;
}

async function rawV8ToIstanbul(root, directories) {
  if (directories.length === 0) return {};
  const coverageRequire = createRequire(requireFromBackend.resolve("@vitest/coverage-v8"));
  const { mergeProcessCovs } = coverageRequire("@bcoe/v8-coverage");
  const { convert } = await import(pathToFileURL(coverageRequire.resolve("ast-v8-to-istanbul")).href);
  const { parseAstAsync } = await import(pathToFileURL(coverageRequire.resolve("vite")).href);
  const processes = [];
  for (const directory of directories) {
    const safeDirectory = assertExternalArtifact(root, directory, "raw Node V8 directory", true);
    for (const name of readdirSync(safeDirectory).filter((item) => item.endsWith(".json")).sort()) {
      const report = assertExternalArtifact(root, join(safeDirectory, name), "raw Node V8 report");
      processes.push(JSON.parse(readFileSync(report, "utf8")));
    }
  }
  if (processes.length === 0) throw new Error("No raw Node V8 coverage files found");
  const merged = mergeProcessCovs(processes);
  const converted = {};
  for (const coverage of merged.result) {
    if (!coverage.url?.startsWith("file:")) continue;
    const absolute = fileURLToPath(coverage.url);
    const path = relative(root, absolute).replaceAll("\\", "/");
    if (!instrumentableExternal(path) || !existsSync(absolute)) continue;
    const sourcePath = assertRegularRepositoryFile(root, path, "raw Node V8 coverage source", true);
    const code = readFileSync(sourcePath, "utf8");
    const report = await convert({ ast: parseAstAsync(code), code, coverage, wrapperLength: 0 });
    for (const [key, entry] of Object.entries(report)) {
      addUniqueRawCoverageEntry(converted, key, entry);
    }
  }
  return converted;
}

export function addUniqueRawCoverageEntry(converted, key, entry) {
  if (Object.hasOwn(converted, key)) throw new Error(`Duplicate raw V8 coverage source ${key}`);
  converted[key] = entry;
}

export async function buildExternalCoverage(root, { nodeV8 = [], istanbul = [], python = [] }) {
  assertCleanRepository(root, "external build");
  const combined = {};
  const sources = new Set();
  const merge = (data, label) => {
    const entries = validatedCoverageEntries(root, data, label, true);
    for (const [path, value] of entries) {
      if (sources.has(path)) {
        throw new Error(`Duplicate external coverage source ${path} from ${label}`);
      }
      sources.add(path);
      const absolute = resolve(root, path);
      combined[absolute] = { ...addEvaluatedModuleStatements(root, path, value), path: absolute };
    }
  };
  merge(await rawV8ToIstanbul(root, nodeV8), "raw Node V8 coverage");
  for (const report of istanbul) {
    const safeReport = assertExternalArtifact(root, report, "Istanbul input report");
    merge(JSON.parse(readFileSync(safeReport, "utf8")), safeReport);
  }
  for (const report of python) {
    const safeReport = assertExternalArtifact(root, report, "Python input report");
    merge(pythonCoverageToIstanbul(root, JSON.parse(readFileSync(safeReport, "utf8"))), safeReport);
  }
  if (Object.keys(combined).length === 0) throw new Error("External coverage build produced no instrumentable sources");
  const reportPath = assertExternalArtifactDestination(root, coverageArtifactPath(root, "external"), "external report");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(combined, null, 2)}\n`);
  return combined;
}

function fullSuitePaths(outputRoot) {
  const externalInput = join(outputRoot, "external-input");
  return {
    resolverV8: join(externalInput, "node-resolver"),
    gateV8: join(externalInput, "node-gate"),
    orchestratorV8: join(externalInput, "node-orchestrator"),
    pythonData: join(externalInput, "python.data"),
    pythonJson: join(externalInput, "python.json"),
    typescriptReport: join(externalInput, "typescript"),
  };
}

function createExactCommitCheckout(root, outputRoot, expectedHead) {
  const checkout = join(outputRoot, "exact-commit-checkout");
  git(root, "worktree", "add", "--detach", checkout, expectedHead);
  try {
    for (const packageName of ["hrms_backend", "hrms-client"]) {
      const installed = join(root, packageName, "node_modules");
      if (!existsSync(installed) || !lstatSync(realpathSync(installed)).isDirectory()) {
        throw new Error(`Exact-commit checkout requires installed ${packageName}/node_modules`);
      }
      symlinkSync(realpathSync(installed), join(checkout, packageName, "node_modules"), "dir");
    }
    const tracked = git(checkout, "ls-files", "-s", "-z").split("\0").filter(Boolean);
    for (const entry of tracked) {
      const match = /^(100644|100755) [0-9a-f]+ 0\t(.+)$/.exec(entry);
      if (!match) throw new Error(`Exact-commit checkout contains unsupported tracked entry: ${entry}`);
      const trackedPath = join(checkout, match[2]);
      chmodSync(trackedPath, match[1] === "100755" ? 0o555 : 0o444);
    }
    const makeDirectoriesReadOnly = (path) => {
      const details = lstatSync(path);
      if (details.isSymbolicLink() || !details.isDirectory()) return;
      for (const entry of readdirSync(path)) makeDirectoriesReadOnly(join(path, entry));
      chmodSync(path, 0o555);
    };
    makeDirectoriesReadOnly(checkout);
    assertExactCleanCommit(checkout, expectedHead, "exact-commit checkout");
    return checkout;
  } catch (error) {
    removeExactCommitCheckout(root, checkout);
    throw error;
  }
}

export function removeExactCommitCheckout(root, checkout) {
  if (!checkout || !existsSync(checkout)) return;
  const makeDirectoriesWritable = (path) => {
    const details = lstatSync(path);
    if (details.isSymbolicLink() || !details.isDirectory()) return;
    chmodSync(path, 0o755);
    for (const entry of readdirSync(path)) makeDirectoriesWritable(join(path, entry));
  };
  makeDirectoriesWritable(checkout);
  git(root, "worktree", "remove", "--force", checkout);
}

export function sanitizedCoverageEnvironment(outputRoot) {
  const allowed = ["PATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "TEMP", "TMP", "CI", "GITHUB_ACTIONS",
    "RUNNER_OS", "RUNNER_ARCH", "PNPM_HOME", "COREPACK_HOME", "NO_COLOR", "FORCE_COLOR",
    "NODE_V8_COVERAGE", "HRMS_COVERAGE_PYTHON"];
  const environment = Object.fromEntries(allowed.flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name]]]));
  return {
    ...environment,
    NODE_ENV: "test",
    APP_ENV: "local",
    HOME: join(outputRoot, "home"),
    XDG_CONFIG_HOME: join(outputRoot, "xdg-config"),
    XDG_CACHE_HOME: join(outputRoot, "xdg-cache"),
    NPM_CONFIG_USERCONFIG: join(outputRoot, "no-user-npmrc"),
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    LANG: "C.UTF-8",
    TZ: "UTC",
    TEST_DATABASE_URL: "postgresql://unused:unused@127.0.0.1:5432/hrms_coverage_unit_only",
    HRMS_ENV_FILE: join(outputRoot, "no-env-file"),
    HRMS_COVERAGE_OUTPUT_DIR: outputRoot,
  };
}

const defaultFullSuiteResolvers = Object.freeze({ executable: resolveTrustedExecutable, python: resolveCoveragePython });

export function selectFullSuiteTools(provided, environment, resolvers = defaultFullSuiteResolvers) {
  return provided ?? {
    node: resolvers.executable(process.execPath, environment),
    pnpm: resolvers.executable("pnpm", environment),
    python: resolvers.python(environment),
    bash: resolvers.executable("bash", environment),
  };
}

export function selectFinalizerDependencies(options) {
  return {
    build: options.buildExternal ?? buildExternalCoverage,
    stampExternal: options.stampExternal ?? stampExternalReport,
    stampPackage: options.stampPackage ?? stampReport,
    verifyGate: options.verifyGate ?? verify,
  };
}

function replaceProcessEnvironment(environment) {
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env, environment);
}

export function runFullCoverageWorker(root, outputRoot, expectedHead, tools, runCommand = execFileSync) {
  const guard = (phase) => assertExactCleanCommit(root, expectedHead, `full coverage worker ${phase}`);
  guard("entry");
  const { resolverV8, gateV8, pythonData, pythonJson, typescriptReport } = fullSuitePaths(outputRoot);
  for (const directory of [resolverV8, gateV8, typescriptReport, process.env.HOME, process.env.XDG_CONFIG_HOME, process.env.XDG_CACHE_HOME]) {
    if (directory) mkdirSync(directory, { recursive: true });
  }
  const completed = [];
  const execute = (label, command, args, extraEnv = {}, omit = []) => {
    guard(`before ${label}`);
    const environment = { ...process.env, ...extraEnv };
    for (const name of omit) delete environment[name];
    runCommand(command, args, { cwd: root, env: environment, stdio: "inherit", maxBuffer: 32 * 1024 * 1024 });
    guard(`after ${label}`);
    completed.push(label);
  };
  execute("resolver tests", tools.node, ["--test", "scripts/agent/resolve-push-coverage-base.test.mjs"], { NODE_V8_COVERAGE: resolverV8 });
  execute("gate regressions", tools.node, ["--experimental-test-coverage", "--test", "scripts/agent/changed-coverage.test.mjs"], { NODE_V8_COVERAGE: gateV8 }, ["HRMS_COVERAGE_OUTPUT_DIR"]);
  execute("Python tests", tools.python, ["-m", "coverage", "run", "--branch", "--source=scripts/agent", "-m", "unittest", "discover", "-s", "scripts/agent/tests", "-v"], { COVERAGE_FILE: pythonData }, ["NODE_V8_COVERAGE"]);
  execute("Python report", tools.python, ["-m", "coverage", "json", "--pretty-print", "--include=scripts/agent/assert-disposable-test-db.py,scripts/agent/validate-doc-references.py", "-o", pythonJson], { COVERAGE_FILE: pythonData }, ["NODE_V8_COVERAGE"]);
  execute("agent setup validation", tools.bash, ["scripts/agent/validate-agent-setup.sh"], {}, ["NODE_V8_COVERAGE"]);
  const includes = [
    "hrms_backend/scripts/lib.ts",
    "qa-artifacts/hrms/discovery-2026-11-09/admin-settings-cross-company-probe.ts",
    "qa-artifacts/hrms/discovery-2026-11-09/disposable-probe-guard.ts",
    "qa-artifacts/hrms/discovery-2026-11-09/multi-instance-asset-probe.ts",
    "qa-artifacts/hrms/discovery-2026-11-09/tenant-boundary-probe.ts",
  ];
  execute("isolated TypeScript tests", tools.pnpm, ["--dir", "hrms_backend", "exec", "vitest", "run", "--project", "unit",
    "src/__tests__/discovery-probes.unit.test.ts", "src/__tests__/disposable-probe-guard.unit.test.ts", "src/__tests__/walk-files.unit.test.ts",
    "--coverage", "--coverage.allowExternal=true", ...includes.flatMap((path) => ["--coverage.include", resolve(root, path)]),
    "--coverage.reporter=text", "--coverage.reporter=json", `--coverage.reportsDirectory=${typescriptReport}`], {}, ["NODE_V8_COVERAGE"]);
  execute("backend coverage", tools.pnpm, ["--dir", "hrms_backend", "exec", "vitest", "run", "--project", "unit", "--coverage", "--coverage.reporter=json", `--coverage.reportsDirectory=${dirname(coverageArtifactPath(root, "backend"))}`], {}, ["NODE_V8_COVERAGE"]);
  execute("frontend coverage", tools.pnpm, ["--dir", "hrms-client", "exec", "vitest", "run", "--coverage", "--coverage.reporter=json", `--coverage.reportsDirectory=${dirname(coverageArtifactPath(root, "frontend"))}`], {}, ["NODE_V8_COVERAGE"]);
  return completed;
}

export async function runFullCoverageGate(root, base, head = "HEAD", options = {}) {
  if (!base) throw new Error("Full coverage suite requires a validated --base REF");
  const expectedHead = assertCleanRepository(root, "full coverage suite entry");
  const requestedHead = git(root, "rev-parse", head).trim();
  if (requestedHead !== expectedHead) throw new Error(`Full coverage requested head ${requestedHead} does not equal checked-out commit ${expectedHead}`);
  if (options.outputRoot !== undefined && (!isAbsolute(options.outputRoot) || resolve(options.outputRoot) !== options.outputRoot)) {
    throw new Error("Full coverage suite --coverage-output must be absolute and canonical");
  }
  const outputRoot = options.outputRoot ? resolve(options.outputRoot) : mkdtempSync(join(tmpdir(), "hrms-changed-coverage-"));
  const validatorScript = options.validatorScript ?? fileURLToPath(import.meta.url);
  if (options.validatorScript !== undefined) {
    assertExternalArtifact(root, validatorScript, "trusted validator script");
  }
  const previousOutput = process.env.HRMS_COVERAGE_OUTPUT_DIR;
  const preserveOutput = options.preserveOutput === true || options.outputRoot !== undefined;
  let sourceRoot = undefined;
  try {
    if (existsSync(outputRoot)) {
      assertExternalArtifact(root, outputRoot, "full coverage output", true);
      if (readdirSync(outputRoot).length > 0) throw new Error("Full coverage output directory must be empty");
    } else {
      assertExternalArtifactDestination(root, join(outputRoot, ".output-probe"), "full coverage output");
    }
    process.env.HRMS_COVERAGE_OUTPUT_DIR = outputRoot;
    const paths = fullSuitePaths(outputRoot);
    mkdirSync(paths.orchestratorV8, { recursive: true });
    const environment = sanitizedCoverageEnvironment(outputRoot);
    const tools = selectFullSuiteTools(options.tools, environment);
    assertExactCleanCommit(root, expectedHead, "full coverage launcher before checkout");
    const prepareCheckout = options.prepareCheckout ?? createExactCommitCheckout;
    sourceRoot = await prepareCheckout(root, outputRoot, expectedHead);
    assertExactCleanCommit(root, expectedHead, "full coverage launcher after checkout");
    assertExactCleanCommit(sourceRoot, expectedHead, "full coverage source checkout");
    const guardCollector = (phase) => {
      assertExactCleanCommit(root, expectedHead, `full coverage launcher ${phase}`);
      assertExactCleanCommit(sourceRoot, expectedHead, `full coverage source ${phase}`);
    };
    const workerExecutor = options.execFile ?? execFileSync;
    const launchWorker = options.launchWorker ?? (() => workerExecutor(tools.node,
      [validatorScript, "--full-suite-worker", "--coverage-output", outputRoot,
        "--expected-head", expectedHead, "--node", tools.node, "--pnpm", tools.pnpm, "--python", tools.python, "--bash", tools.bash], {
        cwd: sourceRoot,
        env: { ...environment, HRMS_COVERAGE_REPO_ROOT: sourceRoot, NODE_V8_COVERAGE: paths.orchestratorV8 },
        stdio: "inherit",
        maxBuffer: 32 * 1024 * 1024,
      }));
    guardCollector("before worker");
    await launchWorker({ root: sourceRoot, outputRoot, environment, paths, expectedHead, tools, validatorScript });
    guardCollector("after worker");
    const finalize = options.finalize ?? (async () => {
      const { build, stampExternal, stampPackage, verifyGate } = selectFinalizerDependencies(options);
      guardCollector("before report build");
      await build(sourceRoot, {
        nodeV8: [paths.resolverV8, paths.gateV8, paths.orchestratorV8],
        istanbul: [join(paths.typescriptReport, "coverage-final.json")],
        python: [paths.pythonJson],
      });
      guardCollector("after report build");
      stampExternal(sourceRoot);
      guardCollector("after external stamp");
      stampPackage(sourceRoot, "backend");
      guardCollector("after backend stamp");
      stampPackage(sourceRoot, "frontend");
      guardCollector("before verify");
      const verified = verifyGate(sourceRoot, base, expectedHead, paths);
      guardCollector("after verify");
      return verified;
    });
    const result = await finalize({ root: sourceRoot, base, head: expectedHead, outputRoot, paths, expectedHead, tools });
    return { ...result, coverageOutputRoot: outputRoot };
  } finally {
    if (previousOutput === undefined) delete process.env.HRMS_COVERAGE_OUTPUT_DIR;
    else process.env.HRMS_COVERAGE_OUTPUT_DIR = previousOutput;
    const cleanupCheckout = options.cleanupCheckout ?? removeExactCommitCheckout;
    if (sourceRoot && sourceRoot !== root) cleanupCheckout(root, sourceRoot);
    if (!preserveOutput) rmSync(outputRoot, { recursive: true, force: true });
  }
}

export function changedLines(root, base, head, gitCommand = git) {
  gitCommand(root, "cat-file", "-e", `${base}^{commit}`);
  gitCommand(root, "cat-file", "-e", `${head}^{commit}`);
  const mergeBase = gitCommand(root, "merge-base", base, head).trim();
  if (!mergeBase) throw new Error(`No merge base for ${base} and ${head}`);
  const diff = gitCommand(root, "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--unified=0", "--diff-filter=AM", mergeBase, head, "--");
  const files = new Map();
  const textHunks = new Set();
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
      textHunks.add(current);
      if (count === 0 && !isTestOrGenerated(current) &&
          (/^(?:hrms_backend|hrms-client)\/src\//.test(current) || instrumentableExternal(current))) {
        deletionOnly.push(`${current}:${line}`);
      }
      if (oldCount > 0 && count > 0 && !isTestOrGenerated(current) &&
          (/^(?:hrms_backend|hrms-client)\/src\//.test(current) || instrumentableExternal(current))) {
        replacementHunks.push({ path: current, oldStart, oldCount, start, count });
      }
      for (let index = 0; index < count; index++) files.get(current).add(start + index);
    }
  }
  if (state === "hunk") throw new Error(`Incomplete diff hunk in ${current}`);
  const raw = gitCommand(root, "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--raw", "-z", mergeBase, head, "--")
    .split("\0").filter(Boolean);
  if (raw.length % 2 !== 0) throw new Error("Malformed git raw diff: missing path");
  const statuses = [];
  for (let index = 0; index < raw.length; index += 2) {
    const match = /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z])$/.exec(raw[index]);
    if (!match) throw new Error(`Unsupported git raw diff status: ${raw[index]}`);
    statuses.push({ oldMode: match[1], newMode: match[2], status: match[3], path: raw[index + 1] });
  }
  const outside = [];
  const external = [];
  const testSource = [];
  const excludedGenerated = [];
  const modeTransitions = [];
  const changedProductTests = [];
  for (const { status, path, oldMode, newMode } of statuses) {
    const sourceTreePath = /^(?:hrms_backend|hrms-client)\/src(?:\/|$)/.test(path);
    const instrumentedSource = /^(?:hrms_backend|hrms-client)\/src\/.*\.tsx?$/.test(path);
    const monitored = sourceTreePath || outsideExecutableOrConfig(path);
    if (monitored && (!/^[AMD]$/.test(status) ||
        (status === "A" && newMode !== "100644") ||
        (status === "M" && (oldMode !== "100644" || newMode !== "100644")) ||
        (status === "D" && oldMode !== "100644") ||
        ((status === "A" || status === "M") && instrumentedSource && !textHunks.has(path)))) {
      modeTransitions.push({ path, status, oldMode, newMode, noTextHunk: (status === "A" || status === "M") && !textHunks.has(path) });
      continue;
    }
    if (isProductTestPath(path)) {
      changedProductTests.push(path);
      continue;
    }
    if (sourceTreePath && /\/routeTree\.gen\.ts$/.test(path)) {
      outside.push(path);
      continue;
    }
    if (/(?:\.test\.[cm]?[jt]sx?$|\/tests\/test_[^/]+\.py$|\/src\/test\/)/.test(path)) {
      testSource.push(path);
      continue;
    }
    if (isTestOrGenerated(path)) {
      excludedGenerated.push(path);
      continue;
    }
    if (status === "D" && /^(?:hrms_backend|hrms-client)\/src\/.*\.tsx?$/.test(path)) {
      deletionOnly.push(`${path}:deleted source file`);
    } else if (status === "D" && instrumentableExternal(path)) {
      deletionOnly.push(`${path}:deleted external executable file`);
    } else if (instrumentableExternal(path)) {
      external.push(path);
    } else if ((sourceTreePath || outsideExecutableOrConfig(path)) && !instrumentedSource) {
      outside.push(path);
    }
  }
  const importRisks = changedProductTests.length ? productionImportRisks(root) : [];
  for (const path of changedProductTests) {
    if (importRisks.length) outside.push(path);
    else testSource.push(path);
  }
  const unsafePaths = new Set(modeTransitions.map((item) => item.path));
  const removedRuntime = [];
  for (const hunk of replacementHunks) {
    if (unsafePaths.has(hunk.path)) continue;
    const oldContent = gitCommand(root, "show", `${mergeBase}:${hunk.path}`);
    const newContent = readFileSync(join(root, hunk.path), "utf8");
    const oldLines = new Set(Array.from({ length: hunk.oldCount }, (_, index) => hunk.oldStart + index));
    const newLines = new Set(Array.from({ length: hunk.count }, (_, index) => hunk.start + index));
    const oldRuntime = assessChangedFile(hunk.path, oldLines, oldContent, undefined).executable.length;
    const newRuntime = assessChangedFile(hunk.path, newLines, newContent, undefined).executable.length;
    if (oldRuntime > 0 && newRuntime === 0) {
      removedRuntime.push(`${hunk.path}:${hunk.oldStart}-${hunk.oldStart + hunk.oldCount - 1} replaced by non-executable lines`);
    }
  }
  return { mergeBase, files, deletionOnly, removedRuntime, outside, external, testSource, excludedGenerated, modeTransitions, importRisks };
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
    if (ts.isVariableDeclaration(node) && !node.initializer) {
      mark(node);
    }
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) && node.body) {
      const first = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const beforeBody = source.getLineAndCharacterOfPosition(node.body.getStart(source)).line + 1;
      for (let line = first; line <= beforeBody; line++) excluded.add(line);
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
  return statements.every(([id]) => validateCount(entry.s?.[id], `statement ${id}`) > 0) &&
    functions.every(([id]) => validateCount(entry.f?.[id], `function ${id}`) > 0);
}

function branchAtLine(entry, line) {
  const spansLine = (location) => location &&
    location.start?.line <= line && line <= location.end?.line;
  return Object.entries(entry.branchMap ?? {}).filter(([, branch]) =>
    spansLine(branch.loc) || branch.locations?.some(spansLine));
}

export function assessChangedFile(path, lines, content, entry) {
  const python = path.endsWith(".py");
  const { excluded, tokens } = python ? { excluded: new Set(), tokens: new Set() } : nonExecutableLines(path, content);
  const result = { executable: [], nonExecutable: [], uncovered: [], branches: [], uncoveredBranches: [] };
  const seenBranches = new Set();
  const contentLines = content.split("\n");
  for (const line of [...lines].sort((a, b) => a - b)) {
    const raw = contentLines[line - 1] ?? "";
    const covered = entry ? coverageAtLine(entry, line) : null;
    const lineBranches = entry ? branchAtLine(entry, line) : [];
    if ((python && covered === null && lineBranches.length === 0) ||
        (!python && !tokens.has(line) && covered === null && lineBranches.length === 0) ||
        ((excluded.has(line) || /^\s*(?:\/\/|\/\*|\*|\*\/)/.test(raw) || /^[\s{}()[\];,]*$/.test(raw)) &&
          covered === null && lineBranches.length === 0)) {
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
      if (!Array.isArray(outcomes) || outcomes.length === 0) throw new Error(`branch ${id}: malformed branch counts`);
      if (outcomes.some((count, index) => validateCount(count, `branch ${id}.${index}`) <= 0)) {
        result.uncoveredBranches.push(`${line}:${id}`);
      }
    }
  }
  return result;
}

export function verify(root, base, head, suitePaths = fullSuitePaths(coverageOutputRoot(root))) {
  assertCleanRepository(root);
  const actualHead = git(root, "rev-parse", "HEAD").trim();
  const resolvedHead = git(root, "rev-parse", head).trim();
  if (actualHead !== resolvedHead) throw new Error("Coverage gate head must equal checked-out HEAD");
  const { mergeBase, files, deletionOnly, removedRuntime, outside, external, testSource, excludedGenerated, modeTransitions, importRisks } = changedLines(root, base, head);
  const reports = {};
  const totals = { executable: 0, nonExecutable: 0, branches: 0, uncovered: [] };
  let uncoveredLines = 0;
  let uncoveredBranches = 0;
  let unmeasuredCount = deletionOnly.length + removedRuntime.length;
  const lines = [`Coverage diff ${mergeBase}..${resolvedHead}`];
  for (const path of testSource) lines.push(`TEST SOURCE ${path}: excluded from product line denominator; independent assertion-quality review required`);
  for (const risk of importRisks) lines.push(`IMPORT GRAPH ${risk}: changed in-source test files require review`);
  for (const path of excludedGenerated) lines.push(`EXCLUDED TYPE/GENERATED ${path}: no product line denominator; typecheck/build regeneration evidence required`);
  for (const item of deletionOnly) {
    const message = `deletion-only ${item}: behavior requires explicit regression evidence`;
    totals.uncovered.push(message);
  }
  for (const item of removedRuntime) totals.uncovered.push(`removed runtime ${item}: replacement has no executable coverage target`);
  for (const path of outside) {
    const message = `unmeasured executable/config ${path}: no package coverage mapping`;
    totals.uncovered.push(message);
    unmeasuredCount += 1;
  }
  for (const item of modeTransitions) {
    totals.uncovered.push(`unmeasured source mode/type ${item.path}: git status ${item.status}, mode ${item.oldMode}->${item.newMode}${item.noTextHunk ? ", no text hunk" : ""}; explicit regression disposition required`);
    unmeasuredCount += 1;
  }
  const unsafePaths = new Set(modeTransitions.map((item) => item.path));
  const excludedPaths = new Set([...testSource, ...excludedGenerated]);
  const outsidePaths = new Set(outside);
  const externalPaths = new Set(external);
  for (const [path, changed] of files) {
    if (unsafePaths.has(path) || excludedPaths.has(path) || outsidePaths.has(path)) continue;
    if (changed.size === 0) continue;
    const packageName = externalPaths.has(path) ? "external" : path.startsWith("hrms_backend/") ? "backend" : "frontend";
    if (packageName !== "external" && !/^(?:hrms_backend|hrms-client)\/src\//.test(path)) continue;
    reports[packageName] ??= readReport(root, packageName, resolvedHead);
    const entry = reports[packageName].get(path);
    const result = assessChangedFile(path, changed, readFileSync(join(root, path), "utf8"), entry);
    totals.executable += result.executable.length;
    totals.nonExecutable += result.nonExecutable.length;
    totals.branches += result.branches.length;
    uncoveredLines += result.uncovered.length;
    uncoveredBranches += result.uncoveredBranches.length;
    for (const line of result.uncovered) totals.uncovered.push(`${path}:${line}`);
    for (const branch of result.uncoveredBranches) totals.uncovered.push(`${path}:branch ${branch}`);
    lines.push(`${path}: executable ${result.executable.length}, non-executable ${result.nonExecutable.length}, decision branches ${result.branches.length}`);
  }
  lines.push(`Changed executable lines: ${totals.executable - uncoveredLines}/${totals.executable}; changed decision branches: ${totals.branches - uncoveredBranches}/${totals.branches}; unmeasured paths/deletions/modes: ${unmeasuredCount}`);
  lines.push(...totals.uncovered.map((item) => `UNCOVERED ${item}`));
  return { pass: totals.uncovered.length === 0, mergeBase, files, totals, lines };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function argumentsFor(name) {
  return process.argv.flatMap((value, index) => value === name && process.argv[index + 1] ? [process.argv[index + 1]] : []);
}

export async function runFullSuiteCommand(root, args, dependencies = {}) {
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const explicitOutput = value("--coverage-output");
  const preserveOutput = args.includes("--preserve-coverage") || explicitOutput !== undefined;
  const runGate = dependencies.runGate ?? runFullCoverageGate;
  const log = dependencies.log ?? console.log;
  const result = await runGate(root, value("--base"), value("--head") ?? "HEAD", {
    outputRoot: explicitOutput,
    preserveOutput,
    validatorScript: value("--trusted-validator"),
  });
  log(result.lines.join("\n"));
  if (preserveOutput) log(`Coverage artifacts preserved at: ${result.coverageOutputRoot}`);
  return result.pass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--full-suite-worker")) {
      const outputRoot = argument("--coverage-output");
      if (!outputRoot || !isAbsolute(outputRoot) || resolve(outputRoot) !== outputRoot) {
        throw new Error("Full coverage worker requires an absolute canonical --coverage-output path");
      }
      const expectedHead = argument("--expected-head");
      const tools = { node: argument("--node"), pnpm: argument("--pnpm"), python: argument("--python"), bash: argument("--bash") };
      if (!expectedHead || Object.values(tools).some((value) => !value || !isAbsolute(value))) {
        throw new Error("Full coverage worker requires exact head and absolute trusted tool paths");
      }
      replaceProcessEnvironment(sanitizedCoverageEnvironment(outputRoot));
      for (const [name, path] of Object.entries(tools)) {
        try { validateTrustedExecutable(path); } catch { throw new Error(`Full coverage worker received invalid ${name} executable`); }
      }
      runFullCoverageWorker(repoRoot, outputRoot, expectedHead, tools);
    } else if (process.argv.includes("--run-full-suite")) {
      process.exitCode = await runFullSuiteCommand(repoRoot, process.argv.slice(2));
    } else if (process.argv.includes("--build-external-report")) {
      await buildExternalCoverage(repoRoot, {
        nodeV8: argumentsFor("--node-v8"),
        istanbul: argumentsFor("--istanbul"),
        python: argumentsFor("--python"),
      });
      stampExternalReport(repoRoot);
      console.log("Built and stamped fresh external coverage at HEAD.");
    } else if (argument("--stamp")) {
      const packageName = argument("--stamp");
      if (packageName === "external") stampExternalReport(repoRoot);
      else stampReport(repoRoot, packageName);
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
