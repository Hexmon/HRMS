# QA-S25-003 full case replacements pending shared-sheet write

Target workbook: HRMS, tab Sprint 25 Test Cases, rows 161-164. Preserve Case ID, Task ID, owner and any historical execution fields. Existing bodies are generic app workflows; replace with the following tooling-specific bodies. Each remains Not Tested until its commands are actually run and evidence is recorded. Owner: Anurag Kumar.

## S25-057-U (row 161)

- Task ID: QA-S25-003
- Scenario: Backend decision unit test and frontend rendered component test produce meaningful input/output assertions and separate coverage reports.
- Test layer: Unit/component. Priority: P0.
- Actor / role: Developer and independent QA reviewer; no application role.
- Tenant / context: Isolated source checkout and synthetic fixtures; company-specific business state N/A.
- Preconditions: Both packages installed from their own lockfiles; known base/head; one backend policy unit test and one frontend component with allowed and rejected states.
- Test data: Explicit allowed/denied inputs and expected value, error or visible element; synthetic only.
- Steps: Run backend unit and frontend component test commands. Run their coverage commands at a named revision. Inspect reported paths, line and branch locations; inspect test assertions against the independent approved oracle.
- Expected result: Both runners exit 0, assert observable behavior rather than implementation internals, and emit machine-readable line/branch coverage for their own source files. No product DB/audit/outbox mutation occurs. Reviewer can trace reported locations to source and test assertions.
- Forbidden effects: No silent empty report, fabricated 100%, skipped failing tests, coverage-ignore directives, hosted requests or application data mutation.
- Oracle / source: DEC-020; docs/agent/test-and-qa-completion.md. Oracle status: CONFIRMED_BUSINESS_RULE. Open question: none.
- Owner: Anurag Kumar. Execution status: Not Tested. Execution evidence: blank until run. Defect ID: blank. Notes: independent assertion-quality review is required even if numerical coverage is 100%.

## S25-057-P (row 162)

- Task ID: QA-S25-003
- Scenario: PR base/head coverage gate classifies changed executable lines and new files and passes a fully exercised behavioral change.
- Test layer: CI/integration tooling. Priority: P0.
- Actor / role: Developer and CI reviewer; no application role.
- Tenant / context: Temporary synthetic git repository or task PR checkout; no tenant data.
- Preconditions: Trusted base and head SHAs, valid machine-readable backend and frontend reports, one new source file, one modified source file, and tests exercising every changed executable line and decision branch.
- Test data: Synthetic new and modified source files with known added lines, independent expected values and matching coverage locations; a separate source-rename fixture for deletion/new-path disposition.
- Steps: Create/identify the base and head; run package coverage commands; run the changed-line gate with those exact refs; inspect counts/path classification and CI exit code. Repeat for a new file and a modified file. Rename a source file and verify that its old path remains a failed deletion while its new path is measured.
- Expected result: Gate reports each changed executable location exactly once and exits 0 for fully exercised new and modified source. A rename does not pass automatically: the old path requires explicit regression disposition. Generated, types-only, comment and blank lines are listed with a justified non-executable classification. Existing package checks still run; no DB/audit/outbox or hosted mutation occurs.
- Forbidden effects: No dropping new files, mapping a changed line to an unrelated file, double counting, broad source exclusion, fabricated report, or production connection.
- Oracle / source: DEC-020; docs/agent/test-and-qa-completion.md. Oracle status: CONFIRMED_BUSINESS_RULE. Open question: none.
- Owner: Anurag Kumar. Execution status: Not Tested. Execution evidence: blank until run. Defect ID: blank. Notes: CI must use the PR merge base and actual head, not an arbitrary previous commit.

## S25-057-N (row 163)

