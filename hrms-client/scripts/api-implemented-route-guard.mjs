import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const openapiPath = join(root, "docs/api/frontend-contract/openapi.json");
const domainsDir = join(root, "src/domains");

const openapi = JSON.parse(readFileSync(openapiPath, "utf8"));
const implementedPaths = Object.keys(openapi.paths ?? {});

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function normalizeLiteralPath(raw) {
  const path = raw.replace(/\$\{[^}]+\}/g, "{param}");
  const start = path.includes("/api/v1/")
    ? path.indexOf("/api/v1/")
    : path.includes("/health/")
      ? path.indexOf("/health/")
      : -1;
  return start === -1 ? null : path.slice(start);
}

function splitPath(path) {
  return path.split("/").filter(Boolean);
}

function matchesImplementedPath(candidate, implemented) {
  if (candidate === implemented) return true;
  const candidateParts = splitPath(candidate);
  const implementedParts = splitPath(implemented);
  if (candidateParts.length !== implementedParts.length) return false;

  return candidateParts.every((part, index) => {
    const implementedPart = implementedParts[index];
    return part === implementedPart || part === "{param}" || /^\{[^}]+\}$/.test(implementedPart);
  });
}

const files = walk(domainsDir).filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
const literalPattern = /(["'`])([^"'`]*(?:\/api\/v1\/|\/health\/)[^"'`]*)\1/g;
const violations = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(literalPattern)) {
    const candidate = normalizeLiteralPath(match[2]);
    if (!candidate) continue;
    const ok = implementedPaths.some((implemented) =>
      matchesImplementedPath(candidate, implemented),
    );
    if (!ok) violations.push(`${relative(root, file)} uses ${candidate}`);
  }
}

if (violations.length) {
  console.error(
    [
      "Domain API guard failed. These paths are not present in docs/api/frontend-contract/openapi.json:",
      ...violations.map((item) => `- ${item}`),
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  `Domain API guard OK: scanned ${files.length} files against ${implementedPaths.length} OpenAPI paths.`,
);
