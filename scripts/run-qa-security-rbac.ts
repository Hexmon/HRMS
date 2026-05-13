import { runStandaloneHumanQa } from "./standalone-human-qa.js";

await runStandaloneHumanQa({
  label: "qa-security-rbac-manager-finance-flow",
  reportDir: process.env.HRMS_REPORT_DIR ?? "docs/qa/runs/qa-readiness",
  outputFile: "qa-security-rbac-results.json"
});
