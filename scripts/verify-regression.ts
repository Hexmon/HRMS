import { writeQaArtifact, run } from "./lib.js";

run("pnpm", ["test"]);
run("pnpm", ["db:verify:no-cross-schema-fks"]);
run("pnpm", ["verify:quality"]);
run("pnpm", ["verify:implementation"]);
run("pnpm", ["verify:scalability"]);
writeQaArtifact("final-regression", ["core", "expenses", "documents", "assets", "timesheets", "platform"], [
  "pnpm test",
  "pnpm db:verify:no-cross-schema-fks",
  "pnpm verify:quality",
  "pnpm verify:implementation",
  "pnpm verify:scalability"
]);
writeQaArtifact("sprint-1-regression", ["core", "expenses", "platform"]);
writeQaArtifact("sprint-2-regression", ["core", "expenses", "documents", "platform"]);
console.log("Regression verification passed.");
