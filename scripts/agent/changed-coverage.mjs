#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { accessSync, chmodSync, constants as fsConstants, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = process.env.HRMS_COVERAGE_REPO_ROOT ? resolve(process.env.HRMS_COVERAGE_REPO_ROOT) : toolRoot;
const requireFromBackend = createRequire(join(toolRoot, "hrms_backend/package.json"));
const ts = requireFromBackend("typescript");
const { Pool: PostgresPool } = requireFromBackend("pg");
const Valkey = requireFromBackend("iovalkey").default;
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
  return /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|\/e2e\/.*\.[cm]?[jt]sx?$|\/tests\/test_[^/]+\.py$|\/src\/test\/|\.d\.ts$|\/routeTree\.gen\.ts$)/.test(path);
}

function isProductTestPath(path) {
  return /^(?:hrms_backend|hrms-client)\/src\//.test(path) &&
    /(?:\.test\.[cm]?[jt]sx?$|\/src\/(?:test|__tests__)\/)/.test(path);
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
      if (ts.isImportDeclaration(node) && !isPureTypeImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) inspect(node.moduleSpecifier.text);
      if (ts.isExportDeclaration(node) && !isPureTypeExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) inspect(node.moduleSpecifier.text);
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

function isPureTypeImportDeclaration(node) {
  if (!ts.isImportDeclaration(node)) return false;
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return false;
  return clause.namedBindings.elements.length > 0 &&
    clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function isPureTypeExportDeclaration(node) {
  if (!ts.isExportDeclaration(node)) return false;
  if (node.isTypeOnly) return true;
  return Boolean(node.exportClause && ts.isNamedExports(node.exportClause) &&
    node.exportClause.elements.length > 0 &&
    node.exportClause.elements.every((element) => element.isTypeOnly));
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
    const typeOnly = isPureTypeImportDeclaration(node) || isPureTypeExportDeclaration(node);
    if (!staticModule || typeOnly) continue;
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
  return new Map([...entries].map(([path, entry]) => [
    path,
    addEvaluatedModuleStatements(root, path, entry),
  ]));
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
    BUILD_SHA: "coverage-exact-head",
    TEST_DATABASE_URL: "postgresql://hrms_coverage:coverage@127.0.0.1:55433/hrms_coverage_test",
    VALKEY_URL: "redis://127.0.0.1:56380/15",
    CLOUDINARY_MOCK_UPLOADS: "true",
    EMAIL_DELIVERY_MODE: "log",
    LOCAL_DEMO_PASSWORD: "coverage-local-demo-A1!",
    JWT_ACCESS_SECRET: "coverage-access-secret-at-least-32-characters",
    JWT_REFRESH_SECRET: "coverage-refresh-secret-at-least-32-characters",
    HRMS_ENV_FILE: join(outputRoot, "no-env-file"),
    HRMS_COVERAGE_OUTPUT_DIR: outputRoot,
  };
}

export function selectCoverageIntegrationPool(environment, dependencies = {}) {
  return dependencies.pool ?? new PostgresPool({ connectionString: environment.TEST_DATABASE_URL });
}

export function selectCoverageIntegrationValkey(environment, dependencies = {}) {
  return dependencies.valkey ?? new Valkey(environment.VALKEY_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
}

export function coverageDatabaseObjectCount(result) {
  if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) {
    throw new Error("Coverage integration database object count result is malformed");
  }
  const row = result.rows[0];
  if (!row || typeof row !== "object") {
    throw new Error("Coverage integration database object count row is malformed");
  }
  const count = row.count;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Coverage integration database object count is malformed");
  }
  return count;
}

