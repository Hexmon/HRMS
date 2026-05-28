#!/usr/bin/env python3
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa"
WORKBOOK = QA / "TESTING_TEST_CASES.xlsx"
LOG = QA / "QA_SHEET_VALIDATION_LOG.md"

REQUIRED_SHEETS = [
    "Executive Summary",
    "How To Use",
    "Environment Matrix",
    "Agile Sprint Plan",
    "Release Gates",
    "P0 Smoke UAT Gate",
    "Deployment Smoke",
    "CI-CD Validation",
    "Domain DNS SSL CORS",
    "Data Isolation",
    "Secrets Config Checklist",
    "Branch Promotion Matrix",
    "Sprint Regression",
    "Full Regression",
    "Role Permission Matrix",
    "Business Rule Traceability",
    "Test Data",
    "Defect Log",
    "Rollback Checklist",
    "Future Scope",
    "Signoff",
]

CASE_SHEETS = [
    "P0 Smoke UAT Gate",
    "Deployment Smoke",
    "CI-CD Validation",
    "Domain DNS SSL CORS",
    "Data Isolation",
    "Secrets Config Checklist",
    "Branch Promotion Matrix",
    "Sprint Regression",
    "Full Regression",
    "Rollback Checklist",
]

REQUIRED_COLUMNS = [
    "Test Case ID",
    "Sprint",
    "Story Points",
    "Suite",
    "Feature / Module",
    "Business Flow",
    "Requirement / BLQ / Deployment ID",
    "Priority: P0 / P1 / P2",
    "Risk: High / Medium / Low",
    "Test Type",
    "Role / Persona",
    "Environment",
    "Preconditions",
    "Test Data",
    "Steps",
    "Expected Result",
    "Status: Not Run / Pass / Fail / Blocked / Not Applicable",
]


