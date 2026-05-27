import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const routesDir = join(root, "src/routes");
const gapAudit = join(root, "docs/api/frontend-contract/FRONTEND_BACKEND_GAP_AUDIT.md");

const coverage = [
  { prefix: "/", group: "Public landing" },
  { prefix: "/login", group: "Auth & Sessions" },
  { prefix: "/signup", group: "Auth & Onboarding" },
  { prefix: "/forgot-password", group: "Auth & Sessions" },
  { prefix: "/reset-password", group: "Auth & Sessions" },
  { prefix: "/verify-email", group: "Auth & Onboarding" },
  { prefix: "/set-password", group: "Auth & Onboarding" },
  { prefix: "/onboarding", group: "Auth & Onboarding" },
  { prefix: "/dashboard", group: "Dashboard & Reports" },
  { prefix: "/employees", group: "Core / Employees & Hierarchy" },
  { prefix: "/ems", group: "EMS / Employee Self Service" },
  { prefix: "/attendance", group: "Attendance" },
  { prefix: "/leave-wfh", group: "Leave & WFH" },
  { prefix: "/timesheet", group: "Timesheets" },
  { prefix: "/projects", group: "Projects & Utilization" },
  { prefix: "/team-utilization", group: "Projects & Utilization" },
  { prefix: "/expenses", group: "Expenses / Manager / Finance" },
  { prefix: "/assets", group: "Assets" },
  { prefix: "/helpdesk", group: "Helpdesk" },
  { prefix: "/reports", group: "Reports & Analytics" },
  { prefix: "/admin-settings", group: "Admin / Configuration" },
];

const forbiddenExpenseRoutes = new Set([
  "src/routes/_app/expenses.director.tsx",
  "src/routes/_app/expenses.mapping.tsx",
]);

const forbiddenExpenseTerms = [
  "pending_reviewer",
  "reviewer_returned",
  "reviewer_rejected",
  "pending_director",
  "director_returned",
  "director_rejected",
  "Reviewer Queue",
  "Director Approval",
  "Reviewer Mapping",
];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function routePath(file) {
  let name = relative(routesDir, file).replace(/\.tsx$/, "");
  if (name === "__root" || name === "_app") return null;
  name = name.replace(/^_app[/.]?/, "");
  if (!name || name === "index") return "/";
  const parts = name.split(".");
  const routeParts = parts
    .filter((part) => part !== "index")
    .map((part) => part.replace(/^\$/, ":"));
  return `/${routeParts.join("/")}`;
}

const routeFiles = walk(routesDir).filter((file) => file.endsWith(".tsx"));
const routes = routeFiles
  .map((file) => ({ file: relative(root, file), route: routePath(file) }))
  .filter((item) => item.route);

const missing = routes.filter(({ route }) => {
  const candidates = coverage.filter(({ prefix }) => prefix !== "/");
  return (
    !candidates.some(({ prefix }) => route === prefix || route.startsWith(`${prefix}/`)) &&
    route !== "/"
  );
});

const forbiddenFiles = routes.filter(({ file }) => forbiddenExpenseRoutes.has(file));
const activeExpenseFiles = routeFiles
  .filter((file) => relative(root, file).startsWith("src/routes/_app/expenses"))
  .concat([join(root, "src/lib/expenses-store.tsx")])
  .filter(existsSync);

const forbiddenTerms = activeExpenseFiles.flatMap((file) => {
  const text = readFileSync(file, "utf8");
  return forbiddenExpenseTerms
    .filter((term) => text.includes(term))
    .map((term) => `${relative(root, file)} contains ${term}`);
});

const errors = [];
if (!existsSync(gapAudit))
  errors.push("Missing docs/api/frontend-contract/FRONTEND_BACKEND_GAP_AUDIT.md");
if (missing.length)
  errors.push(
    `Routes without contract coverage: ${missing.map((item) => `${item.route} (${item.file})`).join(", ")}`,
  );
if (forbiddenFiles.length)
  errors.push(
    `Removed legacy expense routes are present: ${forbiddenFiles.map((item) => item.file).join(", ")}`,
  );
if (forbiddenTerms.length)
  errors.push(`Legacy expense vocabulary found: ${forbiddenTerms.join(", ")}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const groups = new Map();
for (const { route } of routes) {
  const match = coverage
    .filter(({ prefix }) =>
      prefix === "/" ? route === "/" : route === prefix || route.startsWith(`${prefix}/`),
    )
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (match) groups.set(match.group, (groups.get(match.group) ?? 0) + 1);
}

console.log(
  `Frontend contract route coverage OK: ${routes.length} routes mapped across ${groups.size} groups.`,
);
