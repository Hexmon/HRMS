import { runStandaloneHumanQa } from "./standalone-human-qa.js";

await runStandaloneHumanQa({
  label: "release-uat-manager-finance-flow",
  reportDir: process.env.HRMS_REPORT_DIR ?? "docs/qa/runs/release-acceptance",
  outputFile: "business-uat-results.json"
});
