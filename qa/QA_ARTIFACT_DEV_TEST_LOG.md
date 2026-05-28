# QA Artifact Dev Test Log

Date: 2026-05-29

## Command 1

Command: `python3 qa/scripts/generate_deployment_agile_artifacts.py`

Working directory: `/Users/anuragkumar/Desktop/hawkaii-hrms`

Result: Pass

Output summary:

- Generated deployment-aware QA workbook and supporting QA docs.
- Generated `qa/TESTING_TEST_CASES.xlsx`.
- Generated `qa/TESTING_CHECKLIST_INTERNAL.md`.
- Generated `qa/TESTING_CHECKLIST_CLIENT.md`.
- Generated `qa/TESTING_CHECKLIST_CLIENT.docx`.
- Generated `qa/TESTER_RUN_BOOK.md`.
- Generated `qa/RELEASE_SIGNOFF_SUMMARY.md`.
- Updated future-scope files after workbook generation.

Failures: None

Fixes applied: Not applicable.

## Command 2

Command: `python3 qa/scripts/validate_testing_workbook.py`

Working directory: `/Users/anuragkumar/Desktop/hawkaii-hrms`

Result: Pass

Output summary:

- Workbook exists.
- Required deployment/agile sheets exist.
- Required execution-sheet columns exist.
- All test cases have ID, priority, sprint, story points, module, role, steps, expected result, and status.
- No duplicate test case IDs.
- P0, P1, and P2 are present.
- Sprint totals are all <= 48 story points.
- Deployment smoke and CI/CD validation tests are present.
- Role matrix includes required roles.
- Business traceability includes BLQ and deployment rules.

Counts:

- Test cases: 51
- P0: 28
- P1: 16
- P2: 7
- Sprint 1: 41 SP
- Sprint 2: 20 SP
- Sprint 3: 8 SP
- Sprint 4: 10 SP
- Sprint 5: 9 SP

Failures: None

Fixes applied: A non-escalated validation rerun was blocked by filesystem permissions while writing `qa/QA_SHEET_VALIDATION_LOG.md`; it was rerun with approved filesystem access and passed.

## Final Validation Status

Pass.
