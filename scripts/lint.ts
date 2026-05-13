import { walkFiles, read, fail, relativePath } from "./lib.js";

const files = walkFiles(process.cwd(), (path) => /\.(ts|tsx|js|json|md|yml|yaml|sql)$/u.test(path));
const violations: string[] = [];
const oldExpenseFlowRules = [
  { name: "old reviewer queue route", pattern: /\/api\/v1\/expenses\/queue\/reviewer|queue\/reviewer/u },
  { name: "old director queue route", pattern: /\/api\/v1\/expenses\/queue\/director|queue\/director/u },
  { name: "old finance reviewer frontend route", pattern: /\/finance\/reviewer/u },
  { name: "old finance director frontend route", pattern: /\/finance\/director/u },
  { name: "old reviewer action route", pattern: /\/api\/v1\/expenses\/(?:\{id\}|:[\w-]+|\$\{[^}]+\}|[^/]+)\/review|\/expenses\/\$\{[^}]+\}\/review/u },
  { name: "old director approval route", pattern: /\/api\/v1\/expenses\/(?:\{id\}|:[\w-]+|\$\{[^}]+\}|[^/]+)\/approve|\/expenses\/\$\{[^}]+\}\/approve/u },
  { name: "old open workflow status", pattern: /Pending Reviewer|Pending Director|Reviewer Returned|Director Returned|Reviewer Rejected|Director Rejected|Director Approved|Finance Verified|Admin Finance Exception/u },
  { name: "old reviewer mapping API", pattern: /expense-reviewers|reviewerMapping|Reviewer Mapping/u }
] as const;

function isActiveExpenseSurface(path: string): boolean {
  const normalized = relativePath(path);
  if (
    normalized.includes("/__tests__/") ||
    /\.(test|unit|integration|contract|e2e)\.ts$/u.test(normalized) ||
    normalized.startsWith("src/db/migrations/") ||
    normalized === "scripts/lint.ts" ||
    normalized === "scripts/verify-quality.ts" ||
    normalized === "scripts/standalone-human-qa.ts"
  ) {
    return false;
  }
  return (
    normalized.startsWith("src/modules/expenses/") ||
    normalized.startsWith("src/modules/platform/") ||
    normalized.startsWith("src/modules/reports/") ||
    normalized === "src/platform/openapi.ts" ||
    normalized.startsWith("src/shared/") ||
    normalized.startsWith("src/auth/") ||
    normalized.startsWith("scripts/") ||
    normalized.startsWith("docs/api/")
  );
}

for (const file of files) {
  const content = read(file);
  const rel = relativePath(file);
  if (/\t/u.test(content)) {
    violations.push(`${rel} contains tab characters`);
  }
  if (/[ \t]+$/mu.test(content)) {
    violations.push(`${rel} contains trailing whitespace`);
  }
  if (!content.endsWith("\n")) {
    violations.push(`${rel} is missing final newline`);
  }
  if (/\bfrom\s+["'](?:next|react|react-dom)(?:\/[^"']*)?["']/u.test(content)) {
    violations.push(`${rel} imports frontend-only dependency`);
  }
  const isGuardrailFile = rel.startsWith("scripts/") || rel.includes("/__tests__/") || /\.(test|unit|integration|contract|e2e)\.ts$/u.test(rel);
  if (!isGuardrailFile && /apps\/(?:web|finance-web|documents-web|assets-web)|NEXT_PUBLIC_/u.test(content) && !rel.startsWith("docs/api/")) {
    violations.push(`${rel} contains frontend-only monorepo reference`);
  }
  if (isActiveExpenseSurface(file)) {
    for (const rule of oldExpenseFlowRules) {
      if (rule.pattern.test(content)) {
        violations.push(`${rel} reintroduces ${rule.name}`);
      }
    }
  }
}

if (violations.length > 0) {
  fail(`Lint failed:\n${violations.join("\n")}`);
}

console.log(`Lint passed for ${files.length} files.`);