export async function prepareCoverageIntegrationServices(environment, token, dependencies = {}) {
  const databaseUrl = new URL(environment.TEST_DATABASE_URL);
  const valkeyUrl = new URL(environment.VALKEY_URL);
  if (databaseUrl.protocol !== "postgresql:" || databaseUrl.hostname !== "127.0.0.1" ||
      databaseUrl.port !== "55433" || databaseUrl.pathname !== "/hrms_coverage_test") {
    throw new Error("Coverage integration database must be the dedicated 127.0.0.1:55433/hrms_coverage_test service");
  }
  if (valkeyUrl.protocol !== "redis:" || valkeyUrl.hostname !== "127.0.0.1" ||
      valkeyUrl.port !== "56380" || valkeyUrl.pathname !== "/15") {
    throw new Error("Coverage integration Valkey must be the dedicated 127.0.0.1:56380/15 service");
  }
  if (!/^[0-9a-f]{40}:[A-Za-z0-9._-]+$/.test(token)) {
    throw new Error("Coverage integration service token is malformed");
  }

  const pool = selectCoverageIntegrationPool(environment, dependencies);
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('hrms_coverage_service_claim'))");
      const occupied = await client.query(`
        SELECT count(*)::int AS count
        FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE relation.relkind IN ('r','p','v','m','S','f')
          AND namespace.nspname NOT IN ('pg_catalog','information_schema')
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_depend dependency
            JOIN pg_catalog.pg_extension extension ON extension.oid = dependency.refobjid
            WHERE dependency.classid = 'pg_class'::regclass
              AND dependency.objid = relation.oid
              AND dependency.deptype = 'e'
          )
      `);
      if (coverageDatabaseObjectCount(occupied) !== 0) {
        throw new Error("Coverage integration database is not empty; recreate its disposable container before running");
      }
      await client.query("CREATE TABLE public.hrms_coverage_run_guard (token text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())");
      await client.query("INSERT INTO public.hrms_coverage_run_guard (token) VALUES ($1)", [token]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  const valkey = selectCoverageIntegrationValkey(environment, dependencies);
  try {
    await valkey.connect();
    const claimed = await valkey.eval(
      "if redis.call('dbsize') == 0 then return redis.call('set', KEYS[1], ARGV[1], 'NX') else return 0 end",
      1,
      "hrms:coverage:run-guard",
      token,
    );
    if (claimed !== "OK") {
      throw new Error("Coverage integration Valkey is populated or already claimed; recreate its disposable container before running");
    }
  } catch (error) {
    await valkey.quit().catch(() => valkey.disconnect());
    throw new Error(`${error.message}; recreate the disposable PostgreSQL container before retrying`, { cause: error });
  }

  return async () => {
    let cleanupError;
    try {
      const result = await valkey.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('flushdb') else return 0 end",
        1,
        "hrms:coverage:run-guard",
        token,
      );
      if (result !== "OK") throw new Error("Coverage integration Valkey ownership was lost before cleanup");
    } catch (error) {
      cleanupError = error;
    } finally {
      try {
        await valkey.quit();
      } catch (error) {
        valkey.disconnect();
        if (cleanupError) cleanupError = new AggregateError([cleanupError, error], "Coverage integration Valkey cleanup failed");
        else cleanupError = error;
      }
    }
    if (cleanupError) throw cleanupError;
  };
}

