import { runStandaloneHumanQa } from "./standalone-human-qa.js";

await runStandaloneHumanQa({
  label: "qa-api-uat-manager-finance-flow",
  reportDir: process.env.HRMS_REPORT_DIR ?? "docs/qa/runs/qa-readiness",
  outputFile: "qa-api-uat-results.json"
});
