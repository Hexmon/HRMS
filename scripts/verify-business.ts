import { run } from "./lib.js";

run("pnpm", ["test:unit"]);
run("pnpm", ["test:integration"]);
console.log("Business verification passed.");