def read_workbook(path: Path) -> dict[str, list[list[str]]]:
    ns = {
        "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    }
    with ZipFile(path) as zf:
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        sheets: dict[str, list[list[str]]] = {}
        for sheet in workbook.find("main:sheets", ns):
            name = sheet.attrib["name"]
            rel_id = sheet.attrib[f"{{{ns['rel']}}}id"]
            target = rel_map[rel_id]
            xml = ET.fromstring(zf.read(f"xl/{target}"))
            rows: list[list[str]] = []
            for row in xml.findall(".//main:row", ns):
                values: list[str] = []
                for cell in row.findall("main:c", ns):
                    text = cell.find("main:is/main:t", ns)
                    values.append(text.text if text is not None and text.text is not None else "")
                rows.append(values)
            sheets[name] = rows
        return sheets


def dict_rows(rows: list[list[str]]) -> list[dict[str, str]]:
    if not rows:
        return []
    headers = rows[0]
    result = []
    for row in rows[1:]:
        if not any(str(cell).strip() for cell in row):
            continue
        result.append({header: row[index] if index < len(row) else "" for index, header in enumerate(headers)})
    return result


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    if not WORKBOOK.exists():
        errors.append(f"Missing workbook: {WORKBOOK}")
        sheets: dict[str, list[list[str]]] = {}
    else:
        sheets = read_workbook(WORKBOOK)

    for sheet in REQUIRED_SHEETS:
        if sheet not in sheets:
            errors.append(f"Missing required sheet: {sheet}")

    test_ids: list[str] = []
    priority_counts: dict[str, int] = defaultdict(int)
    sprint_points: dict[str, float] = defaultdict(float)
    modules: set[str] = set()
    deployment_case_found = False
    cicd_case_found = False

    for sheet_name in CASE_SHEETS:
        rows = sheets.get(sheet_name, [])
        if not rows:
            errors.append(f"{sheet_name} has no rows")
            continue
        headers = rows[0]
        for column in REQUIRED_COLUMNS:
            if column not in headers:
                errors.append(f"{sheet_name} missing column: {column}")
        for record in dict_rows(rows):
            test_id = record.get("Test Case ID", "").strip()
            if not test_id:
                errors.append(f"{sheet_name} row missing Test Case ID")
            else:
                test_ids.append(test_id)
            for column in REQUIRED_COLUMNS:
                if not record.get(column, "").strip():
                    errors.append(f"{test_id or sheet_name} missing {column}")
            priority = record.get("Priority: P0 / P1 / P2", "").strip()
            if priority not in {"P0", "P1", "P2"}:
                errors.append(f"{test_id} has unsupported priority: {priority}")
            else:
                priority_counts[priority] += 1
            status = record.get("Status: Not Run / Pass / Fail / Blocked / Not Applicable", "").strip()
            if status not in {"Not Run", "Pass", "Fail", "Blocked", "Not Applicable"}:
                errors.append(f"{test_id} has unsupported status: {status}")
            try:
                sprint_points[record.get("Sprint", "").strip()] += float(record.get("Story Points", "0"))
            except ValueError:
                errors.append(f"{test_id} has invalid Story Points")
            modules.add(record.get("Feature / Module", "").strip())
            if sheet_name == "Deployment Smoke":
                deployment_case_found = True
            if sheet_name == "CI-CD Validation":
                cicd_case_found = True

    duplicate_ids = sorted({test_id for test_id in test_ids if test_ids.count(test_id) > 1})
    if duplicate_ids:
        errors.append(f"Duplicate test case IDs: {', '.join(duplicate_ids)}")

    for priority in ["P0", "P1", "P2"]:
        if priority_counts[priority] == 0:
            errors.append(f"Missing priority group {priority}")

    for sprint, points in sorted(sprint_points.items()):
        if points > 48:
            errors.append(f"Sprint {sprint} exceeds 48 story points: {points:g}")

    required_roles = {"Admin", "Employee", "Finance Manager", "Auditor", "Asset Manager", "HR Manager"}
    role_text = "\n".join("\t".join(row) for row in sheets.get("Role Permission Matrix", []))
    for role in required_roles:
        if role not in role_text:
            errors.append(f"Role Permission Matrix missing role: {role}")
    if "Helpdesk Agent" not in role_text:
        errors.append("Role Permission Matrix missing Helpdesk Agent alignment row")

    trace_text = "\n".join("\t".join(row) for row in sheets.get("Business Rule Traceability", []))
    for index in range(1, 26):
        rule = f"BLQ-{index:03d}"
        if rule not in trace_text:
            errors.append(f"Business Rule Traceability missing {rule}")
    for deployment_rule in ["DEP-DOMAIN", "DEP-BRANCH", "DEP-NEON", "DEP-CLOUDINARY", "DEP-VALKEY", "DEP-MOCKS"]:
        if deployment_rule not in trace_text:
            errors.append(f"Business Rule Traceability missing {deployment_rule}")

    if not deployment_case_found:
        errors.append("Deployment Smoke cases missing")
    if not cicd_case_found:
        errors.append("CI-CD Validation cases missing")
    if len(modules) < 12:
        warnings.append(f"Only {len(modules)} modules represented in execution rows")

    runbook = (QA / "TESTER_RUN_BOOK.md").read_text(encoding="utf-8") if (QA / "TESTER_RUN_BOOK.md").exists() else ""
    for term in ["macOS", "Ubuntu/Linux", "Windows", "Cloudinary", "request_id", "CI/CD"]:
        if term not in runbook:
            errors.append(f"Tester run book missing: {term}")

    lines = [
        "# QA Sheet Validation Log",
        "",
        f"Workbook: `{WORKBOOK}`",
        f"Result: {'Pass' if not errors else 'Fail'}",
        "",
        "## Counts",
        f"- Test cases: {len(test_ids)}",
        f"- P0: {priority_counts['P0']}",
        f"- P1: {priority_counts['P1']}",
        f"- P2: {priority_counts['P2']}",
        f"- Sprint totals: {', '.join(f'Sprint {k}: {v:g} SP' for k, v in sorted(sprint_points.items()))}",
        "",
        "## Errors",
        *([f"- {error}" for error in errors] or ["- None"]),
        "",
        "## Warnings",
        *([f"- {warning}" for warning in warnings] or ["- None"]),
    ]
    LOG.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