- Task ID: QA-S25-003
- Scenario: A reachable changed decision branch left untested fails the completion gate; adding a behavioral assertion makes it pass.
- Test layer: Gate regression/CI. Priority: P0.
- Actor / role: Developer and independent QA reviewer; no application role.
- Tenant / context: Synthetic local fixture and PR-style diff.
- Preconditions: Base/head and valid reports; added decision with allowed/rejected outcomes; only allowed test initially runs.
- Test data: Example function with explicit input classes and a rejected branch; tests assert allowed output first, then rejected error/forbidden side effect.
- Steps: Commit a temporary PR-style decision source and an allowed-outcome Vitest test; run real coverage, stamp it and run both `verify()` and the CLI gate against base/head. Retain failing report. Commit a test asserting the rejected outcome, rerun real coverage and the full gate/CLI. Inspect both exit codes and branch locations.
- Expected result: First run exits nonzero and names the uncovered executable branch/line. Second exits 0 only after the rejected behavior is actually exercised. Reviewer checks assertion quality independently. No product DB/audit/outbox mutation.
- Forbidden effects: No ignores, thresholds below 100% for changed code, skipped test, altered expected result to match a defect, or false-green report.
- Oracle / source: DEC-020; docs/agent/test-and-qa-completion.md. Oracle status: CONFIRMED_BUSINESS_RULE. Open question: none.
- Owner: Anurag Kumar. Execution status: Not Tested. Execution evidence: blank until run. Defect ID: blank. Notes: retain red and green command outputs at exact revisions.

## S25-057-F (row 164)

- Task ID: QA-S25-003
- Scenario: Missing, stale, malformed or misbased coverage inputs fail closed without claiming QA completion.
- Test layer: Gate regression/CI failure recovery. Priority: P0.
- Actor / role: CI reviewer and Developer; no application role.
- Tenant / context: Synthetic temporary git checkout; no application records.
- Preconditions: One known-good base/head fixture and controlled variants: missing backend/frontend report, invalid report, unknown base ref, new executable file without coverage, and generated/type-only file with documented classification.
- Test data: Temporary source paths and reports only; no credentials or tenant data.
- Steps: Run the gate separately for missing backend and frontend reports, malformed/tampered/stale-head reports, dirty source, unknown base and uncovered new source; inspect each exit code/diagnostic. Restore valid reports/base and rerun. In a separate no-executable-change fixture, verify the gate reports N/A with explicit classification. Confirm that directly restamping an old report is not represented as proof of report provenance.
- Expected result: Every missing/invalid/misbased or uncovered executable variant exits nonzero with a bounded actionable diagnostic. Restoring valid inputs exits 0. A true docs/generated/types-only change is explicitly classified N/A; unrelated CI checks remain unchanged. No DB/audit/outbox or hosted mutation.
- Forbidden effects: No stale report acceptance, silent zero denominator, skipped package test, network retry loop, secret disclosure or false QA pass.
- Oracle / source: DEC-020; docs/agent/test-and-qa-completion.md. Oracle status: CONFIRMED_BUSINESS_RULE. Open question: none.
- Owner: Anurag Kumar. Execution status: Not Tested. Execution evidence: blank until run. Defect ID: blank. Notes: retain exact command/ref/report path and independent reviewer disposition for each partition.

## Developer execution update awaiting independent QA and tracker access

On 2026-11-11 IST the developer ran backend unit coverage (535/535 passed), frontend component coverage (2/2 passed), synthetic gate regressions (20/20 passed after exact-head review fixes), and a real ActionButton branch red/green demonstration. The synthetic regressions include a temporary real Vitest project with changed decision source and full `verify()`/CLI red and green runs, plus a separate real Vitest modified-source full-gate pass. Git type, mode, symlink and no-text-hunk changes fail closed in isolated fixtures. Exact commands, counts, initial failures and remaining gaps are in `qa-artifacts/hrms/qa-s25-003-2026-11-11/execution.md`. The four shared-sheet case statuses remain **Not Tested** pending the next exact-head PR CI evidence, independent QA disposition, and tracker reconciliation. PR-authored manual exceptions cannot clear the gate. Do not mark Done from these developer runs.
