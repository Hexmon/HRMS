#!/usr/bin/env python3
"""Validate QA *planning artifacts*, not the product under test.

This script reads local markdown/CSV files; it never contacts the app, runs
product tests, installs dependencies, modifies source or approves QA quality.
"""
import argparse
import csv
import re
from pathlib import Path

CORE = [
    '00_SYSTEM_UNDERSTANDING.md', '01_BUSINESS_RULES.md',
    '02_BUSINESS_QUESTIONS.md', '03_RISK_REGISTER.csv',
    '04_MASTER_TEST_CHECKLIST.md', '05_TEST_CASES.csv',
    '06_TRACEABILITY_MATRIX.csv', '07_SECURITY_CHECKLIST.md',
    '08_PERFORMANCE_RELIABILITY_CHECKLIST.md',
    '09_TEST_DATA_AND_ENVIRONMENT.md', '10_SMOKE_REGRESSION_UAT.md',
    '11_RELEASE_READINESS_CHECKLIST.md',
]
TEMPLATE_HEADERS = {
    '03_RISK_REGISTER.csv': ['Risk ID', 'Risk Description', 'Priority P0-P3'],
    '05_TEST_CASES.csv': ['Test ID', 'Expected Result', 'Related Business Rules',
                           'Status', 'Priority', 'Evidence', 'Business Question IDs'],
    '06_TRACEABILITY_MATRIX.csv': ['Test Case ID', 'Business Rule', 'Risk ID',
                                   'Coverage Status'],
}


def read_csv(path, errors):
    try:
        with path.open('r', newline='', encoding='utf-8-sig') as handle:
            reader = csv.DictReader(handle)
            headers = reader.fieldnames or []
            if len(set(headers)) != len(headers):
                errors.append(f'{path.name}: duplicate CSV columns')
            missing = set(TEMPLATE_HEADERS.get(path.name, [])) - set(headers)
            if missing:
                errors.append(f'{path.name}: missing headers: {sorted(missing)}')
            rows = list(reader)
            return rows, headers
    except (OSError, UnicodeError, csv.Error) as e:
        errors.append(f'{path.name}: cannot read CSV: {e}')
        return [], []


def check_plan(root, warnings, errors):
    seen_tests, seen_risks, test_ids = set(), set(), set()
    data = {}
    for file in ('03_RISK_REGISTER.csv', '05_TEST_CASES.csv', '06_TRACEABILITY_MATRIX.csv'):
        path = root / file
        if path.exists():
            data[file], _ = read_csv(path, errors)
        else:
            data[file] = []
    for n, row in enumerate(data['05_TEST_CASES.csv'], start=2):
        tc = (row.get('Test ID') or '').strip()
        if not tc:
            errors.append(f'05_TEST_CASES.csv:{n}: empty Test ID')
        elif tc in seen_tests:
            errors.append(f'05_TEST_CASES.csv:{n}: duplicate ID {tc}')
        else:
            seen_tests.add(tc)
            test_ids.add(tc)
        status = (row.get('Status') or '').strip()
        if status != 'Not Tested':
            errors.append(f'05_TEST_CASES.csv:{n}: planning-only status must be "Not Tested", got {status!r}')
        priority = (row.get('Priority') or '').strip()
        if priority not in ('P0', 'P1', 'P2', 'P3'):
            errors.append(f'05_TEST_CASES.csv:{n}: invalid/missing priority {priority!r}')
        expected = (row.get('Expected Result') or '').strip()
        if not expected:
            errors.append(f'05_TEST_CASES.csv:{n}: expected result must be approved oracle or explicit TBD')
        if re.search(r'\bTBD\b|NEEDS_BUSINESS_CONFIRMATION', expected, re.I) and not (
            row.get('Business Question IDs') or re.search(r'\bBQ[-_]\w+', expected)
        ):
            errors.append(f'05_TEST_CASES.csv:{n}: unresolved oracle without Business Question ID')
        if not (row.get('Evidence') or '').strip():
            warnings.append(f'05_TEST_CASES.csv:{n}: missing path/decision evidence')
        if not (row.get('Related Business Rules') or '').strip():
            warnings.append(f'05_TEST_CASES.csv:{n}: no referenced rule (might be non-business technical test)')
    for n, row in enumerate(data['03_RISK_REGISTER.csv'], start=2):
        key = (row.get('Risk ID') or '').strip()
        if not key:
            errors.append(f'03_RISK_REGISTER.csv:{n}: blank Risk ID')
        elif key in seen_risks:
            errors.append(f'03_RISK_REGISTER.csv:{n}: duplicate ID {key}')
        seen_risks.add(key)
        if row.get('Priority P0-P3') and (row['Priority P0-P3'] or '').strip() not in ('P0','P1','P2','P3'):
            warnings.append(f'03_RISK_REGISTER.csv:{n}: nonstandard priority {row["Priority P0-P3"]!r}')
    for n, row in enumerate(data['06_TRACEABILITY_MATRIX.csv'], start=2):
        tid = (row.get('Test Case ID') or '').strip()
        if tid and tid not in test_ids and tid not in ('TBD', 'GAP', 'NOT PLANNED'):
            warnings.append(f'06_TRACEABILITY_MATRIX.csv:{n}: {tid} missing from new cases (could be linked to previous approved suite)')
    if not data['05_TEST_CASES.csv']:
        warnings.append('05_TEST_CASES.csv: no test cases — probably discovery-only or unfilled plan')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('artifact_dir', nargs='?', default='qa-artifacts', type=Path)
    parser.add_argument('--mode', choices=['discovery','plan'], default='plan')
    args = parser.parse_args()
    root = args.artifact_dir
    errors, warnings = [], []
    if not root.is_dir():
        errors.append(f'{root}: QA artifact directory not found')
    else:
        required = CORE[:3] if args.mode == 'discovery' else CORE
        for item in required:
            if not (root / item).is_file():
                errors.append(f'missing artifact: {item}')
        if args.mode == 'plan':
            check_plan(root, warnings, errors)
    print(f'QA artifact static lint [{args.mode}] for {root}')
    for issue in errors:
        print(f'ERROR: {issue}')
    for issue in warnings:
        print(f'WARN:  {issue}')
    print(f'Issues: {len(errors)} error(s), {len(warnings)} warning(s)')
    if not errors:
        print('Structural lint completed. NOT evidence of application tests, correct business rules, or release readiness.')
    raise SystemExit(1 if errors else 0)


if __name__ == '__main__':
    main()
