import { runStandaloneHumanQa } from "./standalone-human-qa.js";

await runStandaloneHumanQa({
  label: "standalone-full-human-qa",
  reportDir: process.env.HRMS_REPORT_DIR ?? "docs/qa/runs/standalone-full-human-qa",
  outputFile: "standalone-full-human-qa-results.json"
});
