#!/usr/bin/env python3
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa"
WORKBOOK = QA / "TESTING_TEST_CASES.xlsx"
LOG = QA / "QA_ARTIFACT_VALIDATION_LOG.md"

REQUIRED_TABS = [
    "README",
    "Execution Summary",
    "Sprint Plan",
    "Coverage Matrix",
    "P0 UAT Gate",
    "P1 Core Regression",
    "P2 Deep Regression",
    "Role Permission Matrix",
    "Business Rule Traceability",
    "Test Data",
    "Environment Matrix",
    "Defect Log",
    "Blocked Questions",
    "Future Scope",
    "Signoff",
]

CASE_TABS = ["P0 UAT Gate", "P1 Core Regression", "P2 Deep Regression"]
REQUIRED_CASE_FIELDS = [
    "Test Case ID",
    "Priority",
    "Sprint",
    "Story Points",
    "Module",
    "User Role / Persona",
    "Steps",
    "Expected Result",
    "Status",
]


def read_workbook(path: Path) -> dict[str, list[list[str]]]:
    ns = {
        "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
    }
    with ZipFile(path) as zf:
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        result: dict[str, list[list[str]]] = {}
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
            result[name] = rows
        return result


def row_dicts(rows: list[list[str]]) -> list[dict[str, str]]:
    if not rows:
        return []
    headers = rows[0]
    return [
        {headers[index]: row[index] if index < len(row) else "" for index in range(len(headers))}
        for row in rows[1:]
        if any(cell.strip() for cell in row)
    ]


def validate() -> tuple[bool, list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not WORKBOOK.exists():
        return False, [f"Missing workbook: {WORKBOOK}"], warnings

    sheets = read_workbook(WORKBOOK)
    for tab in REQUIRED_TABS:
        if tab not in sheets:
            errors.append(f"Missing required tab: {tab}")

    all_cases: list[dict[str, str]] = []
    ids: list[str] = []
    priorities: set[str] = set()
    sprint_points: dict[str, float] = defaultdict(float)
    modules_with_cases: set[str] = set()
    for tab in CASE_TABS:
        rows = sheets.get(tab, [])
        if not rows:
            errors.append(f"Test case tab has no rows: {tab}")
            continue
        headers = rows[0]
        for field in REQUIRED_CASE_FIELDS:
            if field not in headers:
                errors.append(f"{tab} missing required field: {field}")
        for record in row_dicts(rows):
            all_cases.append(record)
            test_id = record.get("Test Case ID", "").strip()
            if not test_id:
                errors.append(f"{tab} has row without Test Case ID")
            else:
                ids.append(test_id)
            for field in REQUIRED_CASE_FIELDS:
                if not record.get(field, "").strip():
                    errors.append(f"{test_id or tab} missing required value: {field}")
            priority = record.get("Priority", "").strip()
            if priority:
                priorities.add(priority)
            sprint = record.get("Sprint", "").strip()
            try:
                sprint_points[sprint] += float(record.get("Story Points", "0"))
            except ValueError:
                errors.append(f"{test_id} has invalid Story Points: {record.get('Story Points')}")
            if record.get("Module", "").strip():
                modules_with_cases.add(record["Module"].strip())

    duplicates = sorted({test_id for test_id in ids if ids.count(test_id) > 1})
    if duplicates:
        errors.append(f"Duplicate test case IDs: {', '.join(duplicates)}")
    for sprint, points in sorted(sprint_points.items()):
        if points > 48:
            errors.append(f"Sprint {sprint} exceeds 48 story points: {points}")
    for priority in ["P0", "P1", "P2"]:
        if priority not in priorities:
            errors.append(f"Missing priority group: {priority}")

    coverage = row_dicts(sheets.get("Coverage Matrix", []))
    if not coverage:
        errors.append("Coverage Matrix has no module rows")
    for row in coverage:
        module = row.get("Module", "").strip()
        status = row.get("Coverage status", "").strip()
        notes = row.get("Notes", "").strip()
        try:
            total = int(float(row.get("P0 count", "0"))) + int(float(row.get("P1 count", "0"))) + int(float(row.get("P2 count", "0")))
        except ValueError:
            total = 0
            errors.append(f"Coverage Matrix has invalid count for module {module}")
        if total == 0 and not (status in {"Not Covered", "Needs Confirmation"} or notes):
            errors.append(f"Coverage Matrix module has no tests and no explicit reason: {module}")

    role_rows = row_dicts(sheets.get("Role Permission Matrix", []))
    unique_roles = {row.get("Role / Persona", "") for row in role_rows}
    unique_role_modules = {(row.get("Role / Persona", ""), row.get("Module", ""), row.get("Action", "")) for row in role_rows}
    if len(role_rows) <= len(unique_roles):
        errors.append("Role Permission Matrix appears to have only one row per role")
    if len(unique_role_modules) < 15:
        errors.append("Role Permission Matrix does not have enough module/action-level rows")

    trace_rows = row_dicts(sheets.get("Business Rule Traceability", []))
    trace_ids = {row.get("Rule ID / BLQ ID", "") for row in trace_rows}
    for index in range(1, 26):
        blq = f"BLQ-{index:03d}"
        if blq not in trace_ids:
            errors.append(f"Business Rule Traceability missing {blq}")

    runbook = (QA / "TESTER_RUN_BOOK.md").read_text(encoding="utf-8") if (QA / "TESTER_RUN_BOOK.md").exists() else ""
    for term in ["macOS", "Ubuntu/Linux", "Windows"]:
        if term not in runbook:
            errors.append(f"Tester run book missing setup section: {term}")

    for required_file in [
        "TESTING_CHECKLIST_INTERNAL.md",
        "TESTING_CHECKLIST_CLIENT.md",
        "TESTING_CHECKLIST_CLIENT.docx",
        "QA_ARTIFACT_UPGRADE_ANALYSIS.md",
        "TASK_SHEET_UPDATE_AUDIT.md",
    ]:
        if not (QA / required_file).exists():
            errors.append(f"Missing expected QA artifact: {required_file}")

    if len(all_cases) < 35:
        warnings.append(f"Workbook has {len(all_cases)} cases; first full cycle may need more coverage.")

    return not errors, errors, warnings


def main() -> int:
    passed, errors, warnings = validate()
    lines = [
        "# QA Artifact Validation Log",
        "",
        f"Workbook: `{WORKBOOK}`",
        f"Result: {'Pass' if passed else 'Fail'}",
        "",
        "## Errors",
    ]
    lines.extend([f"- {error}" for error in errors] or ["- None"])
    lines.extend(["", "## Warnings"])
    lines.extend([f"- {warning}" for warning in warnings] or ["- None"])
    LOG.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
