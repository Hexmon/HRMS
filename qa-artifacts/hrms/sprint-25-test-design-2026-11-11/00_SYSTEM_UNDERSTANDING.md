# Sprint 25 Test Design — 2026-11-11

Owner: Anurag Kumar. Baseline 87618f88, with pre-existing auth/R2/mail/audit planning docs. Fastify/PostgreSQL/Valkey backend, TanStack Start/React frontend, bounded planned Cloudflare jobs and provider/object-store boundaries. The source review inventory still has unreviewed entries; this plan is not a full source clearance.

Live Sprint 25 intake: 140 task rows, 12 parents and 128 leaf tasks. Designed 482 initial cases, all Not Tested. New provider/payroll/offline features are target contracts, not current UI claims. Exact selectors/routes and every changed decision branch must be refined during implementation.

Use 05_TEST_CASES.csv, 06_TRACEABILITY_MATRIX.csv and case-summary.json; the workbook is the shared execution view. Parent rows roll up child cases without new story points. Historical completed discovery receives provenance-review cases and is not relabelled as product QA.