export async function verifyCoverageIntegrationServiceClaim(environment, token, dependencies = {}) {
  if (!/^[0-9a-f]{40}:[A-Za-z0-9._-]+$/.test(token)) {
    throw new Error("Coverage integration service claim token is malformed");
  }
  const pool = selectCoverageIntegrationPool(environment, dependencies);
  try {
    const result = await pool.query("SELECT token FROM public.hrms_coverage_run_guard");
    if (result.rows.length !== 1 || result.rows[0]?.token !== token) {
      throw new Error("Coverage integration PostgreSQL claim does not match the parent run");
    }
  } finally {
    await pool.end();
  }
  const valkey = selectCoverageIntegrationValkey(environment, dependencies);
  try {
    await valkey.connect();
    if (await valkey.get("hrms:coverage:run-guard") !== token) {
      throw new Error("Coverage integration Valkey claim does not match the parent run");
    }
  } finally {
    try {
      await valkey.quit();
    } catch {
      valkey.disconnect();
    }
  }
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

export function selectPrepareCoverageServices(options) {
  return options.prepareServices ?? prepareCoverageIntegrationServices;
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
  execute("backend unit and integration coverage", tools.pnpm, ["--dir", "hrms_backend", "exec", "vitest", "run",
    "--project", "unit", "--project", "integration", "--coverage", "--coverage.reporter=json",
    `--coverage.reportsDirectory=${dirname(coverageArtifactPath(root, "backend"))}`], {}, ["NODE_V8_COVERAGE"]);
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
  let cleanupServices = undefined;
  let primaryError = undefined;
  const serviceClaimToken = `${expectedHead}:${createHash("sha256").update(outputRoot).digest("hex").slice(0, 16)}`;
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
    const prepareServices = selectPrepareCoverageServices(options);
    cleanupServices = await prepareServices(environment, serviceClaimToken);
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
        "--expected-head", expectedHead, "--service-claim-token", serviceClaimToken,
        "--node", tools.node, "--pnpm", tools.pnpm, "--python", tools.python, "--bash", tools.bash], {
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
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (previousOutput === undefined) delete process.env.HRMS_COVERAGE_OUTPUT_DIR;
    else process.env.HRMS_COVERAGE_OUTPUT_DIR = previousOutput;
    const cleanupCheckout = options.cleanupCheckout ?? removeExactCommitCheckout;
    const cleanupErrors = [];
    try {
      if (sourceRoot && sourceRoot !== root) cleanupCheckout(root, sourceRoot);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (cleanupServices) await cleanupServices();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (!preserveOutput) (options.cleanupOutput ?? rmSync)(outputRoot, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0) {
      const cleanupFailure = new AggregateError(cleanupErrors, "Full coverage cleanup failed");
      if (primaryError && typeof primaryError === "object") primaryError.cause = cleanupFailure;
      else throw cleanupFailure;
    }
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
    } else if (semanticCoveragePaths.has(path)) {
      // Operational QA scripts have explicit semantic contracts rather than
      // executable package coverage. Classify them before the generic
      // external-program path so they cannot be treated as uninstrumented.
      outside.push(path);
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
    if (isPureTypeImportDeclaration(node) ||
        ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
        isPureTypeExportDeclaration(node) || node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword)) {
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

/*
 * Package manifests, lockfiles, runner configuration, workflow YAML and shell
 * orchestration cannot be represented by V8/Istanbul line counts.  They are
 * nevertheless executable policy.  Keep their proof path-specific and
 * fail-closed: every supported path has a semantic contract, while an
 * unknown path remains unmeasured below.  These checks intentionally validate
 * structure and behavior-affecting invariants rather than accepting receipts,
 * trace totals, or string fragments as coverage.
 */
function semanticFailure(path, message) {
  throw new Error(`${path}: ${message}`);
}

function requireText(path, content, pattern, message) {
  if (!pattern.test(content)) semanticFailure(path, message);
}

function forbidText(path, content, pattern, message) {
  if (pattern.test(content)) semanticFailure(path, message);
}

function parseJsonSemantic(path, content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    semanticFailure(path, `invalid JSON (${error.message})`);
  }
}

function validateWorkflow(path, content, trusted) {
  requireText(path, content, /^name:\s+\S+/m, "workflow name is missing");
  requireText(path, content, /^on:\s*$/m, "workflow trigger declaration is missing");
  requireText(path, content, /^jobs:\s*$/m, "jobs declaration is missing");
  requireText(path, content, /^\s{2}[A-Za-z0-9_-]+:\s*$/m, "workflow has no jobs");
  forbidText(path, content, /^\s*if:\s*false\s*$/mi, "disabled job/step is not allowed");
  forbidText(path, content, /^\s*continue-on-error:\s*true\s*$/mi, "continue-on-error would hide a failed policy");
  forbidText(path, content, /manual-evidence|allowlist|waiver/i, "manual coverage bypass is not allowed");
  requireText(path, content, /actions\/checkout@[^\s#]+/, "candidate checkout is missing");
  requireText(path, content, /--run-full-suite/, "full-suite validator invocation is missing");
  requireText(path, content, /--confirm-disposable-services/, "disposable-service confirmation is missing");
  requireText(path, content, /--base\s+\"?\$\{?COVERAGE_BASE/, "validated coverage base is not passed");
  requireText(path, content, /--head\s+(?:HEAD|\"?\$\{?CANDIDATE_SHA)/, "exact coverage head is not passed");
  if (trusted) {
    requireText(path, content, /--trusted-validator/, "trusted validator identity is not passed");
    requireText(path, content, /TRUSTED_WORKFLOW_SHA/, "trusted workflow SHA is not checked");
    requireText(path, content, /git -C trusted rev-parse HEAD/, "trusted checkout is not pinned to its workflow SHA");
    requireText(path, content, /git -C candidate rev-parse HEAD/, "candidate checkout is not pinned to its event SHA");
    requireText(path, content, /--ignore-pnpmfile/, "candidate package lifecycle hooks are not disabled");
    requireText(path, content, /persist-credentials:\s*false/, "checkout credentials are not disabled");
    requireText(path, content, /image:\s+[^\s@]+@sha256:[0-9a-f]{64}/, "service image is not immutable");
    forbidText(path, content, /actions\/checkout@v\d|actions\/setup-node@v\d/, "trusted action must be pinned by immutable SHA");
  } else {
    requireText(path, content, /changed-coverage:/, "diagnostic changed-coverage job is missing");
    requireText(path, content, /deploy-backend:[\s\S]*needs:[\s\S]*changed-coverage/, "deployment does not depend on changed coverage");
  }
}

function validateIgnoreFile(path, content) {
  const lines = content.split("\n").map((line) => line.trim());
  if (!lines.includes("node_modules")) semanticFailure(path, "root dependency directories are not ignored exactly");
  for (const required of ["hrms_backend/node_modules/", "hrms-client/node_modules/"]) {
    if (!lines.includes(required)) semanticFailure(path, `missing package ignore rule ${required}`);
  }
  const forbiddenNegations = new Set(["!node_modules", "!hrms_backend/node_modules", "!hrms-client/node_modules"]);
  if (lines.some((line) => forbiddenNegations.has(line))) {
    semanticFailure(path, "dependency ignore rules are negated");
  }
}

function validatePackageManifest(path, content, frontend) {
  const manifest = parseJsonSemantic(path, content);
  if (manifest.packageManager !== "pnpm@10.25.0") semanticFailure(path, "packageManager must pin pnpm@10.25.0");
  if (!frontend && (typeof manifest.engines?.node !== "string" || !/^>=\d+/.test(manifest.engines.node))) semanticFailure(path, "Node engine floor is missing");
  const scripts = manifest.scripts ?? {};
  const expected = frontend
    ? { "test:unit": "vitest run", "test:unit:coverage": "vitest run --coverage" }
    : { "test:unit": "vitest run --project unit", "test:unit:coverage": "vitest run --project unit --coverage" };
  for (const [name, prefix] of Object.entries(expected)) {
    if (typeof scripts[name] !== "string" || !scripts[name].startsWith(prefix)) semanticFailure(path, `${name} does not invoke the pinned Vitest contract`);
  }
  if (manifest.scripts?.preinstall || manifest.scripts?.install || manifest.scripts?.postinstall || manifest.scripts?.prepare) {
    semanticFailure(path, "package lifecycle hooks are not permitted in coverage installs");
  }
  const deps = { ...manifest.dependencies, ...manifest.devDependencies };
  if ((frontend && deps.vitest !== "4.1.6") || (!frontend && typeof deps.vitest !== "string")) {
    semanticFailure(path, "Vitest dependency is missing or not constrained");
  }
  if (deps["@vitest/coverage-v8"] !== "4.1.6") {
    semanticFailure(path, "V8 coverage version is not pinned to 4.1.6");
  }
  if (frontend && (deps["@testing-library/react"] === undefined || deps.jsdom === undefined)) {
    semanticFailure(path, "frontend component test dependencies are missing");
  }
}

function validateLockfile(path, content, frontend) {
  requireText(path, content, /^lockfileVersion:\s*['"]?9\./m, "lockfileVersion 9 is required");
  requireText(path, content, /^  \.\s*:\s*$/m, "package importer is missing");
  const importerSection = content.split("packages:\n", 1)[0];
  requireText(path, importerSection, /^\s+vitest:\s*\n\s+specifier:/m, "Vitest dependency is absent from the lockfile importer");
  forbidText(path, content, /<<<<<<<|=======|>>>>>>>/, "merge conflict markers remain in the lockfile");
}

function validateVitestConfig(path, content, frontend) {
  requireText(path, content, /defineConfig\s*\(/, "defineConfig is missing");
  requireText(path, content, /provider:\s*["']v8["']/, "V8 coverage provider is missing");
  requireText(path, content, /coverage:\s*\{[\s\S]*include:\s*\[\s*["']src\/\*\*\/\*\.\{ts,tsx\}["']\s*\]/, "source coverage include is missing");
  requireText(path, content, /coverage:\s*\{[\s\S]*exclude:\s*\[[\s\S]*src\/\*\*\/\*\.test\./, "test-source exclusion is missing");
  requireText(path, content, /reportsDirectory:\s*["']\.\/coverage["']/, "local coverage output is not fixed");
  if (frontend) {
    requireText(path, content, /environment:\s*["']jsdom["']/, "frontend config must use jsdom");
    requireText(path, content, /include:\s*\[[\s\S]*src\/\*\*\/.*unit\.test/, "frontend unit-test selector is missing");
    requireText(path, content, /setupFiles:\s*\[[\s\S]*src\/test\/setup\.ts/, "frontend setup file is missing");
  } else {
    requireText(path, content, /projects:\s*\[/, "backend test projects are missing");
    requireText(path, content, /name:\s*["']unit["']/, "backend unit project is missing");
    requireText(path, content, /name:\s*["']integration["']/, "backend integration project is missing");
    requireText(path, content, /fileParallelism:\s*false/, "backend integration isolation is missing");
  }
}

function validateShellVerifier(root, path, content, base) {
  requireText(path, content, /^set -euo pipefail$/m, "strict shell mode is missing");
  requireText(path, content, /source\s+.*BASH_SOURCE\[0\]/, "shared shell helpers are not loaded safely");
  requireText(path, content, /--plan/, "plan mode is missing");
  requireText(path, content, /--base/, "explicit base selection is missing");
  requireText(path, content, /case \"\$1\" in/, "argument dispatch is missing");
  forbidText(path, content, /\beval\s/, "eval is not permitted in the verifier");
  const semanticRoot = mkdtempSync(join(tmpdir(), "hrms-shell-semantic-"));
  try {
    const semanticScript = join(semanticRoot, "verify-change.sh");
    const semanticLibDir = semanticRoot;
    mkdirSync(semanticLibDir, { recursive: true });
    writeFileSync(semanticScript, content, { mode: 0o755 });
    const sharedLib = readFileSync(join(root, "scripts/agent/lib.sh"), "utf8")
      .replace(/^HRMS_REPO_ROOT=.*$/m, 'HRMS_REPO_ROOT="${HRMS_REPO_ROOT:?}"');
    writeFileSync(join(semanticLibDir, "lib.sh"), sharedLib, { mode: 0o644 });
    const syntax = spawnSync("bash", ["-n", semanticScript], { encoding: "utf8" });
    if (syntax.status !== 0) semanticFailure(path, `bash -n failed: ${syntax.stderr.trim()}`);
    const plan = spawnSync("bash", [semanticScript, "--plan", "--base", base], {
      cwd: root,
      env: { ...process.env, HRMS_REPO_ROOT: root },
      encoding: "utf8",
      timeout: 30000,
    });
    if (plan.status !== 0) semanticFailure(path, `plan execution failed: ${(plan.stderr || plan.stdout).trim()}`);
    if (!plan.stdout.includes("Selected verification plan:") || !plan.stdout.includes("Committed patch integrity")) {
      semanticFailure(path, "plan mode did not enumerate the protected checks");
    }
  } finally {
    rmSync(semanticRoot, { recursive: true, force: true });
  }
}

function requireSemanticText(path, content, pattern, message) {
  if (!pattern.test(content)) semanticFailure(path, message);
}

function validateQaCompose(path, content) {
  requireSemanticText(path, content, /postgres:/, "QA Compose must define PostgreSQL");
  requireSemanticText(path, content, /valkey:/, "QA Compose must define Valkey");
  requireSemanticText(path, content, /pnpm db:migrate && pnpm qa:seed/, "QA migration service must run migrations before the guarded seed");
  requireSemanticText(path, content, /HRMS_QA_SEED_ALLOW:/, "QA seed opt-in must be scoped to the migration service");
  requireSemanticText(path, content, /HRMS_QA_SEED_CONFIRM_DATABASE:/, "QA seed database confirmation is required");
  if (/APP_ENV:\s*prod(?:uction)?/i.test(content)) semanticFailure(path, "QA Compose must not use a production APP_ENV");
}

function validateHolidayMigration(path, content) {
  requireSemanticText(path, content, /BEGIN\s*;/i, "holiday migration must be transactional");
  requireSemanticText(path, content, /DROP\s+INDEX\s+IF\s+EXISTS\s+.*holiday/i, "holiday migration must remove the legacy global uniqueness rule");
  requireSemanticText(path, content, /CREATE\s+UNIQUE\s+INDEX/i, "holiday migration must create a unique index");
  requireSemanticText(path, content, /company_id/i, "holiday uniqueness must include company_id");
  requireSemanticText(path, content, /lower\s*\(/i, "holiday uniqueness must be case-insensitive");
  requireSemanticText(path, content, /deleted_at\s+IS\s+NULL/i, "holiday uniqueness must exclude soft-deleted rows");
  requireSemanticText(path, content, /COMMIT\s*;/i, "holiday migration must commit transactionally");
}

function validateAssetTransactionFenceMigration(path, content) {
  requireSemanticText(path, content, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+assets\.require_transactional_writer\s*\(\)/i, "asset writer fence function is missing");
  requireSemanticText(path, content, /current_setting\s*\(\s*'hrms\.asset_writer_v2'\s*,\s*true\s*\)\s+IS\s+DISTINCT\s+FROM\s+'on'/i, "asset writer fence must require the transaction-local marker");
  requireSemanticText(path, content, /IF\s+TG_OP\s*=\s*'DELETE'[\s\S]*RETURN\s+OLD[\s\S]*RETURN\s+NEW/i, "asset writer fence must preserve DELETE and write trigger row semantics");
  requireSemanticText(path, content, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+assets\.asset_command_results/i, "durable asset command results table is missing");
  requireSemanticText(path, content, /UNIQUE\s*\(\s*company_id\s*,\s*actor_user_id\s*,\s*action_key\s*,\s*idempotency_key\s*\)/i, "asset command replay key must be unique within actor and company scope");
  requireSemanticText(path, content, /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+asset_assignments_one_active_per_asset_uq[\s\S]*\(asset_id\)[\s\S]*WHERE\s+status\s*=\s*'active'/i, "asset assignment fence must allow only one active assignment");
  requireSemanticText(path, content, /BEFORE\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE/i, "asset writer trigger must fence every mutation operation");
  for (const table of [
    "assets", "asset_assignments", "asset_state_events", "asset_requests",
    "asset_acknowledgements", "asset_maintenance_records", "software_vendors",
    "software_products", "asset_recovery_tickets", "license_entitlements",
    "license_activations", "compromised_keys", "asset_command_results",
  ]) {
    requireSemanticText(path, content, new RegExp(`['\"]${table}['\"]`), `asset writer trigger list is missing ${table}`);
  }
}

function validateAssetRecoveryAssignmentMigration(path, content) {
  requireSemanticText(path, content, /ALTER\s+TABLE\s+assets\.asset_recovery_tickets[\s\S]*ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+assignment_id\s+uuid/i, "recovery ticket assignment column is missing");
  requireSemanticText(path, content, /IF\s+NOT\s+EXISTS[\s\S]*asset_recovery_tickets_assignment_id_fkey[\s\S]*FOREIGN\s+KEY\s*\(assignment_id\)\s+REFERENCES\s+assets\.asset_assignments\s*\(id\)/i, "recovery assignment foreign key must be installed idempotently");
  requireSemanticText(path, content, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+asset_recovery_tickets_assignment_idx[\s\S]*\(assignment_id\)/i, "recovery assignment lookup index is missing");
  requireSemanticText(path, content, /SET\s+LOCAL\s+hrms\.asset_writer_v2\s*=\s*'on'/i, "recovery backfill must use only the transaction-local writer marker");
  requireSemanticText(path, content, /assignment\.asset_id\s*=\s*ticket\.asset_id[\s\S]*assignment\.assigned_to_user_id\s*=\s*ticket\.employee_user_id/i, "recovery backfill must match asset and employee custody");
  requireSemanticText(path, content, /assignment\.assigned_at\s*<=\s*ticket\.created_at[\s\S]*assignment\.returned_at\s+IS\s+NULL\s+OR\s+assignment\.returned_at\s*>=\s*ticket\.created_at/i, "recovery backfill must match the ticket custody interval");
  requireSemanticText(path, content, /HAVING\s+count\s*\(\s*\*\s*\)\s*=\s*1/i, "recovery backfill must bind only a unique assignment");
  requireSemanticText(path, content, /UPDATE\s+assets\.asset_recovery_tickets[\s\S]*SET\s+assignment_id\s*=\s*unique_matches\.assignment_id/i, "recovery backfill update is missing");
}

function validateQaSeedSafety(path, content) {
  requireSemanticText(path, content, /HRMS_QA_SEED_ALLOW/, "QA seed safety must require explicit opt-in");
  requireSemanticText(path, content, /only isolated local or QA/, "QA seed safety must reject non-isolated targets");
  requireSemanticText(path, content, /HRMS_QA_SEED_CONFIRM_DATABASE/, "QA seed safety must require exact database confirmation");
  requireSemanticText(path, content, /rethrowAfterQaSeedRollback/, "QA seed safety must preserve primary errors after rollback failure");
}

function validateQaSeedEntrypoint(path, content) {
  requireSemanticText(path, content, /runGuardedQaSeed/, "QA seed entrypoint must use the guarded orchestration");
  requireSemanticText(path, content, /preflight:/, "QA seed entrypoint must run deterministic preflight");
  requireSemanticText(path, content, /releaseSeed:/, "QA seed entrypoint must run the release seed phase");
  requireSemanticText(path, content, /extrasSeed:/, "QA seed entrypoint must run the QA extras phase");
}

function validateQaSeedPhase(path, content) {
  requireSemanticText(path, content, /client\.query\("BEGIN"\)/, "QA seed phase must begin a transaction");
  requireSemanticText(path, content, /rethrowAfterQaSeedRollback/, "QA seed phase must roll back and preserve primary errors");
  requireSemanticText(path, content, /client\.query\("COMMIT"\)/, "QA seed phase must commit only after all writes succeed");
  requireSemanticText(path, content, /client\.end\(\)/, "QA seed phase must close its database client");
}

export function validateSemanticPath(root, path, content, base) {
  switch (path) {
    case ".github/workflows/branch-ci-cd.yml": validateWorkflow(path, content, false); break;
    case ".github/workflows/trusted-changed-coverage.yml": validateWorkflow(path, content, true); break;
    case ".gitignore": validateIgnoreFile(path, content); break;
    case "hrms-client/package.json": validatePackageManifest(path, content, true); break;
    case "hrms_backend/package.json": validatePackageManifest(path, content, false); break;
    case "hrms-client/pnpm-lock.yaml": validateLockfile(path, content, true); break;
    case "hrms_backend/pnpm-lock.yaml": validateLockfile(path, content, false); break;
    case "hrms-client/vitest.config.ts": validateVitestConfig(path, content, true); break;
    case "hrms_backend/vitest.config.ts": validateVitestConfig(path, content, false); break;
    case "scripts/agent/verify-change.sh": validateShellVerifier(root, path, content, base); break;
    case "hrms_backend/infra/docker/docker-compose.qa.yml": validateQaCompose(path, content); break;
    case "hrms_backend/src/db/migrations/0065_holiday_company_unique_constraint.sql": validateHolidayMigration(path, content); break;
    case "hrms_backend/src/db/migrations/0066_asset_transaction_fence.sql": validateAssetTransactionFenceMigration(path, content); break;
    case "hrms_backend/src/db/migrations/0067_asset_recovery_assignment_identity.sql": validateAssetRecoveryAssignmentMigration(path, content); break;
    case "hrms_backend/scripts/qa-seed-safety.ts": validateQaSeedSafety(path, content); break;
    case "hrms_backend/scripts/seed-qa.ts": validateQaSeedEntrypoint(path, content); break;
    case "hrms_backend/scripts/seed-qa-data.ts":
    case "hrms_backend/scripts/seed-release-data.ts": validateQaSeedPhase(path, content); break;
    default: return null;
  }
  return `${path}: semantic contract passed`;
}

export const semanticCoveragePaths = new Set([
  ".github/workflows/branch-ci-cd.yml",
  ".github/workflows/trusted-changed-coverage.yml",
  ".gitignore",
  "hrms-client/package.json",
  "hrms-client/pnpm-lock.yaml",
  "hrms-client/vitest.config.ts",
  "hrms_backend/package.json",
  "hrms_backend/pnpm-lock.yaml",
  "hrms_backend/vitest.config.ts",
  "scripts/agent/verify-change.sh",
  "hrms_backend/infra/docker/docker-compose.qa.yml",
  "hrms_backend/src/db/migrations/0065_holiday_company_unique_constraint.sql",
  "hrms_backend/src/db/migrations/0066_asset_transaction_fence.sql",
  "hrms_backend/src/db/migrations/0067_asset_recovery_assignment_identity.sql",
  "hrms_backend/scripts/qa-seed-safety.ts",
  "hrms_backend/scripts/seed-qa.ts",
  "hrms_backend/scripts/seed-qa-data.ts",
  "hrms_backend/scripts/seed-release-data.ts",
]);

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
  const semanticLines = [];
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
    if (semanticCoveragePaths.has(path)) {
      semanticLines.push(validateSemanticPath(root, path, readFileSync(join(root, path), "utf8"), mergeBase));
      continue;
    }
    const message = `unmeasured executable/config ${path}: no package coverage mapping`;
    totals.uncovered.push(message);
    unmeasuredCount += 1;
  }
  for (const item of modeTransitions) {
    if (semanticCoveragePaths.has(item.path)) {
      semanticLines.push(validateSemanticPath(root, item.path, readFileSync(join(root, item.path), "utf8"), mergeBase));
      continue;
    }
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
  lines.push(...semanticLines.filter(Boolean).map((item) => `SEMANTIC ${item}`));
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
  if (!args.includes("--confirm-disposable-services")) {
    throw new Error("Full coverage suite requires --confirm-disposable-services after provisioning fresh isolated coverage containers");
  }
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

export async function runFullCoverageWorkerCommand(root, args, dependencies = {}) {
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const outputRoot = value("--coverage-output");
  if (!outputRoot || !isAbsolute(outputRoot) || resolve(outputRoot) !== outputRoot) {
    throw new Error("Full coverage worker requires an absolute canonical --coverage-output path");
  }
  const expectedHead = value("--expected-head");
  const serviceClaimToken = value("--service-claim-token");
  const tools = { node: value("--node"), pnpm: value("--pnpm"), python: value("--python"), bash: value("--bash") };
  if (!expectedHead || !serviceClaimToken || Object.values(tools).some((tool) => !tool || !isAbsolute(tool))) {
    throw new Error("Full coverage worker requires exact head, parent service claim and absolute trusted tool paths");
  }
  const workerEnvironment = sanitizedCoverageEnvironment(outputRoot);
  (dependencies.replaceEnvironment ?? replaceProcessEnvironment)(workerEnvironment);
  const validateExecutable = dependencies.validateExecutable ?? validateTrustedExecutable;
  for (const [name, path] of Object.entries(tools)) {
    try { validateExecutable(path); } catch { throw new Error(`Full coverage worker received invalid ${name} executable`); }
  }
  try {
    await (dependencies.verifyClaim ?? verifyCoverageIntegrationServiceClaim)(workerEnvironment, serviceClaimToken);
  } catch (error) {
    throw new Error(`Full coverage worker service claim verification failed: ${error.message}`, { cause: error });
  }
  if (dependencies.runWorker) return dependencies.runWorker(root, outputRoot, expectedHead, tools);
  return runFullCoverageWorker(root, outputRoot, expectedHead, tools, dependencies.runCommand);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--full-suite-worker")) {
      await runFullCoverageWorkerCommand(repoRoot, process.argv.slice(2));
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
